import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useMessages } from '../hooks/useMessages';
import { useConversation } from '../hooks/useConversations';
import { useSendMessage, useMarkAsRead } from '../hooks/useMessageActions';
import { getConversationDisplayName } from '../lib/conversationDisplay';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

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
      <h1 className="mb-4 text-xl font-semibold">
        {conversation ? getConversationDisplayName(conversation) : 'Conversation'}
      </h1>
      {isLoading && <p className="text-muted-foreground">Loading messages…</p>}
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto">
        {messages?.map((message) => (
          <div
            key={message.id}
            className={`max-w-[80%] rounded-lg p-2 ${
              message.sender_id === session?.user.id
                ? 'self-end bg-primary text-primary-foreground'
                : 'self-start bg-muted'
            }`}
          >
            {message.sender_id !== session?.user.id && (
              <p className="text-xs opacity-70">{senderNames.get(message.sender_id) ?? 'Unknown'}</p>
            )}
            {message.body && <p>{message.body}</p>}
            {message.media_url && <img src={message.media_url} alt="" className="mt-1 max-w-full rounded" />}
          </div>
        ))}
      </div>
      <form onSubmit={handleSubmit} className="mt-4 flex gap-2">
        <Input placeholder="Message…" value={body} onChange={(event) => setBody(event.target.value)} />
        <input
          type="file"
          accept="image/*"
          aria-label="Photo"
          onChange={(event) => setMediaFile(event.target.files?.[0])}
        />
        <Button type="submit" disabled={sendMessage.isPending}>
          Send
        </Button>
      </form>
    </div>
  );
}
