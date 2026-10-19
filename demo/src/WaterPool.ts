import * as T from 'three';
import {WaveField} from './waterPool/WaveField';
import * as shaders from './waterPool/poolShaders';
import {PoolResponse} from './waterPool/PoolResponse';
import {createPoolFrame} from './waterPool/PoolFrame';
import {POOL_HALF,POOL_FLOOR,POOL_FULL,POOL_CEILING} from './waterPool/poolDimensions';
import {sensorImpulse} from './waterPool/PoolSensor';
import {animateWater,angleDelta,type WaterHandle} from './waterMotion';

export interface PoolHandle extends WaterHandle {disturb(x:number,y:number,strength:number):void;snapshot?():string|undefined}
export function poolLevel(value:number){return POOL_FLOOR+Math.max(0,Math.min(1,Number.isFinite(value)?value:0))*(POOL_FULL-POOL_FLOOR)}
/** Transparent pool, GPU wave field adapted from MIT threejs-water. All assets are local/procedural. */
export function createWaterPool(host:HTMLElement,fill:number,onFailure:()=>void):PoolHandle {
  const renderer=new T.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.75));renderer.setClearColor(0,0);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
  const canvas=renderer.domElement;canvas.dataset.waterRenderer='transparent-pool';
  let wave:WaveField;try{wave=new WaveField(renderer)}catch(e){renderer.dispose();renderer.forceContextLoss();throw e}
  host.appendChild(canvas);
  const scene=new T.Scene(),camera=new T.OrthographicCamera(-2,2,2,-2,.1,20);camera.position.set(3.1,2.3,4.5);camera.lookAt(0,-.06,0);
  const rt=new T.WebGLRenderTarget(256,256,{depthBuffer:false,minFilter:T.LinearFilter,magFilter:T.LinearFilter});
  const uniforms={water:{value:wave.texture},caustics:{value:rt.texture},level:{value:poolLevel(fill)},dark:{value:0},tilt:{value:new T.Vector2()}};
  if(import.meta.env.DEV)Object.assign(canvas,{__pool:{renderer,wave,uniforms,scene,camera,decode:T.DataUtils.fromHalfFloat}});
  const material=(vertexShader:string,fragmentShader:string,transparent=false)=>new T.ShaderMaterial({uniforms,vertexShader,fragmentShader,transparent,depthWrite:!transparent,side:T.DoubleSide});
  const top=new T.Mesh(new T.PlaneGeometry(2,2,96,96),material(shaders.surfaceVertex,shaders.surfaceFragment,true));top.renderOrder=3;scene.add(top);
  const sides=new T.BoxGeometry(2,POOL_FULL-POOL_FLOOR,2);sides.translate(0,(POOL_FULL+POOL_FLOOR)/2,0);sides.clearGroups();
  // Box face groups: +x,-x,+y,-y,+z,-z. Keep only the four side walls.
  for(const i of [0,1,4,5])sides.addGroup(i*6,6,0);
  const body=new T.Mesh(sides,material(shaders.sideVertex,shaders.sideFragment,true));body.renderOrder=2;scene.add(body);
  const bed=new T.Mesh(new T.PlaneGeometry(2,2),material(shaders.worldVertex,shaders.floorFragment,true));bed.rotation.x=-Math.PI/2;bed.position.y=POOL_FLOOR-.003;bed.renderOrder=1;scene.add(bed);
  const frameDesign=createPoolFrame(material(shaders.glassVertex,shaders.glassFragment,true));scene.add(frameDesign.object);
  const shadow=new T.Mesh(new T.PlaneGeometry(2.9,2.9),new T.ShaderMaterial({transparent:true,depthWrite:false,vertexShader:'varying vec2 p;void main(){p=uv*2.-1.;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec2 p;void main(){float s=exp(-dot(p,p)*4.);gl_FragColor=vec4(.08,.25,.32,s*.14);}'}));shadow.rotation.x=-Math.PI/2;shadow.position.y=-1.115;scene.add(shadow);
  const causticScene=new T.Scene(),causticCamera=new T.Camera(),causticMesh=new T.Mesh(new T.PlaneGeometry(2,2,96,96),material(shaders.causticVertex,shaders.causticFragment));causticMesh.frustumCulled=false;causticScene.add(causticMesh);
  const resize=()=>{const b=host.getBoundingClientRect();if(!b.width||!b.height)return;renderer.setSize(b.width,b.height,false);const aspect=b.width/b.height,vertical=Math.max(1.9,1.67/aspect);camera.left=-vertical*aspect;camera.right=vertical*aspect;camera.top=vertical;camera.bottom=-vertical;camera.updateProjectionMatrix()};
  const observer=new ResizeObserver(resize);observer.observe(host);resize();
  let disposed=false,lost=false,accumulator=0,previousRoll=0,previousPitch=0,lastDisturb=-1,disturbanceCount=0,lastPointerTime=-Infinity;
  const response=new PoolResponse();
  const failed=()=>{if(!disposed&&!lost){lost=true;onFailure()}};const contextLost=(event:Event)=>{event.preventDefault();failed()};canvas.addEventListener('webglcontextlost',contextLost);renderer.debug.onShaderError=failed;
  const raycaster=new T.Raycaster(),point=new T.Vector2(),plane=new T.Plane(new T.Vector3(0,1,0),-poolLevel(fill)),hit=new T.Vector3(),glassBounds=new T.Box3(new T.Vector3(-POOL_HALF,-POOL_HALF,-POOL_HALF),new T.Vector3(POOL_HALF,POOL_HALF,POOL_HALF));
  const motion=animateWater(host,fill,45,frame=>{
    if(disposed||lost)return;
    try{
      uniforms.level.value=poolLevel(frame.fill);top.visible=body.visible=frame.fill>.0001;plane.constant=-uniforms.level.value;
      uniforms.dark.value=document.documentElement.dataset.theme==='dark'||host.closest('[data-theme="dark"]')?1:0;
      frameDesign.setDark(uniforms.dark.value===1);
      const roll=angleDelta(frame.roll,previousRoll),pitch=frame.pitch-previousPitch;previousRoll=frame.roll;previousPitch=frame.pitch;
      response.step(frame.dt,frame.reduced);
      const tiltLimit=Math.min(.24,Math.max(0,(uniforms.level.value-POOL_FLOOR)*.5),Math.max(0,(POOL_CEILING-uniforms.level.value)*.75));
      uniforms.tilt.value.set(frame.reduced?0:Math.max(-tiltLimit,Math.min(tiltLimit,Math.sin(frame.roll)*tiltLimit+response.x)),frame.reduced?0:Math.max(-tiltLimit*.78,Math.min(tiltLimit*.78,Math.sin(frame.pitch)*tiltLimit*.78+response.z)));
      if(!frame.reduced&&frame.fill>.01){
        if(Math.abs(roll)>.006){const kick=Math.max(-.08,Math.min(.08,roll*.65));wave.disturb(.84,0,kick,.22);wave.disturb(-.84,0,-kick,.22)}
        if(Math.abs(pitch)>.006){const kick=Math.max(-.07,Math.min(.07,pitch*.65));wave.disturb(0,.62,kick,.22);wave.disturb(0,-.62,-kick,.22)}
        if(frame.time-lastDisturb>2.8){wave.disturb(Math.sin(frame.time*.7)*.6,Math.cos(frame.time*.83)*.5,.004,.13);lastDisturb=frame.time}
        accumulator=Math.min(accumulator+frame.dt,1/30);while(accumulator>=1/120){wave.step();accumulator-=1/120}wave.normals();
      }
      uniforms.water.value=wave.texture;
      renderer.setRenderTarget(rt);renderer.clear();renderer.render(causticScene,causticCamera);renderer.setRenderTarget(null);renderer.render(scene,camera);canvas.dataset.waterFrames=String((Number(canvas.dataset.waterFrames)||0)+1);
    }catch{failed()}
  },sample=>{
    if(disposed||lost||uniforms.level.value<=POOL_FLOOR+.001)return;
    const input=sensorImpulse(sample);
    if(input.x){wave.disturb(.75,0,-input.x,.28);wave.disturb(-.75,0,input.x,.28);response.kick(.8,0,input.x*5)}
    if(input.z){wave.disturb(0,.6,-input.z,.28);wave.disturb(0,-.6,input.z,.28);response.kick(0,.8,input.z*5)}
    if(input.vertical){
      wave.disturb(0,0,-input.vertical,.22);
      for(const x of [-.58,.58])for(const z of [-.45,.45])wave.disturb(x,z,input.vertical*.25,.22);
    }
  });
  function disturb(x:number,y:number,strength:number){
    if(disposed||lost||uniforms.level.value<=POOL_FLOOR+.001||![x,y,strength].every(Number.isFinite)||x<0||x>1||y<0||y>1||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    const now=performance.now();if(now-lastPointerTime<10)return;
    point.set(x*2-1,1-y*2);raycaster.setFromCamera(point,camera);
    const surfaceHit=raycaster.ray.intersectPlane(plane,hit)&&Math.abs(hit.x)<=1&&Math.abs(hit.z)<=1;
    if(!surfaceHit&&!raycaster.ray.intersectBox(glassBounds,hit))return;
    lastPointerTime=now;hit.x=Math.max(-.92,Math.min(.92,hit.x));hit.z=Math.max(-.92,Math.min(.92,hit.z));
    const force=Math.min(.12,Math.max(.025,Math.abs(strength)*2.8));
    // Keep the accepted simulation footprint; only map the square tank into it.
    wave.disturb(hit.x,hit.z*.78,force*.24,.28);wave.disturb(hit.x,hit.z*.78,-force,.15);wave.normals();uniforms.water.value=wave.texture;
    response.kick(hit.x,hit.z*.78,force*3);canvas.dataset.waterDisturbances=String(++disturbanceCount);
  }
  return {snapshot(){if(disposed||lost||!canvas.dataset.waterFrames)return;try{renderer.render(scene,camera);return canvas.toDataURL('image/png')}catch{return}},setFill:value=>motion.setFill(value),impulse(value){if(disposed||lost||!Number.isFinite(value)||uniforms.level.value<=POOL_FLOOR+.001||matchMedia('(prefers-reduced-motion: reduce)').matches)return;const force=Math.max(-1,Math.min(1,value*2.2));response.kick(.85,.32,force);wave.disturb(.75,0,force*.12,.28);wave.disturb(-.75,0,-force*.12,.28);wave.normals();uniforms.water.value=wave.texture},disturb,dispose(){if(disposed)return;disposed=true;motion.dispose();observer.disconnect();canvas.removeEventListener('webglcontextlost',contextLost);wave.dispose();rt.dispose();const disposeObject=(object:T.Object3D)=>{if(object instanceof T.Mesh||object instanceof T.Line){object.geometry.dispose();const materials=Array.isArray(object.material)?object.material:[object.material];materials.forEach(m=>m.dispose())}};scene.traverse(disposeObject);disposeObject(causticMesh);renderer.dispose();renderer.forceContextLoss();canvas.remove()}};
}
