export interface MemoRecord {
  id: string;
  title: string;
  content: string;
  language: string;
  locked: boolean;
  createdAt: number;
  updatedAt: number;
}

const DB_NAME = "ORAEN_MEMO";
const DB_VERSION = 1;
const STORE_NAME = "memos";

export const createMemoId = () => `memo-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

class MemoDatabase {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<IDBDatabase> | null = null;

  private async getDatabase(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error || new Error("无法打开备忘录数据库"));
      request.onblocked = () => reject(new Error("数据库正在被其他窗口占用，请关闭其他窗口后重试"));
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
          store.createIndex("createdAt", "createdAt", { unique: false });
          store.createIndex("updatedAt", "updatedAt", { unique: false });
        }
      };
      request.onsuccess = () => {
        this.db = request.result;
        this.db.onversionchange = () => {
          this.db?.close();
          this.db = null;
          this.initPromise = null;
        };
        resolve(this.db);
      };
    });

    try {
      return await this.initPromise;
    } catch (error) {
      this.initPromise = null;
      throw error;
    }
  }

  async getAll(): Promise<MemoRecord[]> {
    const db = await this.getDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).getAll();
      request.onerror = () => reject(request.error || new Error("读取备忘录失败"));
      request.onsuccess = () => {
        const records = ((request.result || []) as Array<MemoRecord & { locked?: boolean }>).map((record) => ({
          ...record,
          locked: record.locked === true,
        }));
        resolve(records.sort((a, b) => b.createdAt - a.createdAt));
      };
    });
  }

  async saveMany(records: MemoRecord[]): Promise<void> {
    if (!records.length) return;
    const db = await this.getDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("保存备忘录失败"));
      transaction.onabort = () => reject(transaction.error || new Error("保存备忘录已中止"));
      records.forEach((record) => store.put(record));
    });
  }

  async delete(id: string): Promise<void> {
    const db = await this.getDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("删除备忘录失败"));
      transaction.onabort = () => reject(transaction.error || new Error("删除备忘录已中止"));
      transaction.objectStore(STORE_NAME).delete(id);
    });
  }
}

export default new MemoDatabase();
