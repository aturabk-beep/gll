import {useEffect,useState} from 'react';
import {request} from './api';
import {FarmMap} from './FarmMap';
import {cameraMatch,type Camera} from './cameras';
import type {Point,Device} from './domain';
type Draft=Omit<Camera,'id'>;
const initial:Draft={name:'',latitude:39.89996,longitude:32.77371,radius:40,url:''};
export function CameraScreen({staff,devices,points,now,english,focus}:{staff:{id:string;name:string;workplace?:string|null}[];devices:Device[];points:Point[];now:number;english:boolean;focus?:{camera:string;person:string}|null}){
 const [cameras,setCameras]=useState<Camera[]>([]),[selected,setSelected]=useState(focus?.camera??''),[person,setPerson]=useState(focus?.person??''),[draft,setDraft]=useState<Draft|null>(null),[editId,setEditId]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const t=(tr:string,en:string)=>english?en:tr;
 const load=async()=>setCameras(await request<Camera[]>('/api/admin/cameras'));
 useEffect(()=>{let alive=true;request<Camera[]>('/api/admin/cameras').then(c=>{if(alive)setCameras(c)}).catch(e=>{if(alive)setError(e.message)});return()=>{alive=false}},[]);
 const active=cameras.find(c=>c.id===selected),selectedPoint=points.find(p=>p.staff_id===person);
 const match=(c:Camera,id:string)=>cameraMatch(c,points.find(p=>p.staff_id===id),devices.find(d=>d.staff_id===id),now);
 const matches=active?staff.flatMap(s=>{const kind=match(active,s.id);return kind?[{...s,kind}]:[]}):[];
 const run=async(f:()=>Promise<void>)=>{setBusy(true);setError('');try{await f()}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}};
 return <main className="cameraWorkspace"><aside className="cameraList"><div className="listHeader"><h2>{t('Kameralar','Cameras')}</h2><button disabled={busy} onClick={()=>{setDraft({...initial});setEditId('')}}>＋ {t('Ekle','Add')}</button></div>
 <label>{t('Personele göre','By person')}<select value={person} onChange={e=>setPerson(e.target.value)}><option value="">{t('Tüm personel','All staff')}</option>{staff.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
 {!cameras.length&&<p>{t('Henüz kamera eklenmedi.','No cameras yet.')}</p>}
 {cameras.map(c=><button className={'person '+(selected===c.id?'chosen':'')} key={c.id} onClick={()=>{setSelected(c.id);setDraft(null)}}><b>{c.name}</b><span>{person?(match(c,person)?t('Konumla örtüşüyor','Location overlaps'):t('Güncel konum eşleşmesi yok','No current location match')):`${staff.filter(s=>match(c,s.id)).length} ${t('personel adayı','possible staff')}`}</span></button>)}
 </aside><section className="cameraMain">
 <div className="cameraMap mapWrap"><FarmMap staff={staff} points={points} devices={devices} now={now} selected={person} onSelect={setPerson} cameraLinks={draft?undefined:cameras} onCamera={(camera,staffId)=>{setSelected(camera.id);setPerson(staffId);}} route={[]} english={english} cameras={draft?[...cameras.filter(c=>c.id!==editId),{...draft,id:'draft'}]:cameras} activeCamera={draft?'draft':selected} onMapPick={draft?(latitude,longitude)=>setDraft({...draft,latitude,longitude}):undefined}/>{draft&&<span className="mapHint">{t('Alan merkezini haritadan seç','Select the area centre on the map')}</span>}</div>
 {draft?<form className="cameraForm" onSubmit={e=>{e.preventDefault();void run(async()=>{const c=await request<Camera>('/api/admin/cameras'+(editId?'/'+editId:''),editId?'PUT':'POST',draft);await load();setSelected(c.id);setDraft(null)})}}>
 <h2>{editId?t('Kamerayı düzenle','Edit camera'):t('Kamera ekle','Add camera')}</h2>
 <label>{t('Kamera adı','Camera name')}<input required maxLength={100} value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/></label>
 <div className="cameraCoordinates"><label>{t('Enlem','Latitude')}<input required type="number" step="any" min="-90" max="90" value={draft.latitude} onChange={e=>setDraft({...draft,latitude:+e.target.value})}/></label><label>{t('Boylam','Longitude')}<input required type="number" step="any" min="-180" max="180" value={draft.longitude} onChange={e=>setDraft({...draft,longitude:+e.target.value})}/></label><label>{t('Alan yarıçapı (m)','Area radius (m)')}<input required type="number" min="5" max="1000" value={draft.radius} onChange={e=>setDraft({...draft,radius:+e.target.value})}/></label></div>
 <label>{t('Kamera izleme bağlantısı (isteğe bağlı)','Camera viewer link (optional)')}<input type="url" placeholder="https://" maxLength={2048} value={draft.url} onChange={e=>setDraft({...draft,url:e.target.value})}/></label>
 <div className="cameraButtons"><button type="submit" className="primary" disabled={busy}>{t('Kaydet','Save')}</button><button type="button" disabled={busy} onClick={()=>setDraft(null)}>{t('Vazgeç','Cancel')}</button></div></form>
 :active?<div className="cameraInfo"><div className="listHeader"><h2>{active.name}</h2><div className="cameraButtons">{active.url&&<a className="cameraLink" href={active.url} target="_blank" rel="noopener noreferrer">{t('Kamerayı aç ↗','Open camera ↗')}</a>}<button onClick={()=>{const {id,...value}=active;setDraft(value);setEditId(id)}}>{t('Düzenle','Edit')}</button><button className="danger" disabled={busy} onClick={()=>{if(confirm(t('Kamera silinsin mi?','Delete camera?')))void run(async()=>{await request('/api/admin/cameras/'+active.id,'DELETE');await load();setSelected('')})}}>{t('Sil','Delete')}</button></div></div>
 <h3>{t('Konuma göre personel adayları','Staff candidates by location')}</h3>
 {!matches.length?<p>{t('Bu alanda güncel personel konumu yok.','No current staff location in this area.')}</p>:<div className="cameraMatches">{matches.map(s=><button key={s.id} className={person===s.id?'chosen':''} onClick={()=>setPerson(s.id)}><b>{s.name}</b><span>{s.kind==='inside'?t('Konum alanda','Location within area'):t('Hata payıyla örtüşüyor','Accuracy area overlaps')}</span></button>)}</div>}
 </div>:<div className="cameraInfo"><h2>{t('Bir kamera seçin veya ekleyin','Select or add a camera')}</h2></div>}
 {person&&!selectedPoint&&<p className="cameraInfo">{t('Seçili personelin konumu henüz yok.','The selected person has no location yet.')}</p>}
 {error&&<div role="alert" className="cameraError">{error}</div>}
 </section></main>;
}
