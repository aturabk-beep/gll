import {useEffect,useRef,useMemo,useState} from 'react';
import L from 'leaflet';
import {type Point} from './domain';
import {initials,coloredRoute,routeColor,routeGradient} from './map-display';
import {FarmImage} from './FarmImage';
import {farmImageBounds,farmPreviewBoundary} from './farm-preview';
import type {Camera} from './cameras';

// The active operational boundary is still the temporary office test area.
const testBounds=L.latLngBounds([39.89885,32.77261],[39.90107,32.77481]);
const farmBounds=L.latLngBounds([farmImageBounds.south,farmImageBounds.west],[farmImageBounds.north,farmImageBounds.east]);
let gradientId=0;
export type FarmBoundary={buffer_meters:number;south:number;west:number;north:number;east:number;centerLat:number;centerLon:number;radius_meters:number};
export type MapSite='test'|'farm';
export function FarmMap({points,selected,route,staff=[],english=false,cameras=[],activeCamera='',onMapPick,boundary,showBoundary=false,site,onSiteChange,farmBufferMeters=100}:{points:Point[];selected:string;route:Point[];staff?:{id:string;name:string}[];english?:boolean;cameras?:Camera[];activeCamera?:string;onMapPick?:(latitude:number,longitude:number)=>void;boundary?:FarmBoundary|null;showBoundary?:boolean;site?:MapSite;onSiteChange?:(site:MapSite)=>void;farmBufferMeters?:number}){
 const [localSite,setLocalSite]=useState<MapSite>('test'),activeSite=site??localSite;
 const chooseSite=(next:MapSite)=>{if(onSiteChange)onSiteChange(next);else setLocalSite(next);};
 const el=useRef<HTMLDivElement>(null),map=useRef<L.Map|null>(null),layer=useRef<L.LayerGroup|null>(null),farmImage=useRef<FarmImage|null>(null),focused=useRef(selected);
 const trail=useMemo(()=>coloredRoute(route),[route]);
 useEffect(()=>{
  if(!el.current)return;
  const m=L.map(el.current,{maxZoom:21});map.current=m;
  const satellite=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxNativeZoom:19,maxZoom:21,attribution:'Tiles &copy; Esri — Source: Esri, Vantor, Earthstar Geographics, and the GIS User Community'}).addTo(m);
  const streets=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxNativeZoom:19,maxZoom:21,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'});
  farmImage.current=new FarmImage();
  L.control.layers({'Uydu / Satellite':satellite,'Harita / Map':streets},{'Çiftlik görseli / Farm image':farmImage.current},{position:'topright'}).addTo(m);
  L.control.scale({imperial:false}).addTo(m);
  layer.current=L.layerGroup().addTo(m);m.fitBounds(testBounds,{padding:[24,24]});
  const resize=new ResizeObserver(()=>m.invalidateSize());resize.observe(el.current);
  return()=>{resize.disconnect();m.remove();map.current=null;layer.current=null;farmImage.current=null;};
 },[]);
 useEffect(()=>{const m=map.current;if(!m)return;if(activeSite==='farm'&&farmImage.current&&!m.hasLayer(farmImage.current))farmImage.current.addTo(m);m.fitBounds(activeSite==='farm'?farmBounds:testBounds,{padding:[24,24]});},[activeSite]);
 useEffect(()=>{const m=map.current;if(!m||!onMapPick)return;const pick=(e:L.LeafletMouseEvent)=>onMapPick(e.latlng.lat,e.latlng.lng);m.on('click',pick);return()=>{m.off('click',pick)};},[onMapPick]);
 useEffect(()=>{const m=map.current;if(!m||!showBoundary)return;const active=activeSite==='farm'?farmPreviewBoundary(farmBufferMeters):boundary;if(!active)return;const bounds=L.latLngBounds([active.south,active.west],[active.north,active.east]);const label=activeSite==='farm'?(english?`Farm preview (+${active.buffer_meters} m)`:`Çiftlik önizlemesi (+${active.buffer_meters} m)`):(english?`Test boundary (+${active.buffer_meters} m)`:`Test alanı sınırı (+${active.buffer_meters} m)`);const rectangle=L.rectangle(bounds,{className:'farmBoundary',color:'#2c8f68',weight:3,dashArray:'8 6',fillColor:'#88d9b7',fillOpacity:.14}).bindTooltip(label).addTo(m);m.fitBounds(bounds,{padding:[55,55]});return()=>{rectangle.remove()};},[boundary,showBoundary,english,activeSite,farmBufferMeters]);
 useEffect(()=>{const m=map.current;if(!m)return;const g=L.layerGroup().addTo(m);for(const c of cameras){const chosen=c.id===activeCamera;L.circle([c.latitude,c.longitude],{radius:c.radius,color:chosen?'#e2a94d':'#487ca3',weight:chosen?3:1,fillOpacity:chosen?.15:.05}).bindTooltip(()=>{const label=document.createElement('span');label.textContent=c.name;return label}).addTo(g);}return()=>{g.remove()};},[cameras,activeCamera]);
 useEffect(()=>{
  const m=map.current,g=layer.current;if(!m||!g)return;g.clearLayers();
  for(const p of points){
   const name=staff.find(s=>s.id===p.staff_id)?.name??'';
   const badge=document.createElement('span');badge.className='staffInitials'+(p.staff_id===selected?' selected':'');badge.textContent=initials(name);
   const tooltip=document.createElement('span');tooltip.textContent=name;
   L.marker([p.latitude,p.longitude],{icon:L.divIcon({html:badge,className:'staffMarker',iconSize:[18,18],iconAnchor:[9,9]}),title:name,zIndexOffset:p.staff_id===selected?200:0}).bindTooltip(tooltip).addTo(g);
   if(p.staff_id===selected)L.circle([p.latitude,p.longitude],{radius:p.accuracy,color:'#e2a94d',weight:1,fillOpacity:.12}).addTo(g);
  }
  const point=points.find(p=>p.staff_id===selected);
  if(selected&&selected!==focused.current&&point){m.setView([point.latitude,point.longitude],18);focused.current=selected;}
 },[points,selected,staff]);
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
  if(trail.first)m.fitBounds(L.latLngBounds(trail.groups.flatMap(s=>s.points.map(p=>L.latLng(p.latitude,p.longitude)))),{padding:[60,60],maxZoom:19});
  return()=>{m.off('zoom viewreset moveend',alignGradients);for(const {node} of gradients)node.remove();g.remove()};
 },[trail,english]);
 function showPerson(){const p=points.find(p=>p.staff_id===selected);if(p)map.current?.setView([p.latitude,p.longitude],18);}
 return <><div className="map" ref={el}/><div className="mapActions"><button aria-pressed={activeSite==='test'} onClick={()=>{chooseSite('test');map.current?.fitBounds(testBounds,{padding:[24,24]})}}>{english?'Go to test site':'Test alanına git'}</button><button aria-pressed={activeSite==='farm'} onClick={()=>{chooseSite('farm');map.current?.fitBounds(farmBounds,{padding:[24,24]})}}>{english?'Go to farm':'Çiftliğe git'}</button><button disabled={!points.some(p=>p.staff_id===selected)} onClick={showPerson}>{english?'Go to person':'Personele git'}</button></div>{activeSite==='farm'&&<div className="mapPreviewNote">{english?'Farm image and boundary are a preview; live tracking remains at the test site.':'Çiftlik görseli ve sınırı önizlemedir; canlı takip test alanındadır.'}</div>}{trail.first&&<div className="routeLegend"><span>{english?'Start · 0%':'Başlangıç · %0'}</span><i style={{background:routeGradient}}/><span>{english?'End · 100%':'Bitiş · %100'}</span></div>}</>;
}
