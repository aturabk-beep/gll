import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {testPool} from './pool.mjs';
import {migrate,prune} from '../src/database.mjs';
import {bootstrapAdmin,digest} from '../src/auth.mjs';
import {buildApp} from '../src/app.mjs';
import {createLocationPushSender} from '../src/apns.mjs';

let pool,app,auth,staff,device,sent,sendCount=0,outcome={accepted:true};
const token='a'.repeat(64),origin='https://test.invalid';
const call=(method,url,payload,headers=auth)=>app.inject({method,url,payload,headers});
const register=enabled=>call('POST','/api/device/location-push',{p_token:token,enabled,...(enabled?{token:'b'.repeat(64),environment:'development'}:{})},{});
const endpoint=()=>'/api/admin/staff/'+staff+'/location-push';
const request=()=>call('POST',endpoint(),{});
const result=body=>call('POST','/api/device/location-push-result',{request_id:sent.payload.request_id,response_token:sent.payload.response_token,...body},{});
const fix=()=>({measured_at:new Date().toISOString(),latitude:39.89996,longitude:32.77371,accuracy:12});
const reset=async()=>{await pool.query('delete from private.location_push_requests');outcome={accepted:true};};
before(async()=>{
 pool=testPool();await migrate(pool);await migrate(pool);
 await bootstrapAdmin(pool,{ADMIN_EMAIL:'test@example.invalid',ADMIN_PASSWORD:'only-for-test-12345'});
 app=await buildApp({pool,origin,serveWeb:false,locationPushSender:async value=>{sent=value;sendCount++;return outcome;}});
 const login=await call('POST','/api/login',{email:'test@example.invalid',password:'only-for-test-12345'},{origin});
 auth={origin,cookie:login.headers['set-cookie'].split(';')[0],'x-csrf-token':login.json().csrfToken};
 const person=await call('POST','/api/admin/staff',{name:'LPSE test'});staff=person.json().id;
 const pair=await call('POST','/api/device/pair',{p_code:person.json().pairing_code,p_token:token},{});
 device=pair.json().device_id;
});
after(async()=>{await app?.close();await pool?.end();});
test('missing configuration disables sender; admin auth and CSRF required',async()=>{
 assert.equal(createLocationPushSender({}),null);
 assert.equal((await call('GET',endpoint(),undefined,{})).statusCode,401);
 assert.equal((await call('POST',endpoint(),{},{cookie:auth.cookie,origin})).statusCode,403);
 assert.equal((await request()).statusCode,409);
 const disabled=await buildApp({pool,origin,serveWeb:false,locationPushSender:null});
 assert.equal((await disabled.inject({url:endpoint(),headers:auth})).json().configured,false);
 assert.equal((await disabled.inject({method:'POST',url:endpoint(),payload:{},headers:auth})).statusCode,503);
 await disabled.close();
});
test('registration authenticates device and requires explicit token/environment',async()=>{
 assert.equal((await call('POST','/api/device/location-push',{p_token:'c'.repeat(64),enabled:false},{})).statusCode,403);
 assert.equal((await call('POST','/api/device/location-push',{p_token:token,enabled:true},{})).statusCode,400);
 assert.equal((await register(true)).statusCode,200);
});
test('pending clicks reuse one push without a cooldown; fresh fix enforced',async()=>{
 assert.equal((await request()).json().status,'accepted');
 assert.equal(sent.environment,'development');
 assert.equal(JSON.stringify(sent.payload).includes(token),false);
 const count=sendCount;
 const duplicate=await request();
 assert.equal(duplicate.json().reused,true);
 assert.equal(duplicate.json().id,sent.payload.request_id);
 assert.equal(sendCount,count);
 const status=(await call('GET',endpoint())).json();
 assert.equal(status.request.status,'accepted');
 assert.equal(status.retry_at,null);
 assert.equal(JSON.stringify(status).includes(sent.payload.response_token),false);
 assert.equal((await call('POST','/api/device/location-push-authorize',sent.payload,{})).statusCode,400); // aps not allowed
 assert.equal((await call('POST','/api/device/location-push-authorize',{request_id:sent.payload.request_id,response_token:sent.payload.response_token},{})).statusCode,200);
 assert.equal((await result({fix:{...fix(),measured_at:new Date(Date.now()-120000).toISOString()}})).statusCode,400);
 assert.equal((await result({fix:{...fix(),accuracy:500}})).statusCode,400);
 assert.equal((await result({fix:fix()})).statusCode,200);
 assert.equal((await call('GET',endpoint())).json().request.status,'received');
 assert.equal((await result({fix:fix()})).statusCode,403);
 const rows=(await pool.query('select * from public.locations where device_id=$1',[device])).rows;
 assert.equal(rows.length,1);assert.equal(rows[0].staff_id,staff);
 assert.equal((await pool.query('select id from public.latest_locations where staff_id=$1',[staff])).rows[0].id,rows[0].id);
 assert.equal((await pool.query('select last_seen from public.devices where id=$1',[device])).rows[0].last_seen,null);
});
test('completed requests can be retried immediately; outside coordinate never stored',async()=>{
 const before=sendCount;
 assert.equal((await request()).json().status,'accepted');
 assert.equal(sendCount,before+1);
 await reset();await request();
 const count=Number((await pool.query('select count(*) from public.locations')).rows[0].count);
 assert.equal((await result({fix:{...fix(),latitude:40,longitude:33}})).statusCode,200);
 assert.equal(Number((await pool.query('select count(*) from public.locations')).rows[0].count),count);
 assert.equal((await call('GET',endpoint())).json().request.status,'outside');
 assert.equal((await call('GET','/api/admin/snapshot')).json().points.length,0);
});
test('expired, wrong-secret and consent-withdrawn responses rejected',async()=>{
 await reset();await request();
 assert.equal((await call('POST','/api/device/location-push-result',{request_id:sent.payload.request_id,response_token:'d'.repeat(64),fix:fix()},{})).statusCode,403);
 await pool.query("update private.location_push_requests set expires_at=now()-interval '1 second'");
 assert.equal((await result({fix:fix()})).statusCode,403);
 assert.equal((await call('GET',endpoint())).json().request.status,'timeout');
 await reset();await request();await register(false);
 assert.equal((await result({fix:fix()})).statusCode,403);
 assert.equal((await call('GET',endpoint())).json().request.status,'cancelled');
 assert.equal((await request()).statusCode,409);
});
test('APNs failure is not a new location, invalid tokens disabled',async()=>{
 await reset();await register(true);outcome={accepted:false,invalidToken:true,reason:'BadDeviceToken',httpStatus:400};
 assert.equal((await request()).json().status,'failed');
 assert.equal((await call('GET',endpoint())).json().available,false);
 const detail=(await call('GET',endpoint())).json().request;
 assert.equal(detail.error_code,'BadDeviceToken');
 assert.equal(detail.http_status,400);
 assert.equal(detail.push_environment,'development');
 assert.equal(JSON.stringify(detail).includes(sent.token),false);
 assert.equal(JSON.stringify(detail).includes(sent.payload.response_token),false);
});
test('unrecognized provider text never reaches storage or admin responses',async()=>{
 await reset();await register(true);outcome={accepted:false,reason:'PRIVATE KEY AND TOKEN',httpStatus:403};
 const response=await request();
 assert.equal(response.json().error_code,'UnknownAPNsError');
 const detail=(await call('GET',endpoint())).json().request;
 assert.equal(detail.error_code,'UnknownAPNsError');
 assert.equal(JSON.stringify(detail).includes('PRIVATE KEY'),false);
});
test('revoked devices cannot register or return a location',async()=>{
 await reset();await register(true);await request();
 await pool.query('update public.devices set revoked=true where id=$1',[device]);
 assert.equal((await register(true)).statusCode,403);
 assert.equal((await result({fix:fix()})).statusCode,403);
 await pool.query('update public.devices set revoked=false where id=$1',[device]);
});
test('device diagnostics are allowlisted, optional for old builds and cannot accompany a fix',async()=>{
 await reset();await request();
 assert.equal((await result({result:'unavailable',device_error:'raw secret message'})).statusCode,400);
 assert.equal((await result({fix:fix(),device_error:'StaleLocation'})).statusCode,400);
 assert.equal((await result({result:'unavailable',device_error:'InsufficientAccuracy'})).statusCode,200);
 const latest=(await call('GET',endpoint())).json().request;
 assert.equal(latest.status,'unavailable');assert.equal(latest.device_error,'InsufficientAccuracy');
 assert.equal(latest.error_code,null);assert.equal(latest.http_status,null); // fake sender omits APNs HTTP status
 const count=sendCount;
 await request();assert.equal(sendCount,count+1);
 assert.equal((await result({result:'unavailable'})).statusCode,200);
 assert.equal((await call('GET',endpoint())).json().request.device_error,null);
});
test('expired pending requests allow a new push but reject the old callback',async()=>{
 await reset();await request();
 const old={request_id:sent.payload.request_id,response_token:sent.payload.response_token};
 await pool.query("update private.location_push_requests set expires_at=now()-interval '1 second'");
 const count=sendCount;await request();assert.equal(sendCount,count+1);
 assert.equal((await call('POST','/api/device/location-push-result',{...old,result:'unavailable'},{})).statusCode,403);
});
test('unavailable result completes request; history pruned and staff deletion cascades',async()=>{
 await reset();await request();
 assert.equal((await result({result:'unavailable'})).statusCode,200);
 assert.equal((await call('GET',endpoint())).json().request.status,'unavailable');
 await pool.query("update private.location_push_requests set created_at=now()-interval '8 days'");
 await prune(pool);
 assert.equal((await pool.query('select * from private.location_push_requests')).rows.length,0);
 await request();
 assert.equal((await call('DELETE','/api/admin/staff/'+staff)).statusCode,200);
 assert.equal((await pool.query('select * from private.location_push_devices')).rows.length,0);
 assert.equal((await pool.query('select * from private.location_push_requests')).rows.length,0);
 assert.equal((await pool.query('select * from private.http_limits where key=$1',[digest('lp:registration:'+digest(token))])).rows.length,0);
});
