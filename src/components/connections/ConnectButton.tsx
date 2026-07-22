import { useToggleConnection } from '../../hooks/useToggleConnection';
import { Button } from '@/components/ui/button';

interface ConnectButtonProps {
  viewerId: string | undefined;
  targetUserId: string;
  isFollowing: boolean;
  size?: 'default' | 'sm';
}

export function ConnectButton({ viewerId, targetUserId, isFollowing, size = 'default' }: ConnectButtonProps) {
  const toggleConnection = useToggleConnection();

  if (!viewerId || viewerId === targetUserId) return null;

  return (
    <Button
      type="button"
      size={size}
      variant={isFollowing ? 'outline' : 'default'}
      disabled={toggleConnection.isPending}
      onClick={() => toggleConnection.mutate({ followerId: viewerId, followedId: targetUserId, isFollowing })}
    >
      {isFollowing ? 'Connected' : 'Connect'}
    </Button>
  );
}
