create table public.time_clock_events(
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff,
  device_id uuid not null references public.devices,
  action text not null check(action in ('clock_in','clock_out')),
  occurred_at timestamptz not null default clock_timestamp()
);
create index time_clock_staff_time on public.time_clock_events(staff_id,occurred_at desc);
alter table public.time_clock_events enable row level security;
revoke all on public.time_clock_events from public,gulel_device,gulel_admin;
grant select on public.time_clock_events to gulel_admin;
create policy admin_time_clock on public.time_clock_events for select to gulel_admin using(current_user='gulel_admin');
