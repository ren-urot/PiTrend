import { useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useProfile } from '../hooks/useProfile';
import { useChannels } from '../hooks/useChannels';
import { usePosts } from '../hooks/usePosts';
import { useQueuedDrafts } from '../hooks/useQueuedDrafts';
import { PostComposer } from '../components/feed/PostComposer';
import { PostCard } from '../components/feed/PostCard';
import { DraftPostCard } from '../components/feed/DraftPostCard';

export function ChannelPage() {
  const { slug } = useParams<{ slug: string }>();
  const { session } = useAuth();
  const { data: profile } = useProfile(session?.user.id);
  const { data: channels } = useChannels();
  const channel = channels?.find((candidate) => candidate.slug === slug);

  const { data: posts, isLoading } = usePosts({
    cityId: channel ? profile?.city_id : undefined,
    channelId: channel?.id ?? null,
    viewerId: session?.user.id,
  });
  const { data: drafts } = useQueuedDrafts(session?.user.id);

  if (!channel) {
    return <div className="p-6 text-muted-foreground">Loading channel…</div>;
  }

  const ownDrafts = (drafts ?? []).filter((draft) => draft.channelId === channel.id);

  return (
    <div className="mx-auto max-w-xl p-4">
      <h1 className="mb-4 text-xl font-semibold">{channel.name}</h1>
      {profile?.city_id && <PostComposer cityId={profile.city_id} channelId={channel.id} />}
      {isLoading && <p className="text-muted-foreground">Loading posts…</p>}
      {!isLoading && posts?.length === 0 && ownDrafts.length === 0 && (
        <p className="text-muted-foreground">No posts yet — be the first to post!</p>
      )}
      <div className="flex flex-col gap-4">
        {ownDrafts.map((draft) => (
          <DraftPostCard key={draft.id} draft={draft} />
        ))}
        {posts?.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </div>
    </div>
  );
}
