import {useEffect,useRef,useState} from 'react';

// Pairing codes are permanent but only needed when the app is first installed or reinstalled,
// so the code sits behind a small key next to the name: hover or focus previews it, click/tap pins it.
export function PairingKey({code,paired,english}:{code:string;paired:boolean;english:boolean}){
 const t=(tr:string,en:string)=>english?en:tr;
 const [open,setOpen]=useState<''|'hover'|'pinned'>(''),[copied,setCopied]=useState<''|'ok'|'failed'>('');
 const root=useRef<HTMLDivElement>(null),closing=useRef<number|undefined>(undefined);
 const hover=(on:boolean)=>{window.clearTimeout(closing.current);if(on)setOpen(value=>value||'hover');else closing.current=window.setTimeout(()=>setOpen(value=>value==='hover'?'':value),150);};
 useEffect(()=>()=>window.clearTimeout(closing.current),[]);
 useEffect(()=>{
  if(open!=='pinned')return;
  const away=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setOpen('');};
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')setOpen('');};
  document.addEventListener('pointerdown',away);document.addEventListener('keydown',escape);
  return()=>{document.removeEventListener('pointerdown',away);document.removeEventListener('keydown',escape);};
 },[open]);
 useEffect(()=>{if(copied!=='ok')return;const timer=setTimeout(()=>setCopied(''),2000);return()=>clearTimeout(timer);},[copied]);
 const copy=async()=>{try{await navigator.clipboard.writeText(code);setCopied('ok');}catch{setCopied('failed');}};
 return <div ref={root} className={'pairKey'+(paired?'':' unpaired')} onMouseEnter={()=>hover(true)} onMouseLeave={()=>hover(false)} onFocus={()=>hover(true)} onBlur={event=>{if(!root.current?.contains(event.relatedTarget as Node))setOpen(value=>value==='hover'?'':value);}}>
  <button type="button" className="pairKeyButton" aria-label={t('Eşleştirme kodu','Pairing code')} aria-expanded={!!open} onClick={()=>setOpen(value=>value==='pinned'?'':'pinned')}>
   <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/></svg>
  </button>
  {open&&<div className="pairKeyPop">
   <small>{t('EŞLEŞTİRME KODU','PAIRING CODE')}</small>
   <div className="pairCode"><code>{code}</code><button type="button" className={copied==='ok'?'copied':''} onClick={()=>void copy()}>{copied==='ok'?t('✓ Kopyalandı','✓ Copied'):t('Kopyala','Copy')}</button></div>
   <p role="status">{copied==='failed'?t('Kopyalanamadı; kodu elle not edin.','Could not copy; please note the code down.'):paired?t('Telefon eşleşti. Kod yalnızca uygulama yeniden kurulursa gerekir.','Phone paired. The code is only needed if the app is reinstalled.'):t('Henüz eşleşmedi. Çalışan bu kodu telefonundaki Gülel uygulamasına girer.','Not paired yet. The employee enters this code in the Gülel app on their phone.')}</p>
  </div>}
 </div>;
}
