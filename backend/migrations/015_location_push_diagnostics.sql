alter table private.location_push_requests
  add column error_code text,
  add column http_status integer check (http_status between 100 and 599),
  add column push_environment text check (push_environment in ('development','production'));
