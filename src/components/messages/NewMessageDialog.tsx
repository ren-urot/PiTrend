import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSearchProfiles } from '../../hooks/useSearchProfiles';
import { useCreateConversation } from '../../hooks/useCreateConversation';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface NewMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentUserId: string | undefined;
}

export function NewMessageDialog({ open, onOpenChange, currentUserId }: NewMessageDialogProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [groupName, setGroupName] = useState('');
  const { data: results } = useSearchProfiles(query, currentUserId ?? '');
  const createConversation = useCreateConversation();

  function toggleSelected(userId: string) {
    setSelectedIds((ids) => (ids.includes(userId) ? ids.filter((id) => id !== userId) : [...ids, userId]));
  }

  async function handleStart() {
    if (!currentUserId || selectedIds.length === 0) return;

    const conversationId = await createConversation.mutateAsync({
      creatorId: currentUserId,
      participantIds: selectedIds,
      isGroup: selectedIds.length > 1,
      name: selectedIds.length > 1 ? groupName.trim() || null : null,
    });

    setQuery('');
    setSelectedIds([]);
    setGroupName('');
    onOpenChange(false);
    navigate(`/messages/${conversationId}`);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New message</DialogTitle>
        </DialogHeader>
        <Input
          placeholder="Search by username"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="flex flex-col gap-1">
          {results?.map((profile) => (
            <button
              key={profile.id}
              type="button"
              onClick={() => toggleSelected(profile.id)}
              className={`flex items-center justify-between rounded-md p-2 text-left text-sm ${
                selectedIds.includes(profile.id) ? 'bg-accent' : ''
              }`}
            >
              <span>
                {profile.display_name} (@{profile.username})
              </span>
              {selectedIds.includes(profile.id) && <span>✓</span>}
            </button>
          ))}
        </div>
        {selectedIds.length > 1 && (
          <Input
            placeholder="Group name (optional)"
            value={groupName}
            onChange={(event) => setGroupName(event.target.value)}
          />
        )}
        <DialogFooter>
          <Button onClick={handleStart} disabled={selectedIds.length === 0 || createConversation.isPending}>
            {createConversation.isPending ? 'Starting…' : 'Start conversation'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
