import { animateWater, type WaterHandle } from './waterMotion';
import { waterPresets, type WaterQuality } from './waterQuality';
import { TankFluid } from './fluid/TankFluid';
import { LiquidSurface } from './fluid/LiquidSurface';

/** Canvas fallback keeps the same FLIP physics; no pixel or rigid-water mode. */
export function createCanvasWater(host:HTMLElement,quality:WaterQuality,fill:number):WaterHandle {
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');if(!ctx)throw Error('Canvas unavailable');
  canvas.dataset.waterRenderer='flip-canvas';host.appendChild(canvas);
  const size=quality==='eco'?160:256,fluid=new TankFluid(quality==='high'?'balanced':quality,fill);
  canvas.width=canvas.height=size;
  const image=ctx.createImageData(size,size),surface=new LiquidSurface(waterPresets[quality==='high'?'balanced':quality].surfaceSize,fluid.radius);
  let amount=fill;
  const motion=animateWater(host,fill,Math.min(30,waterPresets[quality].fps),frame=>{
    if(!frame.reduced)fluid.advance(frame.dt);
    surface.update(fluid.particlePos,fluid.numParticles,fluid.particleRadius,amount);image.data.fill(0);
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const p=y*size+x,nx=x*2/size-1,ny=1-y*2/size,r=Math.hypot(nx,ny);
      const d=surface.sample((x+.5)/size,1-(y+.5)/size);
      if(d<.48||r>.885)continue;
      const edge=Math.max(0,1-(d-.5)/.15),depth=Math.sqrt(Math.max(0,1-r*r));
      image.data[p*4]=38+edge*12+(1-depth)*30;
      image.data[p*4+1]=145+edge*12+(1-depth)*30;
      image.data[p*4+2]=170+edge*12+(1-depth)*25;
      image.data[p*4+3]=Math.min(1,(d-.48)/.04)*240;
    }
    ctx.putImageData(image,0,0);
    const c=size/2,r=size*.455;
    ctx.beginPath();ctx.arc(c,c,r,0,Math.PI*2);
    ctx.strokeStyle='rgba(134,191,208,.38)';ctx.lineWidth=1.3;ctx.stroke();
    ctx.beginPath();ctx.ellipse(c-r*.55,c-r*.49,r*.06,r*.21,.65,0,Math.PI*2);ctx.fillStyle='rgba(255,255,255,.45)';ctx.fill();
  },sample=>fluid.sample(sample),side=>fluid.kick(side));
  return {...motion,setFill(value){amount=value;fluid.setFill(value);motion.setFill(value);},dispose(){motion.dispose();canvas.remove();}};
}
