import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { PostType } from '../types/post';

interface CreatePostInput {
  authorId: string;
  cityId: string;
  channelId: string | null;
  postType: PostType;
  body: string | null;
  mediaFile?: File;
  mediaType?: 'photo' | 'video';
  pollOptions?: string[];
  buySell?: { priceAmount: number; priceCurrency: 'USD' | 'PHP' | 'PI'; category: string };
}

export function useCreatePost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreatePostInput) => {
      const { data: post, error: postError } = await supabase
        .from('posts')
        .insert({
          author_id: input.authorId,
          city_id: input.cityId,
          channel_id: input.channelId,
          post_type: input.postType,
          body: input.body,
        })
        .select('id')
        .single();
      if (postError) throw postError;

      if (input.mediaFile) {
        const extension = input.mediaFile.name.split('.').pop();
        const path = `${input.authorId}/${post.id}.${extension}`;

        const { error: uploadError } = await supabase.storage
          .from('post-media')
          .upload(path, input.mediaFile);
        if (uploadError) throw uploadError;

        const { data: publicUrlData } = supabase.storage.from('post-media').getPublicUrl(path);

        const { error: mediaError } = await supabase.from('post_media').insert({
          post_id: post.id,
          media_url: publicUrlData.publicUrl,
          media_type: input.mediaType ?? 'photo',
        });
        if (mediaError) throw mediaError;
      }

      if (input.postType === 'poll' && input.pollOptions) {
        const { error: pollError } = await supabase.from('post_polls').insert({ post_id: post.id });
        if (pollError) throw pollError;

        const { error: optionsError } = await supabase.from('poll_options').insert(
          input.pollOptions.map((optionText, index) => ({
            post_id: post.id,
            option_text: optionText,
            display_order: index,
          }))
        );
        if (optionsError) throw optionsError;
      }

      if (input.postType === 'buy_sell' && input.buySell) {
        const { error: buySellError } = await supabase.from('post_buy_sell').insert({
          post_id: post.id,
          price_amount: input.buySell.priceAmount,
          price_currency: input.buySell.priceCurrency,
          category: input.buySell.category,
        });
        if (buySellError) throw buySellError;
      }

      return post;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['posts', variables.cityId, variables.channelId] });
    },
  });
}
