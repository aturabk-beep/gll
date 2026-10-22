import pg from 'pg';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

export function createPool(env=process.env){
  if(!env.DATABASE_URL)throw Error('DATABASE_URL is required');
  return new pg.Pool({connectionString:env.DATABASE_URL,max:10,connectionTimeoutMillis:10000,idleTimeoutMillis:30000,
    ssl:env.DATABASE_SSL==='verify'?{rejectUnauthorized:true}:undefined});
}
export async function transaction(pool,role,fn){
  if(role&&!['gulel_admin','gulel_device'].includes(role))throw Error('Invalid role');
  const client=await pool.connect();
  try{
    await client.query('begin');
    if(role)await client.query(`set local role ${role}`);
    const result=await fn(client);await client.query('commit');return result;
  }catch(e){await client.query('rollback');throw e;}finally{client.release();}
}
export async function migrate(pool){
  const migrations=['001_railway.sql','002_short_pair_codes.sql','003_heartbeat_interval.sql','004_cameras.sql','005_persistent_pairing_codes.sql','006_farm_boundary.sql','007_single_device_pairing.sql','008_location_privacy.sql','009_time_clock.sql','010_delete_staff.sql','011_delete_staff_rate_limits.sql','012_battery_profile.sql','013_random_pairing_codes.sql','014_location_push.sql','015_location_push_diagnostics.sql','016_location_push_device_error.sql','017_staff_workplace.sql'];
  await transaction(pool,null,async c=>{
    await c.query('select pg_advisory_xact_lock(71482001)');
    await c.query('create table if not exists public.gulel_migrations(version integer primary key, applied_at timestamptz not null default now())');
    for(const [index,file] of migrations.entries()){
      const version=index+1;
      const applied=await c.query('select version from public.gulel_migrations where version=$1',[version]);
      if(!applied.rows.length){const sql=await readFile(fileURLToPath(new URL('../migrations/'+file,import.meta.url)),'utf8');await c.query(sql);await c.query('insert into public.gulel_migrations(version) values($1)',[version]);}
    }
  });
}
export async function prune(pool){
  return transaction(pool,null,async c=>{
    const lock=await c.query('select pg_try_advisory_xact_lock(71482002) as acquired');
    if(!lock.rows[0].acquired)return;
    await c.query('select public.prune_history()');
    await c.query('delete from private.sessions where expires_at<now()');
    await c.query("delete from private.location_push_requests where created_at<now()-interval '7 days'");
    await c.query("delete from private.http_limits where window_start<now()-interval '1 day'");
  });
}
