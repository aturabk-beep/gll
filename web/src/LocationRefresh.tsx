import {useEffect,useState} from 'react';
import {request} from './api';
import {pushFailureText,deviceFailureText,type PushRequest} from './push-diagnostic';

type PushStatus={configured:boolean;available:boolean;retry_at:string|null;request:PushRequest|null};
export function LocationRefresh({staffId,english}:{staffId:string;english:boolean}){
 const [status,setStatus]=useState<PushStatus|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const path=`/api/admin/staff/${staffId}/location-push`;
 useEffect(()=>{
  let active=true;
  const load=async()=>{try{const value=await request<PushStatus>(path);if(active){setStatus(value);setError('');}}catch{if(active)setError(english?'Request status unavailable':'İstek durumu alınamadı');}};
  void load();const timer=setInterval(()=>{void load();},5000);
  return()=>{active=false;clearInterval(timer);};
 },[path,english]);
 const labels:Record<string,[string,string]>={
  sending:['Apple’a gönderiliyor','Sending to Apple'],accepted:['İstek gönderildi; cihazın yanıtı bekleniyor','Request sent; waiting for device'],
  received:['Yeni konum alındı','Fresh location received'],outside:['Alan dışında; konum gizlendi','Outside the site; location hidden'],
  unavailable:['Cihaz güncel konum alamadı','Device could not obtain a fresh location'],failed:['İstek Apple’a iletilemedi','Could not send request to Apple'],
  timeout:['Cihazdan yanıt gelmedi; konum yenilenmedi','No device response; location not refreshed'],cancelled:['Paylaşım kapatıldı; istek iptal edildi','Sharing disabled; request cancelled']};
 const message=!status?'':!status.configured?(english?'Apple server setup required':'Apple sunucu kurulumu bekleniyor'):!status.available?(english?'Requires an updated iPhone app and employee approval':'Güncel iPhone uygulaması ve çalışan onayı gerekli'):status.request?(labels[status.request.status]?.[english?1:0]??''):'';
 return <section className="detailSection">
  <button disabled={busy||!status?.configured||!status.available} onClick={async()=>{
   setBusy(true);setError('');try{await request(path,'POST',{});setStatus(await request<PushStatus>(path));}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}
  }}>{english?'Refresh iPhone location':'iPhone konumunu yenile'}</button>
  <p role="status">{error||message}</p>
  {status?.request?.status==='failed'&&<p role="status">{pushFailureText(status.request,english)}</p>}
  {status?.request?.status==='unavailable'&&<p role="status">{deviceFailureText(status.request,english)}</p>}
  <small>{english?'One-time request, not continuous tracking. Delivery is not guaranteed.':'Tek seferlik istektir; sürekli takip değildir. Yanıt gelmesi garanti değildir.'}</small>
 </section>;
}
