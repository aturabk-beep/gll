create or replace function public.delete_staff(p_staff uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.staff where id=p_staff for update;
 if not found then return false; end if;

 delete from private.http_limits limits using (
  select encode(extensions.digest(kind.prefix||encode(token.hash,'hex'),'sha256'),'hex') as key
  from private.tokens token
  join public.devices device on device.id=token.device_id
  cross join (values('ingest:'),('attendance:'),('time-clock:')) as kind(prefix)
  where device.staff_id=p_staff
 ) associated where limits.key=associated.key;
 delete from public.time_clock_events where staff_id=p_staff;
 delete from public.latest_locations where staff_id=p_staff;
 delete from public.locations where staff_id=p_staff;
 delete from private.tokens where device_id in (select id from public.devices where staff_id=p_staff);
 delete from private.pair_codes where staff_id=p_staff;
 delete from public.devices where staff_id=p_staff;
 delete from public.staff where id=p_staff;
 return true;
end $$;

revoke all on function public.delete_staff(uuid) from public,gulel_device;
grant execute on function public.delete_staff(uuid) to gulel_admin;
