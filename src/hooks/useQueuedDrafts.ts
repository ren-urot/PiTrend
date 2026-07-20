import { useQuery } from '@tanstack/react-query';
import { db, type DraftPost } from '../lib/db';

export function useQueuedDrafts(userId: string | undefined) {
  return useQuery({
    queryKey: ['drafts', userId],
    queryFn: async (): Promise<DraftPost[]> => {
      const drafts = await db.draftPosts.where('authorId').equals(userId || '').toArray();
      return drafts.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    refetchInterval: 2000,
  });
}
