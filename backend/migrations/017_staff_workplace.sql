alter table public.staff add column workplace text
  check (workplace is null or length(workplace) between 1 and 100);
