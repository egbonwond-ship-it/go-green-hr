// Keeps the preview database in the viewer's browser (IndexedDB), so changes survive a reload.
const DB_NAME = 'gg-hr-preview'; const STORE = 'db'; const KEY = 'sqlite';
function open() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export async function loadBytes() {
  try {
    const idb = await open();
    return await new Promise((resolve) => {
      const q = idb.transaction(STORE).objectStore(STORE).get(KEY);
      q.onsuccess = () => resolve(q.result || null);
      q.onerror = () => resolve(null);
    });
  } catch { return null; }
}
export async function saveBytes(bytes) {
  try {
    const idb = await open();
    idb.transaction(STORE, 'readwrite').objectStore(STORE).put(bytes, KEY);
  } catch { /* storage blocked: the preview still works, it just resets on reload */ }
}
export async function clearBytes() {
  try {
    const idb = await open();
    await new Promise((resolve) => { const t = idb.transaction(STORE, 'readwrite'); t.objectStore(STORE).delete(KEY); t.oncomplete = resolve; t.onerror = resolve; });
  } catch { /* ignore */ }
}
