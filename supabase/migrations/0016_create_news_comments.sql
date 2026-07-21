create table public.news_comments (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.news_articles(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  parent_comment_id uuid references public.news_comments(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

alter table public.news_comments enable row level security;

create policy "Authenticated users can read all news comments"
  on public.news_comments for select
  to authenticated
  using (true);

create policy "Users can insert their own news comments"
  on public.news_comments for insert
  to authenticated
  with check (auth.uid() = author_id);

create policy "Users can delete their own news comments"
  on public.news_comments for delete
  to authenticated
  using (auth.uid() = author_id);

create index news_comments_article_idx on public.news_comments (article_id, created_at);
