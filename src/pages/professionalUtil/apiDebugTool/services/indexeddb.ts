import { Collection, HttpRequest, HistoryEntry, AppSettings } from '../types';

const DB_NAME = 'ORAEN_API_DEBUG';
const DB_VERSION = 1;

interface Database {
  collections: IDBObjectStore;
  requests: IDBObjectStore;
  history: IDBObjectStore;
  settings: IDBObjectStore;
}

class IndexedDBService {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.db) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        this.db.onversionchange = () => {
          this.db?.close();
          this.db = null;
          this.initPromise = null;
        };
        resolve();
      };

      request.onblocked = () => reject(new Error('Database upgrade is blocked by another open window'));

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create collections store
        if (!db.objectStoreNames.contains('collections')) {
          db.createObjectStore('collections', { keyPath: 'id' });
        }

        // Create requests store
        if (!db.objectStoreNames.contains('requests')) {
          const requestStore = db.createObjectStore('requests', { keyPath: 'id' });
          requestStore.createIndex('collectionId', 'collectionId', { unique: false });
        }

        // Create history store
        if (!db.objectStoreNames.contains('history')) {
          const historyStore = db.createObjectStore('history', { keyPath: 'id' });
          historyStore.createIndex('executedAt', 'executedAt', { unique: false });
        }

        // Create settings store
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'id' });
        }
      };
    });

    try {
      return await this.initPromise;
    } catch (error) {
      this.initPromise = null;
      throw error;
    }
  }

  private async transaction<T>(
    stores: string[],
    mode: IDBTransactionMode,
    callback: (tx: IDBTransaction) => Promise<T>
  ): Promise<T> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(stores, mode);
      let callbackResult: T;
      let callbackFinished = false;
      let transactionFinished = false;
      let settled = false;
      const finish = () => {
        if (!settled && callbackFinished && transactionFinished) {
          settled = true;
          resolve(callbackResult);
        }
      };
      const fail = (error: unknown) => {
        if (!settled) {
          settled = true;
          reject(error instanceof Error ? error : new Error(String(error || 'IndexedDB transaction failed')));
        }
      };
      tx.onerror = () => fail(tx.error);
      tx.onabort = () => fail(tx.error || new Error('Transaction aborted'));
      tx.oncomplete = () => {
        transactionFinished = true;
        finish();
      };
      callback(tx)
        .then(result => {
          callbackResult = result;
          callbackFinished = true;
          finish();
        })
        .catch(error => {
          try { tx.abort(); } catch {}
          fail(error);
        });
    });
  }

  // Collections
  async createCollection(collection: Collection): Promise<void> {
    return this.transaction(['collections'], 'readwrite', (tx) => {
      return new Promise((resolve, reject) => {
        const request = tx.objectStore('collections').add(collection);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    });
  }

  async getCollection(id: string): Promise<Collection | undefined> {
    return this.transaction(['collections'], 'readonly', (tx) => {
      return new Promise((resolve, reject) => {
        const request = tx.objectStore('collections').get(id);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
    });
  }

  async getAllCollections(): Promise<Collection[]> {
    return this.transaction(['collections'], 'readonly', (tx) => {
      return new Promise((resolve, reject) => {
        const request = tx.objectStore('collections').getAll();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result || []);
      });
    });
  }

  async updateCollection(collection: Collection): Promise<void> {
    return this.transaction(['collections'], 'readwrite', (tx) => {
      return new Promise((resolve, reject) => {
        const request = tx.objectStore('collections').put(collection);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    });
  }

  async deleteCollection(id: string): Promise<void> {
    return this.transaction(['collections', 'requests'], 'readwrite', (tx) => {
      return new Promise(async (resolve, reject) => {
        try {
          // Delete requests in this collection
          const requestIndex = tx.objectStore('requests').index('collectionId');
          const getRequest = requestIndex.getAll(id);
          
          getRequest.onsuccess = () => {
            const requests = getRequest.result;
            requests.forEach(req => {
              tx.objectStore('requests').delete(req.id);
            });
          };

          // Delete collection
          const deleteRequest = tx.objectStore('collections').delete(id);
          deleteRequest.onerror = () => reject(deleteRequest.error);
          deleteRequest.onsuccess = () => resolve();
        } catch (e) {
          reject(e);
        }
      });
    });
  }

  // Requests
  async createRequest(request: HttpRequest & { collectionId?: string }): Promise<void> {
    return this.transaction(['requests'], 'readwrite', (tx) => {
      return new Promise((resolve, reject) => {
        const storeRequest = tx.objectStore('requests').add(request);
        storeRequest.onerror = () => reject(storeRequest.error);
        storeRequest.onsuccess = () => resolve();
      });
    });
  }

  async getRequest(id: string): Promise<(HttpRequest & { collectionId?: string }) | undefined> {
    return this.transaction(['requests'], 'readonly', (tx) => {
      return new Promise((resolve, reject) => {
        const request = tx.objectStore('requests').get(id);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
    });
  }

  async getRequestsByCollection(collectionId: string): Promise<HttpRequest[]> {
    return this.transaction(['requests'], 'readonly', (tx) => {
      return new Promise((resolve, reject) => {
        const index = tx.objectStore('requests').index('collectionId');
        const request = index.getAll(collectionId);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result || []);
      });
    });
  }

  async updateRequest(request: HttpRequest & { collectionId?: string }): Promise<void> {
    return this.transaction(['requests'], 'readwrite', (tx) => {
      return new Promise((resolve, reject) => {
        const storeRequest = tx.objectStore('requests').put(request);
        storeRequest.onerror = () => reject(storeRequest.error);
        storeRequest.onsuccess = () => resolve();
      });
    });
  }

  async deleteRequest(id: string): Promise<void> {
    return this.transaction(['requests'], 'readwrite', (tx) => {
      return new Promise((resolve, reject) => {
        const request = tx.objectStore('requests').delete(id);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    });
  }

  // History
  async addHistoryEntry(entry: HistoryEntry): Promise<void> {
    return this.transaction(['history'], 'readwrite', (tx) => {
      return new Promise((resolve, reject) => {
        const request = tx.objectStore('history').add(entry);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    });
  }

  async deleteHistoryEntry(id: string): Promise<void> {
    return this.transaction(['history'], 'readwrite', (tx) => {
      return new Promise((resolve, reject) => {
        const request = tx.objectStore('history').delete(id);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    });
  }

  async getHistory(limit: number = 100, offset: number = 0): Promise<HistoryEntry[]> {
    return this.transaction(['history'], 'readonly', (tx) => {
      return new Promise((resolve, reject) => {
        const index = tx.objectStore('history').index('executedAt');
        const request = index.openCursor(null, 'prev'); // Descending order
        const entries: HistoryEntry[] = [];
        let count = 0;

        request.onsuccess = (e) => {
          const cursor = (e.target as IDBRequest).result;
          if (cursor && entries.length < limit) {
            if (count >= offset) {
              entries.push(cursor.value);
            }
            count++;
            cursor.continue();
          } else {
            resolve(entries);
          }
        };
        request.onerror = () => reject(request.error);
      });
    });
  }

  async clearOldHistory(expireDays: number, maxSize: number): Promise<void> {
    const cutoffTime = Date.now() - expireDays * 24 * 60 * 60 * 1000;
    
    return this.transaction(['history'], 'readwrite', (tx) => {
      return new Promise(async (resolve, reject) => {
        try {
          const store = tx.objectStore('history');
          const allRequest = store.getAll();

          allRequest.onsuccess = () => {
            const allEntries = allRequest.result as HistoryEntry[];
            
            const unexpiredEntries = allEntries.filter(entry => entry.executedAt >= cutoffTime);
            // Delete expired entries
            allEntries.forEach(entry => {
              if (entry.executedAt < cutoffTime) {
                store.delete(entry.id);
              }
            });

            // If still exceeds max size, delete oldest entries
            if (unexpiredEntries.length > maxSize) {
              const sorted = unexpiredEntries.sort((a, b) => b.executedAt - a.executedAt);
              for (let i = maxSize; i < sorted.length; i++) {
                store.delete(sorted[i].id);
              }
            }

            resolve();
          };
          allRequest.onerror = () => reject(allRequest.error);
        } catch (e) {
          reject(e);
        }
      });
    });
  }

  async deleteAllHistory(): Promise<void> {
    return this.transaction(['history'], 'readwrite', (tx) => {
      return new Promise((resolve, reject) => {
        const request = tx.objectStore('history').clear();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    });
  }

  // Settings
  async getSettings(): Promise<AppSettings | null> {
    return this.transaction(['settings'], 'readonly', (tx) => {
      return new Promise((resolve, reject) => {
        const request = tx.objectStore('settings').get('app_settings');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result || null);
      });
    });
  }

  async saveSettings(settings: AppSettings): Promise<void> {
    return this.transaction(['settings'], 'readwrite', (tx) => {
      return new Promise((resolve, reject) => {
        const request = tx.objectStore('settings').put({ ...settings, id: 'app_settings' });
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    });
  }

  async clearAll(): Promise<void> {
    return this.transaction(['collections', 'requests', 'history', 'settings'], 'readwrite', (tx) => {
      return new Promise((resolve, reject) => {
        tx.objectStore('collections').clear();
        tx.objectStore('requests').clear();
        tx.objectStore('history').clear();
        tx.objectStore('settings').clear();

        resolve();
      });
    });
  }
}

export default new IndexedDBService();
