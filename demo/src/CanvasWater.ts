import {animateWater,angleDelta,type WaterHandle} from './waterMotion';
import {waterLevel,waterPresets,type WaterQuality} from './waterQuality';

/** Continuous height surface with damped waves, never reconstructed from particles.
 * Wave superposition: NVIDIA GPU Gems, chapter 1 (physical water surface models).
 * https://developer.nvidia.com/gpugems/gpugems/part-i-natural-effects/chapter-1-effective-water-simulation-physical-models
 */
export function createCanvasWater(host:HTMLElement,quality:WaterQuality,fill:number):WaterHandle{
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
  if(!ctx)throw Error('Canvas unavailable');
  canvas.dataset.waterRenderer='crystal-surface';host.appendChild(canvas);
  const preset=waterPresets[quality],segments=quality==='eco'?40:quality==='balanced'?64:96;
  let width=0,height=0,kick=0,previousRoll=0,sway=0,velocity=0;
  const resize=()=>{const b=host.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,preset.pixelRatio);width=b.width;height=b.height;canvas.width=Math.max(1,Math.round(width*dpr));canvas.height=Math.max(1,Math.round(height*dpr));};
  const observer=new ResizeObserver(resize);observer.observe(host);resize();
  const motion=animateWater(host,fill,preset.fps,frame=>{
    if(!width||!height)return;
    const dt=frame.dt,r=Math.min(width,height)*.435,cx=width/2,cy=height/2-2;
    const dark=document.documentElement.dataset.theme==='dark'||!!host.closest('[data-theme="dark"]');
    const turn=angleDelta(frame.roll,previousRoll);previousRoll=frame.roll;
    velocity+=Math.max(-.2,Math.min(.2,turn))*1.8;
    const steps=Math.max(1,Math.ceil(dt/.008));
    for(let i=0;i<steps;i++){const h=dt/steps;velocity+=(-sway*32-velocity*4.8)*h;sway+=velocity*h;}
    kick*=Math.exp(-dt*3.1);
    if(frame.reduced){kick=sway=velocity=0;}
    const ratio=Math.min(1,Math.max(0,frame.fill)),level=-waterLevel(ratio)*r;
    const amount=Math.sin(Math.PI*ratio),power=Math.min(.1,.001+Math.abs(kick)*.075+Math.abs(sway)*.09+frame.shock*.012)*amount;
    const wave=(x:number)=>r*power*(Math.sin(x/r*3.6-frame.time*5.7)*.65+Math.sin(x/r*7.8+frame.time*7.1)*.22)+x*Math.max(-.12,Math.min(.12,sway+kick*.11));
    ctx.setTransform(canvas.width/width,0,0,canvas.height/height,0,0);ctx.clearRect(0,0,width,height);
    ctx.save();ctx.translate(cx,cy);
    // A restrained contact shadow and glass volume give the sphere depth.
    const shadow=ctx.createRadialGradient(0,r*.98,0,0,r*.98,r*.75);shadow.addColorStop(0,dark?'rgba(0,0,0,.28)':'rgba(48,99,123,.14)');shadow.addColorStop(1,'rgba(30,70,100,0)');ctx.save();ctx.scale(1,.13);ctx.fillStyle=shadow;ctx.beginPath();ctx.ellipse(0,r*7.5,r*.85,r*.85,0,0,Math.PI*2);ctx.fill();ctx.restore();
    const glass=ctx.createRadialGradient(-r*.32,-r*.48,r*.05,r*.1,r*.15,r*1.3);glass.addColorStop(0,dark?'rgba(204,238,251,.09)':'rgba(255,255,255,.95)');glass.addColorStop(.6,dark?'rgba(115,190,215,.025)':'rgba(228,246,251,.25)');glass.addColorStop(1,dark?'rgba(101,171,195,.24)':'rgba(120,188,207,.21)');ctx.fillStyle=glass;ctx.beginPath();ctx.arc(0,0,r*1.025,0,Math.PI*2);ctx.fill();
    ctx.save();ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.clip();ctx.rotate(-frame.roll);
    if(ratio>.0001){
      const body=new Path2D();body.moveTo(-r*1.1,level+wave(-r));
      for(let i=0;i<=segments;i++){const x=-r*1.1+i*r*2.2/segments;body.lineTo(x,level+wave(x));}
      body.lineTo(r*1.1,r*1.2);body.lineTo(-r*1.1,r*1.2);body.closePath();
      ctx.save();ctx.clip(body);
      const water=ctx.createLinearGradient(0,level-r*.1,0,r);water.addColorStop(0,'rgba(133,226,235,.86)');water.addColorStop(.18,'rgba(42,172,194,.88)');water.addColorStop(.68,'rgba(13,119,151,.93)');water.addColorStop(1,'rgba(7,68,105,.97)');ctx.fillStyle=water;ctx.fillRect(-r,-r,r*2,r*2);
      const lens=ctx.createRadialGradient(-r*.4,-r*.2,r*.1,0,r*.1,r*1.12);lens.addColorStop(0,'rgba(178,246,250,.26)');lens.addColorStop(.55,'rgba(81,206,223,.02)');lens.addColorStop(1,'rgba(0,38,74,.32)');ctx.fillStyle=lens;ctx.fillRect(-r,-r,r*2,r*2);
      // Reflections stay on the glass while the water moves behind them.
      ctx.rotate(frame.roll);
      const light=ctx.createLinearGradient(-r*.75,0,-r*.18,0);light.addColorStop(0,'rgba(255,255,255,0)');light.addColorStop(.3,'rgba(220,255,255,.48)');light.addColorStop(.65,'rgba(200,251,255,.04)');light.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=light;ctx.beginPath();ctx.ellipse(-r*.5,-r*.04,r*.21,r*.9,-.18,0,Math.PI*2);ctx.fill();
      if(quality!=='eco'){ctx.strokeStyle='rgba(165,242,250,.22)';ctx.lineWidth=r*.025;ctx.beginPath();ctx.ellipse(r*.05,r*.72,r*.62,r*.14,-.08,0,Math.PI);ctx.stroke();ctx.fillStyle='rgba(227,255,255,.4)';ctx.beginPath();ctx.ellipse(r*.65,r*.44,r*.04,r*.17,.3,0,Math.PI*2);ctx.fill();}
      ctx.restore();
      if(ratio<.999){
        const span=Math.sqrt(Math.max(0,r*r-level*level));
        const surface=new Path2D();surface.moveTo(-span,level+wave(-span));
        for(let i=0;i<=segments;i++){const x=-span+i*span*2/segments;surface.lineTo(x,level+wave(x));}
        for(let i=segments;i>=0;i--){const x=-span+i*span*2/segments;surface.lineTo(x,level+wave(x)+Math.sqrt(Math.max(0,1-(x/Math.max(1,span))**2))*r*(.055+Math.abs(Math.sin(frame.pitch))*.1));}
        surface.closePath();ctx.fillStyle='rgba(185,247,250,.5)';ctx.fill(surface);
        ctx.strokeStyle='rgba(230,255,255,.85)';ctx.lineWidth=Math.max(.8,r*.009);ctx.beginPath();for(let i=0;i<=segments;i++){const x=-span+i*span*2/segments,y=level+wave(x);if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.stroke();
      }
    }
    ctx.restore();
    // Fixed studio reflections across the front and the thick polished rim.
    ctx.save();ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.clip();const shine=ctx.createRadialGradient(-r*.5,-r*.55,0,-r*.5,-r*.55,r*.24);shine.addColorStop(0,'rgba(255,255,255,.88)');shine.addColorStop(.3,'rgba(255,255,255,.34)');shine.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=shine;ctx.fillRect(-r,-r,r*2,r*2);ctx.strokeStyle=dark?'rgba(224,249,255,.25)':'rgba(255,255,255,.86)';ctx.lineWidth=r*.025;ctx.beginPath();ctx.arc(0,0,r*.985,.13,Math.PI*.93);ctx.stroke();ctx.restore();
    ctx.strokeStyle=dark?'rgba(167,215,231,.28)':'rgba(135,197,213,.45)';ctx.lineWidth=1;ctx.beginPath();ctx.arc(0,0,r*1.025,0,Math.PI*2);ctx.stroke();ctx.restore();
  },undefined,side=>{kick=Math.max(-.7,Math.min(.7,kick+side*.8));velocity+=side*.7;});
  return{...motion,dispose(){motion.dispose();observer.disconnect();canvas.remove();}};
}
