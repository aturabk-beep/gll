create table public.farm_settings(
  id boolean primary key default true check(id),
  boundary_buffer_meters integer not null default 100 check(boundary_buffer_meters between 0 and 1000),
  updated_at timestamptz not null default now()
);

insert into public.farm_settings(id,boundary_buffer_meters) values(true,100) on conflict(id) do nothing;
revoke all on public.farm_settings from public,gulel_device;
grant select on public.farm_settings to gulel_admin;
grant update(boundary_buffer_meters,updated_at) on public.farm_settings to gulel_admin;
