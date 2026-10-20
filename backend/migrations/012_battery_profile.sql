alter table public.devices alter column moving_seconds set default 30;
alter table public.devices alter column stationary_seconds set default 300;
alter table public.devices alter column stationary_after set default 180;
alter table public.devices alter column heartbeat_seconds set default 600;

update public.devices set moving_seconds=30,stationary_seconds=300,stationary_after=180,heartbeat_seconds=600;
