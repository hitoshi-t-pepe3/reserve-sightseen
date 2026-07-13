import { generateSecretKey } from "nostr-tools/pure";

// Nostr の秘密鍵管理。
// 鍵は初回にブラウザ内で生成し、IndexedDB に AES-GCM で暗号化して保存する。
// 暗号化キー自体は取り出し不可（non-extractable）の CryptoKey として同じ DB に置くため、
// localStorage/IndexedDB を覗かれても秘密鍵の平文は得られない。
const DB_NAME = "rs-nostr";
const DB_VERSION = 1;
const KEYS_STORE = "keys";
export const BLOCK_STORE = "blocklist";

export function openNostrDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(KEYS_STORE)) db.createObjectStore(KEYS_STORE);
      if (!db.objectStoreNames.contains(BLOCK_STORE)) db.createObjectStore(BLOCK_STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGet<T>(db: IDBDatabase, store: string, key: IDBValidKey): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, "readonly").objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(db: IDBDatabase, store: string, value: unknown, key?: IDBValidKey): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, "readwrite").objectStore(store).put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

interface EncryptedSecret {
  iv: Uint8Array;
  ciphertext: ArrayBuffer;
}

// 秘密鍵を取得（なければ生成して暗号化保存）。返り値は nostr-tools が使う32バイト
export async function getOrCreateSecretKey(): Promise<Uint8Array> {
  const db = await openNostrDb();
  try {
    const wrapKey = await idbGet<CryptoKey>(db, KEYS_STORE, "wrapKey");
    const enc = await idbGet<EncryptedSecret>(db, KEYS_STORE, "secretKey");

    if (wrapKey && enc) {
      const plain = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: enc.iv as BufferSource },
        wrapKey,
        enc.ciphertext
      );
      return new Uint8Array(plain);
    }

    const sk = generateSecretKey();
    const newWrapKey = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      false, // non-extractable
      ["encrypt", "decrypt"]
    );
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      newWrapKey,
      sk as BufferSource
    );
    await idbPut(db, KEYS_STORE, newWrapKey, "wrapKey");
    await idbPut(db, KEYS_STORE, { iv, ciphertext }, "secretKey");
    return sk;
  } finally {
    db.close();
  }
}
