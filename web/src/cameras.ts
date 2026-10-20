import {state,type Point,type Device} from './domain';
export type Camera={id:string;name:string;latitude:number;longitude:number;radius:number;url:string};
export function cameraMatch(camera:Camera,point:Point|undefined,device:Device|undefined,now:number):'inside'|'near'|null{
 if(!point||state(point,device,now)!=='current')return null;
 const rad=Math.PI/180,dlat=(point.latitude-camera.latitude)*rad,dlon=(point.longitude-camera.longitude)*rad;
 const a=Math.sin(dlat/2)**2+Math.cos(camera.latitude*rad)*Math.cos(point.latitude*rad)*Math.sin(dlon/2)**2;
 const distance=6371000*2*Math.asin(Math.sqrt(Math.min(1,a)));
 if(distance+point.accuracy<=camera.radius)return 'inside';
 if(distance-point.accuracy<=camera.radius)return 'near';
 return null;
}
