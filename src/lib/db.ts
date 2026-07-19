import Dexie, { type Table } from 'dexie';

export interface CachedQueryClient {
  key: string;
  value: string;
}

export class PiMeshDB extends Dexie {
  queryCache!: Table<CachedQueryClient, string>;

  constructor() {
    super('pimesh');
    this.version(1).stores({
      queryCache: 'key',
    });
  }
}

export const db = new PiMeshDB();
