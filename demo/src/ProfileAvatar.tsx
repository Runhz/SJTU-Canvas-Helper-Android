import {useEffect,useRef,useState} from 'react';
import {Camera,Check,ImagePlus,UserRound,RotateCcw} from 'lucide-react';
import {Modal} from './Modal';

export function avatarCrop(width:number,height:number,zoom:number,x:number,y:number){
  const side=Math.min(width,height)/Math.min(3,Math.max(1,zoom));
  return{side,x:Math.min(width-side,Math.max(0,(width-side)/2-x*side)),y:Math.min(height-side,Math.max(0,(height-side)/2-y*side))};
}
function readAvatar(key:string){try{const value=localStorage.getItem(key)||'';return value.length<350000&&/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(value)?value:''}catch{return''}}
export function ProfileAvatar({scope}:{scope:string}){
  const key=`canvas-avatar-v1:${scope}`,[avatar,setAvatar]=useState(()=>readAvatar(key)),[src,setSrc]=useState(''),[open,setOpen]=useState(false),[zoom,setZoom]=useState(1),[pan,setPan]=useState({x:0,y:0}),[size,setSize]=useState({w:1,h:1}),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const input=useRef<HTMLInputElement>(null),image=useRef<HTMLImageElement>(null),pointer=useRef<{id:number;x:number;y:number;pan:{x:number;y:number}}>(),url=useRef('');
  useEffect(()=>{setAvatar(readAvatar(key));const update=()=>setAvatar(readAvatar(key));window.addEventListener('canvas-avatar-changed',update);return()=>window.removeEventListener('canvas-avatar-changed',update)},[key]);
  useEffect(()=>()=>{if(url.current)URL.revokeObjectURL(url.current)},[]);
  function close(){setOpen(false);setSrc('');setError('');if(url.current){URL.revokeObjectURL(url.current);url.current=''}}
  const stage=useRef<HTMLDivElement>(null),[displaySize,setDisplaySize]=useState(260);
  useEffect(()=>{const el=stage.current;if(!el)return;const measure=()=>{if(el.clientWidth)setDisplaySize(el.clientWidth)};measure();const observer=new ResizeObserver(measure);observer.observe(el);return()=>observer.disconnect()},[src,open]);
  const crop=avatarCrop(size.w,size.h,zoom,pan.x,pan.y),scale=displaySize/crop.side;
  function clampPan(next:{x:number;y:number},value=zoom){const side=Math.min(size.w,size.h)/value;return{x:Math.max(-(size.w-side)/2/side,Math.min((size.w-side)/2/side,next.x)),y:Math.max(-(size.h-side)/2/side,Math.min((size.h-side)/2/side,next.y))}}
  async function save(){if(!image.current?.complete||size.w<=1)return;setBusy(true);setError('');try{const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const ctx=canvas.getContext('2d');if(!ctx)throw Error('暂时无法处理图片');ctx.fillStyle='#f2f4f8';ctx.fillRect(0,0,256,256);ctx.drawImage(image.current,crop.x,crop.y,crop.side,crop.side,0,0,256,256);const value=canvas.toDataURL('image/jpeg',.88);localStorage.setItem(key,value);setAvatar(value);window.dispatchEvent(new Event('canvas-avatar-changed'));close()}catch{setError('头像未保存，请检查本机存储后重试')}finally{setBusy(false)}}
  return <><button className="profile-avatar" aria-label="自定义头像" onClick={()=>{setError('');setOpen(true)}}>{avatar?<img src={avatar} alt="我的头像"/>:<UserRound size={30}/>}<span><Camera size={12}/></span></button>
    {open&&<Modal title="我的头像" subtitle="仅保存在当前账号的本机资料中" onClose={close}><div className="avatar-editor">
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" aria-label="上传头像图片" hidden onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10*1024*1024){setError('请选择 10 MB 以内的 JPG、PNG 或 WebP 图片');return}if(url.current)URL.revokeObjectURL(url.current);url.current=URL.createObjectURL(file);setSize({w:1,h:1});setSrc(url.current);setZoom(1);setPan({x:0,y:0});setError('')}}/>
      {src?<><div ref={stage} className="avatar-crop" style={{height:displaySize}} aria-label="圆形头像裁切，拖动调整位置" onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);pointer.current={id:e.pointerId,x:e.clientX,y:e.clientY,pan}}} onPointerMove={e=>{const p=pointer.current;if(!p||p.id!==e.pointerId)return;const width=e.currentTarget.clientWidth;setPan(clampPan({x:p.pan.x+(e.clientX-p.x)/width,y:p.pan.y+(e.clientY-p.y)/width}))}} onPointerUp={()=>{pointer.current=undefined}} onPointerCancel={()=>{pointer.current=undefined}}><img ref={image} src={src} alt="待裁切的头像" draggable={false} onLoad={e=>{const el=e.currentTarget;if(el.naturalWidth*el.naturalHeight>80000000){setError('图片分辨率过大，请换一张较小图片');setSrc('');return}setSize({w:el.naturalWidth,h:el.naturalHeight})}} onError={()=>{setSrc('');setError('图片无法读取，请选择另一张')}} style={{width:size.w*scale,height:size.h*scale,left:-crop.x*scale,top:-crop.y*scale}}/><div className="avatar-crop-mask"/></div><label className="avatar-zoom">缩放<input aria-label="头像缩放" type="range" min="1" max="3" step=".01" value={zoom} onChange={e=>{const next=Number(e.target.value);setZoom(next);setPan(clampPan(pan,next))}}/></label><p>拖动图片调整位置，圆圈内是保存后的头像。</p></>:<div className="avatar-empty">{avatar?<img src={avatar} alt="当前头像"/>:<UserRound size={52}/>}<p>选择一张你喜欢的照片</p></div>}
      {error&&<p className="notice amber" role="alert">{error}</p>}<div className="button-row"><button className="button secondary" onClick={()=>input.current?.click()}><ImagePlus size={16}/>{src?'重新选择':'上传图片'}</button>{src?<button className="button primary" disabled={busy||size.w<=1} onClick={()=>void save()}><Check size={16}/>保存头像</button>:avatar&&<button className="button secondary" onClick={()=>{try{localStorage.removeItem(key);setAvatar('');window.dispatchEvent(new Event('canvas-avatar-changed'))}catch{setError('无法恢复默认头像')}}}><RotateCcw size={15}/>恢复默认</button>}</div>
    </div></Modal>}
  </>;
}
