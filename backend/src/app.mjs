import Fastify from 'fastify';
import {cameraRoutes} from './cameras.mjs';
import {locationPushRoutes} from './location-push.mjs';
import {createLocationPushSender} from './apns.mjs';
import cookie from '@fastify/cookie';
import staticFiles from '@fastify/static';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {transaction} from './database.mjs';
import {digest,randomToken,passwordHash,passwordMatches,limited} from './auth.mjs';
import {attendanceSummary,farmBoundary,isAtFarm,isWithinFarmBoundary,localDayRange} from './attendance.mjs';

const uuid={type:'string',format:'uuid'};
const hex={type:'string',pattern:'^[a-f0-9]{64}$'};
const optionalNumber=(min,max)=>({anyOf:[{type:'number',minimum:min,maximum:max},{type:'null'}]});
const point={type:'object',additionalProperties:false,required:['id','measured_at','latitude','longitude','accuracy'],properties:{
  id:uuid,staff_id:uuid,device_id:uuid,measured_at:{type:'string',format:'date-time'},latitude:{type:'number',minimum:-90,maximum:90},longitude:{type:'number',minimum:-180,maximum:180},accuracy:{type:'number',minimum:0,maximum:100000},speed:optionalNumber(0,500),heading:optionalNumber(0,359.999999),battery:{anyOf:[{type:'integer',minimum:0,maximum:100},{type:'null'}]},motion:{enum:['moving','stationary','unknown']}}};
const pairBody={type:'object',additionalProperties:false,required:['p_code','p_token'],properties:{p_code:{type:'string',pattern:'^[0-9]{4}$'},p_token:hex}};
const ingestBody={type:'object',additionalProperties:false,required:['p_token','p_points','p_status'],properties:{p_token:hex,p_points:{type:'array',maxItems:200,items:point},p_status:{type:'object',additionalProperties:false,required:['sent_at_ms'],properties:{sent_at_ms:{type:'number',minimum:0,maximum:1e15},app_version:{type:'string',maxLength:40},queue_count:{type:'integer',minimum:0,maximum:1000000},dropped_count:{type:'integer',minimum:0,maximum:Number.MAX_SAFE_INTEGER},location_enabled:{type:'boolean'}}}}};
const deviceUpdate={type:'object',additionalProperties:false,minProperties:1,properties:{heartbeat_seconds:{type:'integer',minimum:30,maximum:900},revoked:{const:true},moving_seconds:{type:'integer',minimum:10,maximum:60},stationary_seconds:{type:'integer',minimum:30,maximum:300},stationary_after:{type:'integer',minimum:120,maximum:900}}};
const error=(code,message)=>Object.assign(Error(message),{statusCode:code});
const attendanceDate={type:'string',pattern:'^\\d{4}-\\d{2}-\\d{2}$'};
const boundaryUpdate={type:'object',additionalProperties:false,required:['buffer_meters'],properties:{buffer_meters:{type:'integer',minimum:0,maximum:1000}}};
const timeClockBody={type:'object',additionalProperties:false,required:['p_token','action'],properties:{p_token:hex,action:{enum:['clock_in','clock_out']}}};

async function clockSummary(c,staffId,range,now=new Date()){
  const events=(await c.query('select action,occurred_at from public.time_clock_events where staff_id=$1 and occurred_at<$2 order by occurred_at',[staffId,range.to])).rows;
  let active=null,total=0,firstIn=null,lastOut=null;
  for(const event of events){const time=new Date(event.occurred_at);if(event.action==='clock_in'&&!active){active=time;if(+time>=Date.parse(range.from))firstIn??=time;}else if(event.action==='clock_out'&&active){const from=Math.max(+active,Date.parse(range.from)),to=Math.min(+time,Date.parse(range.to));if(to>from)total+=(to-from)/1000;if(+time>=Date.parse(range.from))lastOut=time;active=null;}}
  if(active){const from=Math.max(+active,Date.parse(range.from)),to=Math.min(+now,Date.parse(range.to));if(to>from)total+=(to-from)/1000;}
  return {clocked_in:Boolean(active),clocked_in_at:active?.toISOString()??null,first_clock_in:firstIn?.toISOString()??null,last_clock_out:lastOut?.toISOString()??null,work_seconds:Math.max(0,Math.round(total))};
}

export async function buildApp({pool,origin,production=true,serveWeb=true,logger=false,locationPushSender=createLocationPushSender()}){
  if(!origin||new URL(origin).origin!==origin||(production&&!origin.startsWith('https://')))throw Error('A valid PUBLIC_ORIGIN is required (HTTPS in production)');
  const app=Fastify({logger,disableRequestLogging:true,bodyLimit:262144,trustProxy:1,
    ajv:{customOptions:{removeAdditional:false,coerceTypes:false}}});
  await app.register(cookie);
  const cookieName=production?'__Host-gulel_session':'gulel_session';
  const cookieOptions={httpOnly:true,secure:production,sameSite:'strict',path:'/',maxAge:12*3600};
  const fakePassword=await passwordHash(randomToken());
  app.addHook('onSend',async(_req,reply,payload)=>{
    reply.header('X-Content-Type-Options','nosniff').header('Referrer-Policy','strict-origin-when-cross-origin').header('X-Frame-Options','DENY');
    if(production)reply.header('Strict-Transport-Security','max-age=31536000');
    reply.header('Cache-Control','no-store');return payload;
  });
  app.setErrorHandler((err,req,reply)=>{
    let status=err.statusCode||500;
    if(err.code==='42501')status=403;
    if(['23505','23503'].includes(err.code))status=409;
    if(['23514','22P02','22003','22007','22008'].includes(err.code))status=400;
    if(status>=500)app.log.error({code:err.code||'internal'},'Request failed');
    reply.code(status).send({error:status>=500?'Server error':err.validation?'Invalid request':status===403?'Forbidden':status===409?'Conflict':err.message});
  });
  async function browserOrigin(req){if(req.headers.origin!==origin)throw error(403,'Origin denied');}
  async function admin(req){
    const token=req.cookies[cookieName];if(!token||!/^[a-f0-9]{64}$/.test(token))throw error(401,'Sign in required');
    const result=await pool.query(`select a.id,a.email,s.csrf_token,s.token_hash from private.sessions s join private.admin_users a on a.id=s.admin_id where s.token_hash=$1 and s.expires_at>now() and not a.disabled`,[digest(token)]);
    if(!result.rows.length)throw error(401,'Sign in required');req.admin=result.rows[0];
    if(!['GET','HEAD'].includes(req.method)){
      await browserOrigin(req);
      if(req.headers['x-csrf-token']!==req.admin.csrf_token)throw error(403,'CSRF denied');
    }
  }
  const viewSession=req=>({user:{id:req.admin.id,email:req.admin.email},csrfToken:req.admin.csrf_token});
  app.get('/healthz',async()=>{await pool.query('select 1');return {ok:true,version:'0.2.2'};});
  app.post('/api/login',{onRequest:browserOrigin,schema:{body:{type:'object',additionalProperties:false,required:['email','password'],properties:{email:{type:'string',minLength:3,maxLength:254},password:{type:'string',minLength:1,maxLength:200}}}}},async(req,reply)=>{
    const email=req.body.email.trim().toLowerCase();
    const limits=await Promise.all([limited(pool,'login:global',200,900),limited(pool,'login:email:'+email,10,900),limited(pool,'login:ip:'+req.ip,30,900)]);
    if(limits.some(Boolean))throw error(429,'Too many attempts; retry later');
    const user=(await pool.query('select id,email,password_hash,disabled from private.admin_users where email=$1',[email])).rows[0];
    const match=await passwordMatches(req.body.password,user?.password_hash||fakePassword);
    if(!user||!match||user.disabled)throw error(401,'Invalid email or password');
    const token=randomToken(),csrf=randomToken();
    await pool.query("insert into private.sessions(token_hash,admin_id,csrf_token,expires_at) values($1,$2,$3,now()+interval '12 hours')",[digest(token),user.id,csrf]);
    reply.setCookie(cookieName,token,cookieOptions);return {user:{id:user.id,email:user.email},csrfToken:csrf};
  });
  app.get('/api/session',{preHandler:admin},viewSession);
  app.post('/api/logout',{preHandler:admin},async(req,reply)=>{await pool.query('delete from private.sessions where token_hash=$1',[req.admin.token_hash]);reply.clearCookie(cookieName,{path:'/',secure:production,sameSite:'strict'});return {ok:true};});
  app.get('/api/admin/snapshot',{preHandler:admin},async()=>transaction(pool,'gulel_admin',async c=>{
    const staff=await c.query("select id,name,created_at,lpad(pairing_code::text,4,'0') as pairing_code from public.staff order by name,id");
    const devices=await c.query('select * from public.devices where not revoked');
    const settings=await c.query('select boundary_buffer_meters from public.farm_settings where id=true');
    // Keep live markers on the latest reliable fix. Noisy samples remain in
    // history for auditing, but cannot make a person jump around the map.
    const points=await c.query(`select point.* from public.staff person cross join lateral (
      select * from public.locations location where location.staff_id=person.id and not location.clock_skew and location.accuracy<=35
      order by location.measured_at desc,location.id desc limit 1
    ) point`);
    const boundary=farmBoundary(settings.rows[0]?.boundary_buffer_meters??100);
    return {staff:staff.rows,devices:devices.rows,points:points.rows.filter(point=>isWithinFarmBoundary(point,boundary)&&devices.rows.find(device=>device.id===point.device_id)?.at_farm!==false),boundary};
  }));
  app.post('/api/admin/staff',{preHandler:admin,schema:{body:{type:'object',additionalProperties:false,required:['name'],properties:{name:{type:'string',minLength:1,maxLength:100}}}}},async req=>{
    const name=req.body.name.trim();if(!name)throw error(400,'Name required');
    return transaction(pool,'gulel_admin',async c=>(await c.query("insert into public.staff(name) values($1) returning id,name,created_at,lpad(pairing_code::text,4,'0') as pairing_code",[name])).rows[0]);
  });
  app.delete('/api/admin/staff/:id',{preHandler:admin,schema:{params:{type:'object',properties:{id:uuid},required:['id']}}},async req=>transaction(pool,'gulel_admin',async c=>{
    const removed=(await c.query('select public.delete_staff($1) as removed',[req.params.id])).rows[0].removed;
    if(!removed)throw error(404,'Staff not found');return {ok:true};
  }));
  app.post('/api/admin/staff/:id/pair-code',{preHandler:admin,schema:{params:{type:'object',properties:{id:uuid},required:['id']}}},async req=>transaction(pool,'gulel_admin',async c=>({code:(await c.query('select public.create_pair_code($1) as code',[req.params.id])).rows[0].code,permanent:true})));
  app.get('/api/admin/staff/:id/attendance',{preHandler:admin,schema:{params:{type:'object',properties:{id:uuid},required:['id']},querystring:{type:'object',additionalProperties:false,required:['date'],properties:{date:attendanceDate}}}},async req=>transaction(pool,'gulel_admin',async c=>{const range=localDayRange(req.query.date),points=(await c.query('select measured_at,latitude,longitude,accuracy,clock_skew from public.locations where staff_id=$1 and measured_at >= $2 and measured_at < $3 order by measured_at',[req.params.id,range.from,range.to])).rows,settings=(await c.query('select boundary_buffer_meters from public.farm_settings where id=true')).rows[0],device=(await c.query('select at_farm from public.devices where staff_id=$1 and not revoked',[req.params.id])).rows[0];return {...attendanceSummary(points,new Date(),farmBoundary(settings?.boundary_buffer_meters??100)),...await clockSummary(c,req.params.id,range),at_farm:device?.at_farm===true};}));
  app.patch('/api/admin/farm-boundary',{preHandler:admin,schema:{body:boundaryUpdate}},async req=>transaction(pool,'gulel_admin',async c=>{const row=(await c.query('update public.farm_settings set boundary_buffer_meters=$1,updated_at=now() where id=true returning boundary_buffer_meters',[req.body.buffer_meters])).rows[0];return farmBoundary(row.boundary_buffer_meters);}));
  app.patch('/api/admin/devices/:id',{preHandler:admin,schema:{params:{type:'object',properties:{id:uuid},required:['id']},body:deviceUpdate}},async req=>transaction(pool,'gulel_admin',async c=>{
    const keys=Object.keys(req.body); // validated allowlist, never arbitrary SQL identifiers
    const result=await c.query(`update public.devices set ${keys.map((k,i)=>`${k}=$${i+1}`).join(',')} where id=$${keys.length+1} returning *`,[...keys.map(k=>req.body[k]),req.params.id]);
    if(!result.rows.length)throw error(404,'Device not found');return result.rows[0];
  }));
  cameraRoutes(app,pool,admin);
  locationPushRoutes(app,{pool,admin,send:locationPushSender});
  app.get('/api/admin/locations',{preHandler:admin,schema:{querystring:{type:'object',additionalProperties:false,required:['staff_id','from','to'],properties:{staff_id:uuid,from:{type:'string',format:'date-time'},to:{type:'string',format:'date-time'},cursor_time:{type:'string',format:'date-time'},cursor_id:uuid}}}},async req=>{
    const q=req.query,a=Date.parse(q.from),b=Date.parse(q.to);
    if(!Number.isFinite(a)||!Number.isFinite(b)||b<=a||b-a>7*86400000||Boolean(q.cursor_time)!==Boolean(q.cursor_id))throw error(400,'Invalid UTC date range/cursor');
    return transaction(pool,'gulel_admin',async c=>{
      const [result,settings]=await Promise.all([
        c.query(`select * from public.locations where staff_id=$1 and measured_at >= $2 and measured_at <= $3
          ${q.cursor_time?'and (measured_at,id)>($4::timestamptz,$5::uuid)':''} order by measured_at,id limit 1000`,q.cursor_time?[q.staff_id,q.from,q.to,q.cursor_time,q.cursor_id]:[q.staff_id,q.from,q.to]),
        c.query('select boundary_buffer_meters from public.farm_settings where id=true')
      ]);
      const boundary=farmBoundary(settings.rows[0]?.boundary_buffer_meters??100),last=result.rows.at(-1);
      return {points:result.rows.filter(point=>isWithinFarmBoundary(point,boundary)),next:result.rows.length===1000?{time:last.measured_at,id:last.id}:null};
    });
  });
  const pair=async(req,reply)=>{
    if(await limited(pool,'pair:ip:'+req.ip,5,60))throw error(429,'Too many pairing attempts');
    const result=await transaction(pool,'gulel_device',async c=>(await c.query('select public.pair_device($1,$2) as value',[req.body.p_code,req.body.p_token])).rows[0].value);
    if(result.error)reply.code(result.error==='rate_limited'?429:result.error==='already_paired'?409:400);return result;
  };
  const ingest=async req=>{
    if(await limited(pool,'ingest:'+digest(req.body.p_token),180,60))throw error(429,'Too many device requests');
    const settings=await pool.query('select boundary_buffer_meters from public.farm_settings where id=true');
    const boundary=farmBoundary(settings.rows[0]?.boundary_buffer_meters??100);
    const accepted=req.body.p_points.filter(point=>isWithinFarmBoundary(point,boundary));
    const discarded=req.body.p_points.filter(point=>!accepted.includes(point)).map(point=>point.id);
    const latest=[...req.body.p_points].sort((a,b)=>Date.parse(b.measured_at)-Date.parse(a.measured_at))[0];
    const value=await transaction(pool,null,async c=>{
      const result=(await c.query('select public.ingest($1,$2::jsonb,$3::jsonb) as value',[req.body.p_token,JSON.stringify(accepted),JSON.stringify(req.body.p_status)])).rows[0].value;
      if(latest)await c.query(`update public.devices device set at_farm=$1 from private.tokens token
        where token.device_id=device.id and token.hash=$2 and not device.revoked`,[isWithinFarmBoundary(latest,boundary),Buffer.from(digest(req.body.p_token),'hex')]);
      return result;
    });
    value.ack_ids=[...value.ack_ids,...discarded];
    value.config={...value.config,farm_boundary:boundary};
    return value;
  };
  app.post('/api/device/pair',{schema:{body:pairBody}},pair);
  app.post('/api/device/attendance',{schema:{body:{type:'object',additionalProperties:false,required:['p_token','date'],properties:{p_token:hex,date:attendanceDate}}}},async req=>{if(await limited(pool,'attendance:'+digest(req.body.p_token),120,60))throw error(429,'Too many device requests');const range=localDayRange(req.body.date);return transaction(pool,null,async c=>{const device=(await c.query('select d.staff_id,d.at_farm from public.devices d join private.tokens t on t.device_id=d.id where t.hash=$1 and not d.revoked',[Buffer.from(digest(req.body.p_token),'hex')])).rows[0];if(!device)throw error(403,'Forbidden');const [locations,settings]=await Promise.all([c.query('select measured_at,latitude,longitude,accuracy,clock_skew from public.locations where staff_id=$1 and measured_at >= $2 and measured_at < $3 order by measured_at',[device.staff_id,range.from,range.to]),c.query('select boundary_buffer_meters from public.farm_settings where id=true')]);return {...attendanceSummary(locations.rows,new Date(),farmBoundary(settings.rows[0]?.boundary_buffer_meters??100)),...await clockSummary(c,device.staff_id,range),at_farm:device.at_farm===true};});});
  app.post('/api/device/time-clock',{schema:{body:timeClockBody}},async req=>{
    if(await limited(pool,'time-clock:'+digest(req.body.p_token),30,60))throw error(429,'Too many clock attempts');
    return transaction(pool,null,async c=>{
      const device=(await c.query(`select device.id,device.staff_id,device.at_farm,location.device_id as location_device_id,location.measured_at,location.received_at,location.accuracy,location.clock_skew,location.latitude,location.longitude
        from public.devices device join private.tokens token on token.device_id=device.id left join public.latest_locations location on location.staff_id=device.staff_id
        where token.hash=$1 and not device.revoked for update of device`,[Buffer.from(digest(req.body.p_token),'hex')])).rows[0];
      if(!device)throw error(403,'Forbidden');
      const previous=(await c.query('select action from public.time_clock_events where staff_id=$1 order by occurred_at desc limit 1',[device.staff_id])).rows[0]?.action;
      if(req.body.action==='clock_in'){
        const settings=(await c.query('select boundary_buffer_meters from public.farm_settings where id=true')).rows[0],recent=device.received_at&&Date.now()-Date.parse(device.received_at)<=300000;
        if(device.at_farm!==true||device.location_device_id!==device.id||!recent||device.accuracy>50||device.clock_skew||!isWithinFarmBoundary(device,farmBoundary(settings?.boundary_buffer_meters??100)))throw error(409,'Clock-in requires a current location inside the farm');
        if(previous==='clock_in')throw error(409,'Already clocked in');
      }else if(previous!=='clock_in')throw error(409,'Not clocked in');
      const event=(await c.query('insert into public.time_clock_events(staff_id,device_id,action) values($1,$2,$3) returning id,action,occurred_at',[device.staff_id,device.id,req.body.action])).rows[0];
      return {event,clocked_in:req.body.action==='clock_in',at_farm:device.at_farm===true};
    });
  });
  app.post('/api/device/ingest',{schema:{body:ingestBody}},ingest);
  // Transport compatibility for 0.1 clients configured to this server; no Supabase service is used.
  app.post('/rest/v1/rpc/pair_device',{schema:{body:pairBody}},pair);
  app.post('/rest/v1/rpc/ingest',{schema:{body:ingestBody}},ingest);
  if(serveWeb)await app.register(staticFiles,{root:path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../web/dist'),prefix:'/',index:'index.html',dotfiles:'deny'});
  return app;
}
