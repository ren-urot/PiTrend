import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useConversations } from '../hooks/useConversations';
import { getConversationDisplayName } from '../lib/conversationDisplay';
import { NewMessageDialog } from '../components/messages/NewMessageDialog';
import { Button } from '@/components/ui/button';

export function MessagesPage() {
  const { session } = useAuth();
  const { data: conversations, isLoading } = useConversations(session?.user.id);
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="mx-auto max-w-xl p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Messages</h1>
        <Button onClick={() => setDialogOpen(true)}>New message</Button>
      </div>
      {isLoading && <p className="text-muted-foreground">Loading conversations…</p>}
      {!isLoading && conversations?.length === 0 && (
        <p className="text-muted-foreground">No conversations yet — start one!</p>
      )}
      <div className="flex flex-col gap-2">
        {conversations?.map((conversation) => (
          <Link
            key={conversation.id}
            to={`/messages/${conversation.id}`}
            className="flex items-center justify-between rounded-lg border p-3 hover:bg-accent"
          >
            <div className="min-w-0 flex-1 flex flex-col">
              <span className="truncate font-medium">{getConversationDisplayName(conversation)}</span>
              <span className="truncate text-sm text-muted-foreground">
                {conversation.lastMessagePreview ?? 'No messages yet'}
              </span>
            </div>
            {conversation.unreadCount > 0 && (
              <span className="ml-2 shrink-0 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                {conversation.unreadCount}
              </span>
            )}
          </Link>
        ))}
      </div>
      <NewMessageDialog open={dialogOpen} onOpenChange={setDialogOpen} currentUserId={session?.user.id} />
    </div>
  );
}
