import { generateSecretKey, getPublicKey } from "nostr-tools";

export class NostrKeyManager {
  private readonly STORAGE_KEY = "nostr_keypair";

  /**
   * 新しいキーペアを生成する
   */
  generateNewKeyPair(): { secretKey: string; publicKey: string } {
    const secretKey = generateSecretKey();
    const publicKey = getPublicKey(secretKey);
    return {
      secretKey: Buffer.from(secretKey).toString("hex"),
      publicKey,
    };
  }

  /**
   * 既存のキーペアを取得、なければ生成する
   */
  getOrCreateKeyPair(): { secretKey: string; publicKey: string } {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          secretKey: parsed.secretKey,
          publicKey: parsed.publicKey,
        };
      }
    } catch (error) {
      console.error("Failed to load stored keypair:", error);
    }

    // 新しいキーペアを生成して保存
    const keyPair = this.generateNewKeyPair();
    this.storeKeyPair(keyPair);
    return keyPair;
  }

  /**
   * キーペアをローカルストレージに保存
   */
  private storeKeyPair(keyPair: {
    secretKey: string;
    publicKey: string;
  }): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(keyPair));
    } catch (error) {
      console.error("Failed to store keypair:", error);
    }
  }

  /**
   * NIP-07 拡張（Alby など）からキーを取得
   * Note: Requires window.nostr to be available
   */
  async getKeyFromExtension(): Promise<{
    secretKey?: string;
    publicKey: string;
  } | null> {
    if (typeof window === "undefined") return null;

    const nostr = (window as any).nostr;
    if (!nostr) {
      console.warn("NIP-07 extension not found");
      return null;
    }

    try {
      const publicKey = await nostr.getPublicKey();
      return {
        publicKey,
        // secretKey は NIP-07 では取得不可（署名のみ可能）
      };
    } catch (error) {
      console.error("Failed to get key from extension:", error);
      return null;
    }
  }

  /**
   * 秘密鍵を 16 進数文字列から Uint8Array に変換
   */
  hexToUint8Array(hex: string): Uint8Array {
    return new Uint8Array(Buffer.from(hex, "hex"));
  }

  /**
   * Uint8Array を 16 進数文字列に変換
   */
  uint8ArrayToHex(arr: Uint8Array): string {
    return Buffer.from(arr).toString("hex");
  }
}

// シングルトンインスタンス
export const nostrKeyManager = new NostrKeyManager();
