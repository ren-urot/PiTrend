import { describe, it, expect, beforeEach } from 'vitest';
import { dexiePersister } from './persister';
import { db } from './db';
import type { PersistedClient } from '@tanstack/react-query-persist-client';

const snapshot: PersistedClient = {
  clientState: { queries: [], mutations: [] },
  timestamp: Date.now(),
  buster: '',
};

describe('dexiePersister', () => {
  beforeEach(async () => {
    await db.queryCache.clear();
  });

  it('persists and restores a client snapshot', async () => {
    await dexiePersister.persistClient(snapshot);
    const restored = await dexiePersister.restoreClient();
    expect(restored).toEqual(snapshot);
  });

  it('removes a persisted client', async () => {
    await dexiePersister.persistClient(snapshot);
    await dexiePersister.removeClient();
    const restored = await dexiePersister.restoreClient();
    expect(restored).toBeUndefined();
  });
});
