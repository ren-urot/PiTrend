import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useMessages } from '../hooks/useMessages';
import { useConversation } from '../hooks/useConversations';
import { useSendMessage, useMarkAsRead } from '../hooks/useMessageActions';
import { getConversationDisplayName } from '../lib/conversationDisplay';
import { NodeAvatar } from '../components/NodeAvatar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function ConversationPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const { session } = useAuth();
  const { data: conversation } = useConversation(conversationId, session?.user.id);
  const { data: messages, isLoading } = useMessages(conversationId);
  const sendMessage = useSendMessage();
  const markAsRead = useMarkAsRead();
  const [body, setBody] = useState('');
  const [mediaFile, setMediaFile] = useState<File | undefined>(undefined);

  useEffect(() => {
    if (!conversationId || !session?.user.id) return;
    markAsRead.mutate({ conversationId, userId: session.user.id });
  }, [conversationId, session?.user.id]);

  const senderNames = new Map((conversation?.participants ?? []).map((p) => [p.user_id, p.display_name]));
  const conversationName = conversation ? getConversationDisplayName(conversation) : 'Conversation';

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!conversationId || !session?.user.id) return;
    if (!body.trim() && !mediaFile) return;

    await sendMessage.mutateAsync({
      conversationId,
      senderId: session.user.id,
      body: body.trim() || null,
      mediaFile,
    });
    setBody('');
    setMediaFile(undefined);
  }

  if (!conversationId) return null;

  return (
    <div className="mx-auto flex h-full max-w-xl flex-col p-4">
      <div className="mb-4 flex items-center gap-3">
        <NodeAvatar name={conversationName} size={36} />
        <h1 className="font-display text-xl font-semibold">{conversationName}</h1>
      </div>
      {isLoading && <p className="text-muted-foreground">Loading messages…</p>}
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto">
        {messages?.map((message) => {
          const isOwn = message.sender_id === session?.user.id;
          return (
            <div
              key={message.id}
              className={`flex items-end gap-2 ${isOwn ? 'flex-row-reverse self-end' : 'self-start'}`}
            >
              {!isOwn && <NodeAvatar name={senderNames.get(message.sender_id) ?? 'Unknown'} size={28} />}
              <div
                className={`max-w-[75%] rounded-2xl px-3 py-2 ${
                  isOwn
                    ? 'rounded-br-sm bg-primary text-primary-foreground'
                    : 'rounded-bl-sm border border-border bg-card'
                }`}
              >
                {!isOwn && (
                  <p className="font-display text-xs font-medium opacity-70">
                    {senderNames.get(message.sender_id) ?? 'Unknown'}
                  </p>
                )}
                {message.body && <p>{message.body}</p>}
                {message.media_url && (
                  <img src={message.media_url} alt="" className="mt-1 max-w-full rounded-lg" />
                )}
                <p
                  className={`mt-1 font-mono text-[10px] ${
                    isOwn ? 'text-primary-foreground/70' : 'text-muted-foreground'
                  }`}
                >
                  {formatTime(message.created_at)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
      <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-2">
        <label className="text-sm">
          Photo
          <input
            type="file"
            accept="image/*"
            aria-label="Photo"
            onChange={(event) => setMediaFile(event.target.files?.[0])}
          />
        </label>
        <div className="flex gap-2">
          <Input
            placeholder="Message…"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            className="min-w-0 flex-1"
          />
          <Button type="submit" disabled={sendMessage.isPending} className="shrink-0">
            Send
          </Button>
        </div>
      </form>
    </div>
  );
}
