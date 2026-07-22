import { useQuery } from '@tanstack/react-query';
import { db, type DraftPost } from '../lib/db';

export function useQueuedDrafts(userId: string | undefined) {
  return useQuery({
    queryKey: ['drafts', userId],
    queryFn: async (): Promise<DraftPost[]> => {
      const drafts = await db.draftPosts.where('authorId').equals(userId || '').toArray();
      return drafts.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    refetchInterval: userId ? 2000 : false,
    // This query only ever reads local IndexedDB, never the network — with
    // the default networkMode:'online', React Query pauses ALL fetches
    // (mount, refetchInterval, invalidateQueries) whenever navigator.onLine
    // is false, which would otherwise leave queued/failed drafts invisible
    // until a manual reload while the device is offline.
    networkMode: 'always',
  });
}
