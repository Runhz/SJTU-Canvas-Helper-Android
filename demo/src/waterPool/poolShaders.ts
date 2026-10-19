import {POOL_FLOOR,POOL_CEILING} from './poolDimensions';
const bounds=`const float poolFloor=${POOL_FLOOR.toFixed(3)};const float poolCeiling=${POOL_CEILING.toFixed(3)};`;
// Optical model: ray refraction + Beer-Lambert absorption, Fresnel reflection.
// Caustic area-ratio projection follows Evan Wallace / Yong Su's MIT implementation.
export const common=`${bounds}
uniform sampler2D water;uniform sampler2D caustics;uniform float level;uniform float dark;uniform vec2 tilt;
varying vec3 vWorld;
const vec3 lamp=vec3(-0.43,0.85,0.31);
vec3 environment(vec3 d){
  vec3 room=mix(vec3(.36,.43,.50),vec3(.91,.96,.99),smoothstep(-.35,.8,d.y));
  room=mix(room,room*.25,dark*.72);
  float window=pow(max(0.,dot(d,normalize(vec3(-.7,.9,-1.)))),85.);
  float strip=pow(max(0.,dot(d,normalize(vec3(.65,.8,-.5)))),180.);
  return room+vec3(1.,.97,.89)*window*1.8+vec3(.8,.93,1.)*strip*1.4;
}
vec3 floorColor(vec2 p){
  float line=min(abs(fract(p.x*3.+.5)-.5),abs(fract(p.y*3.+.5)-.5));
  vec3 base=mix(vec3(.10,.33,.41),vec3(.30,.61,.68),smoothstep(.008,.02,line));
  float focus=texture2D(caustics,p*.5+.5).r;
  return base*mix(1.,.28,dark)+vec3(.59,.86,.91)*focus*1.2;
}
vec3 waterNormal(vec2 p){vec2 n=texture2D(water,clamp(p,0.,1.)).ba*min(1.,max(0.,level-poolFloor)/.16);return normalize(vec3(n.x+tilt.x,sqrt(max(.02,1.-min(.98,dot(n,n)))),n.y+tilt.y));}
`;
export const surfaceVertex=`${bounds}uniform sampler2D water;uniform float level;uniform vec2 tilt;varying vec3 vWorld;
void main(){vec3 p=vec3(position.x,level+texture2D(water,uv).r*min(1.,max(0.,level-poolFloor)/.16),position.y);p.y=clamp(p.y-dot(p.xz,tilt),poolFloor+.001,poolCeiling);vWorld=p;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`;
export const surfaceFragment=common+`
void main(){
 vec3 n=waterNormal(vWorld.xz/vec2(2.)+.5),view=normalize(cameraPosition-vWorld);
 vec3 ray=refract(-view,n,1./1.333);float dist=max(.001,(poolFloor-vWorld.y)/min(-.02,ray.y));
 vec2 hit=vWorld.xz+ray.xz*dist;vec3 bed=floorColor(clamp(hit,-1.,1.));
 vec3 transmission=exp(-vec3(1.6,.35,.16)*dist);
 vec3 refracted=bed*transmission+vec3(.12,.64,.74)*(1.-transmission)*.42;
 float fresnel=.0204+.9796*pow(1.-max(0.,dot(view,n)),5.);
 vec3 reflected=environment(reflect(-view,n));
 float spec=pow(max(0.,dot(n,normalize(lamp+view))),145.);
 vec3 c=mix(refracted,reflected,clamp(fresnel,.02,.92))+vec3(1.,.98,.91)*spec*.9;
 gl_FragColor=vec4(c,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;
export const worldVertex=`varying vec3 vWorld;void main(){vWorld=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.);}`;
export const sideVertex=`${bounds}uniform sampler2D water;uniform float level;uniform vec2 tilt;varying vec3 vWorld;void main(){vec3 p=position;if(p.y>poolFloor+.01)p.y=clamp(level+texture2D(water,p.xz/vec2(2.)+.5).r*min(1.,max(0.,level-poolFloor)/.16)-dot(p.xz,tilt),poolFloor+.001,poolCeiling);vWorld=p;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`;
export const sideFragment=common+`
void main(){vec3 view=normalize(cameraPosition-vWorld);vec3 n=abs(vWorld.x)>.999?vec3(sign(vWorld.x),0.,0.):vec3(0.,0.,sign(vWorld.z));
 float distance=.65/max(.35,abs(dot(view,n)));vec3 tr=exp(-vec3(.85,.22,.12)*distance);
 vec3 c=mix(vec3(.10,.51,.65),floorColor(vWorld.xz+view.xz*.08),tr)*mix(1.,.7,dark);
 float f=.02+.98*pow(1.-abs(dot(n,view)),5.);c=mix(c,environment(reflect(-view,n)),f*.5);
 gl_FragColor=vec4(c,.48+distance*.16);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;
export const floorFragment=common+`void main(){gl_FragColor=vec4(floorColor(vWorld.xz),.70);#include <tonemapping_fragment>
#include <colorspace_fragment>
}`.replace(';#include',';\n#include');
export const glassVertex=`varying vec3 vWorld;varying vec3 vGlassNormal;void main(){vWorld=(modelMatrix*vec4(position,1.)).xyz;vGlassNormal=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.);}`;
export const glassFragment=`uniform float dark;varying vec3 vWorld;varying vec3 vGlassNormal;
void main(){vec3 n=normalize(vGlassNormal),v=normalize(cameraPosition-vWorld);float f=pow(1.-abs(dot(n,v)),3.);
 float heightFade=smoothstep(-1.04,-.7,vWorld.y)*(1.-smoothstep(.88,1.04,vWorld.y));
 float stripe=exp(-pow((vWorld.x+.78)/.055,2.))*heightFade*abs(n.z)*.12;
 float panel=exp(-pow((vWorld.x+.66)/.23,4.))*heightFade*abs(n.z)*.035;
 float sideStripe=exp(-pow((vWorld.z-.78)/.045,2.))*heightFade*abs(n.x)*.09;
 float gleam=pow(max(0.,dot(reflect(-v,n),normalize(vec3(-.7,.25,.85)))),55.)*.17;
 vec3 glass=mix(vec3(.80,.94,.97),vec3(.63,.83,.91),dark);
 gl_FragColor=vec4(mix(glass,vec3(1.),min(1.,stripe+sideStripe+gleam)),.014+f*.13+stripe+sideStripe+panel+gleam);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;
export const causticVertex=`${bounds}uniform sampler2D water;uniform float level;uniform vec2 tilt;varying vec3 oldPos;varying vec3 newPos;
void main(){vec2 uv=position.xy*.5+.5;vec4 info=texture2D(water,uv);float waveScale=min(1.,max(0.,level-poolFloor)/.16);vec2 slope=info.ba*.6*waveScale+tilt;vec3 n=normalize(vec3(slope.x,sqrt(max(.01,1.-dot(slope,slope))),slope.y));vec3 light=normalize(vec3(-.43,.85,.31));vec3 flatRay=refract(-light,vec3(0.,1.,0.),1./1.333);vec3 ray=refract(-light,n,1./1.333);vec3 p=vec3(position.x,level,position.y);oldPos=p+flatRay*((poolFloor-p.y)/flatRay.y);p.y=clamp(p.y+info.r*waveScale-dot(p.xz,tilt),poolFloor+.001,poolCeiling);newPos=p+ray*((poolFloor-p.y)/ray.y);gl_Position=vec4(newPos.x,newPos.z,0.,1.);}`;
export const causticFragment=`varying vec3 oldPos;varying vec3 newPos;void main(){float a=length(dFdx(oldPos))*length(dFdy(oldPos));float b=max(.0000001,length(dFdx(newPos))*length(dFdy(newPos)));float focus=clamp((a/b-.99)*1.6,0.,1.);gl_FragColor=vec4(vec3(focus),1.);}`;
