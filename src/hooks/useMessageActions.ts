import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

interface SendMessageInput {
  conversationId: string;
  senderId: string;
  body: string | null;
  mediaFile?: File;
}

export function useSendMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: SendMessageInput) => {
      const messageId = crypto.randomUUID();
      let mediaUrl: string | null = null;

      if (input.mediaFile) {
        const extension = input.mediaFile.type.split('/')[1] || 'jpg';
        const path = `${input.conversationId}/${messageId}.${extension}`;

        const { error: uploadError } = await supabase.storage
          .from('message-media')
          .upload(path, input.mediaFile);
        if (uploadError) throw uploadError;

        const { data: publicUrlData } = supabase.storage.from('message-media').getPublicUrl(path);
        mediaUrl = publicUrlData.publicUrl;
      }

      const { error: insertError } = await supabase.from('messages').insert({
        id: messageId,
        conversation_id: input.conversationId,
        sender_id: input.senderId,
        body: input.body,
        media_url: mediaUrl,
      });
      if (insertError) throw insertError;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['messages', variables.conversationId] });
      queryClient.invalidateQueries({ queryKey: ['conversations', variables.senderId] });
    },
  });
}

interface MarkAsReadInput {
  conversationId: string;
  userId: string;
}

export function useMarkAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: MarkAsReadInput) => {
      const { error } = await supabase
        .from('conversation_participants')
        .update({ last_read_at: new Date().toISOString() })
        .eq('conversation_id', input.conversationId)
        .eq('user_id', input.userId);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['conversations', variables.userId] });
      queryClient.invalidateQueries({ queryKey: ['unread-count', variables.userId] });
    },
  });
}
