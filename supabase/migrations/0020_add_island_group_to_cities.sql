alter table public.cities
  add column island_group text not null default 'luzon'
  check (island_group in ('luzon', 'visayas', 'mindanao'));

update public.cities set island_group = 'luzon'
  where slug in ('manila', 'baguio', 'san-fernando', 'naga-city');

update public.cities set island_group = 'visayas'
  where slug in (
    'cebu-city', 'mandaue-city', 'lapu-lapu-city', 'cordova', 'consolacion',
    'liloan', 'compostela', 'danao-city', 'talisay', 'minglanilla',
    'carcar-city', 'iloilo', 'bacolod'
  );

update public.cities set island_group = 'mindanao'
  where slug in ('davao', 'general-santos');

alter table public.cities alter column island_group drop default;
