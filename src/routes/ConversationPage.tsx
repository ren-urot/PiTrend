import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ImagePlus, X } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useMessages } from '../hooks/useMessages';
import { useConversation } from '../hooks/useConversations';
import { useMarkAsRead } from '../hooks/useMessageActions';
import { useQueuedMessageDrafts } from '../hooks/useQueuedMessageDrafts';
import { queueDraftMessage, processMessageQueue } from '../lib/messageQueue';
import { getConversationDisplayName, getConversationAvatarUrl } from '../lib/conversationDisplay';
import { NodeAvatar } from '../components/NodeAvatar';
import { DraftMessageBubble } from '../components/messages/DraftMessageBubble';
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
  const { data: drafts } = useQueuedMessageDrafts(session?.user.id);
  const markAsRead = useMarkAsRead();
  const queryClient = useQueryClient();
  const [body, setBody] = useState('');
  const [mediaFile, setMediaFile] = useState<File | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const isFirstScrollRef = useRef(true);

  useEffect(() => {
    if (!conversationId || !session?.user.id) return;
    markAsRead.mutate({ conversationId, userId: session.user.id });
  }, [conversationId, session?.user.id]);

  const senderNames = new Map((conversation?.participants ?? []).map((p) => [p.user_id, p.display_name]));
  const senderAvatars = new Map((conversation?.participants ?? []).map((p) => [p.user_id, p.avatar_url]));
  const conversationName = conversation ? getConversationDisplayName(conversation) : 'Conversation';
  const conversationAvatarUrl = conversation ? getConversationAvatarUrl(conversation) : null;
  const ownDrafts = (drafts ?? []).filter((draft) => draft.conversationId === conversationId);

  // Jump straight to the bottom on first load of a conversation (no
  // animation — there's no "previous position" to animate from), then
  // smooth-scroll on every later arrival (a new message or draft).
  useEffect(() => {
    isFirstScrollRef.current = true;
  }, [conversationId]);

  useEffect(() => {
    if (!messages) return;
    bottomRef.current?.scrollIntoView({ behavior: isFirstScrollRef.current ? 'auto' : 'smooth' });
    isFirstScrollRef.current = false;
  }, [messages, ownDrafts.length]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!conversationId || !session?.user.id) return;
    if (!body.trim() && !mediaFile) return;

    setSubmitting(true);
    try {
      await queueDraftMessage({
        conversationId,
        senderId: session.user.id,
        body: body.trim() || null,
        mediaBlob: mediaFile ? { blob: mediaFile, mediaType: 'photo' } : undefined,
      });

      queryClient.invalidateQueries({ queryKey: ['message-drafts', session.user.id] });
      setBody('');
      setMediaFile(undefined);
      if (fileInputRef.current) fileInputRef.current.value = '';

      processMessageQueue().then(() => {
        queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
        queryClient.invalidateQueries({ queryKey: ['conversations', session.user.id] });
        queryClient.invalidateQueries({ queryKey: ['message-drafts', session.user.id] });
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (!conversationId) return null;

  return (
    <div className="mx-auto flex max-w-xl flex-col p-4">
      <div className="mb-4 flex items-center gap-3">
        <NodeAvatar name={conversationName} avatarUrl={conversationAvatarUrl} size={36} />
        <h1 className="min-w-0 flex-1 truncate font-display text-base font-semibold md:text-xl">
          {conversationName}
        </h1>
      </div>
      {isLoading && <p className="text-muted-foreground">Loading messages…</p>}
      <div className="flex flex-col gap-3 pb-36 md:pb-24">
        {messages?.map((message) => {
          const isOwn = message.sender_id === session?.user.id;
          return (
            <div
              key={message.id}
              className={`flex items-end gap-2 ${isOwn ? 'flex-row-reverse self-end' : 'self-start'}`}
            >
              {!isOwn && (
                <NodeAvatar
                  name={senderNames.get(message.sender_id) ?? 'Unknown'}
                  avatarUrl={senderAvatars.get(message.sender_id)}
                  size={28}
                />
              )}
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
        {ownDrafts.map((draft) => (
          <DraftMessageBubble key={draft.id} draft={draft} />
        ))}
        <div ref={bottomRef} />
      </div>
      <form
        onSubmit={handleSubmit}
        className="fixed inset-x-0 bottom-16 z-10 mx-auto flex max-w-xl flex-col gap-2 rounded-lg border bg-card p-2 px-4 shadow-md md:inset-x-auto md:bottom-4 md:left-56 md:right-0 md:px-4"
      >
        {mediaFile && (
          <div className="flex items-center justify-between rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
            <span className="truncate">{mediaFile.name}</span>
            <button
              type="button"
              aria-label="Remove photo"
              onClick={() => {
                setMediaFile(undefined);
                if (fileInputRef.current) fileInputRef.current.value = '';
              }}
            >
              <X size={14} />
            </button>
          </div>
        )}
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            aria-label="Photo"
            className="hidden"
            onChange={(event) => setMediaFile(event.target.files?.[0])}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="shrink-0"
            aria-label="Attach photo"
            onClick={() => fileInputRef.current?.click()}
          >
            <ImagePlus size={18} />
          </Button>
          <Input
            placeholder="Message…"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            className="min-w-0 flex-1"
          />
          <Button type="submit" disabled={submitting} className="shrink-0">
            Send
          </Button>
        </div>
      </form>
    </div>
  );
}
