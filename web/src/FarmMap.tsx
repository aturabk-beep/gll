import {useEffect,useRef,useMemo,useState} from 'react';
import L from 'leaflet';
import {state,elapsedAge,statusWords,type Point,type Device} from './domain';
import {initials,coloredRoute,routeColor,routeGradient} from './map-display';
import {FarmImage} from './FarmImage';
import {farmImageBounds,farmPreviewBoundary} from './farm-preview';
import {bestCamera,type Camera} from './cameras';

// The active operational boundary is still the temporary office test area.
const testBounds=L.latLngBounds([39.89885,32.77261],[39.90107,32.77481]);
const farmBounds=L.latLngBounds([farmImageBounds.south,farmImageBounds.west],[farmImageBounds.north,farmImageBounds.east]);
let gradientId=0;
// The Locations screen floats the staff list and detail panel over the map's edges (CSS --map-inset / --map-inset-right); keep fitted and focused content clear of them.
const inset=(m:L.Map,side='')=>parseFloat(getComputedStyle(m.getContainer()).getPropertyValue('--map-inset'+side))||0;
const fitVisible=(m:L.Map,bounds:L.LatLngBounds,pad:number,maxZoom?:number)=>m.fitBounds(bounds,{paddingTopLeft:[pad+inset(m),pad],paddingBottomRight:[pad+inset(m,'-right'),pad],maxZoom});
const centerOn=(m:L.Map,latitude:number,longitude:number,zoom=18)=>m.setView(m.unproject(m.project([latitude,longitude],zoom).subtract([(inset(m)-inset(m,'-right'))/2,0]),zoom),zoom);
const cameraIcon='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m16 13 5.2 3.5a.5.5 0 0 0 .8-.4V7.9a.5.5 0 0 0-.8-.4L16 11"/><rect x="2" y="6" width="14" height="12" rx="2"/></svg>';
// Hover card for a staff marker; plain DOM text so names are never parsed as HTML.
function staffCard(name:string,workplace:string|null|undefined,p:Point,d:Device|undefined,now:number,english:boolean,camera?:{camera:Camera;kind:'inside'|'near';open:()=>void}|null){
 const status=state(p,d,now),card=document.createElement('div'),head=card.appendChild(document.createElement('div')),title=head.appendChild(document.createElement('b')),pill=head.appendChild(document.createElement('span'));
 head.className='staffCardHead';title.textContent=name;pill.className='staffCardStatus '+status;pill.textContent=statusWords[english?'en':'tr'][status];
 if(workplace){const place=card.appendChild(document.createElement('div'));place.className='staffCardPlace';place.textContent=workplace;}
 const rows=card.appendChild(document.createElement('dl'));
 for(const [label,value] of [[english?'Last valid location':'Son geçerli konum',elapsedAge(p.measured_at,now,english)],[english?'Last communication':'Son haberleşme',elapsedAge(d?.last_seen,now,english)],[english?'Accuracy':'Doğruluk',`±${Math.round(p.accuracy)} m`],[english?'Battery':'Pil',p.battery==null?'—':`${p.battery}%`],[english?'Motion':'Hareket',p.motion==='moving'?(english?'Moving':'Hareketli'):(english?'Stationary':'Sabit')]]){rows.appendChild(document.createElement('dt')).textContent=label;rows.appendChild(document.createElement('dd')).textContent=value;}
 if(camera){
  const foot=card.appendChild(document.createElement('div')),icon=foot.appendChild(document.createElement('span')),about=foot.appendChild(document.createElement('div')),go=foot.appendChild(document.createElement('button'));
  foot.className='staffCardCamera';icon.className='staffCardCameraIcon';icon.innerHTML=cameraIcon;
  about.appendChild(document.createElement('b')).textContent=camera.camera.name;
  about.appendChild(document.createElement('small')).textContent=camera.kind==='inside'?(english?'Location within camera area':'Konum kamera alanında'):(english?'Accuracy area overlaps':'Hata payıyla örtüşüyor');
  go.type='button';go.textContent=english?'Go to camera →':'Kameraya git →';go.onclick=camera.open;
 }
 return card;
}
export type FarmBoundary={buffer_meters:number;south:number;west:number;north:number;east:number;centerLat:number;centerLon:number;radius_meters:number};
export type MapSite='test'|'farm';
export function FarmMap({points,devices,now,selected,onSelect,cameraLinks,onCamera,route,staff=[],english=false,cameras=[],activeCamera='',onMapPick,boundary,showBoundary=false,site,onSiteChange,farmBufferMeters=100}:{points:Point[];devices?:Device[];now?:number;selected:string;onSelect?:(staffId:string)=>void;cameraLinks?:Camera[];onCamera?:(camera:Camera,staffId:string)=>void;route:Point[];staff?:{id:string;name:string;workplace?:string|null}[];english?:boolean;cameras?:Camera[];activeCamera?:string;onMapPick?:(latitude:number,longitude:number)=>void;boundary?:FarmBoundary|null;showBoundary?:boolean;site?:MapSite;onSiteChange?:(site:MapSite)=>void;farmBufferMeters?:number}){
 const [localSite,setLocalSite]=useState<MapSite>('test'),activeSite=site??localSite;
 const chooseSite=(next:MapSite)=>{if(onSiteChange)onSiteChange(next);else setLocalSite(next);};
 const el=useRef<HTMLDivElement>(null),map=useRef<L.Map|null>(null),layer=useRef<L.LayerGroup|null>(null),farmImage=useRef<FarmImage|null>(null),focused=useRef(selected),hovered=useRef(''),clicked=useRef('');
 // One shared, interactive hover card: it stays open while the pointer travels from the marker into it.
 const card=useRef<L.Tooltip|null>(null),cardTimer=useRef<number|undefined>(undefined),handlers=useRef({onSelect,onCamera});handlers.current={onSelect,onCamera};
 const hideCard=()=>{window.clearTimeout(cardTimer.current);cardTimer.current=window.setTimeout(()=>{if(card.current)map.current?.closeTooltip(card.current);hovered.current='';},180);};
 const trail=useMemo(()=>coloredRoute(route),[route]);
 useEffect(()=>{
  if(!el.current)return;
  const m=L.map(el.current,{maxZoom:21});map.current=m;
  const satellite=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxNativeZoom:19,maxZoom:21,attribution:'Tiles &copy; Esri — Source: Esri, Vantor, Earthstar Geographics, and the GIS User Community'}).addTo(m);
  const streets=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxNativeZoom:19,maxZoom:21,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'});
  farmImage.current=new FarmImage();
  L.control.layers({'Uydu / Satellite':satellite,'Harita / Map':streets},{'Çiftlik görseli / Farm image':farmImage.current},{position:'topright'}).addTo(m);
  L.control.scale({imperial:false}).addTo(m);
  layer.current=L.layerGroup().addTo(m);fitVisible(m,testBounds,24);
  const tip=L.tooltip({className:'staffCard',direction:'top',offset:[0,-12],opacity:1,interactive:true});card.current=tip;
  tip.on('add',()=>{const node=tip.getElement();if(!node)return;L.DomEvent.disableClickPropagation(node);node.onmouseenter=()=>window.clearTimeout(cardTimer.current);node.onmouseleave=hideCard;});
  const resize=new ResizeObserver(()=>m.invalidateSize());resize.observe(el.current);
  return()=>{window.clearTimeout(cardTimer.current);resize.disconnect();m.remove();map.current=null;layer.current=null;farmImage.current=null;card.current=null;};
 },[]);
 useEffect(()=>{const m=map.current;if(!m)return;if(activeSite==='farm'&&farmImage.current&&!m.hasLayer(farmImage.current))farmImage.current.addTo(m);fitVisible(m,activeSite==='farm'?farmBounds:testBounds,24);},[activeSite]);
 useEffect(()=>{const m=map.current;if(!m||!onMapPick)return;const pick=(e:L.LeafletMouseEvent)=>onMapPick(e.latlng.lat,e.latlng.lng);m.on('click',pick);return()=>{m.off('click',pick)};},[onMapPick]);
 useEffect(()=>{const m=map.current;if(!m||!showBoundary)return;const active=activeSite==='farm'?farmPreviewBoundary(farmBufferMeters):boundary;if(!active)return;const bounds=L.latLngBounds([active.south,active.west],[active.north,active.east]);const label=activeSite==='farm'?(english?`Farm preview (+${active.buffer_meters} m)`:`Çiftlik önizlemesi (+${active.buffer_meters} m)`):(english?`Test boundary (+${active.buffer_meters} m)`:`Test alanı sınırı (+${active.buffer_meters} m)`);const rectangle=L.rectangle(bounds,{className:'farmBoundary',color:'#2c8f68',weight:3,dashArray:'8 6',fillColor:'#88d9b7',fillOpacity:.14}).bindTooltip(label).addTo(m);fitVisible(m,bounds,55);return()=>{rectangle.remove()};},[boundary,showBoundary,english,activeSite,farmBufferMeters]);
 useEffect(()=>{const m=map.current;if(!m)return;const g=L.layerGroup().addTo(m);for(const c of cameras){const chosen=c.id===activeCamera;L.circle([c.latitude,c.longitude],{radius:c.radius,color:chosen?'#e2a94d':'#487ca3',weight:chosen?3:1,fillOpacity:chosen?.15:.05}).bindTooltip(()=>{const label=document.createElement('span');label.textContent=c.name;return label}).addTo(g);}return()=>{g.remove()};},[cameras,activeCamera]);
 useEffect(()=>{
  const m=map.current,g=layer.current,tip=card.current;if(!m||!g||!tip)return;g.clearLayers();const at=now??Date.now();
  const content=(p:Point)=>{
   const person=staff.find(s=>s.id===p.staff_id),device=devices?.find(d=>d.staff_id===p.staff_id),match=cameraLinks&&handlers.current.onCamera?bestCamera(cameraLinks,p,device,at):null;
   return staffCard(person?.name??'',person?.workplace,p,device,at,english,match&&{...match,open:()=>{map.current?.closeTooltip(tip);hovered.current='';handlers.current.onCamera?.(match.camera,p.staff_id);}});
  };
  for(const p of points){
   const name=staff.find(s=>s.id===p.staff_id)?.name??'';
   const badge=document.createElement('span');badge.className='staffInitials'+(p.staff_id===selected?' selected':'');badge.textContent=initials(name);
   // No native title: it would pop up over the card. The marker keeps its accessible name via aria-label.
   const marker=L.marker([p.latitude,p.longitude],{icon:L.divIcon({html:badge,className:'staffMarker',iconSize:[18,18],iconAnchor:[9,9]}),zIndexOffset:p.staff_id===selected?200:0}).addTo(g);
   const show=()=>{window.clearTimeout(cardTimer.current);hovered.current=p.staff_id;m.openTooltip(tip.setLatLng([p.latitude,p.longitude]).setContent(content(p)));};
   marker.on('mouseover',show).on('mouseout',hideCard).on('click',()=>{clicked.current=p.staff_id;handlers.current.onSelect?.(p.staff_id);});
   const element=marker.getElement();if(element){element.setAttribute('aria-label',name);element.addEventListener('focus',show);element.addEventListener('blur',hideCard);}
   if(p.staff_id===selected)L.circle([p.latitude,p.longitude],{radius:p.accuracy,color:'#e2a94d',weight:1,fillOpacity:.12}).addTo(g);
  }
  // Markers are rebuilt on every 10 s poll; refresh the open card in place so it doesn't vanish mid-read.
  const open=points.find(p=>p.staff_id===hovered.current);
  if(open&&m.hasLayer(tip))tip.setLatLng([open.latitude,open.longitude]).setContent(content(open));else if(m.hasLayer(tip)){m.closeTooltip(tip);hovered.current='';}
  const point=points.find(p=>p.staff_id===selected);
  // A person picked from the list is centred; one clicked on the map is already in view, so only nudge it clear of the panels.
  if(selected&&selected!==focused.current&&point){if(selected===clicked.current)m.panInside([point.latitude,point.longitude],{paddingTopLeft:[inset(m)+40,40],paddingBottomRight:[inset(m,'-right')+40,40]});else centerOn(m,point.latitude,point.longitude);focused.current=selected;}
  clicked.current='';
 },[points,devices,now,selected,staff,english,cameraLinks]);
 useEffect(()=>{
  const m=map.current;if(!m)return;const g=L.layerGroup().addTo(m);
  const gradients:{node:SVGLinearGradientElement;first:Point;last:Point}[]=[];
  const start=Date.parse(trail.first?.measured_at??''),duration=Date.parse(trail.last?.measured_at??'')-start;
  for(const s of trail.groups){
   const line=L.polyline(s.points.map(p=>[p.latitude,p.longitude] as L.LatLngTuple),{color:s.color,weight:3.5,opacity:.72}).addTo(g);
   const path=line.getElement(),svg=path instanceof SVGElement?path.ownerSVGElement:null;
   if(path&&svg){
    const node=document.createElementNS('http://www.w3.org/2000/svg','linearGradient');node.id=`route-gradient-${++gradientId}`;node.setAttribute('gradientUnits','userSpaceOnUse');
    const first=s.points[0],last=s.points.at(-1)!;
    for(const [p,offset] of [[first,'0%'],[last,'100%']] as const){const stop=document.createElementNS(node.namespaceURI,'stop');stop.setAttribute('offset',offset);stop.setAttribute('stop-color',routeColor(duration>0?(Date.parse(p.measured_at)-start)/duration:0));node.appendChild(stop)}
    svg.appendChild(node);path.setAttribute('stroke',`url(#${node.id})`);gradients.push({node,first,last});
   }
  }
  const alignGradients=()=>{for(const {node,first,last} of gradients){const a=m.latLngToLayerPoint([first.latitude,first.longitude]),b=m.latLngToLayerPoint([last.latitude,last.longitude]);node.setAttribute('x1',String(a.x));node.setAttribute('y1',String(a.y));node.setAttribute('x2',String(a.equals(b)?b.x+1:b.x));node.setAttribute('y2',String(b.y))}};
  m.on('zoom viewreset moveend',alignGradients);alignGradients();
  for(const [p,label,kind] of [[trail.first,english?'Start':'Başlangıç','start'],[trail.last,english?'End':'Bitiş','end']] as const){
   if(!p)continue;const node=document.createElement('span');node.textContent=label;node.className='routeEndpoint '+kind;
   L.marker([p.latitude,p.longitude],{icon:L.divIcon({html:node,className:'routeEndpointMarker',iconSize:[58,20],iconAnchor:kind==='start'?[58,25]:[0,-6]}),zIndexOffset:300}).bindTooltip(new Date(p.measured_at).toISOString().replace('T',' ').replace('.000Z',' UTC')).addTo(g);
  }
  if(trail.first)fitVisible(m,L.latLngBounds(trail.groups.flatMap(s=>s.points.map(p=>L.latLng(p.latitude,p.longitude)))),60,19);
  return()=>{m.off('zoom viewreset moveend',alignGradients);for(const {node} of gradients)node.remove();g.remove()};
 },[trail,english]);
 function showPerson(){const p=points.find(p=>p.staff_id===selected);if(p&&map.current)centerOn(map.current,p.latitude,p.longitude);}
 return <><div className="map" ref={el}/><div className="mapActions"><button aria-pressed={activeSite==='test'} onClick={()=>{chooseSite('test');if(map.current)fitVisible(map.current,testBounds,24)}}>{english?'Go to test site':'Test alanına git'}</button><button aria-pressed={activeSite==='farm'} onClick={()=>{chooseSite('farm');if(map.current)fitVisible(map.current,farmBounds,24)}}>{english?'Go to farm':'Çiftliğe git'}</button><button disabled={!points.some(p=>p.staff_id===selected)} onClick={showPerson}>{english?'Go to person':'Personele git'}</button></div>{activeSite==='farm'&&<div className="mapPreviewNote">{english?'Farm image and boundary are a preview; live tracking remains at the test site.':'Çiftlik görseli ve sınırı önizlemedir; canlı takip test alanındadır.'}</div>}{trail.first&&<div className="routeLegend"><span>{english?'Start · 0%':'Başlangıç · %0'}</span><i style={{background:routeGradient}}/><span>{english?'End · 100%':'Bitiş · %100'}</span></div>}</>;
}
