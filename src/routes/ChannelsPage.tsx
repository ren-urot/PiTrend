import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useProfile } from '../hooks/useProfile';
import { useChannels } from '../hooks/useChannels';
import { useChannelSubscriptions } from '../hooks/useChannelSubscriptions';
import { useToggleChannelSubscription } from '../hooks/useToggleChannelSubscription';
import { Button } from '@/components/ui/button';

export function ChannelsPage() {
  const { session } = useAuth();
  const { data: profile } = useProfile(session?.user.id);
  const { data: channels } = useChannels();
  const { data: subscribedIds } = useChannelSubscriptions(session?.user.id);
  const toggleSubscription = useToggleChannelSubscription();

  const viewerId = session?.user.id;
  const visibleChannels = channels?.filter(
    (channel) => channel.city_id === null || channel.city_id === profile?.city_id
  );

  return (
    <div className="mx-auto max-w-xl p-4">
      <h1 className="mb-4 text-xl font-semibold">Channels</h1>
      <div className="flex flex-col gap-2">
        {visibleChannels?.map((channel) => {
          const isSubscribed = subscribedIds?.includes(channel.id) ?? false;
          return (
            <div key={channel.id} className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Link to={`/channels/${channel.slug}`} className="font-medium hover:underline">
                  {channel.name}
                </Link>
                {channel.description && (
                  <p className="text-sm text-muted-foreground">{channel.description}</p>
                )}
              </div>
              <Button
                type="button"
                variant={isSubscribed ? 'outline' : 'default'}
                size="sm"
                disabled={!viewerId}
                onClick={() =>
                  viewerId &&
                  toggleSubscription.mutate({
                    channelId: channel.id,
                    userId: viewerId,
                    isSubscribed,
                  })
                }
              >
                {isSubscribed ? 'Subscribed' : 'Subscribe'}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
