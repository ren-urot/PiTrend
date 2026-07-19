create table public.cities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  country text not null default 'Philippines',
  created_at timestamptz not null default now()
);

alter table public.cities enable row level security;

create policy "Anyone can read cities"
  on public.cities for select
  to anon, authenticated
  using (true);

insert into public.cities (name, slug) values
  ('Cebu City', 'cebu-city'),
  ('Mandaue City', 'mandaue-city'),
  ('Lapu-Lapu City', 'lapu-lapu-city'),
  ('Cordova', 'cordova'),
  ('Consolacion', 'consolacion'),
  ('Liloan', 'liloan'),
  ('Compostela', 'compostela'),
  ('Danao City', 'danao-city'),
  ('Talisay', 'talisay'),
  ('Minglanilla', 'minglanilla'),
  ('Naga City', 'naga-city'),
  ('San Fernando', 'san-fernando'),
  ('Carcar City', 'carcar-city'),
  ('Manila', 'manila'),
  ('Davao', 'davao'),
  ('Iloilo', 'iloilo'),
  ('Bacolod', 'bacolod'),
  ('Baguio', 'baguio'),
  ('General Santos', 'general-santos');
