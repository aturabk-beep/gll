import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {request,restoreSession,signIn,signOut,type Session} from './api';
import {FarmMap,type FarmBoundary,type MapSite} from './FarmMap';
import {CameraScreen} from './CameraScreen';
import type {Camera} from './cameras';
import {LocationRefresh} from './LocationRefresh';
import {AddStaff} from './AddStaff';
import {PairingKey} from './PairingKey';
import {state,csv,elapsedAge,statusWords,type Point,type Device} from './domain';
import 'leaflet/dist/leaflet.css';
import './style.css';

type Staff={id:string;name:string;workplace:string|null;pairing_code:string};
type Attendance={arrived_at:string|null;left_at:string|null;seconds:number;inside:boolean;at_farm:boolean;clocked_in:boolean;first_clock_in:string|null;last_clock_out:string|null;work_seconds:number};
const words={
 tr:{...statusWords.tr,staff:'Personel',search:'Personel ara',all:'Tümü',problems:'Kontrol gerekli',login:'Yönetici girişi',logout:'Çıkış',email:'E-posta',password:'Şifre',add:'Personel ekle',deleteStaff:'Personeli sil',pair:'Eşleştirme kodu',revoke:'Cihazı iptal et',history:'Güzergâhı getir',clear:'Kaldır',export:'CSV indir',save:'Aralıkları kaydet',seen:'Son haberleşme',fix:'Son geçerli konum',accuracy:'Doğruluk',battery:'Pil',minutes:'dk',never:'Henüz yok',moving:'Hareketli',stationary:'Sabit',threshold:'Sabit moda geçiş',name:'Ad soyad'},
 en:{...statusWords.en,staff:'Staff',search:'Search staff',all:'All',problems:'Needs attention',login:'Admin sign in',logout:'Sign out',email:'Email',password:'Password',add:'Add staff',deleteStaff:'Delete staff',pair:'Pairing code',revoke:'Revoke device',history:'Load route',clear:'Clear',export:'Download CSV',save:'Save intervals',seen:'Last communication',fix:'Last valid location',accuracy:'Accuracy',battery:'Battery',minutes:'min',never:'Not yet',moving:'Moving',stationary:'Stationary',threshold:'Stationary after',name:'Full name'},
};

function localDate(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
function clock(value:string|null,english:boolean){if(!value)return '—';return new Intl.DateTimeFormat(english?'en-GB':'tr-TR',{timeZone:'Europe/Istanbul',hour:'2-digit',minute:'2-digit'}).format(new Date(value));}
function duration(seconds=0,english=false){const h=Math.floor(seconds/3600),m=Math.floor(seconds%3600/60);return h?`${h} ${english?'h':'sa'} ${String(m).padStart(2,'0')} ${english?'min':'dk'}`:`${m} ${english?'min':'dk'}`;}

function App(){
 const [screen,setScreen]=useState<'map'|'cameras'>('map');
 const [cameras,setCameras]=useState<Camera[]>([]),[cameraFocus,setCameraFocus]=useState<{camera:string;person:string}|null>(null);
 const [mapSite,setMapSite]=useState<MapSite>('test'),[farmPreviewMeters,setFarmPreviewMeters]=useState(100);
 const [lang,setLang]=useState<'tr'|'en'>('tr'),t=words[lang],english=lang==='en';
 const [session,setSession]=useState<Session|null>(null),[allowed,setAllowed]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [staff,setStaff]=useState<Staff[]>([]),[devices,setDevices]=useState<Device[]>([]),[points,setPoints]=useState<Point[]>([]);
 const [selected,setSelected]=useState(''),[query,setQuery]=useState(''),[problems,setProblems]=useState(false),[route,setRoute]=useState<Point[]>([]),[now,setNow]=useState(Date.now()),[adding,setAdding]=useState(false);
 const [attendance,setAttendance]=useState<Attendance|null>(null);
 const [boundary,setBoundary]=useState<FarmBoundary|null>(null),[boundaryMeters,setBoundaryMeters]=useState(100),[showBoundary,setShowBoundary]=useState(false);
 const [from,setFrom]=useState(new Date(Date.now()-3600000).toISOString().slice(0,16)),[to,setTo]=useState(new Date().toISOString().slice(0,16));
 const [moving,setMoving]=useState(30),[stationary,setStationary]=useState(300),[after,setAfter]=useState(180),[heartbeat,setHeartbeat]=useState(600);

 const load=async()=>{const result=await request<{staff:Staff[];devices:Device[];points:Point[];boundary:FarmBoundary}>('/api/admin/snapshot');setStaff(result.staff);setDevices(result.devices);setPoints(result.points);setBoundary(current=>{if(!current)setBoundaryMeters(result.boundary.buffer_meters);const same=current&&current.buffer_meters===result.boundary.buffer_meters&&current.south===result.boundary.south&&current.west===result.boundary.west&&current.north===result.boundary.north&&current.east===result.boundary.east;return same?current:result.boundary;});return result;};
 const run=async(f:()=>Promise<void>)=>{setBusy(true);setError('');try{await f();}catch(e){setError(e instanceof Error?e.message:String((e as {message?:string})?.message||e));}finally{setBusy(false);}};
 const loadAttendance=async(id=selected)=>{if(!id)return;setAttendance(await request<Attendance>(`/api/admin/staff/${id}/attendance?date=${localDate()}`));};

 useEffect(()=>{const expired=()=>{setSession(null);setAllowed(false);setStaff([]);setDevices([]);setPoints([]);setRoute([]);};window.addEventListener('gulel:session-ended',expired);void restoreSession().then(setSession);return()=>window.removeEventListener('gulel:session-ended',expired);},[]);
 useEffect(()=>{setAllowed(false);if(!session)return;let alive=true;void run(async()=>{await load();if(alive)setAllowed(true);});return()=>{alive=false;};},[session?.user.id]);
 useEffect(()=>{if(!allowed)return;let pending=false,failures=0,refreshMessage='';const timer=setInterval(()=>{setNow(Date.now());if(pending)return;pending=true;void load().then(()=>{failures=0;setError(current=>current===refreshMessage?'':current);refreshMessage='';}).catch(e=>{if(++failures>=2){refreshMessage=e instanceof Error?e.message:String(e);setError(refreshMessage);}}).finally(()=>{pending=false;});},10000);return()=>clearInterval(timer);},[allowed]);
 // Camera links on the map's hover cards; reloaded on returning from the Cameras screen, where cameras are edited.
 useEffect(()=>{if(!allowed||screen!=='map')return;let alive=true;void request<Camera[]>('/api/admin/cameras').then(list=>{if(alive)setCameras(list);}).catch(()=>{});return()=>{alive=false;};},[allowed,screen]);

 const person=staff.find(s=>s.id===selected),device=devices.find(d=>d.staff_id===selected),point=points.find(p=>p.staff_id===selected);
 useEffect(()=>{setRoute([]);setMoving(device?.moving_seconds??30);setStationary(device?.stationary_seconds??300);setAfter(device?.stationary_after??180);setHeartbeat(device?.heartbeat_seconds??600);setAttendance(null);if(!selected)return;void loadAttendance(selected).catch(()=>{});const timer=setInterval(()=>void loadAttendance(selected).catch(()=>{}),60000);return()=>clearInterval(timer);},[selected,device?.id]);

 const age=(value:string|null|undefined)=>elapsedAge(value,now,english);
 const history=async()=>{if(!selected)return;const a=new Date(from+'Z'),b=new Date(to+'Z');if(!Number.isFinite(+a)||!Number.isFinite(+b)||b<=a||+b-+a>7*86400000)throw Error('UTC tarih aralığı 0–7 gün olmalı / UTC range must be 0–7 days');const all:Point[]=[];let next:{time:string;id:string}|null=null;do{const q=new URLSearchParams({staff_id:selected,from:a.toISOString(),to:b.toISOString(),...(next?{cursor_time:next.time,cursor_id:next.id}:{})});const result:{points:Point[];next:{time:string;id:string}|null}=await request('/api/admin/locations?'+q);all.push(...result.points);next=result.next;}while(next&&all.length<70000);setRoute(all);};

 return <>
  <header>
   <div className="brand"><img className="brandLogo" src="/logo.svg" alt="Gülel Personnel"/></div>
   {allowed&&<nav className="screenTabs" aria-label={english?'Screens':'Ekranlar'}>
    <button aria-pressed={screen==='map'} onClick={()=>setScreen('map')}>{english?'Locations':'Konumlar'}</button>
    <button aria-pressed={screen==='cameras'} onClick={()=>{setCameraFocus(null);setScreen('cameras');}}>{english?'Cameras':'Kameralar'}</button>
   </nav>}
   <div className="headerRight">{allowed&&<span className="headerCount">{staff.length} {t.staff.toLocaleLowerCase(lang)}</span>}<button onClick={()=>setLang(english?'tr':'en')}>{english?'TR':'EN'}</button>{session&&<button onClick={()=>void run(async()=>{await signOut();setSession(null);setStaff([]);setDevices([]);setPoints([]);})}>{t.logout}</button>}</div>
  </header>
  {!session?<main className="center"><img className="loginLogo" src="/logo.svg" alt="Gülel Personnel"/><h1>{t.login}</h1><form onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget);void run(async()=>setSession(await signIn(String(form.get('email')),String(form.get('password')))));}}><input name="email" type="email" required placeholder={t.email}/><input name="password" type="password" required placeholder={t.password}/><button className="primary" disabled={busy}>{t.login}</button></form></main>
  :allowed?screen==='cameras'?<CameraScreen staff={staff} devices={devices} points={points} now={now} english={english} focus={cameraFocus}/>:<main className={'workspace'+(person?' hasDetail':'')}>
   <aside className="staffList">
    <div className="listHeader"><h2>{t.staff}</h2><button onClick={()=>setAdding(true)}>＋ {t.add}</button></div>
    {adding&&<AddStaff english={english} workplaces={[...new Set(staff.flatMap(item=>item.workplace?[item.workplace]:[]))].sort((a,b)=>a.localeCompare(b,'tr'))} onCreated={async created=>{await load();setSelected(created.id);}} onClose={()=>setAdding(false)}/>}
    <input placeholder={t.search} value={query} onChange={event=>setQuery(event.target.value)}/>
    <div className="filters"><button className={!problems?'active':''} onClick={()=>setProblems(false)}>{t.all}</button><button className={problems?'active':''} onClick={()=>setProblems(true)}>{t.problems}</button></div>
    <div className="people">{staff.filter(item=>`${item.name} ${item.workplace??''}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map(item=>{const latest=points.find(p=>p.staff_id===item.id),itemDevice=devices.find(d=>d.staff_id===item.id),status=state(latest,itemDevice,now);if(problems&&(status==='current'||status==='offsite'))return null;return <button className={'person '+(selected===item.id?'chosen':'')} key={item.id} onClick={()=>setSelected(item.id)}><div className="personTitle"><b>{item.name}</b><i className={status}/></div><span>{t[status]} · {age(latest?.measured_at)}</span><small>±{latest?Math.round(latest.accuracy):'—'} m · {latest?.battery??'—'}%</small></button>;})}</div>
   </aside>
   <section className="mapWrap">
    <FarmMap staff={staff} points={points} devices={devices} now={now} selected={selected} onSelect={setSelected} cameraLinks={cameras} onCamera={(camera,staffId)=>{setCameraFocus({camera:camera.id,person:staffId});setScreen('cameras');}} route={route} english={english} boundary={boundary} showBoundary={showBoundary} site={mapSite} onSiteChange={setMapSite} farmBufferMeters={farmPreviewMeters}/>
    <div className="boundaryTools">
     <button aria-pressed={showBoundary} onClick={()=>setShowBoundary(value=>!value)}>{showBoundary?(english?'Hide boundary':'Sınırı gizle'):(english?'Show boundary':'Sınırı göster')}</button>
     {showBoundary&&<div className="boundaryEditor"><b>{mapSite==='farm'?(english?'Farm boundary preview':'Çiftlik sınırı önizlemesi'):(english?'Test site boundary':'Test alanı sınırı')}</b><label>{english?'Surrounding buffer (metres)':'Çevre payı (metre)'}<input type="number" min="0" max="1000" step="10" value={mapSite==='farm'?farmPreviewMeters:boundaryMeters} onChange={event=>{const value=Math.max(0,Math.min(1000,+event.target.value||0));if(mapSite==='farm')setFarmPreviewMeters(value);else setBoundaryMeters(value);}}/></label><div><button onClick={()=>mapSite==='farm'?setFarmPreviewMeters(value=>Math.max(0,value-50)):setBoundaryMeters(value=>Math.max(0,value-50))}>−50 m</button><button onClick={()=>mapSite==='farm'?setFarmPreviewMeters(value=>Math.min(1000,value+50)):setBoundaryMeters(value=>Math.min(1000,value+50))}>+50 m</button></div>{mapSite==='farm'?<p>{english?'Preview only — does not change the active test boundary.':'Yalnızca önizleme — aktif test sınırını değiştirmez.'}</p>:<button className="primary" disabled={busy||boundaryMeters===boundary?.buffer_meters} onClick={()=>void run(async()=>{const saved=await request<FarmBoundary>('/api/admin/farm-boundary','PATCH',{buffer_meters:boundaryMeters});setBoundary(saved);setBoundaryMeters(saved.buffer_meters);await loadAttendance();})}>{english?'Save boundary':'Sınırı kaydet'}</button>}</div>}
    </div>
   </section>
   <aside className="detail">{person&&<>
    <div className="detailHeading"><div><div className="detailTitle"><h2>{person.name}</h2><PairingKey key={person.id} code={person.pairing_code} paired={!!device} english={english}/></div>{person.workplace&&<small className="detailWorkplace">{person.workplace}</small>}</div><button className="detailClose" aria-label={english?'Close details':'Detayı kapat'} onClick={()=>setSelected('')}>×</button></div>
    <LocationRefresh key={person.id} staffId={person.id} english={english}/>
    <span className="status">{t[state(point,device,now)]}</span>
    <dl>{[[t.seen,age(device?.last_seen)],[t.fix,age(point?.measured_at)],[t.accuracy,point?`±${Math.round(point.accuracy)} m`:'—'],[t.battery,`${point?.battery??'—'}%`]].map(([key,value])=><React.Fragment key={key}><dt>{key}</dt><dd>{value}</dd></React.Fragment>)}</dl>
    <section className="attendanceCard"><small>{attendance?.at_farm?(english?'ON SHIFT':'MESAİ İÇİNDE'):(english?'OFF SHIFT':'MESAİ DIŞI')}</small><strong>{duration(attendance?.work_seconds,english)}</strong><dl><dt>{english?'Clock-in':'Mesai başlangıcı'}</dt><dd>{clock(attendance?.first_clock_in??null,english)}</dd><dt>{english?'Clock-out':'Mesai bitişi'}</dt><dd>{clock(attendance?.last_clock_out??null,english)}</dd></dl></section>
    {device&&<details className="detailSection"><summary>{english?'Device settings':'Cihaz ayarları'}</summary><button className="danger" disabled={busy} onClick={()=>{if(confirm(t.revoke+'?'))void run(async()=>{await request('/api/admin/devices/'+device.id,'PATCH',{revoked:true});await load();});}}>{t.revoke}</button><div className="intervals">{[[t.moving,moving,setMoving,10,60],[t.stationary,stationary,setStationary,30,300],[t.threshold,after,setAfter,120,900],[english?'Server check':'Sunucu kontrolü',heartbeat,setHeartbeat,30,900]].map(([label,value,set,min,max])=><label key={String(label)}>{String(label)} (s)<input type="number" min={Number(min)} max={Number(max)} value={Number(value)} onChange={event=>(set as (n:number)=>void)(+event.target.value)}/></label>)}</div><button disabled={busy} onClick={()=>void run(async()=>{await request('/api/admin/devices/'+device.id,'PATCH',{moving_seconds:moving,stationary_seconds:stationary,stationary_after:after,heartbeat_seconds:heartbeat});await load();})}>{t.save}</button></details>}
    <details className="detailSection"><summary>{english?'Location history':'Konum geçmişi'}</summary><label>UTC — {t.history}<input type="datetime-local" value={from} onChange={event=>setFrom(event.target.value)}/><input type="datetime-local" value={to} onChange={event=>setTo(event.target.value)}/></label><button disabled={busy} onClick={()=>void run(history)}>{t.history}</button><button disabled={!route.length} onClick={()=>setRoute([])}>{t.clear}</button><button disabled={!route.length} onClick={()=>{const blob=new Blob([csv(route)],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download=`locations-${selected}.csv`;anchor.click();URL.revokeObjectURL(url);}}>{t.export} ({route.length})</button></details>
    <details className="detailSection"><summary>{english?'Staff actions':'Personel işlemleri'}</summary><button className="danger" disabled={busy} onClick={()=>{const message=english?`Permanently delete ${person.name} and all device, location and time-clock records?`:`${person.name} ve bağlı tüm cihaz, konum ve mesai kayıtları kalıcı olarak silinsin mi?`;if(confirm(message))void run(async()=>{await request('/api/admin/staff/'+person.id,'DELETE');setSelected('');setRoute([]);setAttendance(null);await load();})}}>{t.deleteStaff}</button></details>
   </>}</aside>
  </main>:null}
  {error&&<div role="alert" className="error">{error}<button onClick={()=>setError('')}>×</button></div>}
 </>;
}

createRoot(document.getElementById('root')!).render(<App/>);
