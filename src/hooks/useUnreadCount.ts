import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export function useUnreadCount(userId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`unread-count:${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
        queryClient.invalidateQueries({ queryKey: ['unread-count', userId] });
      });
    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);

  return useQuery({
    queryKey: ['unread-count', userId],
    queryFn: async (): Promise<number> => {
      if (!userId) return 0;

      const { data: participantRows, error: participantError } = await supabase
        .from('conversation_participants')
        .select('conversation_id, last_read_at')
        .eq('user_id', userId);
      if (participantError) throw participantError;
      if (!participantRows || participantRows.length === 0) return 0;

      const conversationIds = participantRows.map((row) => row.conversation_id);
      const lastReadByConversation = new Map(
        participantRows.map((row) => [row.conversation_id, row.last_read_at])
      );

      const { data: messages, error: messagesError } = await supabase
        .from('messages')
        .select('conversation_id, sender_id, created_at')
        .in('conversation_id', conversationIds)
        .neq('sender_id', userId);
      if (messagesError) throw messagesError;

      return (messages ?? []).filter((message) => {
        const lastReadAt = lastReadByConversation.get(message.conversation_id);
        return lastReadAt ? message.created_at > lastReadAt : true;
      }).length;
    },
  });
}
