create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
do $$ begin
 if not exists(select 1 from pg_roles where rolname='gulel_admin') then create role gulel_admin nologin; end if;
 if not exists(select 1 from pg_roles where rolname='gulel_device') then create role gulel_device nologin; end if;
end $$;
grant usage on schema public to gulel_admin,gulel_device;
create schema if not exists private;
revoke all on schema private from public;
create table private.admin_users(id uuid primary key default gen_random_uuid(),email text unique not null,password_hash text not null,disabled boolean not null default false);
create table private.sessions(token_hash text primary key,admin_id uuid not null references private.admin_users,csrf_token text not null,expires_at timestamptz not null);
create index sessions_expiry on private.sessions(expires_at);
create table private.http_limits(key text not null,window_start timestamptz not null,attempts integer not null,primary key(key,window_start));
create table public.staff(id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 100), created_at timestamptz not null default now());
create table public.devices(id uuid primary key default gen_random_uuid(), staff_id uuid not null references public.staff, revoked boolean not null default false, last_seen timestamptz, app_version text, queue_count integer, dropped_count bigint default 0, location_enabled boolean, moving_seconds integer not null default 10 check(moving_seconds between 10 and 60), stationary_seconds integer not null default 60 check(stationary_seconds between 30 and 300), stationary_after integer not null default 180 check(stationary_after between 120 and 900));
create unique index one_active_device on public.devices(staff_id) where not revoked;
alter table public.devices add column clock_skew boolean not null default false;
create table private.tokens(device_id uuid primary key references public.devices, hash bytea unique not null);
create table private.pair_codes(hash bytea primary key, staff_id uuid not null references public.staff, expires_at timestamptz not null, used_at timestamptz);
create table private.pair_budget(bucket timestamptz primary key, attempts integer not null);
create table public.locations(id uuid primary key, staff_id uuid not null references public.staff, device_id uuid not null references public.devices, measured_at timestamptz not null, received_at timestamptz not null default clock_timestamp(), latitude double precision not null check(latitude between -90 and 90), longitude double precision not null check(longitude between -180 and 180), accuracy double precision not null check(accuracy between 0 and 100000), speed double precision check(speed between 0 and 500), heading double precision check(heading >= 0 and heading < 360), battery integer check(battery between 0 and 100), motion text not null check(motion in ('moving','stationary','unknown')), clock_skew boolean not null default false);
create index locations_staff_time on public.locations(staff_id, measured_at desc);
create index locations_received on public.locations(received_at);
create index locations_measured_retention on public.locations using brin(measured_at);
create table public.latest_locations (like public.locations including defaults including constraints);
alter table public.latest_locations add primary key(staff_id);
alter table public.staff enable row level security;
alter table public.devices enable row level security;
alter table public.locations enable row level security;
alter table public.latest_locations enable row level security;
revoke all on public.staff, public.devices, public.locations, public.latest_locations from gulel_device, gulel_admin;
grant select,insert,update on public.staff to gulel_admin;
grant select on public.devices,public.locations,public.latest_locations to gulel_admin;
grant update(revoked,moving_seconds,stationary_seconds,stationary_after) on public.devices to gulel_admin;
create policy admin_staff on public.staff for all to gulel_admin using(current_user='gulel_admin') with check(current_user='gulel_admin');
create policy admin_devices on public.devices for all to gulel_admin using(current_user='gulel_admin') with check(current_user='gulel_admin');
create policy admin_history on public.locations for select to gulel_admin using(current_user='gulel_admin');
create policy admin_latest on public.latest_locations for select to gulel_admin using(current_user='gulel_admin');
create function public.create_pair_code(p_staff uuid) returns text language plpgsql security definer set search_path='' as $$
declare c text;
begin
 -- Execute permission is granted only to the server-selected admin role.
 c:=encode(extensions.gen_random_bytes(16),'hex');
 update private.pair_codes set used_at=now() where staff_id=p_staff and used_at is null;
 insert into private.pair_codes values(extensions.digest(c,'sha256'),p_staff,now()+interval '15 minutes',null);
 return c;
end $$;
create function public.pair_device(p_code text,p_token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare p private.pair_codes; d uuid; n integer;
begin
 insert into private.pair_budget values(date_trunc('minute',now()),1) on conflict(bucket) do update set attempts=private.pair_budget.attempts+1 returning attempts into n;
 if n>300 then return jsonb_build_object('error','rate_limited'); end if;
 if p_code !~ '^[0-9a-f]{32}$' or p_token !~ '^[0-9a-f]{64}$' then return jsonb_build_object('error','invalid_code'); end if;
 select * into p from private.pair_codes where hash=extensions.digest(p_code,'sha256') for update;
 if not found or p.expires_at<=now() then return jsonb_build_object('error','invalid_code'); end if;
 if p.used_at is not null then
  select dv.id into d from public.devices dv join private.tokens t on t.device_id=dv.id where dv.staff_id=p.staff_id and not dv.revoked and t.hash=extensions.digest(p_token,'sha256');
  if found then return jsonb_build_object('device_id',d,'staff_id',p.staff_id,'name',(select name from public.staff where id=p.staff_id)); end if;
  return jsonb_build_object('error','invalid_code');
 end if;
 if exists(select 1 from public.devices where staff_id=p.staff_id and not revoked) then return jsonb_build_object('error','revoke_previous_device'); end if;
 insert into public.devices(staff_id) values(p.staff_id) returning id into d;
 insert into private.tokens values(d,extensions.digest(p_token,'sha256'));
 update private.pair_codes set used_at=now() where hash=p.hash;
 return jsonb_build_object('device_id',d,'staff_id',p.staff_id,'name',(select name from public.staff where id=p.staff_id));
end $$;
create function public.ingest(p_token text,p_points jsonb,p_status jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
 return jsonb_build_object('ack_ids',ids,'server_time',srv,'config',jsonb_build_object('moving_seconds',d.moving_seconds,'stationary_seconds',d.stationary_seconds,'stationary_after',d.stationary_after));
end $$;
create function public.prune_history() returns bigint language plpgsql security definer set search_path='' as $$
declare n bigint;
begin
 delete from public.locations where received_at<now()-interval '7 days' or measured_at<now()-interval '7 days'; get diagnostics n=row_count;
 delete from public.latest_locations where received_at<now()-interval '7 days' or measured_at<now()-interval '7 days';
 delete from private.pair_codes where expires_at<now()-interval '1 day';
 delete from private.pair_budget where bucket<now()-interval '1 day'; return n;
end $$;
revoke all on function public.create_pair_code(uuid),public.pair_device(text,text),public.ingest(text,jsonb,jsonb),public.prune_history() from public;
grant execute on function public.create_pair_code(uuid) to gulel_admin;
grant execute on function public.pair_device(text,text),public.ingest(text,jsonb,jsonb) to gulel_device;
-- Retention is executed by the backend database owner, never by device/admin roles.
-- Panel polls only latest_locations every 10 seconds; no publication dependency.
