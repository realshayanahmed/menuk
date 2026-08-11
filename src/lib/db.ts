// Lightweight client-side IndexedDB wrapper to enable 100% serverless custom model uploads on InfinityFree
export function initDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("PlatelyDB", 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("files")) {
        db.createObjectStore("files");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveFileToLocal(key: string, file: Blob): Promise<void> {
  const db = await initDB();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction("files", "readwrite");
    const store = transaction.objectStore("files");
    const request = store.put(file, key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getFileFromLocal(key: string): Promise<Blob | null> {
  const db = await initDB();
  return new Promise<Blob | null>((resolve, reject) => {
    const transaction = db.transaction("files", "readonly");
    const store = transaction.objectStore("files");
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteFileFromLocal(key: string): Promise<void> {
  const db = await initDB();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction("files", "readwrite");
    const store = transaction.objectStore("files");
    const request = store.delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
