import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { ConversationDetail, ConversationSummary } from '../types/conversation';

interface RawParticipantEmbed {
  user_id: string;
  last_read_at: string;
  profiles: { username: string; display_name: string; avatar_url: string | null } | null;
}

interface RawConversationRow {
  id: string;
  is_group: boolean;
  name: string | null;
  created_at: string;
  conversation_participants: RawParticipantEmbed[];
}

interface RawMessageRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string | null;
  media_url: string | null;
  created_at: string;
}

export function useConversations(userId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`conversations:${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
        queryClient.invalidateQueries({ queryKey: ['conversations', userId] });
      });
    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);

  return useQuery({
    queryKey: ['conversations', userId],
    queryFn: async (): Promise<ConversationSummary[]> => {
      if (!userId) return [];

      const { data: participantRows, error: participantError } = await supabase
        .from('conversation_participants')
        .select('conversation_id, last_read_at')
        .eq('user_id', userId);
      if (participantError) throw participantError;
      if (!participantRows || participantRows.length === 0) return [];

      const conversationIds = participantRows.map((row) => row.conversation_id);
      const lastReadByConversation = new Map(
        participantRows.map((row) => [row.conversation_id, row.last_read_at])
      );

      const { data: conversations, error: conversationsError } = await supabase
        .from('conversations')
        .select(
          'id, is_group, name, created_at, ' +
            'conversation_participants(user_id, last_read_at, profiles!conversation_participants_user_id_fkey(username, display_name, avatar_url))'
        )
        .in('id', conversationIds);
      if (conversationsError) throw conversationsError;

      const { data: messages, error: messagesError } = await supabase
        .from('messages')
        .select('id, conversation_id, sender_id, body, media_url, created_at')
        .in('conversation_id', conversationIds)
        .order('created_at', { ascending: true });
      if (messagesError) throw messagesError;

      const messagesByConversation = new Map<string, RawMessageRow[]>();
      for (const message of (messages ?? []) as RawMessageRow[]) {
        const existing = messagesByConversation.get(message.conversation_id) ?? [];
        existing.push(message);
        messagesByConversation.set(message.conversation_id, existing);
      }

      return ((conversations ?? []) as unknown as RawConversationRow[])
        .map((conversation) => {
          const lastReadAt = lastReadByConversation.get(conversation.id) ?? conversation.created_at;
          const conversationMessages = messagesByConversation.get(conversation.id) ?? [];
          const lastMessage = conversationMessages[conversationMessages.length - 1] ?? null;
          const unreadCount = conversationMessages.filter(
            (message) => message.sender_id !== userId && message.created_at > lastReadAt
          ).length;

          return {
            id: conversation.id,
            is_group: conversation.is_group,
            name: conversation.name,
            created_at: conversation.created_at,
            participants: conversation.conversation_participants
              .filter((participant) => participant.user_id !== userId && participant.profiles)
              .map((participant) => ({
                user_id: participant.user_id,
                username: participant.profiles!.username,
                display_name: participant.profiles!.display_name,
                avatar_url: participant.profiles!.avatar_url,
              })),
            lastMessagePreview: lastMessage ? (lastMessage.body ?? '📷 Photo') : null,
            lastMessageAt: lastMessage?.created_at ?? null,
            unreadCount,
            lastReadAt,
          };
        })
        .sort((a, b) => (b.lastMessageAt ?? b.created_at).localeCompare(a.lastMessageAt ?? a.created_at));
    },
  });
}

export function useConversation(conversationId: string | undefined, currentUserId: string | undefined) {
  return useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: async (): Promise<ConversationDetail | null> => {
      if (!conversationId) return null;

      const { data, error } = await supabase
        .from('conversations')
        .select(
          'id, is_group, name, created_at, ' +
            'conversation_participants(user_id, profiles!conversation_participants_user_id_fkey(username, display_name, avatar_url))'
        )
        .eq('id', conversationId)
        .single();
      if (error) throw error;

      const raw = data as unknown as {
        id: string;
        is_group: boolean;
        name: string | null;
        created_at: string;
        conversation_participants: {
          user_id: string;
          profiles: { username: string; display_name: string; avatar_url: string | null } | null;
        }[];
      };

      return {
        id: raw.id,
        is_group: raw.is_group,
        name: raw.name,
        created_at: raw.created_at,
        participants: raw.conversation_participants
          .filter((participant) => participant.user_id !== currentUserId && participant.profiles)
          .map((participant) => ({
            user_id: participant.user_id,
            username: participant.profiles!.username,
            display_name: participant.profiles!.display_name,
            avatar_url: participant.profiles!.avatar_url,
          })),
      };
    },
    enabled: !!conversationId,
  });
}
