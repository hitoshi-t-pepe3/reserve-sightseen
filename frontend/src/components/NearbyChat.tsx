"use client";

import { useEffect, useRef, useState } from "react";
import { SimplePool } from "nostr-tools/pool";
import { finalizeEvent, getPublicKey } from "nostr-tools/pure";
import { getOrCreateSecretKey } from "@/lib/nostrKeys";
import { BlockedUser, loadBlocklist, blockUser, unblockUser } from "@/lib/blocklist";

// Bitchat と相互配信するための公開リレー。必要なら減らしてよい
export const NOSTR_RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.snort.social",
];

export interface ChatChannel {
  gh: string; // 6文字ジオハッシュ（チャンネルID）
  label: string; // 表示名（スポット名 or 現在地）
}

interface ChatMessage {
  id: string;
  pubkey: string;
  content: string;
  created_at: number;
}

interface NearbyChatProps {
  channel: ChatChannel | null;
  onRequestLocation: () => void;
  locating: boolean;
}

// 周辺チャット（Nostr geohash チャンネル）。リアルタイムのみ表示・ローカル保存なし。
export function NearbyChat({ channel, onRequestLocation, locating }: NearbyChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [blocked, setBlocked] = useState<BlockedUser[]>([]);
  const [showBlocklist, setShowBlocklist] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [connected, setConnected] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [myPubkey, setMyPubkey] = useState<string | null>(null);
  const poolRef = useRef<SimplePool | null>(null);
  const seenIds = useRef<Set<string>>(new Set());
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    loadBlocklist().then(setBlocked).catch(() => {});
  }, []);

  // チャンネル購読。過去ログは取得しない（since ≒ 今）
  const gh = channel?.gh;
  useEffect(() => {
    if (!gh) return;
    setMessages([]);
    seenIds.current = new Set();
    setConnected(false);
    const pool = new SimplePool();
    poolRef.current = pool;
    const sub = pool.subscribeMany(
      NOSTR_RELAYS,
      { kinds: [1], "#g": [gh], since: Math.floor(Date.now() / 1000) - 60 },
      {
        onevent(ev) {
          if (seenIds.current.has(ev.id)) return;
          seenIds.current.add(ev.id);
          setMessages((prev) => [
            ...prev.slice(-99),
            { id: ev.id, pubkey: ev.pubkey, content: ev.content, created_at: ev.created_at },
          ]);
        },
        oneose() {
          setConnected(true);
        },
      }
    );
    return () => {
      sub.close();
      pool.close(NOSTR_RELAYS);
      poolRef.current = null;
    };
  }, [gh]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    const content = draft.trim();
    if (!content || !channel || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const sk = await getOrCreateSecretKey();
      setMyPubkey(getPublicKey(sk));
      const event = finalizeEvent(
        {
          kind: 1,
          created_at: Math.floor(Date.now() / 1000),
          tags: [["g", channel.gh]],
          content,
        },
        sk
      );
      // 自分の発言は即時表示（リレーからのエコーは seenIds で重複排除）
      seenIds.current.add(event.id);
      setMessages((prev) => [
        ...prev.slice(-99),
        { id: event.id, pubkey: event.pubkey, content: event.content, created_at: event.created_at },
      ]);
      setDraft("");
      const pool = poolRef.current;
      if (pool) await Promise.any(pool.publish(NOSTR_RELAYS, event));
    } catch {
      setSendError("送信に失敗しました。電波状況を確認してもう一度お試しください。");
    } finally {
      setSending(false);
    }
  };

  const doBlock = async (pubkey: string) => {
    await blockUser(pubkey);
    setBlocked(await loadBlocklist());
  };
  const doUnblock = async (pubkey: string) => {
    await unblockUser(pubkey);
    setBlocked(await loadBlocklist());
  };

  const blockedSet = new Set(blocked.map((b) => b.id));
  const visible = messages.filter((m) => !blockedSet.has(m.pubkey));

  if (!channel) {
    return (
      <div className="border-b border-gray-200 bg-indigo-50 px-4 py-2.5 text-xs text-gray-700 flex items-center justify-between gap-2">
        <span>📡 周辺チャット: 現在地か、日程表の地点の「💬」で場所を選んでください</span>
        <button
          onClick={onRequestLocation}
          disabled={locating}
          className="shrink-0 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs disabled:opacity-60"
        >
          {locating ? "取得中..." : "現在地を使う"}
        </button>
      </div>
    );
  }

  return (
    <div className="border-b border-gray-200 bg-white">
      {/* パネルヘッダー */}
      <div className="flex items-center justify-between px-4 py-2 bg-indigo-50">
        <p className="text-xs text-gray-700 min-w-0 truncate">
          📡 <span className="font-medium">{channel.label}</span> の周辺チャット
          <span className="ml-1 font-mono text-gray-400">#{channel.gh}</span>
          <span
            className={`inline-block w-2 h-2 rounded-full ml-2 ${connected ? "bg-green-500" : "bg-gray-300"}`}
            title={connected ? "接続中" : "接続待ち"}
          />
        </p>
        <button
          onClick={() => setShowBlocklist((v) => !v)}
          className="shrink-0 text-xs text-indigo-700 underline"
        >
          ブロック管理{blocked.length > 0 ? `(${blocked.length})` : ""}
        </button>
      </div>

      {/* ブロック管理 */}
      {showBlocklist && (
        <div className="px-4 py-2 border-b border-gray-100 bg-gray-50 space-y-1">
          {blocked.length === 0 && (
            <p className="text-xs text-gray-500">ブロック中のユーザーはいません</p>
          )}
          {blocked.map((b) => (
            <div key={b.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="font-mono text-gray-600 truncate">{b.id.slice(0, 16)}…</span>
              <button onClick={() => doUnblock(b.id)} className="text-blue-600 underline shrink-0">
                解除
              </button>
            </div>
          ))}
        </div>
      )}

      {/* メッセージ一覧（リアルタイムのみ・保存しない） */}
      <div className="max-h-52 overflow-y-auto px-4 py-2 space-y-2">
        {visible.length === 0 && (
          <p className="text-xs text-gray-400 py-3 text-center">
            まだメッセージはありません。この辺りにいる Bitchat ユーザーに挨拶してみましょう
          </p>
        )}
        {visible.map((m) => (
          <div key={m.id} className="text-sm">
            <div className="flex items-baseline gap-2">
              <span
                className={`font-mono text-xs ${m.pubkey === myPubkey ? "text-indigo-600 font-semibold" : "text-gray-400"}`}
              >
                {m.pubkey === myPubkey ? "自分" : `${m.pubkey.slice(0, 8)}…`}
              </span>
              <span className="text-[10px] text-gray-300">
                {new Date(m.created_at * 1000).toLocaleTimeString("ja-JP", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              {m.pubkey !== myPubkey && (
                <button
                  onClick={() => doBlock(m.pubkey)}
                  className="text-[10px] text-gray-400 hover:text-red-600 underline"
                  aria-label="このユーザーをブロック"
                >
                  ブロック
                </button>
              )}
            </div>
            <p className="text-gray-800 break-words whitespace-pre-wrap">{m.content}</p>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* 入力 */}
      {sendError && <p className="px-4 pb-1 text-xs text-red-600">{sendError}</p>}
      <div className="flex gap-2 px-4 pb-3">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && send()}
          placeholder="この場所にメッセージを送る（公開されます）"
          className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
        />
        <button
          onClick={send}
          disabled={sending || !draft.trim()}
          className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-sm disabled:opacity-50"
        >
          送信
        </button>
      </div>
    </div>
  );
}
