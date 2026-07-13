"use client";

import { useEffect, useRef, useState } from "react";
import { SimplePool } from "nostr-tools/pool";
import { finalizeEvent, getPublicKey } from "nostr-tools/pure";
import { minePow } from "nostr-tools/nip13";
import { getOrCreateSecretKey } from "@/lib/nostrKeys";
import { relaysNear } from "@/lib/georelays";
import { BlockedUser, loadBlocklist, blockUser, unblockUser } from "@/lib/blocklist";

// Bitchat の位置チャンネルと互換のプロトコル:
// - kind 20000（ephemeral・リレーに保存されない）
// - tags: ["g", geohash6] + ["n", ニックネーム]
// - 送信時に NIP-13 PoW（8bit。Bitchat 側のレート制限を回避）
// - リレーは georelays ディレクトリからチャンネル座標に近い順に選ぶ
const EPHEMERAL_KIND = 20000;
const POW_BITS = 8;
const NICK_KEY = "rs-nostr-nick";

export interface ChatChannel {
  gh: string; // 6文字ジオハッシュ（チャンネルID）
  label: string; // 表示名（スポット名 or 現在地）
  lat: number;
  lng: number;
}

interface ChatMessage {
  id: string;
  pubkey: string;
  content: string;
  created_at: number;
  name?: string; // ["n"] タグのニックネーム
}

interface NearbyChatProps {
  channel: ChatChannel | null;
  onRequestLocation: () => void;
  locating: boolean;
  // チャンネルID（geohash）の手動指定。Bitchat 側の表示に合わせるために使う
  onOverrideChannel?: (gh: string) => void;
}

export function NearbyChat({ channel, onRequestLocation, locating, onOverrideChannel }: NearbyChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [blocked, setBlocked] = useState<BlockedUser[]>([]);
  const [showBlocklist, setShowBlocklist] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [connected, setConnected] = useState(false);
  const [relayCount, setRelayCount] = useState(0);
  const [sendError, setSendError] = useState<string | null>(null);
  const [myPubkey, setMyPubkey] = useState<string | null>(null);
  const [nickname, setNickname] = useState("");
  // インライン編集（iOS の PWA では prompt() が使えないためダイアログは使わない）
  const [editingChannel, setEditingChannel] = useState(false);
  const [channelDraft, setChannelDraft] = useState("");
  const [editingNick, setEditingNick] = useState(false);
  const [nickDraft, setNickDraft] = useState("");
  const poolRef = useRef<SimplePool | null>(null);
  const relaysRef = useRef<string[]>([]);
  const seenIds = useRef<Set<string>>(new Set());
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    loadBlocklist().then(setBlocked).catch(() => {});
    let nick = localStorage.getItem(NICK_KEY);
    if (!nick) {
      nick = `旅人${Math.floor(1000 + Math.random() * 9000)}`;
      localStorage.setItem(NICK_KEY, nick);
    }
    setNickname(nick);
  }, []);

  const submitNickname = () => {
    const next = nickDraft.trim();
    if (next) {
      setNickname(next);
      localStorage.setItem(NICK_KEY, next);
    }
    setEditingNick(false);
  };

  const submitChannel = () => {
    const v = channelDraft.trim().toLowerCase();
    if (v && /^[0-9b-hj-km-np-z]{2,10}$/.test(v) && onOverrideChannel) {
      onOverrideChannel(v);
      setEditingChannel(false);
    }
  };

  // チャンネル購読。リレーは座標に近い順（Bitchat と同じディレクトリ）
  const gh = channel?.gh;
  const clat = channel?.lat;
  const clng = channel?.lng;
  useEffect(() => {
    if (!gh || clat == null || clng == null) return;
    let cancelled = false;
    let pool: SimplePool | null = null;
    let sub: { close: () => void } | null = null;
    let relayList: string[] = [];
    setMessages([]);
    seenIds.current = new Set();
    setConnected(false);
    setRelayCount(0);

    (async () => {
      relayList = await relaysNear(clat, clng);
      if (cancelled) return;
      setRelayCount(relayList.length);
      pool = new SimplePool();
      poolRef.current = pool;
      relaysRef.current = relayList;
      sub = pool.subscribeMany(
        relayList,
        { kinds: [EPHEMERAL_KIND], "#g": [gh], since: Math.floor(Date.now() / 1000) - 60 },
        {
          onevent(ev) {
            if (seenIds.current.has(ev.id)) return;
            seenIds.current.add(ev.id);
            const name = ev.tags.find((t) => t[0] === "n")?.[1];
            setMessages((prev) => [
              ...prev.slice(-99),
              { id: ev.id, pubkey: ev.pubkey, content: ev.content, created_at: ev.created_at, name },
            ]);
          },
          oneose() {
            setConnected(true);
          },
        }
      );
    })();

    return () => {
      cancelled = true;
      sub?.close();
      if (pool) pool.close(relayList);
      poolRef.current = null;
    };
  }, [gh, clat, clng]);

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
      const pubkey = getPublicKey(sk);
      setMyPubkey(pubkey);
      const tags: string[][] = [["g", channel.gh]];
      if (nickname) tags.push(["n", nickname]);
      // PoW を付けてから署名（nonce タグが増えるので finalize は mined の内容で行う）
      const mined = minePow(
        { kind: EPHEMERAL_KIND, created_at: Math.floor(Date.now() / 1000), tags, content, pubkey },
        POW_BITS
      );
      const event = finalizeEvent(
        { kind: EPHEMERAL_KIND, created_at: mined.created_at, tags: mined.tags, content },
        sk
      );
      // 自分の発言は即時表示（リレーからのエコーは seenIds で重複排除）
      seenIds.current.add(event.id);
      setMessages((prev) => [
        ...prev.slice(-99),
        { id: event.id, pubkey, content, created_at: event.created_at, name: nickname },
      ]);
      setDraft("");
      const pool = poolRef.current;
      if (pool) await Promise.any(pool.publish(relaysRef.current, event));
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
      <div className="flex items-center justify-between px-4 py-2 bg-indigo-50 gap-2">
        <p className="text-xs text-gray-700 min-w-0 truncate">
          📡 <span className="font-medium">{channel.label}</span> の周辺チャット
          <button
            onClick={() => {
              setChannelDraft(channel.gh);
              setEditingChannel((v) => !v);
            }}
            className="ml-1 font-mono text-indigo-600 underline"
            title="チャンネルIDを変更"
          >
            #{channel.gh}
          </button>
          <span
            className={`inline-block w-2 h-2 rounded-full ml-2 ${connected ? "bg-green-500" : "bg-gray-300"}`}
            title={connected ? `接続中（リレー${relayCount}件）` : "接続待ち"}
          />
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => {
              setNickDraft(nickname);
              setEditingNick((v) => !v);
            }}
            className="text-xs text-gray-500 underline"
            title="表示名を変更"
          >
            {nickname || "名前"}✏️
          </button>
          <button onClick={() => setShowBlocklist((v) => !v)} className="text-xs text-indigo-700 underline">
            ブロック管理{blocked.length > 0 ? `(${blocked.length})` : ""}
          </button>
        </div>
      </div>

      {/* チャンネルIDのインライン変更（Bitchat 側の表示に合わせる） */}
      {editingChannel && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-100 bg-indigo-50/50">
          <span className="text-xs text-gray-600 shrink-0">チャンネルID:</span>
          <input
            type="text"
            value={channelDraft}
            onChange={(e) => setChannelDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitChannel()}
            placeholder="例: xn77s6（Bitchatの表示に合わせる）"
            className="flex-1 min-w-0 px-2 py-1.5 border border-gray-300 rounded-lg text-sm font-mono"
            autoFocus
          />
          <button
            onClick={submitChannel}
            disabled={!/^[0-9b-hj-km-np-z]{2,10}$/.test(channelDraft.trim().toLowerCase())}
            className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs disabled:opacity-50 shrink-0"
          >
            変更
          </button>
          <button onClick={() => setEditingChannel(false)} className="text-xs text-gray-500 shrink-0">
            キャンセル
          </button>
        </div>
      )}

      {/* 表示名のインライン変更 */}
      {editingNick && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-100 bg-gray-50">
          <span className="text-xs text-gray-600 shrink-0">表示名:</span>
          <input
            type="text"
            value={nickDraft}
            onChange={(e) => setNickDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitNickname()}
            className="flex-1 min-w-0 px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
            autoFocus
          />
          <button
            onClick={submitNickname}
            disabled={!nickDraft.trim()}
            className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs disabled:opacity-50 shrink-0"
          >
            変更
          </button>
          <button onClick={() => setEditingNick(false)} className="text-xs text-gray-500 shrink-0">
            キャンセル
          </button>
        </div>
      )}

      {/* ブロック管理 */}
      {showBlocklist && (
        <div className="px-4 py-2 border-b border-gray-100 bg-gray-50 space-y-1">
          {blocked.length === 0 && <p className="text-xs text-gray-500">ブロック中のユーザーはいません</p>}
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
                className={`text-xs ${m.pubkey === myPubkey ? "text-indigo-600 font-semibold" : "text-gray-500"}`}
              >
                {m.pubkey === myPubkey ? "自分" : m.name || `${m.pubkey.slice(0, 8)}…`}
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
