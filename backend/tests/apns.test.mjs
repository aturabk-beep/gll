import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {generateKeyPairSync,verify} from 'node:crypto';
import {createLocationPushSender} from '../src/apns.mjs';
import {pushDiagnostic} from '../src/apns-errors.mjs';

test('diagnostic sanitizer only preserves fixed codes and valid HTTP statuses',()=>{
 assert.deepEqual(pushDiagnostic({accepted:false,reason:'secret',httpStatus:999}),{error_code:'UnknownAPNsError',http_status:null});
 assert.equal(pushDiagnostic({accepted:false,reason:'BadEnvironmentKeyIdInToken',httpStatus:403}).error_code,'BadEnvironmentKeyIdInToken');
 assert.equal(pushDiagnostic({accepted:true,reason:'secret',httpStatus:200}).error_code,null);
});

test('connection errors and timeouts expose no raw exception details',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const {privateKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
 const env={APNS_KEY_ID:'TEST',APNS_TEAM_ID:'TEST',APNS_BUNDLE_ID:'test.bundle',APNS_PRIVATE_KEY:privateKey.export({type:'pkcs8',format:'pem'})};
 let client,destroyed=0;
 const send=createLocationPushSender(env,()=>{
  client=new EventEmitter();client.destroy=()=>destroyed++;
  client.request=()=>{const stream=new EventEmitter();stream.end=()=>{};return stream;};
  return client;
 });
 const input={token:'a'.repeat(64),environment:'production',payload:{aps:{}},expiresAt:new Date(Date.now()+120000)};
 const errored=send(input);client.emit('error',Error('sensitive token in error message'));
 assert.deepEqual(await errored,{accepted:false,invalidToken:false,reason:'NetworkError',httpStatus:null});
 const timedOut=send(input);t.mock.timers.tick(10001);
 assert.deepEqual(await timedOut,{accepted:false,invalidToken:false,reason:'RequestTimeout',httpStatus:null});
 assert.equal(destroyed,2);
});

test('APNs transport uses signed ES256 location topic, selected environment and expiry',async()=>{
 const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
 const env={APNS_KEY_ID:'TESTKEY123',APNS_TEAM_ID:'TESTTEAM12',APNS_BUNDLE_ID:'tr.com.gulel.gulelPersonnel',
  APNS_PRIVATE_KEY:privateKey.export({type:'pkcs8',format:'pem'}).replaceAll('\n','\\n')};
 let status=200,body='',host,headers,payload,destroyed=0;
 const connect=url=>{
  host=url;const client=new EventEmitter();client.destroy=()=>{destroyed++};
  client.request=value=>{
   headers=value;const stream=new EventEmitter();
   stream.end=data=>{payload=JSON.parse(data);queueMicrotask(()=>{stream.emit('response',{':status':status});stream.emit('data',body);stream.emit('end');});};
   return stream;
  };return client;
 };
 const send=createLocationPushSender(env,connect);
 const input={token:'a'.repeat(64),environment:'development',expiresAt:new Date(Date.now()+120000),payload:{aps:{'content-available':1},request_id:'test'}};
 assert.deepEqual(await send(input),{accepted:true,invalidToken:false,reason:null,httpStatus:200});
 assert.equal(host,'https://api.sandbox.push.apple.com');
 assert.equal(headers['apns-push-type'],'location');
 assert.equal(headers['apns-topic'],env.APNS_BUNDLE_ID+'.location-query');
 assert.equal(headers['apns-priority'],'10');
 assert.equal(headers['apns-expiration'],String(Math.floor(+input.expiresAt/1000)));
 assert.deepEqual(payload,input.payload);
 const jwt=headers.authorization.slice(7),[h,p,s]=jwt.split('.');
 assert.deepEqual(JSON.parse(Buffer.from(h,'base64url')),{alg:'ES256',kid:env.APNS_KEY_ID});
 assert.equal(JSON.parse(Buffer.from(p,'base64url')).iss,env.APNS_TEAM_ID);
 assert.equal(verify('sha256',Buffer.from(h+'.'+p),{key:publicKey,dsaEncoding:'ieee-p1363'},Buffer.from(s,'base64url')),true);
 status=410;body='{"reason":"Unregistered"}';
 assert.deepEqual(await send({...input,environment:'production'}),{accepted:false,invalidToken:true,reason:'Unregistered',httpStatus:410});
 assert.equal(host,'https://api.push.apple.com');
 assert.equal(headers.authorization,'bearer '+jwt); // reuse, not one token per push
 status=403;body='{"reason":"InvalidProviderToken"}';
 assert.deepEqual(await send(input),{accepted:false,invalidToken:false,reason:'InvalidProviderToken',httpStatus:403});
 assert.equal(destroyed,3);
 status=400;body=JSON.stringify({reason:'secret-device-token-or-private-key'});
 assert.deepEqual(await send(input),{accepted:false,invalidToken:false,reason:'UnknownAPNsError',httpStatus:400});
 status=503;body='not JSON with secret data';
 assert.deepEqual(await send(input),{accepted:false,invalidToken:false,reason:'UnknownAPNsError',httpStatus:503});
});
