export type Point={id:string;staff_id:string;device_id:string;measured_at:string;received_at:string;latitude:number;longitude:number;accuracy:number;battery:number|null;motion:string;clock_skew:boolean};
export type Device={id:string;staff_id:string;revoked:boolean;last_seen:string|null;app_version:string|null;queue_count:number|null;dropped_count:number;location_enabled:boolean|null;clock_skew?:boolean;at_farm?:boolean|null;moving_seconds:number;stationary_seconds:number;heartbeat_seconds?:number;stationary_after:number};
export function elapsedAge(value:string|null|undefined,now=Date.now(),english=false){
 if(!value)return english?'Never':'Henüz yok';
 const measured=Date.parse(value);if(!Number.isFinite(measured))return english?'Never':'Henüz yok';
 const seconds=Math.max(0,Math.floor((now-measured)/1000));
 if(seconds<60)return `${seconds} ${english?'sec':'sn'}`;
 const minutes=Math.floor(seconds/60);if(minutes<60)return `${minutes} ${english?'min':'dk'}`;
 const hours=Math.floor(minutes/60);if(hours<24)return `${hours} ${english?'h':'sa'}`;
 const days=Math.floor(hours/24);if(days<7)return `${days} ${english?(days===1?'day':'days'):'gün'}`;
 const weeks=Math.floor(days/7);return `${weeks} ${english?(weeks===1?'week':'weeks'):'hafta'}`;
}
export function state(p:Point|undefined,d:Device|undefined,now=Date.now()){
 if(!d||d.revoked) return 'unpaired';
 const seen=d.last_seen?Date.parse(d.last_seen):NaN;
 // Outside coordinates are intentionally hidden; phones there may send only
 // once an hour. Inside, heartbeat and location uploads are separate clocks.
 const communicationSeconds=d.at_farm===false?3600:Math.max(300,d.heartbeat_seconds??600);
 const silence=(now-seen)/1000;
 if(!Number.isFinite(seen)||silence>communicationSeconds*2+60)return 'missing';
 if(d.clock_skew||seen>now+30_000)return 'inaccurate';
 if(d.location_enabled===false)return 'noLocation';
 if(silence>communicationSeconds+60)return 'late';
 if(d.at_farm===false)return 'offsite';
 if(!p||p.device_id!==d.id||p.staff_id!==d.staff_id)return 'noLocation';
 const measured=Date.parse(p.measured_at);
 if(!Number.isFinite(measured)||measured>now+30_000)return 'inaccurate';
 // Native clients upload at 60 s while moving and 300 s while stationary.
 // Allow one measurement interval, one upload interval and 30 s for delivery
 // and panel polling. Receiving a queued old fix never refreshes its age.
 const moving=p.motion==='moving';
 const freshnessSeconds=(moving?d.moving_seconds:d.stationary_seconds)+(moving?60:300)+30;
 if(now-measured>freshnessSeconds*1000)return 'late';
 if(p.accuracy>50 || p.clock_skew)return 'inaccurate';
 return 'current';
}
export function segments(points:Point[],gapSeconds=180):Point[][]{
 const result:Point[][]=[];
 for(const p of points.filter(p=>!p.clock_skew&&p.accuracy<=100)){
  const last=result.at(-1);const prev=last?.at(-1);
  if(!last || (prev && Date.parse(p.measured_at)-Date.parse(prev.measured_at)>gapSeconds*1000))result.push([p]);else last.push(p);
 }
 return result.filter(s=>s.length>1);
}
export function csv(points:Point[]){
 const cols=['id','staff_id','device_id','measured_at','received_at','latitude','longitude','accuracy','battery','motion','clock_skew'] as const;
 const quote=(v:unknown)=>`"${String(v??'').replace(/^[=+@-]/,"'$&").replaceAll('"','""')}"`;
 return '\ufeff'+[cols.join(','),...points.map(p=>cols.map(c=>quote(p[c])).join(','))].join('\r\n');
}
