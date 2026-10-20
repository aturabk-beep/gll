create table public.cameras (
 id uuid primary key default gen_random_uuid(),
 name text not null check(length(name) between 1 and 100),
 latitude double precision not null check(latitude between -90 and 90),
 longitude double precision not null check(longitude between -180 and 180),
 radius integer not null check(radius between 5 and 1000),
 url text not null default '' check(length(url)<=2048)
);
alter table public.cameras enable row level security;
revoke all on public.cameras from public,gulel_device;
grant select,insert,update,delete on public.cameras to gulel_admin;
create policy admin_cameras on public.cameras for all to gulel_admin using(current_user='gulel_admin') with check(current_user='gulel_admin');
