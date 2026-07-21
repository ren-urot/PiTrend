import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageCirclePlus } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useConversations } from '../hooks/useConversations';
import { getConversationDisplayName, getConversationAvatarUrl } from '../lib/conversationDisplay';
import { NewMessageDialog } from '../components/messages/NewMessageDialog';
import { NodeAvatar } from '../components/NodeAvatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

function EmptyMesh() {
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <svg width="120" height="80" viewBox="0 0 120 80" fill="none" aria-hidden="true">
        <line x1="20" y1="20" x2="60" y2="50" stroke="#8A348E" strokeOpacity="0.25" strokeWidth="1.5" strokeDasharray="3 3" />
        <line x1="60" y1="50" x2="100" y2="24" stroke="#E8A93A" strokeOpacity="0.3" strokeWidth="1.5" strokeDasharray="3 3" />
        <line x1="60" y1="50" x2="50" y2="70" stroke="#1FA097" strokeOpacity="0.3" strokeWidth="1.5" strokeDasharray="3 3" />
        <circle cx="20" cy="20" r="6" fill="#8A348E" fillOpacity="0.35" />
        <circle cx="100" cy="24" r="6" fill="#E8A93A" fillOpacity="0.4" />
        <circle cx="50" cy="70" r="6" fill="#1FA097" fillOpacity="0.4" />
        <circle cx="60" cy="50" r="8" fill="#8A348E" />
      </svg>
      <p className="text-muted-foreground">No conversations yet — start one to join the mesh!</p>
    </div>
  );
}

export function MessagesPage() {
  const { session } = useAuth();
  const { data: conversations, isLoading } = useConversations(session?.user.id);
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="mx-auto max-w-xl p-4">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h1 className="font-display text-base font-semibold md:text-xl">Messages</h1>
        <Button onClick={() => setDialogOpen(true)} className="shrink-0 whitespace-nowrap">
          <MessageCirclePlus size={16} className="mr-1 shrink-0" />
          New message
        </Button>
      </div>
      {isLoading && <p className="text-muted-foreground">Loading conversations…</p>}
      {!isLoading && conversations?.length === 0 && <EmptyMesh />}
      <div className="flex flex-col gap-2">
        {conversations?.map((conversation) => (
          <Link key={conversation.id} to={`/messages/${conversation.id}`}>
            <Card className="flex flex-row items-center gap-3 p-3 transition-colors hover:bg-accent">
              <NodeAvatar
                name={getConversationDisplayName(conversation)}
                avatarUrl={getConversationAvatarUrl(conversation)}
                size={40}
              />
              <div className="min-w-0 flex-1 flex flex-col">
                <span className="truncate font-display font-medium">
                  {getConversationDisplayName(conversation)}
                </span>
                <span className="truncate text-sm text-muted-foreground">
                  {conversation.lastMessagePreview ?? 'No messages yet'}
                </span>
              </div>
              {conversation.unreadCount > 0 && (
                <Badge className="shrink-0 rounded-full bg-mesh-gold font-mono text-white hover:bg-mesh-gold">
                  {conversation.unreadCount}
                </Badge>
              )}
            </Card>
          </Link>
        ))}
      </div>
      <NewMessageDialog open={dialogOpen} onOpenChange={setDialogOpen} currentUserId={session?.user.id} />
    </div>
  );
}
