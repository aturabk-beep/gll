import {useEffect,useRef,useState,type FormEvent} from 'react';
import {request} from './api';

export type NewStaff={id:string;name:string;workplace:string|null;pairing_code:string};
// Native <dialog>: top layer above the map, focus trap and Escape handling come from the browser.
export function AddStaff({english,workplaces,onCreated,onClose}:{english:boolean;workplaces:string[];onCreated:(staff:NewStaff)=>Promise<void>;onClose:()=>void}){
 const t=(tr:string,en:string)=>english?en:tr;
 const dialog=useRef<HTMLDialogElement>(null),firstField=useRef<HTMLInputElement>(null),copyButton=useRef<HTMLButtonElement>(null);
 const [first,setFirst]=useState(''),[last,setLast]=useState(''),[workplace,setWorkplace]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [created,setCreated]=useState<NewStaff|null>(null),[copied,setCopied]=useState<''|'ok'|'failed'>('');
 useEffect(()=>{const d=dialog.current;if(d&&!d.open){d.showModal();firstField.current?.focus();}},[]);
 useEffect(()=>{if(created)copyButton.current?.focus();},[created]);
 useEffect(()=>{if(copied!=='ok')return;const timer=setTimeout(()=>setCopied(''),2000);return()=>clearTimeout(timer);},[copied]);
 const close=()=>dialog.current?.close();
 const submit=async(event:FormEvent)=>{
  event.preventDefault();setBusy(true);setError('');
  try{const staff=await request<NewStaff>('/api/admin/staff','POST',{name:`${first.trim()} ${last.trim()}`,workplace:workplace.trim()||undefined});setCreated(staff);await onCreated(staff);}
  catch(e){setError(e instanceof Error?e.message:String(e));}
  finally{setBusy(false);}
 };
 const copy=async()=>{if(!created)return;try{await navigator.clipboard.writeText(created.pairing_code);setCopied('ok');}catch{setCopied('failed');}};
 return <dialog ref={dialog} className="addStaff" aria-labelledby="addStaffTitle" onCancel={event=>{if(busy)event.preventDefault();}} onClose={onClose}>
  {!created?<form onSubmit={event=>void submit(event)}>
   <div className="addStaffHead"><div><h2 id="addStaffTitle">{t('Yeni personel','New staff member')}</h2><p>{t('Eşleştirme kodu kayıttan sonra otomatik oluşturulur.','A pairing code is created automatically when you save.')}</p></div><button type="button" className="addStaffClose" aria-label={t('Kapat','Close')} disabled={busy} onClick={close}>×</button></div>
   <div className="addStaffNames">
    <label>{t('Ad','First name')}<input ref={firstField} required maxLength={50} autoComplete="off" value={first} onChange={event=>setFirst(event.target.value)}/></label>
    <label>{t('Soyad','Last name')}<input required maxLength={49} autoComplete="off" value={last} onChange={event=>setLast(event.target.value)}/></label>
   </div>
   <label>{t('Çalışma yeri','Workplace')}<input list="addStaffWorkplaces" maxLength={100} autoComplete="off" placeholder={t('ör. Sera 2, Ahır, Depo','e.g. Greenhouse 2, Barn, Store')} value={workplace} onChange={event=>setWorkplace(event.target.value)}/></label>
   <datalist id="addStaffWorkplaces">{workplaces.map(place=><option key={place} value={place}/>)}</datalist>
   {error&&<p role="alert" className="addStaffError">{error}</p>}
   <div className="addStaffActions"><button type="button" disabled={busy} onClick={close}>{t('Vazgeç','Cancel')}</button><button className="primary" disabled={busy}>{busy?t('Ekleniyor…','Adding…'):t('Personeli ekle','Add staff member')}</button></div>
  </form>:<div className="addStaffDone">
   <div className="addStaffHead"><div className="addStaffTitleRow"><span className="addStaffCheck" aria-hidden="true">✓</span><h2 id="addStaffTitle">{t('Personel eklendi','Staff member added')}</h2></div><button type="button" className="addStaffClose" aria-label={t('Kapat','Close')} onClick={close}>×</button></div>
   <div className="addStaffPerson"><b>{created.name}</b>{created.workplace&&<span>{created.workplace}</span>}</div>
   <div className="addStaffCode">
    <small>{t('EŞLEŞTİRME KODU','PAIRING CODE')}</small>
    <code>{created.pairing_code}</code>
    <button ref={copyButton} type="button" className={copied==='ok'?'copied':''} onClick={()=>void copy()}>{copied==='ok'?t('✓ Kopyalandı','✓ Copied'):t('Kodu kopyala','Copy code')}</button>
   </div>
   <p role="status">{copied==='failed'?t('Kopyalanamadı; kodu elle not edin.','Could not copy; please note the code down.'):t('Çalışan bu kodu telefonundaki Gülel uygulamasına girer. Kod kalıcıdır ve personel ayrıntılarında da görünür.','The employee enters this code in the Gülel app on their phone. The code is permanent and also shown in the staff details.')}</p>
   {error&&<p role="alert" className="addStaffError">{error}</p>}
   <div className="addStaffActions"><button type="button" className="primary" onClick={close}>{t('Bitti','Done')}</button></div>
  </div>}
 </dialog>;
}
