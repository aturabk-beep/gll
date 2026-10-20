import {describe,it,expect} from 'vitest';
import {pushFailureText,deviceFailureText} from './push-diagnostic';
describe('location push diagnostics',()=>{
 it('distinguishes device measurement errors from Apple transport errors',()=>{
  expect(deviceFailureText({id:'1',status:'unavailable',device_error:'InsufficientAccuracy'})).toContain('35 metre');
  expect(deviceFailureText({id:'1',status:'unavailable',device_error:'AlwaysPermissionRequired'},true)).toContain('Always');
  expect(deviceFailureText({id:'1',status:'unavailable'})).toContain('TestFlight');
 });
 it('shows Apple code, HTTP response and production with a Turkish explanation',()=>{
  const text=pushFailureText({id:'1',status:'failed',error_code:'InvalidProviderToken',http_status:403,push_environment:'production'});
  expect(text).toContain('InvalidProviderToken · HTTP 403 · production');
  expect(text).toContain('Key ID ve Team ID');
 });
 it('distinguishes credential environment failures',()=>{
  expect(pushFailureText({id:'1',status:'failed',error_code:'BadEnvironmentKeyInToken',push_environment:'development'})).toContain('sandbox');
  expect(pushFailureText({id:'1',status:'failed',error_code:'BadEnvironmentKeyIdInToken'},true)).toContain('production access for TestFlight');
 });
 it('gives a registration recovery hint even when a token was invalidated',()=>{
  expect(pushFailureText({id:'1',status:'failed',error_code:'BadDeviceToken'})).toContain('yeniden etkinleştirin');
 });
 it('does not claim older requests have a known cause',()=>{
  expect(pushFailureText({id:'1',status:'failed',error_code:null})).toContain('Eski istek');
 });
 it('distinguishes connection timeout from Apple rejection',()=>{
  expect(pushFailureText({id:'1',status:'failed',error_code:'RequestTimeout'})).toContain('teslim durumu bilinmiyor');
 });
});
