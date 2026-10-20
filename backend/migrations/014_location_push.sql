-- Secrets deliberately stay outside public.devices / the admin snapshot.
create table private.location_push_devices (
  device_id uuid primary key references public.devices(id) on delete cascade,
  token text not null,
  environment text not null check (environment in ('development','production')),
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
create table private.location_push_requests (
  id uuid primary key,
  device_id uuid not null references public.devices(id) on delete cascade,
  admin_id uuid references private.admin_users(id) on delete set null,
  response_hash text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  completed_at timestamptz,
  status text not null check (status in ('sending','accepted','received','outside','unavailable','failed','cancelled'))
);
create index on private.location_push_requests(device_id,created_at desc);

-- Remove the registration rate-limit fingerprint when a device is deleted.
create function private.delete_location_push_limit() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  delete from private.http_limits
  where key=encode(extensions.digest('lp:registration:'||encode(old.hash,'hex'),'sha256'),'hex');
  return old;
end $$;
revoke all on function private.delete_location_push_limit() from public;
create trigger delete_location_push_limit before delete on private.tokens
for each row execute function private.delete_location_push_limit();
