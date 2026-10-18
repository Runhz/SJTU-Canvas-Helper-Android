import { useLayoutEffect, useId, useRef, type ReactNode, type CSSProperties } from 'react';
import { X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { NATIVE, native } from './runtime';
const dialogs: HTMLElement[] = [];
let restoreShell: (() => void) | null = null;
let playerObscured = false;
function updateStack() {
  dialogs.forEach((node,i)=>{if(i===dialogs.length-1){node.removeAttribute('inert');node.removeAttribute('aria-hidden');}else{node.setAttribute('inert','');node.setAttribute('aria-hidden','true');}});
  const obscured = dialogs.length > 0;
  if (obscured !== playerObscured) {
    playerObscured = obscured;
    // The Android video view sits above the WebView; CSS z-index cannot cover it.
    if (NATIVE) void native('playerControl', { action: 'occlusion', obscured }).catch(() => {});
    if (NATIVE) void native('documentPreviewControl', { action: 'occlusion', obscured }).catch(() => {});
  }
  if(!dialogs.length){restoreShell?.();restoreShell=null;}
}

export function Modal({ title, subtitle, children, onClose, wide = false, fullscreen=false,className='',style }: {
  title: string; subtitle?: string; children: ReactNode; onClose: () => void; wide?: boolean;fullscreen?:boolean;className?:string;style?:CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const opener = useRef(document.activeElement as HTMLElement | null);
  const close = useRef(onClose);
  const titleId = useId();
  close.current = onClose;
  useLayoutEffect(() => {
    const previous = opener.current;
    const shells = Array.from(document.querySelectorAll('.app-shell,.study-chat-dock,.floating-study'));
    if (!dialogs.length) {
      const previousShells=shells.map(shell=>({shell,hidden:shell.getAttribute('aria-hidden'),inert:shell.hasAttribute('inert')})),overflow=document.body.style.overflow;
      shells.forEach(shell=>{shell.setAttribute('aria-hidden','true');shell.setAttribute('inert','');});document.body.style.overflow = 'hidden';
      restoreShell=()=>{document.body.style.overflow=overflow;previousShells.forEach(({shell,hidden,inert})=>{if(!inert)shell.removeAttribute('inert');if(hidden===null)shell.removeAttribute('aria-hidden');else shell.setAttribute('aria-hidden',hidden);});};
    }
    const node=ref.current!;dialogs.push(node);updateStack();
    const focusable = () => Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href],[tabindex="0"]') || []).filter(n => !n.closest('[hidden]') && n.getAttribute('type') !== 'hidden');
    const handle = (e: KeyboardEvent) => {
      if(dialogs[dialogs.length-1]!==node)return;
      if (e.key === 'Escape') { e.preventDefault(); close.current(); }
      if (e.key !== 'Tab') return;
      const nodes = focusable(), first = nodes[0], last = nodes[nodes.length - 1];
      if (!first) { e.preventDefault(); ref.current?.focus(); return; }
      if (!ref.current?.contains(document.activeElement) || document.activeElement === ref.current) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', handle);
    // Respect explicit autofocus on search and keep the title available to screen readers.
    if (!ref.current?.contains(document.activeElement)) ref.current?.focus();
    return () => {
      document.removeEventListener('keydown', handle);
      const index=dialogs.indexOf(node);if(index>=0)dialogs.splice(index,1);updateStack();
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return createPortal(<div className={`modal-overlay ${fullscreen?'fullscreen-overlay':''} ${className}`} onMouseDown={e => { if (e.target === e.currentTarget) close.current(); }}>
    <div className={`modal ${wide ? 'wide' : ''} ${fullscreen?'fullscreen':''}`} style={style} role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref} tabIndex={-1}>
      <div className="sheet-handle"/>
      <header className="modal-header"><div><h2 id={titleId}>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-button" aria-label="关闭弹窗" onClick={() => close.current()}><X size={20}/></button></header>
      {children}
    </div>
  </div>, document.body);
}
