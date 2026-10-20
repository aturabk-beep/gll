// TEMPORARY OFFICE TEST AREA: ODTU Technopolis Silicon Block. Revert the
// dedicated test-site commit before handing the app to farm personnel.
// The configurable buffer expands this building-sized rectangle on every edge.
const imageBounds={south:39.89885,west:32.77261,north:39.90107,east:32.77481};
const earthRadiusMeters=6371000;

function distanceMeters(a,b){
 const radians=value=>value*Math.PI/180;
 const latitudeDelta=radians(b.latitude-a.latitude),longitudeDelta=radians(b.longitude-a.longitude);
 const h=Math.sin(latitudeDelta/2)**2+Math.cos(radians(a.latitude))*Math.cos(radians(b.latitude))*Math.sin(longitudeDelta/2)**2;
 return earthRadiusMeters*2*Math.asin(Math.sqrt(Math.min(1,h)));
}

export function farmBoundary(bufferMeters=100){
 const buffer=Math.max(0,Math.min(1000,Number(bufferMeters)||0));
 const centerLat=(imageBounds.south+imageBounds.north)/2,centerLon=(imageBounds.west+imageBounds.east)/2;
 const latitudeDelta=buffer/earthRadiusMeters*180/Math.PI;
 const longitudeDelta=buffer/(earthRadiusMeters*Math.cos(centerLat*Math.PI/180))*180/Math.PI;
 const south=imageBounds.south-latitudeDelta,north=imageBounds.north+latitudeDelta;
 const west=imageBounds.west-longitudeDelta,east=imageBounds.east+longitudeDelta;
 // OS region APIs accept circles only. This radius is just a low-power wake-up
 // hint around the rectangle and is never used for the inside/outside decision.
 const radius_meters=Math.max(...[[south,west],[south,east],[north,west],[north,east]].map(([latitude,longitude])=>distanceMeters({latitude:centerLat,longitude:centerLon},{latitude,longitude})));
 return {buffer_meters:buffer,south,west,north,east,centerLat,centerLon,radius_meters};
}

export function isWithinFarmBoundary(point,boundary=farmBoundary()){
 return point.latitude>=boundary.south&&point.latitude<=boundary.north&&point.longitude>=boundary.west&&point.longitude<=boundary.east;
}

export function isAtFarm(point,boundary=farmBoundary()){
 return point.accuracy<=50&&!point.clock_skew&&isWithinFarmBoundary(point,boundary);
}

export function attendanceSummary(points,now=new Date(),boundary=farmBoundary()){
 const valid=[...points].filter(point=>point.accuracy<=50&&!point.clock_skew).sort((a,b)=>Date.parse(a.measured_at)-Date.parse(b.measured_at));
 const sessions=[];let inside=false,candidate=null,count=0,candidateAt=null,enteredAt=null,previous=null;
 const close=time=>{if(enteredAt){sessions.push({arrived_at:enteredAt.toISOString(),left_at:time.toISOString()});enteredAt=null;}inside=false;};
 for(const point of valid){const time=new Date(point.measured_at);if(previous&&+time-+previous>300000){if(inside)close(previous);candidate=null;count=0;}
  const next=isAtFarm(point,boundary);if(next===inside){candidate=null;count=0;}else if(candidate===next)count++;else{candidate=next;count=1;candidateAt=time;}
  if(count>=2){if(next){inside=true;enteredAt=candidateAt;}else close(candidateAt);candidate=null;count=0;}previous=time;
 }
 const current=inside&&previous!=null&&+now-+previous<=300000;
 if(inside&&!current)close(previous);
 const total=sessions.reduce((sum,session)=>sum+(Date.parse(session.left_at)-Date.parse(session.arrived_at))/1000,0)+(current&&enteredAt?(+now-+enteredAt)/1000:0);
 return {arrived_at:sessions[0]?.arrived_at??enteredAt?.toISOString()??null,left_at:current?null:sessions.at(-1)?.left_at??null,seconds:Math.max(0,Math.round(total)),inside:current,sessions};
}

export function localDayRange(date){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Object.assign(Error('Invalid date'),{statusCode:400});
 const from=new Date(`${date}T00:00:00+03:00`);if(!Number.isFinite(+from))throw Object.assign(Error('Invalid date'),{statusCode:400});
 return {from:from.toISOString(),to:new Date(+from+86400000).toISOString()};
}
