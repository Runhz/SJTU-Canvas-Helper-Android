// Adapted from jeantimex/threejs-water, Copyright 2011 Evan Wallace / 2026 Yong Su.
// MIT license: public/licenses/LICENSE.threejs-water. No models or image assets copied.
import * as T from 'three';
import vertex from './WaterRipple.vert?raw';
import ripple from './WaterRipple.frag?raw';
import simulation from './WaveSimulation.frag?raw';
import normal from './WaterNormal.frag?raw';
export class WaveField {
  private front:T.WebGLRenderTarget;private back:T.WebGLRenderTarget;
  private scene=new T.Scene();private camera=new T.Camera();private quad:T.Mesh<T.PlaneGeometry,T.ShaderMaterial>;
  private drop:T.ShaderMaterial;private stepMaterial:T.ShaderMaterial;private normal:T.ShaderMaterial;
  constructor(private renderer:T.WebGLRenderer){
    if(!renderer.extensions.has('EXT_color_buffer_float'))throw Error('Floating point water targets unavailable');
    const options={type:T.HalfFloatType,minFilter:T.NearestFilter,magFilter:T.NearestFilter,depthBuffer:false};
    this.front=new T.WebGLRenderTarget(128,128,options);this.back=this.front.clone();
    const make=(fragmentShader:string)=>new T.ShaderMaterial({vertexShader:vertex,fragmentShader,depthTest:false,depthWrite:false,uniforms:{tInput:{value:null},delta:{value:new T.Vector2(1/128,1/128)},poolWidth:{value:1},poolLength:{value:.78},center:{value:new T.Vector2()},radius:{value:.09},strength:{value:0}}});
    this.drop=make(ripple.replace('info.r += drop * strength;','info.r = clamp(info.r + drop * strength, -0.20, 0.20);'));
    this.stepMaterial=make(simulation.replace('info.g *= 0.995;','info.g = clamp(info.g * 0.996, -0.055, 0.055);').replace('info.r += info.g;','info.r = clamp(info.r + info.g, -0.20, 0.20);'));
    this.normal=make(normal);this.quad=new T.Mesh(new T.PlaneGeometry(2,2),this.drop);this.scene.add(this.quad);
    const color=renderer.getClearColor(new T.Color()),alpha=renderer.getClearAlpha();renderer.setClearColor(0,0);
    for(const rt of [this.front,this.back]){renderer.setRenderTarget(rt);renderer.clear();if(renderer.getContext().checkFramebufferStatus(renderer.getContext().FRAMEBUFFER)!==renderer.getContext().FRAMEBUFFER_COMPLETE){this.dispose();throw Error('Water render target incomplete')}}
    renderer.setRenderTarget(null);renderer.setClearColor(color,alpha);
  }
  get texture(){return this.front.texture}
  private run(material:T.ShaderMaterial){this.quad.material=material;material.uniforms.tInput.value=this.front.texture;this.renderer.setRenderTarget(this.back);this.renderer.render(this.scene,this.camera);this.renderer.setRenderTarget(null);[this.front,this.back]=[this.back,this.front]}
  disturb(x:number,z:number,strength:number,radius=.09){this.drop.uniforms.center.value.set(Math.max(-1,Math.min(1,x)),Math.max(-1,Math.min(1,z/.78)));this.drop.uniforms.strength.value=Math.max(-.12,Math.min(.12,strength));this.drop.uniforms.radius.value=radius;this.run(this.drop)}
  step(){this.run(this.stepMaterial)}
  normals(){this.run(this.normal)}
  dispose(){this.front.dispose();this.back.dispose();this.quad.geometry.dispose();this.drop.dispose();this.stepMaterial.dispose();this.normal.dispose()}
}
