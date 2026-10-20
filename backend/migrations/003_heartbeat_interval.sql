alter table public.devices add column heartbeat_seconds integer not null default 60 check(heartbeat_seconds between 30 and 900);
grant update(heartbeat_seconds) on public.devices to gulel_admin;

create or replace function public.ingest(p_token text,p_points jsonb,p_status jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.devices; x jsonb; r public.locations; ids jsonb:='[]'; srv timestamptz:=clock_timestamp(); skew boolean;
begin
 select dv.* into d from public.devices dv join private.tokens t on t.device_id=dv.id where t.hash=extensions.digest(p_token,'sha256') and not dv.revoked for update of dv;
 if not found then raise exception 'Device revoked or invalid' using errcode='42501'; end if;
 if jsonb_typeof(p_points)<>'array' or jsonb_array_length(p_points)>200 then raise exception 'Invalid batch'; end if;
 update public.devices set last_seen=srv, app_version=left(p_status->>'app_version',40),queue_count=greatest(0,(p_status->>'queue_count')::integer),dropped_count=greatest(coalesce(dropped_count,0),coalesce((p_status->>'dropped_count')::bigint,0)),location_enabled=(p_status->>'location_enabled')::boolean,clock_skew=abs(coalesce((p_status->>'sent_at_ms')::double precision,extract(epoch from srv)*1000)-extract(epoch from srv)*1000)>300000 where id=d.id;
 for x in select value from jsonb_array_elements(p_points) loop
  skew:=abs(coalesce((p_status->>'sent_at_ms')::double precision,extract(epoch from srv)*1000)-extract(epoch from srv)*1000)>300000;
  r.id:=(x->>'id')::uuid; r.staff_id:=d.staff_id; r.device_id:=d.id; r.measured_at:=(x->>'measured_at')::timestamptz; r.received_at:=srv;
  r.latitude:=(x->>'latitude')::double precision; r.longitude:=(x->>'longitude')::double precision; r.accuracy:=(x->>'accuracy')::double precision;
  r.speed:=(x->>'speed')::double precision; r.heading:=(x->>'heading')::double precision; r.battery:=(x->>'battery')::integer; r.motion:=coalesce(x->>'motion','unknown');
  r.clock_skew:=skew or r.measured_at>srv+interval '5 minutes';
  if r.measured_at < srv-interval '7 days' then ids:=ids||jsonb_build_array(r.id); continue; end if;
  insert into public.locations select r.* on conflict(id) do nothing;
  if not found then
   if exists(select 1 from public.locations where id=r.id and device_id<>d.id) then raise exception 'ID conflict'; end if;
   ids:=ids||jsonb_build_array(r.id); continue;
  end if;
  if exists(select 1 from public.locations where id=r.id and device_id<>d.id) then raise exception 'ID conflict'; end if;
  if not r.clock_skew then
   insert into public.latest_locations select r.* on conflict(staff_id) do update set id=excluded.id,device_id=excluded.device_id,measured_at=excluded.measured_at,received_at=excluded.received_at,latitude=excluded.latitude,longitude=excluded.longitude,accuracy=excluded.accuracy,speed=excluded.speed,heading=excluded.heading,battery=excluded.battery,motion=excluded.motion,clock_skew=excluded.clock_skew where excluded.measured_at>public.latest_locations.measured_at;
  end if;
  ids:=ids||jsonb_build_array(r.id);
 end loop;
 return jsonb_build_object('ack_ids',ids,'server_time',srv,'config',jsonb_build_object('moving_seconds',d.moving_seconds,'stationary_seconds',d.stationary_seconds,'stationary_after',d.stationary_after,'heartbeat_seconds',d.heartbeat_seconds));
end $$;
