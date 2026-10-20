import L from 'leaflet';
import calibration from './farm-image.json';

// Keep the supplied raster unchanged; project it into the map with a CSS homography.
export class FarmImage extends L.Layer {
 private image?:HTMLImageElement;
 private container?:HTMLDivElement;
 private map?:L.Map;
 private opacity=1;
 onAdd(map:L.Map):this {
  this.map=map;
  const pane=map.getPane('farmImagePane')||map.createPane('farmImagePane');
  pane.style.zIndex='350';pane.style.pointerEvents='none';
  this.container=L.DomUtil.create('div','leaflet-zoom-animated',pane);
  Object.assign(this.container.style,{position:'absolute',transformOrigin:'0 0'});
  this.image=L.DomUtil.create('img','',this.container);
  this.image.onload=()=>this.fire('load');
  this.image.onerror=()=>this.fire('error');
  this.image.src=calibration.image;this.image.alt='Gülel çiftlik görseli';
  Object.assign(this.image.style,{position:'absolute',width:`${calibration.width}px`,height:`${calibration.height}px`,maxWidth:'none',transformOrigin:'0 0',opacity:String(this.opacity)});
  map.on('zoom viewreset moveend',this.reset,this);
  map.on('zoomanim',this.animateZoom,this);this.reset();return this;
 }
 onRemove(map:L.Map):this {map.off('zoom viewreset moveend',this.reset,this);map.off('zoomanim',this.animateZoom,this);if(this.image){this.image.onload=null;this.image.onerror=null;}this.container?.remove();this.container=undefined;this.image=undefined;this.map=undefined;return this;}
 setOpacity(value:number){this.opacity=value;if(this.image)this.image.style.opacity=String(value);}
 private animateZoom(event:L.ZoomAnimEvent){
  if(!this.map||!this.container)return;
  const map=this.map,scale=map.getZoomScale(event.zoom);
  // Same target pixel origin as Leaflet's tiles and image overlays, without private APIs.
  const panePosition=map.containerPointToLayerPoint([0,0]).multiplyBy(-1);
  const origin=map.project(event.center,event.zoom).subtract(map.getSize().divideBy(2)).add(panePosition).round();
  const offset=map.project(map.layerPointToLatLng([0,0]),event.zoom).subtract(origin);
  L.DomUtil.setTransform(this.container,offset,scale);
 }
 private reset(){
  if(!this.map||!this.image)return;
  if(this.container)L.DomUtil.setTransform(this.container,L.point(0,0),1);
  const e=calibration.extent,h=calibration.matrix;
  const tl=this.map.latLngToLayerPoint(L.CRS.EPSG3857.unproject(L.point(e.xmin,e.ymax)));
  const br=this.map.latLngToLayerPoint(L.CRS.EPSG3857.unproject(L.point(e.xmax,e.ymin)));
  const sx=(br.x-tl.x)/calibration.referenceWidth,sy=(br.y-tl.y)/calibration.referenceHeight;
  const a=sx*h[0]+tl.x*h[6],b=sx*h[1]+tl.x*h[7],c=sx*h[2]+tl.x*h[8];
  const d=sy*h[3]+tl.y*h[6],f=sy*h[4]+tl.y*h[7],g=sy*h[5]+tl.y*h[8];
  this.image.style.transform=`matrix3d(${[a,d,0,h[6],b,f,0,h[7],0,0,1,0,c,g,0,h[8]].join(',')})`;
 }
}
