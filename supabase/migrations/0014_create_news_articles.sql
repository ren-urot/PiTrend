create table public.news_articles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  url text not null unique,
  source text not null,
  summary text,
  published_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.news_articles enable row level security;

create policy "Anyone can read news articles"
  on public.news_articles for select
  to anon, authenticated
  using (true);

create index news_articles_published_idx on public.news_articles (published_at desc);
