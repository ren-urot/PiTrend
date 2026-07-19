import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { Profile } from '../types/profile';

export function PublicProfilePage() {
  const { username } = useParams<{ username: string }>();

  const { data: profile, isLoading } = useQuery({
    queryKey: ['public-profile', username],
    queryFn: async (): Promise<Profile | null> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, created_at')
        .eq('username', username)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!username,
  });

  if (isLoading) return <div className="p-6">Loading…</div>;
  if (!profile) return <div className="p-6">No profile found for @{username}.</div>;

  return (
    <div className="flex flex-col items-center gap-4 p-6">
      <p className="text-lg font-semibold">{profile.display_name}</p>
      <p className="text-muted-foreground">@{profile.username}</p>
    </div>
  );
}
