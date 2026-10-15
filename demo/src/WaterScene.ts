import * as THREE from 'three';
import { waterPresets, type WaterQuality } from './waterQuality';
import { animateWater, type GravitySample, type WaterHandle } from './waterMotion';
import { TankFluid } from './fluid/TankFluid';
import { LiquidSurface } from './fluid/LiquidSurface';

export type WaterSceneHandle=WaterHandle;
const vertex=`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`;
/** Shade a hole-free liquid silhouette. Particle density is never used as a specular normal. */
const liquidShader=`
precision highp float;
uniform sampler2D uField;
uniform vec2 uTexel;
uniform float uDark;
varying vec2 vUv;
float density(vec2 uv){return texture2D(uField,uv).r;}
void main(){
  vec2 p=vUv*2.-1.;float r=length(p),glassR=.91;
  float shadow=exp(-pow(p.x/.65,2.)-pow((p.y+.938)/.055,2.))*.14;
  if(r>glassR+.008){gl_FragColor=vec4(.07,.19,.23,shadow);return;}
  float sphere=sqrt(max(.0001,1.-dot(p/glassR,p/glassR)));
  float rim=pow(1.-sphere,3.);
  float glassMask=1.-smoothstep(glassR-.004,glassR+.003,r);
  vec3 bg=mix(vec3(.97,.99,1.),vec3(.085,.105,.13),uDark);
  vec3 color=mix(bg,vec3(.47,.72,.77),rim*.55);float alpha=.025+rim*.6;
  float d=density(vUv);
  float water=smoothstep(.48,.52,d)*(1.-smoothstep(.877,.889,r));
  if(water>.001){
    vec2 grad=vec2(density(vUv+vec2(uTexel.x,0.))-density(vUv-vec2(uTexel.x,0.)),density(vUv+vec2(0.,uTexel.y))-density(vUv-vec2(0.,uTexel.y)));
    float edge=1.-smoothstep(.5,.65,d);
    vec3 n=normalize(vec3(-grad*7.*edge+p*.36,sphere*.85+.2));
    float thickness=sphere;
    vec3 shallow=vec3(.62,.9,.93),deep=vec3(.025,.43,.56);
    vec3 body=mix(shallow,deep,clamp(thickness*.62+(.5-p.y)*.14,0.,1.));
    float fresnel=pow(1.-max(0.,n.z),3.);
    float spec=pow(max(0.,dot(n,normalize(vec3(-.5,.75,1.4)))),55.);
    float strip=exp(-pow((n.x+.42)/.085,2.))*smoothstep(.15,.85,n.y)*.2;
    body+=vec3(.7,.9,1.)*(fresnel*.12+spec*.32+strip);
    float broad=exp(-pow((p.x+.48)/.12,2.)-pow((p.y+.34)/.48,2.))*.19;
    body+=vec3(.7,.91,1.)*broad;
    body=mix(body,vec3(.68,.9,.94),edge*.1);
    float caustic=pow(max(0.,1.-abs(r-.82)/.09),3.)*max(0.,-p.y)*.17;
    body+=vec3(.24,.63,.7)*caustic;
    color=mix(color,body,water);alpha=mix(alpha,.94,water);
  }
  vec3 gn=vec3(p/glassR,sphere);
  float light=pow(max(0.,dot(gn,normalize(vec3(-.62,.48,.68)))),95.);
  float light2=pow(max(0.,dot(gn,normalize(vec3(.75,-.18,.64)))),140.);
  float reflection=light*.72+light2*.48;
  color=mix(color,vec3(.94,.99,1.),clamp(reflection+rim*.12,0.,1.));
  alpha=clamp(alpha+reflection+rim*.15,0.,1.)*glassMask;
  gl_FragColor=vec4(color,alpha);
}`;

export interface WaterSceneOptions { input?:(dt:number)=>GravitySample }
export function createWaterScene(host:HTMLElement,quality:WaterQuality,fill:number,options:WaterSceneOptions={}):WaterSceneHandle {
  const preset=waterPresets[quality],fluid=new TankFluid(quality,fill);
  const surface=new LiquidSurface(preset.surfaceSize,fluid.radius);
  let amount=fill;
  const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:quality==='eco'?'low-power':'high-performance'});
  renderer.domElement.dataset.waterRenderer='flip';
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,preset.pixelRatio));
  renderer.setClearColor(0,0);host.appendChild(renderer.domElement);
  const field=new THREE.DataTexture(surface.pixels,surface.size,surface.size,THREE.RGBAFormat);
  field.minFilter=field.magFilter=THREE.LinearFilter;field.generateMipmaps=false;
  const camera=new THREE.Camera();
  const texel=new THREE.Vector2(1/surface.size,1/surface.size);
  const material=new THREE.ShaderMaterial({transparent:true,depthTest:false,depthWrite:false,uniforms:{uField:{value:field},uTexel:{value:texel},uDark:{value:0}},vertexShader:vertex,fragmentShader:liquidShader});
  const quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),material),scene=new THREE.Scene();scene.add(quad);
  const resize=()=>{const {width,height}=host.getBoundingClientRect();if(width&&height)renderer.setSize(width,height,false);};
  const observer=new ResizeObserver(resize);observer.observe(host);resize();
  const motion=animateWater(host,fill,preset.fps,frame=>{
    if(options.input)fluid.sample(options.input(frame.dt));
    if(!frame.reduced)fluid.advance(frame.dt);
    surface.update(fluid.particlePos,fluid.numParticles,fluid.particleRadius,amount);field.needsUpdate=true;
    material.uniforms.uDark.value=document.documentElement.dataset.theme==='dark'||host.closest('[data-theme="dark"]')?1:0;
    renderer.clear();renderer.render(scene,camera);
  },sample=>{if(!options.input)fluid.sample(sample);},side=>fluid.kick(side));
  return {
    ...motion,setFill(value){amount=value;fluid.setFill(value);motion.setFill(value);},
    dispose(){motion.dispose();observer.disconnect();quad.geometry.dispose();material.dispose();field.dispose();renderer.dispose();renderer.domElement.remove();},
  };
}
