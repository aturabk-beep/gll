import {describe,it,expect} from 'vitest';
import {state,segments,csv,elapsedAge,type Point,type Device} from './domain';
const now=Date.parse('2026-09-16T12:00:00Z');
const p:Point={id:'a',staff_id:'s',device_id:'d',measured_at:new Date(now-65000).toISOString(),received_at:new Date(now).toISOString(),latitude:1,longitude:1,accuracy:10,battery:null,motion:'stationary',clock_skew:false};
const d:Device={id:'d',staff_id:'s',revoked:false,last_seen:new Date(now).toISOString(),app_version:'0.1',queue_count:0,dropped_count:0,location_enabled:true,moving_seconds:10,stationary_seconds:60,stationary_after:180};
describe('freshness and routes',()=>{
 it('normal 60 second sampling does not alarm',()=>expect(state(p,d,now)).toBe('current'));
 it('heartbeat and delayed upload do not refresh an old fix',()=>expect(state({...p,measured_at:new Date(now-500000).toISOString(),received_at:new Date(now).toISOString()},d,now)).toBe('late'));
 it('no communication has no invented cause',()=>expect(state(p,{...d,last_seen:null},now)).toBe('missing'));
 it('allows configured heartbeat gaps without hiding stale location',()=>{
  const slow={...d,heartbeat_seconds:900,last_seen:new Date(now-900000).toISOString()};
  expect(state(p,slow,now)).toBe('current');
  expect(state({...p,measured_at:new Date(now-1000000).toISOString()},slow,now)).toBe('late');
  expect(state(p,{...slow,last_seen:new Date(now-2800000).toISOString()},now)).toBe('missing');
 });
 it('marks poor accuracy',()=>expect(state({...p,accuracy:90},d,now)).toBe('inaccurate'));
 it('allows moving samples to wait for the 60 second upload',()=>{
  const moving={...p,motion:'moving',measured_at:new Date(now-95_000).toISOString()};
  expect(state(moving,d,now)).toBe('current');
  expect(state({...moving,measured_at:new Date(now-101_000).toISOString()},d,now)).toBe('late');
 });
 it('allows stationary samples to wait for the 5 minute upload',()=>{
  expect(state({...p,measured_at:new Date(now-350_000).toISOString()},d,now)).toBe('current');
  expect(state({...p,measured_at:new Date(now-391_000).toISOString()},d,now)).toBe('late');
 });
 it('does not call a 14 minute stationary location current',()=>{
  expect(state({...p,measured_at:new Date(now-840_000).toISOString()},{...d,stationary_seconds:300},now)).toBe('late');
 });
 it('respects hourly outside reports without expecting hidden coordinates',()=>{
  const outside={...d,at_farm:false,last_seen:new Date(now-3500_000).toISOString()};
  expect(state(undefined,outside,now)).toBe('offsite');
  expect(state(p,outside,now)).toBe('offsite');
  expect(state(undefined,{...outside,last_seen:new Date(now-3700_000).toISOString()},now)).toBe('late');
  expect(state(undefined,{...outside,last_seen:new Date(now-7300_000).toISOString()},now)).toBe('missing');
  expect(state(undefined,{...outside,location_enabled:false},now)).toBe('noLocation');
 });
 it('rejects invalid and future timestamps instead of marking them current',()=>{
  expect(state({...p,measured_at:'invalid'},d,now)).toBe('inaccurate');
  expect(state({...p,measured_at:new Date(now+60_000).toISOString()},d,now)).toBe('inaccurate');
  expect(state(p,{...d,last_seen:'invalid'},now)).toBe('missing');
 });
 it('rejects revoked and unrelated devices',()=>{
  expect(state(p,{...d,revoked:true},now)).toBe('unpaired');
  expect(state({...p,device_id:'old-device'},d,now)).toBe('noLocation');
 });
 it('expires communication even if a point appears recent',()=>{
  expect(state(p,{...d,last_seen:new Date(now-700_000).toISOString()},now)).toBe('late');
  expect(state(p,{...d,last_seen:new Date(now-1300_000).toISOString()},now)).toBe('missing');
 });
 it('keeps real gaps but skips an isolated unreliable point without cutting the route',()=>{const points=[0,10,20,1000,1010,1020].map((s,i)=>({...p,id:String(i),measured_at:new Date(now+s*1000).toISOString()}));expect(segments(points).map(s=>s.length)).toEqual([3,3]);points[1].accuracy=500;expect(segments(points).map(s=>s.length)).toEqual([2,3]);});
 it('neutralizes spreadsheet formulas',()=>expect(csv([{...p,id:'=HYPERLINK("x")'}])).toContain("'=HYPERLINK"));
});
describe('elapsed age',()=>{
 it('uses readable units instead of accumulating thousands of minutes',()=>{
  expect(elapsedAge(new Date(now-45_000).toISOString(),now)).toBe('45 sn');
  expect(elapsedAge(new Date(now-45*60_000).toISOString(),now)).toBe('45 dk');
  expect(elapsedAge(new Date(now-9*3_600_000).toISOString(),now)).toBe('9 sa');
  expect(elapsedAge(new Date(now-3*86_400_000).toISOString(),now)).toBe('3 gün');
  expect(elapsedAge(new Date(now-21*86_400_000).toISOString(),now)).toBe('3 hafta');
  expect(elapsedAge(new Date(now-8*86_400_000).toISOString(),now,true)).toBe('1 week');
 });
});
