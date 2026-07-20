-- shared_post_id previously had no ON DELETE clause (defaulting to
-- RESTRICT), which made the app's "This post is no longer available."
-- fallback (PostCard.tsx, when shared_post is null) unreachable — deleting
-- a post that had been reposted would fail with an FK violation instead of
-- letting the repost gracefully show the fallback. Deleting your own post
-- is an intended capability (posts DELETE RLS policy already exists in
-- 0006) even though no delete UI has been built yet.
alter table public.posts
  drop constraint posts_shared_post_id_fkey,
  add constraint posts_shared_post_id_fkey
    foreign key (shared_post_id) references public.posts(id) on delete set null;
