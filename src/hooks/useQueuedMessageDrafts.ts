import { useQuery } from '@tanstack/react-query';
import { db, type DraftMessage } from '../lib/db';

export function useQueuedMessageDrafts(senderId: string | undefined) {
  return useQuery({
    queryKey: ['message-drafts', senderId],
    queryFn: async (): Promise<DraftMessage[]> => {
      const drafts = await db.draftMessages.where('senderId').equals(senderId || '').toArray();
      return drafts.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    refetchInterval: senderId ? 2000 : false,
  });
}
