alter table public.profiles
  add column city_id uuid references public.cities(id),
  add column reputation_score integer not null default 0;

update public.profiles
  set city_id = (select id from public.cities where slug = 'cebu-city')
  where city_id is null;

alter table public.profiles
  alter column city_id set not null;
