import {segments,type Point} from './domain';
export function initials(name:string){const words=name.trim().split(/\s+/).filter(Boolean);return words.length?([words[0],...(words.length>1?[words.at(-1)!]:[])].map(w=>Array.from(w)[0]).join('').toLocaleUpperCase('tr-TR')):'?'}
const routeColors=[[37,99,235],[56,189,248],[20,184,166],[132,204,22],[22,163,74]] as const;
export const routeGradient=`linear-gradient(to right,${routeColors.map((color,index)=>`rgb(${color.join(',')}) ${index*25}%`).join(',')})`;
export function routeColor(progress:number){
 const scaled=Math.max(0,Math.min(1,progress))*(routeColors.length-1),index=Math.min(routeColors.length-2,Math.floor(scaled)),amount=scaled-index;
 const from=routeColors[index],to=routeColors[index+1],mixed=from.map((value,channel)=>Math.round(value+(to[channel]-value)*amount));
 return `rgb(${mixed.join(', ')})`;
}
export function stabilizeRoute(points:Point[]){
 return points.map((point,index)=>{
  if(point.accuracy<=25)return point;
  const time=Date.parse(point.measured_at);
  const nearby=points.slice(Math.max(0,index-1),index+2).filter(candidate=>Math.abs(Date.parse(candidate.measured_at)-time)<=90000);
  if(nearby.length<2)return point;
  let latitude=0,longitude=0,total=0;
  for(const candidate of nearby){const weight=1/Math.max(5,candidate.accuracy)**2;latitude+=candidate.latitude*weight;longitude+=candidate.longitude*weight;total+=weight;}
  return {...point,latitude:latitude/total,longitude:longitude/total};
 });
}
// Bound the number of colour changes on long histories; retain every coordinate and gap.
export function coloredRoute(route:Point[]){
 const parts=segments([...route].sort((a,b)=>Date.parse(a.measured_at)-Date.parse(b.measured_at))).map(stabilizeRoute);
 const first=parts[0]?.[0],last=parts.at(-1)?.at(-1);
 if(!first||!last)return {groups:[],first,last};
 const start=Date.parse(first.measured_at),duration=Date.parse(last.measured_at)-start;
 const groups:{points:Point[];color:string}[]=[];
 for(const part of parts){let previousBucket=-1;for(let i=1;i<part.length;i++){
  const ratio=duration>0?(Date.parse(part[i-1].measured_at)-start)/duration:0;
  const bucket=Math.round(ratio*63);
  if(bucket===previousBucket)groups.at(-1)!.points.push(part[i]);
  else groups.push({points:[part[i-1],part[i]],color:routeColor(bucket/63)});
  previousBucket=bucket;
 }}
 return {groups,first,last};
}
