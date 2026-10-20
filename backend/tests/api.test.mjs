import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {testPool} from './pool.mjs';
import {migrate,transaction,prune} from '../src/database.mjs';
import {bootstrapAdmin,digest} from '../src/auth.mjs';
import {buildApp} from '../src/app.mjs';

let pool,app,auth,staff,device,code;
const origin='https://pilot-test.invalid',email='admin@example.invalid',password='Railway-test-only-password!';
const token='1'.repeat(64);
const point=(overrides={})=>({id:randomUUID(),measured_at:new Date().toISOString(),latitude:39.89996,longitude:32.77371,accuracy:12,battery:80,motion:'moving',...overrides});
const ingest=(points,secret=token,status={})=>app.inject({method:'POST',url:'/api/device/ingest',payload:{p_token:secret,p_points:points,p_status:{sent_at_ms:Date.now(),queue_count:points.length,dropped_count:0,location_enabled:true,app_version:'test',...status}}});
async function call(method,url,payload){return app.inject({method,url,payload,headers:auth});}
before(async()=>{pool=testPool();await migrate(pool);await migrate(pool);await bootstrapAdmin(pool,{ADMIN_EMAIL:email,ADMIN_PASSWORD:password});app=await buildApp({pool,origin,serveWeb:false});await app.ready();});
after(async()=>{await app?.close();await pool?.end()});
test('health endpoint verifies database without leaking secrets',async()=>{const r=await app.inject('/healthz');assert.equal(r.statusCode,200);assert.equal(r.json().version,'0.2.2');});
test('login rejects foreign Origin, wrong password and unsigned admin requests',async()=>{
 assert.equal((await app.inject('/api/admin/snapshot')).statusCode,401);
 assert.equal((await app.inject({method:'POST',url:'/api/login',headers:{origin:'https://evil.invalid'},payload:{email,password}})).statusCode,403);
 assert.equal((await app.inject({method:'POST',url:'/api/login',headers:{origin},payload:{email,password:'wrong'}})).statusCode,401);
 const r=await app.inject({method:'POST',url:'/api/login',headers:{origin},payload:{email,password}});assert.equal(r.statusCode,200);
 const setCookie=r.headers['set-cookie'];assert.match(setCookie,/HttpOnly/);assert.match(setCookie,/Secure/);assert.match(setCookie,/SameSite=Strict/i);
 auth={origin,cookie:setCookie.split(';')[0],'x-csrf-token':r.json().csrfToken};assert.ok(r.json().user.id);
 const stored=(await pool.query('select * from private.sessions')).rows[0];assert.notEqual(stored.token_hash,auth.cookie.split('=')[1]);
});
test('CSRF required; input validation rejects privilege fields',async()=>{
 assert.equal((await app.inject({method:'POST',url:'/api/admin/staff',headers:{cookie:auth.cookie,origin},payload:{name:'X'}})).statusCode,403);
 assert.equal((await call('POST','/api/admin/staff',{name:'X',admin:true})).statusCode,400);
 const r=await call('POST','/api/admin/staff',{name:'TEST PERSONNEL — NOT REAL DATA'});assert.equal(r.statusCode,200);staff=r.json().id;
});
test('new staff receives a four-digit persistent code',async()=>assert.match((await call('GET','/api/admin/snapshot')).json().staff.find(person=>person.id===staff).pairing_code,/^[0-9]{4}$/));
test('database roles isolate admin reads and device RPC calls',async()=>{
 await assert.rejects(transaction(pool,'gulel_device',c=>c.query('select * from public.staff')));
 await assert.rejects(transaction(pool,'gulel_device',c=>c.query('select * from public.locations')));
 await assert.rejects(transaction(pool,'gulel_device',c=>c.query('select * from private.admin_users')));
 await assert.rejects(transaction(pool,'gulel_device',c=>c.query('select public.create_pair_code($1)',[staff])));
 await assert.rejects(transaction(pool,'gulel_admin',c=>c.query('select * from private.sessions')));
 assert.equal((await transaction(pool,'gulel_admin',c=>c.query('select * from public.staff'))).rows.length,1);
});
test('persistent pairing code is idempotent but rejects a second active device',async()=>{
 const r=await call('POST',`/api/admin/staff/${staff}/pair-code`,{});assert.equal(r.statusCode,200);code=r.json().code;assert.match(code,/^[0-9]{4}$/);
 const pair=(secret)=>app.inject({method:'POST',url:'/api/device/pair',payload:{p_code:code,p_token:secret}});
 const paired=await pair(token);assert.equal(paired.statusCode,200);device=paired.json().device_id;assert.equal(paired.json().staff_id,staff);
 assert.equal((await pair(token)).json().device_id,device);
 const duplicate=await pair('2'.repeat(64));assert.equal(duplicate.statusCode,409);assert.equal(duplicate.json().error,'already_paired');
 const defaults=await ingest([],token);assert.equal(defaults.statusCode,200);assert.deepEqual({moving:defaults.json().config.moving_seconds,stationary:defaults.json().config.stationary_seconds,after:defaults.json().config.stationary_after,heartbeat:defaults.json().config.heartbeat_seconds},{moving:30,stationary:300,after:180,heartbeat:600});
 assert.equal((await ingest([],'2'.repeat(64))).statusCode,403);
 assert.equal((await app.inject({url:'/api/admin/snapshot',headers:{authorization:`Bearer ${token}`}})).statusCode,401);
});
test('pairing codes are permanent, random-looking and unique',async()=>{
 const same=await call('POST',`/api/admin/staff/${staff}/pair-code`,{});assert.deepEqual(same.json(),{code,permanent:true});
 const second=await call('POST','/api/admin/staff',{name:'SECOND TEST PERSON'}),third=await call('POST','/api/admin/staff',{name:'THIRD TEST PERSON'});
 assert.match(second.json().pairing_code,/^[0-9]{4}$/);assert.match(third.json().pairing_code,/^[0-9]{4}$/);
 const snapshot=(await call('GET','/api/admin/snapshot')).json(),codes=snapshot.staff.map(person=>person.pairing_code);
 assert.equal(codes.length,3);assert.equal(new Set(codes).size,codes.length);
});
test('invalid codes and persisted pairing budget are enforced',async()=>{
 const used=new Set((await call('GET','/api/admin/snapshot')).json().staff.map(person=>person.pairing_code));
 const unused=Array.from({length:10000},(_,value)=>String(value).padStart(4,'0')).find(value=>!used.has(value));assert.ok(unused);
 assert.equal((await app.inject({method:'POST',url:'/api/device/pair',payload:{p_code:unused,p_token:'3'.repeat(64)}})).statusCode,400);
 await pool.query("insert into private.pair_budget values(date_trunc('minute',now()),300) on conflict(bucket) do update set attempts=300");
 assert.equal((await app.inject({method:'POST',url:'/api/device/pair',payload:{p_code:code,p_token:'3'.repeat(64)}})).statusCode,429);
 await pool.query('delete from private.pair_budget');
});
test('server-owned identity, idempotency and out-of-order updates',async()=>{
 const newer=point({staff_id:randomUUID(),device_id:randomUUID()}),older=point({measured_at:new Date(Date.now()-60000).toISOString()});
 const r=await ingest([newer]);assert.equal(r.statusCode,200);assert.deepEqual(r.json().ack_ids,[newer.id]);
 assert.equal((await ingest([{...newer,latitude:39.90002,measured_at:new Date(Date.now()+1000).toISOString()},older])).statusCode,200);
 const snap=(await call('GET','/api/admin/snapshot')).json();assert.equal(snap.points[0].id,newer.id);assert.equal(snap.points[0].staff_id,staff);assert.equal(snap.points[0].device_id,device);assert.equal(snap.points[0].latitude,39.89996);
 const weak=point({measured_at:new Date(Date.now()+2000).toISOString(),latitude:39.90001,accuracy:40});assert.equal((await ingest([weak])).statusCode,200);
 assert.equal((await call('GET','/api/admin/snapshot')).json().points[0].id,newer.id);
 assert.equal((await pool.query('select count(*) as n from public.locations')).rows[0].n,3);
});
test('clock skew is flagged on device/history without moving latest',async()=>{
 const previous=(await call('GET','/api/admin/snapshot')).json().points[0].id;
 const p=point({measured_at:new Date(Date.now()+86400000).toISOString()});
 assert.equal((await ingest([p],token,{sent_at_ms:Date.now()+86400000})).statusCode,200);
 const snap=(await call('GET','/api/admin/snapshot')).json();assert.equal(snap.devices[0].clock_skew,true);assert.equal(snap.points[0].id,previous);
 assert.equal((await pool.query('select clock_skew from public.locations where id=$1',[p.id])).rows[0].clock_skew,true);
});
test('legacy device wire format accepted; malformed samples rejected atomically',async()=>{
 assert.equal((await app.inject({method:'POST',url:'/rest/v1/rpc/ingest',payload:{p_token:token,p_points:[],p_status:{sent_at_ms:Date.now()}}})).statusCode,200);
 const valid=point();assert.equal((await ingest([valid,point({latitude:1000})])).statusCode,400);
 assert.equal((await pool.query('select id from public.locations where id=$1',[valid.id])).rows.length,0);
 assert.equal((await ingest(Array.from({length:201},()=>point()))).statusCode,400);
});
test('bounded config, route range/cursor and persisted auth session',async()=>{
 assert.equal((await call('PATCH',`/api/admin/devices/${device}`,{moving_seconds:1})).statusCode,400);
 assert.equal((await call('PATCH',`/api/admin/devices/${device}`,{staff_id:randomUUID()})).statusCode,400);
 assert.equal((await call('PATCH',`/api/admin/devices/${device}`,{moving_seconds:20,stationary_seconds:90})).statusCode,200);
 assert.equal((await ingest([])).json().config.stationary_seconds,90);
 const q=new URLSearchParams({staff_id:staff,from:new Date(Date.now()-3600000).toISOString(),to:new Date(Date.now()+10000).toISOString()});
 const r=await call('GET','/api/admin/locations?'+q);assert.equal(r.statusCode,200);assert.equal(r.json().points.length,3);
 q.set('from',new Date(Date.now()-8*86400000).toISOString());assert.equal((await call('GET','/api/admin/locations?'+q)).statusCode,400);
 const second=await buildApp({pool,origin,serveWeb:false});assert.equal((await second.inject({url:'/api/session',headers:auth})).statusCode,200);await second.close();
});
test('outside locations are discarded and hidden from admin location views',async()=>{
 const outside=point({measured_at:new Date(Date.now()+3000).toISOString(),latitude:36,longitude:30});
 const result=await ingest([outside]);assert.equal(result.statusCode,200);assert.deepEqual(result.json().ack_ids,[outside.id]);
 const snapshot=(await call('GET','/api/admin/snapshot')).json();assert.equal(snapshot.points.some(p=>p.id===outside.id),false);
 const q=new URLSearchParams({staff_id:staff,from:new Date(Date.now()-3600000).toISOString(),to:new Date(Date.now()+10000).toISOString()});
 const history=(await call('GET','/api/admin/locations?'+q)).json();assert.equal(history.points.some(p=>p.id===outside.id),false);
 assert.equal((await pool.query('select count(*) as n from public.locations where id=$1',[outside.id])).rows[0].n,0);assert.equal((await pool.query('select at_farm from public.devices where id=$1',[device])).rows[0].at_farm,false);
});
test('heartbeat config defaults, bounds and device delivery',async()=>{
 const config=(await ingest([])).json().config;assert.equal(config.heartbeat_seconds,600);assert.ok(config.farm_boundary.south<39.89885);assert.ok(config.farm_boundary.west<32.77261);assert.ok(config.farm_boundary.north>39.90107);assert.ok(config.farm_boundary.east>32.77481);
 for(const value of [29,901,60.5])assert.equal((await call('PATCH',`/api/admin/devices/${device}`,{heartbeat_seconds:value})).statusCode,400);
 for(const value of [30,900,120]){
  assert.equal((await call('PATCH',`/api/admin/devices/${device}`,{heartbeat_seconds:value})).statusCode,200);
  assert.equal((await ingest([])).json().config.heartbeat_seconds,value);
  assert.equal((await call('GET','/api/admin/snapshot')).json().devices.find(d=>d.id===device).heartbeat_seconds,value);
 }
});
test('today attendance is available to the paired device and admin',async()=>{
 await pool.query('delete from public.latest_locations; delete from public.locations');
 const date=new Date(Date.now()+3*3600000).toISOString().slice(0,10);
 const first=point({measured_at:new Date(Date.now()+10000).toISOString(),latitude:39.89990,longitude:32.77365,accuracy:10});
 const second=point({measured_at:new Date(Date.now()+20000).toISOString(),latitude:39.90000,longitude:32.77375,accuracy:10});
 assert.equal((await ingest([first,second])).statusCode,200);
 const deviceResult=await app.inject({method:'POST',url:'/api/device/attendance',payload:{p_token:token,date}});
 assert.equal(deviceResult.statusCode,200);assert.equal(deviceResult.json().inside,true);assert.equal(deviceResult.json().arrived_at,first.measured_at);assert.equal(deviceResult.json().at_farm,true);assert.equal(deviceResult.json().clocked_in,false);
 const adminResult=await call('GET',`/api/admin/staff/${staff}/attendance?date=${date}`);
 assert.equal(adminResult.statusCode,200);assert.equal(adminResult.json().inside,true);assert.ok(adminResult.json().seconds>=0);
 assert.equal((await app.inject({method:'POST',url:'/api/device/attendance',payload:{p_token:'9'.repeat(64),date}})).statusCode,403);
});
test('clock-in requires the farm but clock-out remains available outside',async()=>{
 const clock=action=>app.inject({method:'POST',url:'/api/device/time-clock',payload:{p_token:token,action}});
 const entered=await clock('clock_in');assert.equal(entered.statusCode,200);assert.equal(entered.json().clocked_in,true);
 assert.equal((await clock('clock_in')).statusCode,409);
 const outside=point({measured_at:new Date(Date.now()+30000).toISOString(),latitude:36,longitude:30});assert.equal((await ingest([outside])).statusCode,200);
 assert.equal((await clock('clock_in')).statusCode,409);
 const left=await clock('clock_out');assert.equal(left.statusCode,200);assert.equal(left.json().clocked_in,false);
 assert.equal((await clock('clock_out')).statusCode,409);
 const date=new Date(Date.now()+3*3600000).toISOString().slice(0,10),summary=(await app.inject({method:'POST',url:'/api/device/attendance',payload:{p_token:token,date}})).json();
 assert.equal(summary.at_farm,false);assert.equal(summary.clocked_in,false);assert.ok(summary.first_clock_in);assert.ok(summary.last_clock_out);assert.ok(summary.work_seconds>=0);
});
test('admin can expand the visible farm boundary with a bounded buffer',async()=>{
 const before=(await call('GET','/api/admin/snapshot')).json().boundary;assert.equal(before.buffer_meters,100);
 assert.equal((await call('PATCH','/api/admin/farm-boundary',{buffer_meters:1001})).statusCode,400);
 const expanded=await call('PATCH','/api/admin/farm-boundary',{buffer_meters:200});assert.equal(expanded.statusCode,200);assert.equal(expanded.json().buffer_meters,200);assert.ok(expanded.json().south<before.south);assert.ok(expanded.json().west<before.west);assert.ok(expanded.json().north>before.north);assert.ok(expanded.json().east>before.east);assert.equal(expanded.json().centerLat,before.centerLat);assert.equal(expanded.json().centerLon,before.centerLon);
 const snapshot=(await call('GET','/api/admin/snapshot')).json();assert.equal(snapshot.boundary.buffer_meters,200);
 assert.equal((await call('PATCH','/api/admin/farm-boundary',{buffer_meters:100})).statusCode,200);
});
test('camera CRUD requires admin and validates viewer links and areas',async()=>{
 assert.equal((await app.inject({url:'/api/admin/cameras'})).statusCode,401);
 const camera={name:'TEST camera',latitude:37,longitude:30,radius:40,url:''};
 for(const bad of [{...camera,url:'javascript:alert(1)'},{...camera,url:'https://user:pass@example.com'},{...camera,radius:0}])assert.equal((await call('POST','/api/admin/cameras',bad)).statusCode,400);
 const created=await call('POST','/api/admin/cameras',camera);assert.equal(created.statusCode,200);const id=created.json().id;
 assert.ok((await call('GET','/api/admin/cameras')).json().some(c=>c.id===id));
 assert.equal((await call('PUT','/api/admin/cameras/'+id,{...camera,radius:80,url:'https://example.com/view'})).json().radius,80);
 assert.equal((await call('DELETE','/api/admin/cameras/'+id)).statusCode,200);
 assert.equal((await call('PUT','/api/admin/cameras/'+id,camera)).statusCode,404);
});
test('revocation rejects subsequent device writes',async()=>{
 assert.equal((await call('PATCH',`/api/admin/devices/${device}`,{revoked:true})).statusCode,200);
 assert.equal((await ingest([point()])).statusCode,403);
 assert.equal((await call('PATCH',`/api/admin/devices/${device}`,{revoked:false})).statusCode,400);
 await pool.query("delete from private.http_limits where key=$1",[digest('pair:ip:127.0.0.1')]);
 const replacement=await app.inject({method:'POST',url:'/api/device/pair',payload:{p_code:code,p_token:'2'.repeat(64)}});assert.equal(replacement.statusCode,200);assert.notEqual(replacement.json().device_id,device);
});
test('deleting staff removes linked device, location and time-clock data',async()=>{
 const created=await call('POST','/api/admin/staff',{name:'DELETE TEST PERSON — NOT REAL DATA'}),person=created.json(),deleteToken='4'.repeat(64);
 const paired=await app.inject({method:'POST',url:'/api/device/pair',payload:{p_code:person.pairing_code,p_token:deleteToken}});assert.equal(paired.statusCode,200);const deleteDevice=paired.json().device_id;
 const sample=point();assert.equal((await ingest([sample],deleteToken)).statusCode,200);
 const deleteDate=new Date(Date.now()+3*3600000).toISOString().slice(0,10);assert.equal((await app.inject({method:'POST',url:'/api/device/attendance',payload:{p_token:deleteToken,date:deleteDate}})).statusCode,200);
 assert.equal((await app.inject({method:'POST',url:'/api/device/time-clock',payload:{p_token:deleteToken,action:'clock_in'}})).statusCode,200);
 const removed=await call('DELETE',`/api/admin/staff/${person.id}`);assert.equal(removed.statusCode,200);assert.deepEqual(removed.json(),{ok:true});
 assert.equal((await call('DELETE',`/api/admin/staff/${person.id}`)).statusCode,404);
 for(const [table,column,value] of [['staff','id',person.id],['devices','id',deleteDevice],['locations','staff_id',person.id],['latest_locations','staff_id',person.id],['time_clock_events','staff_id',person.id]])assert.equal((await pool.query(`select count(*) as n from public.${table} where ${column}=$1`,[value])).rows[0].n,0);
 assert.equal((await pool.query('select count(*) as n from private.tokens where hash=$1',[Buffer.from(digest(deleteToken),'hex')])).rows[0].n,0);
 const limitKeys=['ingest:','attendance:','time-clock:'].map(prefix=>digest(prefix+digest(deleteToken)));assert.equal((await pool.query('select count(*) as n from private.http_limits where key=any($1::text[])',[limitKeys])).rows[0].n,0);
 assert.equal((await ingest([],deleteToken)).statusCode,403);
});
test('retention cleans history, expired sessions and limits',async()=>{
 await pool.query("update public.locations set received_at=now()-interval '8 days'; update public.latest_locations set measured_at=now()-interval '8 days'");await prune(pool);
 assert.equal((await pool.query('select * from public.locations')).rows.length,0);assert.equal((await pool.query('select * from public.latest_locations')).rows.length,0);
});
test('logout invalidates server-side session and cookie',async()=>{
 assert.equal((await call('POST','/api/logout',{})).statusCode,200);assert.equal((await call('GET','/api/session')).statusCode,401);
});
test('failed logins are rate-limited without disclosing account existence',async()=>{
 for(let n=0;n<10;n++)await app.inject({method:'POST',url:'/api/login',headers:{origin},payload:{email:'nobody@example.invalid',password:'wrong'}});
 const r=await app.inject({method:'POST',url:'/api/login',headers:{origin},payload:{email:'nobody@example.invalid',password:'wrong'}});assert.equal(r.statusCode,429);
});
