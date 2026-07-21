alter table public.news_articles
  add column category text not null default 'pi_network'
  check (category in ('pi_network', 'crypto_update'));

create index news_articles_category_idx on public.news_articles (category, published_at desc);
