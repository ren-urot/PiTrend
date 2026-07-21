import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { useUserPosts } from '../hooks/useUserPosts';
import { NodeAvatar } from '../components/NodeAvatar';
import { PostCard } from '../components/feed/PostCard';
import type { Profile } from '../types/profile';

export function PublicProfilePage() {
  const { username } = useParams<{ username: string }>();
  const { session } = useAuth();

  const { data: profile, isLoading } = useQuery({
    queryKey: ['public-profile', username],
    queryFn: async (): Promise<Profile | null> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, city_id, reputation_score, created_at')
        .eq('username', username)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!username,
  });

  const { data: posts, isLoading: postsLoading } = useUserPosts({
    authorId: profile?.id,
    viewerId: session?.user.id,
  });

  if (isLoading) return <div className="p-6">Loading…</div>;
  if (!profile) return <div className="p-6">No profile found for @{username}.</div>;

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-4 p-6">
      <NodeAvatar name={profile.display_name} avatarUrl={profile.avatar_url} size={80} />
      <div className="text-center">
        <p className="text-lg font-semibold">{profile.display_name}</p>
        <p className="text-muted-foreground">@{profile.username}</p>
      </div>

      <div className="flex w-full flex-col gap-4">
        {session && postsLoading && <p className="text-muted-foreground">Loading posts…</p>}
        {session && !postsLoading && posts?.length === 0 && (
          <p className="text-center text-muted-foreground">No posts yet.</p>
        )}
        {session && posts?.map((post) => <PostCard key={post.id} post={post} />)}
      </div>
    </div>
  );
}
