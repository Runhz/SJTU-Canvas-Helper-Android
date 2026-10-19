import * as T from 'three';
import {POOL_HALF} from './poolDimensions';

function roundedPath<P extends T.Path>(path:P,width:number,depth:number,radius:number):P {
  const x=-width/2,z=-depth/2,r=Math.min(radius,width/2,depth/2);
  path.moveTo(x+r,z);path.lineTo(x+width-r,z);path.quadraticCurveTo(x+width,z,x+width,z+r);
  path.lineTo(x+width,z+depth-r);path.quadraticCurveTo(x+width,z+depth,x+width-r,z+depth);
  path.lineTo(x+r,z+depth);path.quadraticCurveTo(x,z+depth,x,z+depth-r);
  path.lineTo(x,z+r);path.quadraticCurveTo(x,z,x+r,z);path.closePath();return path;
}
function profile(width:number,depth:number,radius:number,inset=0){
  const shape=roundedPath(new T.Shape(),width,depth,radius);
  if(inset)shape.holes.push(roundedPath(new T.Path(),width-inset*2,depth-inset*2,Math.max(.012,radius-inset)));
  return shape;
}
function extrude(shape:T.Shape,height:number,y:number,bevel=0){
  const geometry=new T.ExtrudeGeometry(shape,{depth:height,steps:1,curveSegments:8,bevelEnabled:bevel>0,bevelThickness:bevel,bevelSize:bevel,bevelSegments:2});
  geometry.rotateX(Math.PI/2);geometry.translate(0,y,0);return geometry;
}
/** Equal-sided glass cube: thick clear walls, polished edges, and a recessed foot. */
export function createPoolFrame(glassMaterial:T.ShaderMaterial){
  const group=new T.Group();group.name='polished-pool-frame';
  const size=POOL_HALF*2,radius=.065;
  const wall=new T.Mesh(extrude(profile(size,size,radius,.032),size,POOL_HALF),glassMaterial);wall.name='glass-cube';wall.renderOrder=4;group.add(wall);
  const lipMaterial=new T.MeshPhysicalMaterial({color:0xe4f5f7,metalness:.08,roughness:.08,clearcoat:1,clearcoatRoughness:.05,transparent:true,opacity:.55,depthWrite:false});
  const lip=new T.Mesh(extrude(profile(size,size,radius,.032),.008,POOL_HALF,.002),lipMaterial);lip.renderOrder=5;group.add(lip);
  const lid=new T.Mesh(extrude(profile(size,size,radius),.018,POOL_HALF-.002),glassMaterial);lid.name='sealed-glass-lid';lid.renderOrder=5;group.add(lid);
  const glassBase=new T.Mesh(extrude(profile(size,size,radius),.035,-1.012),glassMaterial);glassBase.renderOrder=4;group.add(glassBase);
  const baseMaterial=new T.MeshPhysicalMaterial({color:0x839da5,metalness:.65,roughness:.24,clearcoat:1,clearcoatRoughness:.18});
  const base=new T.Mesh(extrude(profile(2.084,2.084,radius),.016,-1.049,.003),baseMaterial);base.renderOrder=0;group.add(base);
  const foot=new T.Mesh(extrude(profile(1.95,1.95,.07),.018,-1.074,.003),new T.MeshStandardMaterial({color:0x28444e,metalness:.48,roughness:.3}));group.add(foot);
  // Fine edge catches sit on the glass itself, rather than a heavy metal cage.
  const edgeMaterial=new T.LineBasicMaterial({color:0xd8f4fa,transparent:true,opacity:.32,depthWrite:false});
  for(const y of [-POOL_HALF+.005,POOL_HALF+.001]){
    const path=roundedPath(new T.Path(),size,size,radius),points=path.getPoints(64).map(p=>new T.Vector3(p.x,y,p.y));
    const edge=new T.LineLoop(new T.BufferGeometry().setFromPoints(points),edgeMaterial);edge.renderOrder=6;group.add(edge);
  }
  const corner=POOL_HALF-radius+radius/Math.sqrt(2),points=[];
  for(const x of [-corner,corner])for(const z of [-corner,corner])points.push(new T.Vector3(x,-POOL_HALF,z),new T.Vector3(x,POOL_HALF,z));
  const seams=new T.LineSegments(new T.BufferGeometry().setFromPoints(points),new T.LineBasicMaterial({color:0xd9f3f8,transparent:true,opacity:.15,depthWrite:false}));seams.renderOrder=6;group.add(seams);
  const lighting=new T.HemisphereLight(0xf5fdff,0x8ea5b0,2.3);group.add(lighting);
  const key=new T.DirectionalLight(0xffffff,2.4);key.position.set(-3,6,4);group.add(key);
  const edge=new T.DirectionalLight(0xc5edff,1.1);edge.position.set(4,2,-4);group.add(edge);
  let previous:boolean|undefined;
  return {object:group,setDark(dark:boolean){if(previous===dark)return;previous=dark;baseMaterial.color.setHex(dark?0x526f7c:0x839da5);lipMaterial.color.setHex(dark?0xaecdd7:0xe4f5f7);edgeMaterial.opacity=dark?.42:.32;lighting.intensity=dark?1.6:2.3;key.intensity=dark?1.8:2.4;edge.intensity=dark?.8:1.1}};
}
