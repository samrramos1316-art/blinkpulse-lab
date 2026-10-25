/**
 * Where history rows live (SPEC_AMENDMENT_04 F2): this browser's IndexedDB, on this
 * device only. Browser-only; `MemoryHistoryStore` stands in for tests.
 */

import type { HistoryRow } from '../history/history.ts';

export interface HistoryStore {
  put(rows: readonly HistoryRow[]): Promise<void>;
  /** Every row, oldest first. */
  all(): Promise<HistoryRow[]>;
  /** Delete rows that start before `ms`; returns how many were deleted. */
  deleteBefore(ms: number): Promise<number>;
  clear(): Promise<void>;
}

const DB_NAME = 'blinkpulse-history';
const STORE = 'minutes';

function done(req: IDBRequest): Promise<unknown> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => {
      resolve(req.result);
    };
    req.onerror = () => {
      reject(req.error ?? new Error('IndexedDB request failed'));
    };
  });
}

function finished(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => {
      resolve();
    };
    tx.onerror = () => {
      reject(tx.error ?? new Error('IndexedDB transaction failed'));
    };
    tx.onabort = () => {
      reject(tx.error ?? new Error('IndexedDB transaction aborted'));
    };
  });
}

class IdbHistoryStore implements HistoryStore {
  private db: Promise<IDBDatabase> | null = null;

  private open(): Promise<IDBDatabase> {
    this.db ??= new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const store = req.result.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('startMs', 'startMs');
      };
      req.onsuccess = () => {
        resolve(req.result);
      };
      req.onerror = () => {
        this.db = null;
        reject(req.error ?? new Error('Could not open the history database'));
      };
    });
    return this.db;
  }

  async put(rows: readonly HistoryRow[]): Promise<void> {
    if (rows.length === 0) return;
    const tx = (await this.open()).transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    for (const r of rows) store.put(r);
    await finished(tx);
  }

  async all(): Promise<HistoryRow[]> {
    const tx = (await this.open()).transaction(STORE, 'readonly');
    const rows = (await done(tx.objectStore(STORE).index('startMs').getAll())) as HistoryRow[];
    return rows;
  }

  async deleteBefore(ms: number): Promise<number> {
    const tx = (await this.open()).transaction(STORE, 'readwrite');
    const index = tx.objectStore(STORE).index('startMs');
    const range = IDBKeyRange.upperBound(ms, true);
    const keys = (await done(index.getAllKeys(range))) as IDBValidKey[];
    const store = tx.objectStore(STORE);
    for (const k of keys) store.delete(k);
    await finished(tx);
    return keys.length;
  }

  async clear(): Promise<void> {
    const tx = (await this.open()).transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    await finished(tx);
  }
}

/** The browser's store, or null where IndexedDB is unavailable (some private modes). */
export function openHistoryStore(): HistoryStore | null {
  return typeof indexedDB === 'undefined' ? null : new IdbHistoryStore();
}

export class MemoryHistoryStore implements HistoryStore {
  private readonly rows = new Map<string, HistoryRow>();

  put(rows: readonly HistoryRow[]): Promise<void> {
    for (const r of rows) this.rows.set(r.id, r);
    return Promise.resolve();
  }

  all(): Promise<HistoryRow[]> {
    return Promise.resolve([...this.rows.values()].sort((a, b) => a.startMs - b.startMs));
  }

  deleteBefore(ms: number): Promise<number> {
    let n = 0;
    for (const [k, r] of this.rows) {
      if (r.startMs < ms) {
        this.rows.delete(k);
        n++;
      }
    }
    return Promise.resolve(n);
  }

  clear(): Promise<void> {
    this.rows.clear();
    return Promise.resolve();
  }
}
