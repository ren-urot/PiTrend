import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageCirclePlus, Users, User } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useConversations } from '../hooks/useConversations';
import { getConversationDisplayName } from '../lib/conversationDisplay';
import { NewMessageDialog } from '../components/messages/NewMessageDialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export function MessagesPage() {
  const { session } = useAuth();
  const { data: conversations, isLoading } = useConversations(session?.user.id);
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="mx-auto max-w-xl p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Messages</h1>
        <Button onClick={() => setDialogOpen(true)}>
          <MessageCirclePlus size={16} className="mr-1" />
          New message
        </Button>
      </div>
      {isLoading && <p className="text-muted-foreground">Loading conversations…</p>}
      {!isLoading && conversations?.length === 0 && (
        <p className="text-muted-foreground">No conversations yet — start one!</p>
      )}
      <div className="flex flex-col gap-2">
        {conversations?.map((conversation) => (
          <Link key={conversation.id} to={`/messages/${conversation.id}`}>
            <Card className="flex flex-row items-center gap-3 p-3 transition-colors hover:bg-accent">
              {conversation.is_group ? (
                <Users size={20} className="shrink-0 text-muted-foreground" />
              ) : (
                <User size={20} className="shrink-0 text-muted-foreground" />
              )}
              <div className="min-w-0 flex-1 flex flex-col">
                <span className="truncate font-medium">{getConversationDisplayName(conversation)}</span>
                <span className="truncate text-sm text-muted-foreground">
                  {conversation.lastMessagePreview ?? 'No messages yet'}
                </span>
              </div>
              {conversation.unreadCount > 0 && (
                <Badge className="shrink-0 rounded-full">{conversation.unreadCount}</Badge>
              )}
            </Card>
          </Link>
        ))}
      </div>
      <NewMessageDialog open={dialogOpen} onOpenChange={setDialogOpen} currentUserId={session?.user.id} />
    </div>
  );
}
