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
    // This query only ever reads local IndexedDB, never the network — with
    // the default networkMode:'online', React Query pauses ALL fetches
    // (mount, refetchInterval, invalidateQueries) whenever navigator.onLine
    // is false, which would otherwise leave queued/failed drafts invisible
    // until a manual reload while the device is offline.
    networkMode: 'always',
  });
}
