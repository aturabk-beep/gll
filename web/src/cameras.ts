import {state,type Point,type Device} from './domain';
export type Camera={id:string;name:string;latitude:number;longitude:number;radius:number;url:string};
function distance(camera:Camera,point:Point){
 const rad=Math.PI/180,dlat=(point.latitude-camera.latitude)*rad,dlon=(point.longitude-camera.longitude)*rad;
 const a=Math.sin(dlat/2)**2+Math.cos(camera.latitude*rad)*Math.cos(point.latitude*rad)*Math.sin(dlon/2)**2;
 return 6371000*2*Math.asin(Math.sqrt(Math.min(1,a)));
}
export function cameraMatch(camera:Camera,point:Point|undefined,device:Device|undefined,now:number):'inside'|'near'|null{
 if(!point||state(point,device,now)!=='current')return null;
 const meters=distance(camera,point);
 if(meters+point.accuracy<=camera.radius)return 'inside';
 if(meters-point.accuracy<=camera.radius)return 'near';
 return null;
}
// The camera to offer for a person: a contained location beats an accuracy overlap, then the nearest centre wins.
export function bestCamera(cameras:Camera[],point:Point|undefined,device:Device|undefined,now:number){
 let best:{camera:Camera;kind:'inside'|'near';meters:number}|null=null;
 for(const camera of cameras){
  const kind=cameraMatch(camera,point,device,now);if(!kind||!point)continue;
  const meters=distance(camera,point);
  if(!best||(kind==='inside'&&best.kind==='near')||(kind===best.kind&&meters<best.meters))best={camera,kind,meters};
 }
 return best;
}
