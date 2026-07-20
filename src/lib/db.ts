import Dexie, { type Table } from 'dexie';
import type { PostType } from '../types/post';

export interface CachedQueryClient {
  key: string;
  value: string;
}

export interface DraftPost {
  id: string;
  authorId: string;
  cityId: string;
  channelId: string | null;
  postType: PostType;
  body: string | null;
  mediaBlob?: { blob: Blob; mediaType: 'photo' | 'video' };
  pollOptions?: string[];
  buySell?: { priceAmount: number; priceCurrency: 'USD' | 'PHP' | 'PI'; category: string };
  status: 'queued' | 'syncing' | 'failed';
  lastError: string | null;
  createdAt: string;
}

export class PiMeshDB extends Dexie {
  queryCache!: Table<CachedQueryClient, string>;
  draftPosts!: Table<DraftPost, string>;

  constructor() {
    super('pimesh');
    this.version(1).stores({
      queryCache: 'key',
    });
    this.version(2).stores({
      queryCache: 'key',
      draftPosts: 'id, authorId, status',
    });
  }
}

export const db = new PiMeshDB();
