import { Link } from 'react-router-dom';
import { useConnections } from '../../hooks/useConnections';
import { NodeAvatar } from '../NodeAvatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface ConnectionsDialogProps {
  userId: string | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ConnectionsDialog({ userId, open, onOpenChange }: ConnectionsDialogProps) {
  const { data: connections, isLoading } = useConnections(userId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Network</DialogTitle>
        </DialogHeader>
        {isLoading && <p className="text-muted-foreground">Loading…</p>}
        {!isLoading && connections?.length === 0 && (
          <p className="text-muted-foreground">You haven't connected with anyone yet.</p>
        )}
        <div className="flex max-h-96 flex-col gap-1 overflow-y-auto">
          {connections?.map((profile) => (
            <Link
              key={profile.id}
              to={`/u/${profile.username}`}
              onClick={() => onOpenChange(false)}
              className="flex items-center gap-3 rounded-md p-2 hover:bg-accent"
            >
              <NodeAvatar name={profile.display_name} avatarUrl={profile.avatar_url} size={40} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{profile.display_name}</p>
                <p className="truncate text-sm text-muted-foreground">@{profile.username}</p>
              </div>
            </Link>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
