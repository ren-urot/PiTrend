import { useAuth } from '../hooks/useAuth';
import { useProfile } from '../hooks/useProfile';
import { useCities } from '../hooks/useCities';
import { usePosts } from '../hooks/usePosts';
import { PostComposer } from '../components/feed/PostComposer';
import { PostCard } from '../components/feed/PostCard';
import { ComingSoon } from '../components/ComingSoon';

export function FeedPage() {
  const { session } = useAuth();
  const { data: profile } = useProfile(session?.user.id);
  const { data: cities } = useCities();
  const { data: posts, isLoading } = usePosts({
    cityId: profile?.city_id,
    channelId: null,
    viewerId: session?.user.id,
  });

  const cityName = cities?.find((city) => city.id === profile?.city_id)?.name;

  if (!profile?.city_id) {
    return <ComingSoon title={cityName ? `${cityName} Feed` : 'Feed'} />;
  }

  return (
    <div className="mx-auto max-w-xl p-4">
      <h1 className="mb-4 text-xl font-semibold">{cityName} Feed</h1>
      <PostComposer cityId={profile.city_id} />
      {isLoading && <p className="text-muted-foreground">Loading posts…</p>}
      {!isLoading && posts?.length === 0 && (
        <p className="text-muted-foreground">No posts yet — be the first to post!</p>
      )}
      <div className="flex flex-col gap-4">
        {posts?.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </div>
    </div>
  );
}
