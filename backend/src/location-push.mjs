import {randomUUID} from 'node:crypto';
import {digest,randomToken,limited} from './auth.mjs';
import {transaction} from './database.mjs';
import {farmBoundary,isWithinFarmBoundary} from './attendance.mjs';
import {pushDiagnostic} from './apns-errors.mjs';

const fail=(statusCode,message)=>Object.assign(Error(message),{statusCode});
const secret={type:'string',pattern:'^[a-f0-9]{64}$'},uuid={type:'string',format:'uuid'};
const object=(properties,required=Object.keys(properties))=>({type:'object',additionalProperties:false,properties,required});
const responseAuth={request_id:uuid,response_token:secret};
const fix=object({measured_at:{type:'string',format:'date-time'},latitude:{type:'number',minimum:-90,maximum:90},longitude:{type:'number',minimum:-180,maximum:180},accuracy:{type:'number',minimum:0,maximum:35}});
const pending="('sending','accepted')";
const deviceErrors=['LocationTimedOut','StaleLocation','InsufficientAccuracy','LocationServicesDisabled','AuthorizationNotReady','AlwaysPermissionRequired','PreciseLocationRequired','LocationDenied','LocationUnknown','LocationServiceError'];

export function locationPushRoutes(app,{pool,admin,send}){
  async function device(c,token){
    const row=(await c.query('select d.* from public.devices d join private.tokens t on t.device_id=d.id where t.hash=$1 and not d.revoked for update of d',[Buffer.from(digest(token),'hex')])).rows[0];
    if(!row)throw fail(403,'Invalid device');return row;
  }
  app.post('/api/device/location-push',{schema:{body:object({p_token:secret,enabled:{type:'boolean'},token:{type:'string',pattern:'^[a-f0-9]{32,512}$'},environment:{enum:['development','production']}},['p_token','enabled'])}},async req=>{
    if(await limited(pool,'lp:registration:'+digest(req.body.p_token),30,3600))throw fail(429,'Retry later');
    return transaction(pool,null,async c=>{
      const d=await device(c,req.body.p_token),b=req.body;
      if(b.enabled){
        if(!b.token||!b.environment)throw fail(400,'Push token and environment required');
        await c.query(`insert into private.location_push_devices(device_id,token,environment) values($1,$2,$3)
          on conflict(device_id) do update set token=$2,environment=$3,enabled=true,updated_at=now()`,[d.id,b.token,b.environment]);
      }else{
        await c.query('delete from private.location_push_devices where device_id=$1',[d.id]);
        await c.query(`update private.location_push_requests set status='cancelled',completed_at=now() where device_id=$1 and status in ${pending}`,[d.id]);
      }
      return {ok:true,configured:Boolean(send)};
    });
  });
  const params=object({id:uuid});
  app.get('/api/admin/staff/:id/location-push',{preHandler:admin,schema:{params}},async req=>{
    const d=(await pool.query(`select d.id,p.enabled from public.devices d left join private.location_push_devices p on p.device_id=d.id where d.staff_id=$1 and not d.revoked`,[req.params.id])).rows[0];
    const r=d?(await pool.query('select id,status,created_at,expires_at,completed_at,error_code,http_status,push_environment,device_error from private.location_push_requests where device_id=$1 order by created_at desc limit 1',[d.id])).rows[0]:null;
    if(r&&['sending','accepted'].includes(r.status)&&new Date(r.expires_at)<=new Date())r.status='timeout';
    return {configured:Boolean(send),available:Boolean(d?.enabled),request:r??null,retry_at:null};
  });
  app.post('/api/admin/staff/:id/location-push',{preHandler:admin,schema:{params,body:object({})}},async req=>{
    if(!send)throw fail(503,'Location push is not configured');
    const responseToken=randomToken(),id=randomUUID();
    const registration=await transaction(pool,null,async c=>{
      // Serialize admins/instances; duplicate clicks reuse a pending request.
      const d=(await c.query('select id from public.devices where staff_id=$1 and not revoked for update',[req.params.id])).rows[0];
      if(!d)throw fail(409,'No active device');
      const p=(await c.query('select * from private.location_push_devices where device_id=$1 and enabled',[d.id])).rows[0];
      if(!p)throw fail(409,'Location sharing not enabled');
      const existing=(await c.query(`select id,status from private.location_push_requests where device_id=$1 and status in ${pending} and expires_at>now() order by created_at desc limit 1`,[d.id])).rows[0];
      if(existing)return {existing};
      const r=(await c.query("insert into private.location_push_requests(id,device_id,admin_id,response_hash,expires_at,status) values($1,$2,$3,$4,now()+interval '2 minutes','sending') returning expires_at",[id,d.id,req.admin.id,digest(responseToken)])).rows[0];
      return {...p,expiresAt:r.expires_at};
    });
    if(registration.existing)return {...registration.existing,reused:true};
    let outcome;try{outcome=await send({...registration,payload:{aps:{'content-available':1},request_id:id,response_token:responseToken}})}catch{outcome={accepted:false,reason:'NetworkError'}}
    const diagnostic=pushDiagnostic(outcome);
    await pool.query("update private.location_push_requests set status=case when status='sending' then $2 else status end,error_code=$3,http_status=$4,push_environment=$5 where id=$1",[id,outcome.accepted?'accepted':'failed',diagnostic.error_code,diagnostic.http_status,registration.environment]);
    if(outcome.invalidToken)await pool.query('delete from private.location_push_devices where device_id=$1 and token=$2',[registration.device_id,registration.token]);
    return {id,status:outcome.accepted?'accepted':'failed',...diagnostic,push_environment:registration.environment};
  });
  async function authorized(c,b){
    const r=(await c.query(`select r.*,d.staff_id from private.location_push_requests r join public.devices d on d.id=r.device_id
      join private.location_push_devices p on p.device_id=d.id where r.id=$1 and r.response_hash=$2 and r.expires_at>now()
      and r.status in ${pending} and p.enabled and not d.revoked for update of d,r`,[b.request_id,digest(b.response_token)])).rows[0];
    if(!r)throw fail(403,'Request expired or unavailable');return r;
  }
  app.post('/api/device/location-push-authorize',{schema:{body:object(responseAuth)}},req=>transaction(pool,null,async c=>{await authorized(c,req.body);return {ok:true};}));
  app.post('/api/device/location-push-result',{schema:{body:object({...responseAuth,fix,result:{enum:['unavailable']},device_error:{enum:deviceErrors}},['request_id','response_token'])}},req=>transaction(pool,null,async c=>{
    const b=req.body,r=await authorized(c,b);
    if(Boolean(b.fix)===Boolean(b.result))throw fail(400,'Supply a fix or an unavailable result');
    if(b.device_error&&!b.result)throw fail(400,'Device error requires an unavailable result');
    let status='unavailable';
    if(b.fix){
      const p=b.fix,time=Date.parse(p.measured_at);
      if(time<Date.parse(r.created_at)-5000||time<Date.now()-60000||time>Date.now()+5000)throw fail(400,'A fresh location is required');
      const settings=(await c.query('select boundary_buffer_meters from public.farm_settings where id=true')).rows[0];
      const inside=isWithinFarmBoundary(p,farmBoundary(settings?.boundary_buffer_meters??100));
      status=inside?'received':'outside';
      // Outside coordinates are neither stored nor returned. A remote fix does
      // not pretend that the main application/heartbeat has restarted.
      if(inside){
        await c.query(`insert into public.locations(id,staff_id,device_id,measured_at,latitude,longitude,accuracy,motion)
          values($1,$2,$3,$4,$5,$6,$7,'unknown')`,[r.id,r.staff_id,r.device_id,p.measured_at,p.latitude,p.longitude,p.accuracy]);
        await c.query(`insert into public.latest_locations select * from public.locations where id=$1
          on conflict(staff_id) do update set
          (id,device_id,measured_at,received_at,latitude,longitude,accuracy,speed,heading,battery,motion,clock_skew)=
          (excluded.id,excluded.device_id,excluded.measured_at,excluded.received_at,excluded.latitude,excluded.longitude,excluded.accuracy,excluded.speed,excluded.heading,excluded.battery,excluded.motion,excluded.clock_skew)
          where excluded.measured_at>public.latest_locations.measured_at`,[r.id]);
      }
      await c.query(`update public.devices set at_farm=$2 where id=$1 and not exists
        (select 1 from public.locations where device_id=$1 and measured_at>$3)`,[r.device_id,inside,p.measured_at]);
    }
    await c.query('update private.location_push_requests set status=$2,device_error=$3,completed_at=now() where id=$1',[r.id,status,b.device_error??null]);
    return {ok:true};
  }));
}
