import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

interface CreateConversationInput {
  creatorId: string;
  participantIds: string[];
  isGroup: boolean;
  name?: string | null;
}

async function findExisting1on1(userId: string, otherUserId: string): Promise<string | null> {
  const { data: mine, error: mineError } = await supabase
    .from('conversation_participants')
    .select('conversation_id')
    .eq('user_id', userId);
  if (mineError) throw mineError;

  const { data: theirs, error: theirsError } = await supabase
    .from('conversation_participants')
    .select('conversation_id')
    .eq('user_id', otherUserId);
  if (theirsError) throw theirsError;

  const mineIds = new Set((mine ?? []).map((row) => row.conversation_id));
  const sharedIds = (theirs ?? []).map((row) => row.conversation_id).filter((id) => mineIds.has(id));
  if (sharedIds.length === 0) return null;

  const { data: conversations, error: conversationsError } = await supabase
    .from('conversations')
    .select('id')
    .in('id', sharedIds)
    .eq('is_group', false);
  if (conversationsError) throw conversationsError;

  return conversations?.[0]?.id ?? null;
}

export function useCreateConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateConversationInput): Promise<string> => {
      if (!input.isGroup) {
        const existingId = await findExisting1on1(input.creatorId, input.participantIds[0]);
        if (existingId) return existingId;
      }

      // The conversation id is generated client-side (matching the pattern
      // already used by offlineQueue.ts's queueDraftPost and
      // useMessageActions.ts's useSendMessage) so this insert never needs
      // `.select().single()` return-representation. That matters here
      // specifically: the `conversations` SELECT RLS policy requires being
      // a participant, but the creator isn't a participant yet at the
      // instant this row is inserted — asking PostgREST to hand the new
      // row back would fail RLS and 403, even though the insert itself is
      // permitted. Knowing the id upfront sidesteps that entirely.
      const conversationId = crypto.randomUUID();
      const { error: conversationError } = await supabase.from('conversations').insert({
        id: conversationId,
        is_group: input.isGroup,
        name: input.isGroup ? (input.name ?? null) : null,
      });
      if (conversationError) throw conversationError;

      // Two sequential inserts, not one batched insert — see this plan's Global
      // Constraints: the conversation_participants INSERT policy's fellow-participant
      // check can't see other not-yet-committed rows from the same statement.
      const { error: selfError } = await supabase
        .from('conversation_participants')
        .insert({ conversation_id: conversationId, user_id: input.creatorId });
      if (selfError) throw selfError;

      const { error: othersError } = await supabase.from('conversation_participants').insert(
        input.participantIds.map((userId) => ({
          conversation_id: conversationId,
          user_id: userId,
        }))
      );
      if (othersError) throw othersError;

      return conversationId;
    },
    onSuccess: (_conversationId, variables) => {
      queryClient.invalidateQueries({ queryKey: ['conversations', variables.creatorId] });
    },
  });
}
