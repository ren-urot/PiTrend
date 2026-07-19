import type { Persister } from '@tanstack/react-query-persist-client';
import { db } from './db';

const CACHE_KEY = 'react-query-cache';

export const dexiePersister: Persister = {
  persistClient: async (client) => {
    await db.queryCache.put({ key: CACHE_KEY, value: JSON.stringify(client) });
  },
  restoreClient: async () => {
    const record = await db.queryCache.get(CACHE_KEY);
    return record ? JSON.parse(record.value) : undefined;
  },
  removeClient: async () => {
    await db.queryCache.delete(CACHE_KEY);
  },
};
