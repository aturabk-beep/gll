alter table public.devices add column at_farm boolean;

-- The application server updates only this coarse state after authenticating
-- an ingest request. Precise off-site coordinates are never persisted.
grant update(at_farm) on public.devices to gulel_admin;

-- Remove off-site history collected by earlier versions. The radius is the
-- fixed 395 m farm core plus the currently configured boundary buffer.
delete from public.locations location using public.farm_settings settings
where settings.id=true and 6371000*2*asin(sqrt(least(1,
  power(sin(radians(location.latitude-37.07665)/2),2)+
  cos(radians(37.07665))*cos(radians(location.latitude))*power(sin(radians(location.longitude-30.32525)/2),2)
)))>395+settings.boundary_buffer_meters;

delete from public.latest_locations location using public.farm_settings settings
where settings.id=true and 6371000*2*asin(sqrt(least(1,
  power(sin(radians(location.latitude-37.07665)/2),2)+
  cos(radians(37.07665))*cos(radians(location.latitude))*power(sin(radians(location.longitude-30.32525)/2),2)
)))>395+settings.boundary_buffer_meters;
