import { supabase } from './supabase';
import { db, type DraftPost } from './db';

type QueueDraftPostInput = Omit<DraftPost, 'id' | 'status' | 'lastError' | 'createdAt'>;

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

export async function queueDraftPost(input: QueueDraftPostInput): Promise<string> {
  const id = crypto.randomUUID();
  await db.draftPosts.add({
    ...input,
    id,
    status: 'queued',
    lastError: null,
    createdAt: new Date().toISOString(),
  });
  return id;
}

export async function processQueue(): Promise<void> {
  const queued = await db.draftPosts.where('status').equals('queued').toArray();

  for (const draft of queued) {
    await db.draftPosts.update(draft.id, { status: 'syncing' });

    try {
      const { data: post, error: postError } = await supabase
        .from('posts')
        .insert({
          author_id: draft.authorId,
          city_id: draft.cityId,
          channel_id: draft.channelId,
          post_type: draft.postType,
          body: draft.body,
        })
        .select('id')
        .single();
      if (postError) throw postError;

      if (draft.mediaBlob) {
        const extension =
          draft.mediaBlob.blob.type.split('/')[1] ||
          (draft.mediaBlob.mediaType === 'video' ? 'mp4' : 'jpg');
        const path = `${draft.authorId}/${post.id}.${extension}`;

        const { error: uploadError } = await supabase.storage
          .from('post-media')
          .upload(path, draft.mediaBlob.blob);
        if (uploadError) throw uploadError;

        const { data: publicUrlData } = supabase.storage.from('post-media').getPublicUrl(path);

        const { error: mediaError } = await supabase.from('post_media').insert({
          post_id: post.id,
          media_url: publicUrlData.publicUrl,
          media_type: draft.mediaBlob.mediaType,
        });
        if (mediaError) throw mediaError;
      }

      if (draft.postType === 'poll' && draft.pollOptions) {
        const { error: pollError } = await supabase.from('post_polls').insert({ post_id: post.id });
        if (pollError) throw pollError;

        const { error: optionsError } = await supabase.from('poll_options').insert(
          draft.pollOptions.map((optionText, index) => ({
            post_id: post.id,
            option_text: optionText,
            display_order: index,
          }))
        );
        if (optionsError) throw optionsError;
      }

      if (draft.postType === 'buy_sell' && draft.buySell) {
        const { error: buySellError } = await supabase.from('post_buy_sell').insert({
          post_id: post.id,
          price_amount: draft.buySell.priceAmount,
          price_currency: draft.buySell.priceCurrency,
          category: draft.buySell.category,
        });
        if (buySellError) throw buySellError;
      }

      await db.draftPosts.delete(draft.id);
    } catch (error) {
      await db.draftPosts.update(draft.id, {
        status: 'failed',
        lastError: extractErrorMessage(error),
      });
    }
  }
}

export async function retryDraft(draftId: string): Promise<void> {
  await db.draftPosts.update(draftId, { status: 'queued', lastError: null });
  await processQueue();
}
