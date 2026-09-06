// Minimal IndexedDB wrapper, just for storing CryptoKey objects.
// CryptoKey structured-clones into IndexedDB directly (including
// non-extractable keys) — localStorage can't hold one at all.

const DB_NAME = "stamprally-offline";
const STORE = "keys";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveKeypair(id, keypair) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ id, publicKey: keypair.publicKey, privateKey: keypair.privateKey });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadKeypair(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () =>
      resolve(req.result ? { publicKey: req.result.publicKey, privateKey: req.result.privateKey } : null);
    req.onerror = () => reject(req.error);
  });
}
