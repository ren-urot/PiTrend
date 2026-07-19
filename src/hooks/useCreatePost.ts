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
          media_type: 'photo',
        });
        if (mediaError) throw mediaError;
      }

      return post;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['posts', variables.cityId, variables.channelId] });
    },
  });
}
