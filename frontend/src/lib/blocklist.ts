import { openNostrDb, BLOCK_STORE } from "./nostrKeys";

// スパム対策のユーザーブロックリスト（Nostr 公開鍵単位・IndexedDB 永続化）
export interface BlockedUser {
  id: string; // 公開鍵（hex）
  blockedAt: number;
}

export async function loadBlocklist(): Promise<BlockedUser[]> {
  const db = await openNostrDb();
  try {
    return await new Promise((resolve, reject) => {
      const req = db.transaction(BLOCK_STORE, "readonly").objectStore(BLOCK_STORE).getAll();
      req.onsuccess = () => resolve(req.result as BlockedUser[]);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function blockUser(pubkey: string): Promise<void> {
  const db = await openNostrDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const req = db
        .transaction(BLOCK_STORE, "readwrite")
        .objectStore(BLOCK_STORE)
        .put({ id: pubkey, blockedAt: Date.now() });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function unblockUser(pubkey: string): Promise<void> {
  const db = await openNostrDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const req = db.transaction(BLOCK_STORE, "readwrite").objectStore(BLOCK_STORE).delete(pubkey);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}
