create or replace function public.pair_device(p_code text,p_token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.staff; d uuid; n integer;
begin
 insert into private.pair_budget values(date_trunc('minute',now()),1)
 on conflict(bucket) do update set attempts=private.pair_budget.attempts+1 returning attempts into n;
 if n>300 then return jsonb_build_object('error','rate_limited'); end if;
 if p_code !~ '^[0-9]{4}$' or p_token !~ '^[0-9a-f]{64}$' then return jsonb_build_object('error','invalid_code'); end if;

 select * into s from public.staff where pairing_code=p_code::integer;
 if not found then return jsonb_build_object('error','invalid_code'); end if;

 select dv.id into d from public.devices dv join private.tokens t on t.device_id=dv.id
 where dv.staff_id=s.id and not dv.revoked and t.hash=extensions.digest(p_token,'sha256') for update of dv;
 if found then return jsonb_build_object('device_id',d,'staff_id',s.id,'name',s.name); end if;

 select id into d from public.devices where staff_id=s.id and not revoked for update;
 if found then return jsonb_build_object('error','already_paired'); end if;

 begin
  insert into public.devices(staff_id) values(s.id) returning id into d;
 exception when unique_violation then
  return jsonb_build_object('error','already_paired');
 end;
 insert into private.tokens(device_id,hash) values(d,extensions.digest(p_token,'sha256'));
 return jsonb_build_object('device_id',d,'staff_id',s.id,'name',s.name);
end $$;
