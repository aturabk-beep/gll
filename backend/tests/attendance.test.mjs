import {test} from 'node:test';
import assert from 'node:assert/strict';
import {attendanceSummary,farmBoundary,isAtFarm,localDayRange} from '../src/attendance.mjs';
const p=(minute,latitude=39.89996,longitude=32.77371,accuracy=10)=>({measured_at:new Date(Date.UTC(2026,8,17,5,minute)).toISOString(),latitude,longitude,accuracy,clock_skew:false});
test('farm presence requires confirmed transitions and ignores a lone GPS jump',()=>{
 const result=attendanceSummary([p(0,39.896),p(1),p(2),p(10,39.896),p(11,39.896)],new Date(Date.UTC(2026,8,17,5,12)));
 assert.equal(result.arrived_at,p(1).measured_at);assert.equal(result.left_at,p(2).measured_at);assert.equal(result.seconds,60);assert.equal(result.inside,false);
 assert.equal(attendanceSummary([p(0),p(1),p(2,39.896),p(3)],new Date(Date.UTC(2026,8,17,5,4))).inside,true);
});
test('test-site rectangle includes the expanded campus buffer',()=>{assert.equal(isAtFarm(p(0)),true);assert.equal(isAtFarm(p(0,39.896)),false);assert.deepEqual(localDayRange('2026-09-17'),{from:'2026-09-16T21:00:00.000Z',to:'2026-09-17T21:00:00.000Z'})});
test('increasing the configurable buffer expands all four rectangle edges',()=>{const a=farmBoundary(100),b=farmBoundary(200);assert.ok(b.south<a.south);assert.ok(b.west<a.west);assert.ok(b.north>a.north);assert.ok(b.east>a.east);assert.equal(b.buffer_meters,200)});
test('zero buffer matches the temporary Silicon Block extent',()=>{const boundary=farmBoundary(0);assert.equal(boundary.south,39.89885);assert.equal(boundary.west,32.77261);assert.equal(boundary.north,39.90107);assert.equal(boundary.east,32.77481)});
test('default rectangle contains every corner of the Silicon Block core',()=>{const boundary=farmBoundary();for(const [latitude,longitude] of [[39.89885,32.77261],[39.89885,32.77481],[39.90107,32.77261],[39.90107,32.77481]])assert.equal(isAtFarm({...p(0),latitude,longitude},boundary),true)});
test('farm presence follows the rectangle edges',()=>{const boundary=farmBoundary(0);assert.equal(isAtFarm({...p(0),latitude:boundary.north,longitude:boundary.east},boundary),true);assert.equal(isAtFarm({...p(0),latitude:boundary.north+0.000001,longitude:boundary.centerLon},boundary),false);assert.equal(isAtFarm({...p(0),latitude:boundary.centerLat,longitude:boundary.east+0.000001},boundary),false)});
