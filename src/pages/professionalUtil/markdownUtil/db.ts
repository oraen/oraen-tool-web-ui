export interface MarkdownFile {
  id: string;
  name: string;
  content: string;
  importedAt: number;
  updatedAt: number;
}

let connection: Promise<IDBDatabase> | undefined;
function openDatabase() {
  if (!connection) {
    connection = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("ORAEN_MARKDOWN", 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore("files", { keyPath: "id" });
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("请关闭其他窗口后重试"));
      request.onsuccess = () => {
        request.result.onversionchange = () => {
          request.result.close();
          connection = undefined;
        };
        resolve(request.result);
      };
    }).catch((error) => {
      connection = undefined;
      throw error;
    });
  }
  return connection;
}

export async function readFiles(): Promise<MarkdownFile[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction("files").objectStore("files").getAll();
    request.onsuccess = () =>
      resolve(
        (request.result as MarkdownFile[]).sort(
          (a, b) => b.importedAt - a.importedAt,
        ),
      );
    request.onerror = () => reject(request.error);
  });
}

export async function writeFiles(
  files: MarkdownFile[],
  deleteId?: string,
): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("files", "readwrite");
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
    const store = transaction.objectStore("files");
    try {
      files.forEach((file) => store.put(file));
      if (deleteId) store.delete(deleteId);
    } catch (error) {
      transaction.abort();
      reject(error);
    }
  });
}
