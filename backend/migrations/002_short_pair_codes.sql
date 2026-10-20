-- Short codes are unique across retained records; retired codes are not immediately reused.
create or replace function public.create_pair_code(p_staff uuid) returns text language plpgsql security definer set search_path='' as $$
declare c text; b bytea; v integer;
begin
 perform pg_advisory_xact_lock(71482003);
 update private.pair_codes set used_at=now() where staff_id=p_staff and used_at is null;
 for attempt in 1..1000 loop
  b:=extensions.gen_random_bytes(2); v:=get_byte(b,0)*256+get_byte(b,1);
  if v>=60000 then continue; end if;
  c:=lpad((v%10000)::text,4,'0');
  insert into private.pair_codes values(extensions.digest(c,'sha256'),p_staff,now()+interval '5 minutes',null) on conflict do nothing;
  if found then return c; end if;
 end loop;
 raise exception 'Pair code capacity reached; try later';
end $$;
create or replace function public.pair_device(p_code text,p_token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare p private.pair_codes; d uuid; n integer;
begin
 insert into private.pair_budget values(date_trunc('minute',now()),1) on conflict(bucket) do update set attempts=private.pair_budget.attempts+1 returning attempts into n;
 if n>10 then return jsonb_build_object('error','rate_limited'); end if;
 if p_code !~ '^[0-9]{4}$' or p_token !~ '^[0-9a-f]{64}$' then return jsonb_build_object('error','invalid_code'); end if;
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
