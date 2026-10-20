alter table public.staff alter column pairing_code drop default;
alter table public.staff drop constraint staff_pairing_code_unique;
alter table public.staff alter column pairing_code drop not null;

create or replace function public.allocate_staff_pairing_code() returns integer
language plpgsql volatile security definer set search_path='' as $$
declare
 b bytea;
 v integer;
 c integer;
begin
 perform pg_catalog.pg_advisory_xact_lock(71482003);
 if (select count(*) from public.staff where pairing_code is not null)>=10000 then
  raise exception 'Persistent pairing codes support at most 10000 staff';
 end if;

 loop
  b:=extensions.gen_random_bytes(2);
  v:=pg_catalog.get_byte(b,0)*256+pg_catalog.get_byte(b,1);
  if v>=60000 then continue; end if;
  c:=v%10000;
  exit when not exists(select 1 from public.staff where pairing_code=c);
 end loop;
 return c;
end $$;

revoke all on function public.allocate_staff_pairing_code() from public;
grant execute on function public.allocate_staff_pairing_code() to gulel_admin;

update public.staff set pairing_code=null;
do $$
declare person record;
begin
 for person in select id from public.staff order by id loop
  update public.staff
  set pairing_code=public.allocate_staff_pairing_code()
  where id=person.id;
 end loop;
end $$;

alter table public.staff alter column pairing_code set not null;
alter table public.staff add constraint staff_pairing_code_unique unique(pairing_code);
alter table public.staff alter column pairing_code set default public.allocate_staff_pairing_code();
drop sequence public.staff_pairing_code_seq;
