import {it,expect} from 'vitest';
import {cameraMatch,bestCamera,type Camera} from './cameras';
import type {Point,Device} from './domain';
const now=Date.now(),c:Camera={id:'c',name:'Gate',latitude:37,longitude:30,radius:30,url:''};
const p:Point={id:'p',staff_id:'s',device_id:'d',latitude:37,longitude:30,accuracy:10,measured_at:new Date(now).toISOString(),received_at:new Date(now).toISOString(),battery:80,motion:'moving',clock_skew:false};
const d:Device={id:'d',staff_id:'s',revoked:false,last_seen:new Date(now).toISOString(),app_version:'test',queue_count:0,dropped_count:0,location_enabled:true,moving_seconds:10,stationary_seconds:60,stationary_after:180};
it('distinguishes contained accuracy from boundary overlap',()=>{expect(cameraMatch(c,p,d,now)).toBe('inside');expect(cameraMatch(c,{...p,latitude:37.0003,accuracy:20},d,now)).toBe('near');expect(cameraMatch(c,{...p,latitude:37.001},d,now)).toBeNull()});
it('does not associate old, unreliable or unavailable locations',()=>{for(const fix of [{...p,measured_at:new Date(now-200000).toISOString()},{...p,accuracy:90},{...p,clock_skew:true}])expect(cameraMatch(c,fix,d,now)).toBeNull();expect(cameraMatch(c,p,undefined,now)).toBeNull();expect(cameraMatch(c,p,{...d,location_enabled:false},now)).toBeNull()});
it('offers the containing camera before an overlap, then the nearest one',()=>{
 const overlap={...c,id:'overlap',latitude:37.0003},containing={...c,id:'containing',latitude:37.0005,radius:100},wide={...c,id:'wide',latitude:37.0001,radius:60};
 expect(bestCamera([overlap,containing],p,d,now)?.camera.id).toBe('containing');
 expect(bestCamera([wide,c],p,d,now)?.camera.id).toBe('c');
 expect(bestCamera([overlap],p,d,now)?.kind).toBe('near');
 expect(bestCamera([{...c,latitude:37.01}],p,d,now)).toBeNull();expect(bestCamera([c],p,undefined,now)).toBeNull();
});
