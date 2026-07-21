import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

interface UpdateAvatarInput {
  userId: string;
  file: File;
}

export function useUpdateAvatar() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateAvatarInput): Promise<string> => {
      const extension = input.file.name.split('.').pop();
      const path = `${input.userId}/avatar.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, input.file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(path);
      // The path never changes across re-uploads (upsert overwrites it), so
      // without a cache-busting query param the browser/CDN would keep
      // showing the old photo at the same URL after a user changes it.
      const avatarUrl = `${publicUrlData.publicUrl}?t=${Date.now()}`;

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: avatarUrl })
        .eq('id', input.userId);
      if (updateError) throw updateError;

      return avatarUrl;
    },
    onSuccess: (_avatarUrl, variables) => {
      queryClient.invalidateQueries({ queryKey: ['profile', variables.userId] });
    },
  });
}
