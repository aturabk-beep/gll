alter table public.staff add column pairing_code integer;

do $$
begin
 if (select count(*) from public.staff)>10000 then
  raise exception 'Persistent pairing codes support at most 10000 staff';
 end if;
end $$;

with numbered as (
 select id,row_number() over(order by created_at,id)-1 as code from public.staff
)
update public.staff staff set pairing_code=numbered.code from numbered where numbered.id=staff.id;

create sequence public.staff_pairing_code_seq minvalue 0 start with 0;
select setval('public.staff_pairing_code_seq',coalesce((select max(pairing_code)+1 from public.staff),0),false);
alter table public.staff alter column pairing_code set default nextval('public.staff_pairing_code_seq');
alter table public.staff alter column pairing_code set not null;
alter table public.staff add constraint staff_pairing_code_range check(pairing_code between 0 and 9999);
alter table public.staff add constraint staff_pairing_code_unique unique(pairing_code);
grant usage,select on sequence public.staff_pairing_code_seq to gulel_admin;

create or replace function public.create_pair_code(p_staff uuid) returns text language sql security definer set search_path='' as $$
 select lpad(pairing_code::text,4,'0') from public.staff where id=p_staff
$$;

create or replace function public.pair_device(p_code text,p_token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.staff; d uuid; n integer;
begin
 insert into private.pair_budget values(date_trunc('minute',now()),1)
 on conflict(bucket) do update set attempts=private.pair_budget.attempts+1 returning attempts into n;
 if n>300 then return jsonb_build_object('error','rate_limited'); end if;
 if p_code !~ '^[0-9]{4}$' or p_token !~ '^[0-9a-f]{64}$' then return jsonb_build_object('error','invalid_code'); end if;

 select * into s from public.staff where pairing_code=p_code::integer;
 if not found then return jsonb_build_object('error','invalid_code'); end if;

 select id into d from public.devices where staff_id=s.id and not revoked for update;
 if found then
  insert into private.tokens(device_id,hash) values(d,extensions.digest(p_token,'sha256'))
  on conflict(device_id) do update set hash=excluded.hash;
 else
  insert into public.devices(staff_id) values(s.id) returning id into d;
  insert into private.tokens(device_id,hash) values(d,extensions.digest(p_token,'sha256'));
 end if;

 return jsonb_build_object('device_id',d,'staff_id',s.id,'name',s.name);
end $$;

