import { supabase } from './supabase';
import { db, type DraftMessage } from './db';

type QueueDraftMessageInput = Omit<DraftMessage, 'id' | 'status' | 'lastError' | 'createdAt'>;

// Supabase/PostgREST errors are plain objects with a `message` field and are
// not always `instanceof Error` (e.g. across mock/realm boundaries), so check
// for a string `message` property rather than relying on the Error prototype.
function extractErrorMessage(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message;
  }
  return 'Something went wrong.';
}

export async function queueDraftMessage(input: QueueDraftMessageInput): Promise<string> {
  const id = crypto.randomUUID();
  await db.draftMessages.add({
    ...input,
    id,
    status: 'queued',
    lastError: null,
    createdAt: new Date().toISOString(),
  });
  return id;
}

let isProcessing = false;

export async function processMessageQueue(): Promise<void> {
  if (isProcessing) return;
  isProcessing = true;
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;

    // Include stale 'syncing' drafts so a draft left mid-sync by a crashed or
    // closed tab in a previous app session gets picked back up here. The
    // isProcessing guard above already prevents two concurrent
    // processMessageQueue() calls within this running app from racing on the
    // same draft, so re-querying 'syncing' is safe — it only ever recovers
    // orphaned state from a previous session, never a live concurrent one.
    const pending = await db.draftMessages.where('status').anyOf(['queued', 'syncing']).toArray();
    // Only sync drafts that belong to whoever is currently logged in. On a
    // shared device another user's queued/syncing drafts may still be
    // sitting in the local Dexie store; leave them untouched (don't mark
    // failed) so they're picked up correctly once their actual owner runs
    // processMessageQueue().
    const ownDrafts = pending.filter((draft) => draft.senderId === session.user.id);

    for (const draft of ownDrafts) {
      await db.draftMessages.update(draft.id, { status: 'syncing' });

      try {
        let mediaUrl: string | null = null;

        if (draft.mediaBlob) {
          const extension = draft.mediaBlob.blob.type.split('/')[1] || 'jpg';
          const path = `${draft.conversationId}/${draft.id}.${extension}`;

          const { error: uploadError } = await supabase.storage
            .from('message-media')
            .upload(path, draft.mediaBlob.blob);
          if (uploadError) throw uploadError;

          const { data: publicUrlData } = supabase.storage.from('message-media').getPublicUrl(path);
          mediaUrl = publicUrlData.publicUrl;
        }

        const { error: insertError } = await supabase.from('messages').insert({
          id: draft.id,
          conversation_id: draft.conversationId,
          sender_id: draft.senderId,
          body: draft.body,
          media_url: mediaUrl,
        });
        if (insertError) throw insertError;

        await db.draftMessages.delete(draft.id);
      } catch (error) {
        await db.draftMessages.update(draft.id, {
          status: 'failed',
          lastError: extractErrorMessage(error),
        });
      }
    }
  } finally {
    isProcessing = false;
  }
}

export async function retryDraftMessage(draftId: string): Promise<void> {
  await db.draftMessages.update(draftId, { status: 'queued', lastError: null });
  await processMessageQueue();
}
