import {
  getEventHash,
  finalizeEvent,
  Filter,
  Event as NostrEvent,
} from "nostr-tools";
import { nostrKeyManager } from "./nostr-keys";

// 複数のリレーに対応
const DEFAULT_RELAYS = [
  "wss://relay.damus.io",
  "wss://relay.nostr.band",
  "wss://nos.lol",
];

interface Subscription {
  id: string;
  relay: string;
  filter: Filter;
  ws: WebSocket;
}

interface Message {
  id: string;
  pubkey: string;
  content: string;
  created_at: number;
  tags: string[][];
}

export class BitchatManager {
  private relays: Map<string, WebSocket>;
  private subscriptions: Map<string, Subscription>;
  private messageHandlers: Map<string, (msg: Message) => void>;
  private keyManager: typeof nostrKeyManager;

  constructor() {
    this.relays = new Map();
    this.subscriptions = new Map();
    this.messageHandlers = new Map();
    this.keyManager = nostrKeyManager;
  }

  /**
   * リレーに接続
   */
  async connectToRelays(relayUrls: string[] = DEFAULT_RELAYS): Promise<void> {
    const promises = relayUrls.map((url) => this.connectToRelay(url));
    await Promise.allSettled(promises);
  }

  /**
   * 単一リレーに接続
   */
  private connectToRelay(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.relays.has(url)) {
        resolve();
        return;
      }

      try {
        const ws = new WebSocket(url);
        let isConnected = false;

        ws.onopen = () => {
          isConnected = true;
          this.relays.set(url, ws);
          console.log(`Connected to relay: ${url}`);
          resolve();
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            this.handleRelayMessage(url, message);
          } catch (error) {
            console.error("Failed to parse relay message:", error);
          }
        };

        ws.onerror = () => {
          console.error(`Relay error: ${url}`);
          if (!isConnected) {
            reject(new Error(`Relay error: ${url}`));
          }
        };

        ws.onclose = () => {
          this.relays.delete(url);
          console.log(`Disconnected from relay: ${url}`);
        };

        // 接続タイムアウト（5秒）
        setTimeout(() => {
          if (!isConnected) {
            ws.close();
            reject(new Error(`Relay connection timeout: ${url}`));
          }
        }, 5000);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * プランチャンネルをリッスン
   */
  async subscribeToPlannChannel(
    channelId: string,
    onMessage: (msg: Message) => void
  ): Promise<string> {
    const subscriptionId = `sub_${channelId}_${Date.now()}`;
    this.messageHandlers.set(subscriptionId, onMessage);

    const filter: Filter = {
      kinds: [1],
      limit: 100,
    };

    // 接続済みリレーにサブスクライブ
    for (const [url, ws] of Array.from(this.relays.entries())) {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(
            JSON.stringify(["REQ", subscriptionId, filter])
          );
          const subscription: Subscription = {
            id: subscriptionId,
            relay: url,
            filter,
            ws,
          };
          this.subscriptions.set(`${subscriptionId}_${url}`, subscription);
        } catch (error) {
          console.error(`Failed to subscribe to relay ${url}:`, error);
        }
      }
    }

    return subscriptionId;
  }

  /**
   * メッセージをパブリッシュ
   */
  async publishMessage(
    channelId: string,
    content: string,
    options?: {
      day?: number;
      location?: string;
    }
  ): Promise<string | null> {
    try {
      const keyPair = this.keyManager.getOrCreateKeyPair();
      const secretKeyBytes = this.keyManager.hexToUint8Array(keyPair.secretKey);

      // Nostr イベントを構築
      const tags: Array<string[]> = [
        ["e", channelId, "root"],
        ["u", `bitchat://channel/${channelId}`],
      ];

      if (options?.day !== undefined) {
        tags.push(["day", options.day.toString()]);
      }
      if (options?.location) {
        tags.push(["location", options.location]);
      }

      const event: Partial<NostrEvent> = {
        kind: 1,
        created_at: Math.floor(Date.now() / 1000),
        tags,
        content,
        pubkey: keyPair.publicKey,
      };

      // イベントに署名
      const eventWithHash = {
        ...event,
        id: getEventHash(event as NostrEvent),
      } as NostrEvent;

      const signedEvent = finalizeEvent(eventWithHash, secretKeyBytes);

      // すべてのリレーにパブリッシュ
      const publishPromises: Promise<boolean>[] = [];

      for (const [, ws] of Array.from(this.relays.entries())) {
        if (ws.readyState === WebSocket.OPEN) {
          const promise = new Promise<boolean>((resolve) => {
            try {
              ws.send(JSON.stringify(["EVENT", signedEvent]));
              resolve(true);
            } catch (error) {
              console.error("Failed to publish event:", error);
              resolve(false);
            }
          });
          publishPromises.push(promise);
        }
      }

      const results = await Promise.all(publishPromises);
      const published = results.some((r) => r);

      if (published) {
        return signedEvent.id;
      }

      return null;
    } catch (error) {
      console.error("Failed to publish message:", error);
      return null;
    }
  }

  /**
   * サブスクリプションを解除
   */
  closeSubscription(subscriptionId: string): void {
    this.messageHandlers.delete(subscriptionId);

    const keysToDelete: string[] = [];
    for (const key of Array.from(this.subscriptions.keys())) {
      if (key.startsWith(subscriptionId)) {
        keysToDelete.push(key);
        const subscription = this.subscriptions.get(key);
        if (subscription && subscription.ws.readyState === WebSocket.OPEN) {
          subscription.ws.send(JSON.stringify(["CLOSE", subscriptionId]));
        }
      }
    }

    keysToDelete.forEach((key) => this.subscriptions.delete(key));
  }

  /**
   * すべてのリレー接続を切断
   */
  disconnectAll(): void {
    for (const ws of Array.from(this.relays.values())) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    }
    this.relays.clear();
    this.subscriptions.clear();
    this.messageHandlers.clear();
  }

  /**
   * リレーからのメッセージを処理
   */
  private handleRelayMessage(url: string, message: any[]): void {
    const [type, subscriptionId, event] = message;

    if (type === "EVENT" && event) {
      const handler = this.messageHandlers.get(subscriptionId);
      if (handler) {
        const msg: Message = {
          id: event.id,
          pubkey: event.pubkey,
          content: event.content,
          created_at: event.created_at,
          tags: event.tags || [],
        };
        handler(msg);
      }
    } else if (type === "EOSE") {
      console.log(`EOSE received from ${url} for subscription ${subscriptionId}`);
    }
  }
}

// シングルトンインスタンス
export const bitchatManager = new BitchatManager();

// 自動接続（クライアントサイドのみ）
if (typeof window !== "undefined") {
  bitchatManager.connectToRelays().catch((error) => {
    console.warn("Failed to connect to some relays:", error);
  });
}
