create table public.marketplace_listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id) on delete cascade,
  city_id uuid not null references public.cities(id),
  category text not null check (category in (
    'electronics', 'vehicles', 'property', 'home_furniture', 'jobs', 'other'
  )),
  title text not null,
  description text,
  price_amount numeric not null,
  price_currency text not null check (price_currency in ('USD', 'PHP', 'PI')),
  status text not null default 'active' check (status in ('active', 'sold')),
  created_at timestamptz not null default now()
);

alter table public.marketplace_listings enable row level security;

create policy "Authenticated users can read all marketplace listings"
  on public.marketplace_listings for select
  to authenticated
  using (true);

create policy "Users can insert their own marketplace listings"
  on public.marketplace_listings for insert
  to authenticated
  with check (auth.uid() = seller_id);

create policy "Users can update their own marketplace listings"
  on public.marketplace_listings for update
  to authenticated
  using (auth.uid() = seller_id)
  with check (auth.uid() = seller_id);

create policy "Users can delete their own marketplace listings"
  on public.marketplace_listings for delete
  to authenticated
  using (auth.uid() = seller_id);

create index marketplace_listings_browse_idx
  on public.marketplace_listings (city_id, status, created_at desc);

create table public.marketplace_listing_photos (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.marketplace_listings(id) on delete cascade,
  photo_url text not null,
  display_order integer not null
);

alter table public.marketplace_listing_photos enable row level security;

create policy "Authenticated users can read all marketplace listing photos"
  on public.marketplace_listing_photos for select
  to authenticated
  using (true);

create policy "Users can insert photos for their own marketplace listings"
  on public.marketplace_listing_photos for insert
  to authenticated
  with check (
    exists (
      select 1 from public.marketplace_listings
      where marketplace_listings.id = listing_id
        and marketplace_listings.seller_id = auth.uid()
    )
  );

create index marketplace_listing_photos_listing_idx
  on public.marketplace_listing_photos (listing_id, display_order);
