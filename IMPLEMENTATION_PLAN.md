# プランベース Bitchat 実装計画

**目標：** 同じプランでシェアされたユーザーが自動的にコミュニティ化し、
リアルタイムで「見えない同行者」との交流ができる機能の実装

**実装期間：** 2-3週間（並行開発可）

---

## 📐 アーキテクチャ全体図

```
【User Journey】
ユーザーA が プラン作成
    ↓
"💬 プランチャットに招待" クリック
    ↓
プラン ID → チャンネル ID 生成
    ↓
Bitchat チャンネル自動作成（Nostr relay)
    ↓
友人に invite URL 送信
    ↓
友人が URL クリック → 自動参加
    ↓
リアルタイムメッセージ交換
    ↓
「見えない同行者」体験完成 ✨

【システム構成】
Frontend
├─ ShareButton.tsx (拡張)
├─ PlanChatPanel.tsx (新規)
└─ SavedPlansPanel.tsx (統合)
    ↓
Backend API
├─ POST /api/route/share-with-chat (新規)
├─ GET /api/plan/{planId}/chat-members (新規)
└─ POST /api/plan/{planId}/chat-message (新規)
    ↓
Nostr Relay (Bitchat)
├─ Channel creation
├─ Message subscription
└─ Member management
```

---

## 🔧 Phase 1: Backend API 実装（Week 1）

### Task 1.1: プラン ID ↔ チャンネル ID マッピング

**ファイル：** `backend/app/tools/route_sharing.py` (拡張)

```python
# 既存の RouteSharingManager を拡張

import hashlib
import uuid
from datetime import datetime

class RouteSharingManager:
    """既存コード + 新規: Bitchat チャンネル生成"""
    
    def generate_chat_channel_id(self, plan_id: str) -> str:
        """
        プラン ID からチャンネル ID を生成
        
        規則: plan_{SHA256(plan_id)}
        例: plan_5a7f9e2c3b1d4a6f8e9c2b5d7f3a1c6e
        """
        hash_obj = hashlib.sha256(plan_id.encode())
        return f"plan_{hash_obj.hexdigest()[:32]}"
    
    def create_shared_plan_with_chat(self, route_data: dict) -> dict:
        """
        プランを作成し、自動的に Bitchat チャンネルを生成
        
        Request:
        {
            "itinerary": { ... },
            "title": "京都3日間",
            "planId": "abc123" (UUID)
        }
        
        Response:
        {
            "planId": "abc123",
            "shareUrl": "/routes/plan_5a7f...",
            "chatChannelId": "plan_5a7f9e2c...",
            "chatInviteUrl": "bitchat://channel/plan_5a7f9e2c..."
        }
        """
        plan_id = route_data.get("planId") or str(uuid.uuid4())
        channel_id = self.generate_chat_channel_id(plan_id)
        
        return {
            "planId": plan_id,
            "shareUrl": f"/routes/{plan_id}",
            "chatChannelId": channel_id,
            "chatInviteUrl": f"bitchat://channel/{channel_id}",
            "createdAt": datetime.utcnow().isoformat()
        }

# シングルトンインスタンス
route_sharing_manager = RouteSharingManager()
```

**検証項目：**
```
[ ] SHA256 ハッシュで安定したチャンネル ID を生成
[ ] 同じプラン ID → 同じチャンネル ID になるか確認
[ ] URL フォーマットが正確か
```

### Task 1.2: Backend API エンドポイント作成

**ファイル：** `backend/app/routes/route.py` (拡張)

```python
from fastapi import APIRouter, HTTPException
from app.tools.route_sharing import route_sharing_manager
from pydantic import BaseModel
from typing import Optional

router = APIRouter()

# 【新規】プランシェア + Bitchat チャンネル生成
@router.post("/route/share-with-chat", tags=["route"])
async def share_route_with_chat(route_data: dict) -> dict:
    """
    ルート情報をシェア可能な URL に変換し、
    同時に Bitchat チャンネルを自動作成
    
    Request:
    {
        "itinerary": { ... },
        "title": "京都3日間",
        "planId": "abc123def456"
    }
    
    Response:
    {
        "planId": "abc123def456",
        "shareUrl": "/routes/plan_5a7f...",
        "chatChannelId": "plan_5a7f9e2c...",
        "chatInviteUrl": "bitchat://channel/plan_5a7f9e2c..."
    }
    """
    try:
        result = route_sharing_manager.create_shared_plan_with_chat(route_data)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Share error: {str(e)}")

# 【新規】プランチャットの参加者数を取得
@router.get("/plan/{plan_id}/chat-members", tags=["route"])
async def get_plan_chat_members(plan_id: str) -> dict:
    """
    プラン ID に紐づくチャンネルの参加者数を取得
    
    Response:
    {
        "planId": "abc123def456",
        "chatChannelId": "plan_5a7f9e2c...",
        "memberCount": 3,
        "members": [
            {
                "pubkey": "abc123...",
                "displayName": "User A",
                "joinedAt": "2024-07-30T10:00:00"
            },
            ...
        ]
    }
    """
    try:
        # TODO: Nostr relay に接続して実装
        # 暫定的に localStorage に基づくメンバー情報を返す
        channel_id = route_sharing_manager.generate_chat_channel_id(plan_id)
        return {
            "planId": plan_id,
            "chatChannelId": channel_id,
            "memberCount": 0,  # TODO: Nostr relay から取得
            "members": []
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Member fetch error: {str(e)}")

# 【新規】Bitchat メッセージを記録（オプション）
@router.post("/plan/{plan_id}/chat-message", tags=["route"])
async def log_plan_chat_message(plan_id: str, message: dict) -> dict:
    """
    プランチャットのメッセージを Backend に記録（分析用）
    
    Request:
    {
        "content": "いま清水寺にいます",
        "sender": "user_abc123",
        "timestamp": "2024-07-30T10:30:00"
    }
    
    Response:
    {
        "success": true,
        "messageId": "msg_12345"
    }
    """
    try:
        # TODO: メッセージをログに記録（分析・マーケティング用）
        return {
            "success": True,
            "messageId": f"msg_{int(time.time())}"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Message log error: {str(e)}")
```

**検証項目：**
```
[ ] POST /api/route/share-with-chat が正常に動作
[ ] チャンネル ID が生成される
[ ] invite URL が生成される
[ ] GET /api/plan/{planId}/chat-members が動作
[ ] 各エンドポイントのエラーハンドリング
```

### Task 1.3: Nostr イベント構造の定義

**ファイル：** `backend/app/models/bitchat.py` (新規)

```python
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class NostrEvent(BaseModel):
    """Nostr イベント構造（RFC 2327）"""
    kind: int              # 42 = Channel message
    content: str           # メッセージ本文
    tags: List[List[str]]  # メタデータ
    created_at: int        # Unix timestamp
    pubkey: str            # 送信者公開鍵
    sig: str               # 署名
    id: str                # イベント ID

class PlanChatEvent(BaseModel):
    """プランベース Bitchat 用カスタムイベント"""
    kind: int = 42  # Channel message
    content: str    # メッセージ
    tags: List[List[str]]
    
    def __init__(self, plan_id: str, day: Optional[int] = None, **data):
        """
        tags 例:
        [
            ["e", "plan_5a7f9e2c...", "root"],
            ["u", "bitchat://channel/plan_5a7f9e2c"],
            ["plan", "京都3日間"],
            ["day", "1"],
            ["location", "清水寺周辺"]
        ]
        """
        super().__init__(**data)
        
        channel_id = f"plan_{hashlib.sha256(plan_id.encode()).hexdigest()[:32]}"
        
        tags = [
            ["e", channel_id, "root"],
            ["u", f"bitchat://channel/{channel_id}"],
            ["plan", plan_id]
        ]
        
        if day:
            tags.append(["day", str(day)])
        
        self.tags = tags

class ChatMember(BaseModel):
    """チャンネルメンバー"""
    pubkey: str
    displayName: str
    joinedAt: datetime
    isHost: bool = False

class ChatChannel(BaseModel):
    """プランベース Bitchat チャンネル"""
    channelId: str
    planId: str
    title: str
    description: str
    members: List[ChatMember]
    createdAt: datetime
    messages: int  # メッセージ数
```

**検証項目：**
```
[ ] Nostr イベント構造が RFC 2327 に準拠
[ ] tags フィールドが正確に生成される
[ ] plan_id, day などのメタデータが含まれる
```

---

## 🎨 Phase 2: Frontend 実装（Week 1-2）

### Task 2.1: ShareButton.tsx の拡張

**ファイル：** `frontend/src/components/ShareButton.tsx`

```typescript
"use client";

import { useState } from "react";
import { Itinerary } from "@/lib/api";

interface ShareButtonProps {
  itinerary: Itinerary;
  planId?: string;
}

export function ShareButton({ itinerary, planId }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showOptions, setShowOptions] = useState(false);
  const [planChatMembers, setPlanChatMembers] = useState<number>(0);

  // 【新規】プランチャットメンバー数を取得
  React.useEffect(() => {
    if (planId) {
      fetchPlanChatMembers(planId);
    }
  }, [planId]);

  const fetchPlanChatMembers = async (planId: string) => {
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";
      const res = await fetch(`${apiBase}/api/plan/${planId}/chat-members`);
      if (res.ok) {
        const data = await res.json();
        setPlanChatMembers(data.memberCount || 0);
      }
    } catch (err) {
      console.warn("Failed to fetch chat members:", err);
    }
  };

  // 【既存】通常の URL コピー
  const handleCopyUrl = async () => {
    try {
      setSharing(true);
      setError(null);

      const routeData = {
        title: itinerary.title,
        mode: itinerary.mode,
        transport: itinerary.transport,
        days: itinerary.days,
        planId: planId,
      };

      const jsonStr = JSON.stringify(routeData);
      const encoded = btoa(unescape(encodeURIComponent(jsonStr)));

      const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
      const shareUrl = `${baseUrl}/routes/${encoded}`;

      try {
        await navigator.clipboard.writeText(shareUrl);
      } catch {
        const textArea = document.createElement("textarea");
        textArea.value = shareUrl;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }

      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Share URL generation failed:", err);
      setError("シェア URL の生成に失敗しました。もう一度お試しください。");
      setTimeout(() => setError(null), 3000);
    } finally {
      setSharing(false);
    }
  };

  // 【新規】プランチャットに招待
  const handleInviteToChat = async () => {
    try {
      setSharing(true);
      setError(null);

      const apiBase = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";
      
      const routeData = {
        itinerary: itinerary,
        title: itinerary.title,
        planId: planId,
      };

      const res = await fetch(`${apiBase}/api/route/share-with-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(routeData),
      });

      if (!res.ok) {
        throw new Error("Chat channel creation failed");
      }

      const data = await res.json();
      const chatInviteUrl = data.chatInviteUrl;

      // クリップボードにコピー
      try {
        await navigator.clipboard.writeText(chatInviteUrl);
      } catch {
        const textArea = document.createElement("textarea");
        textArea.value = chatInviteUrl;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }

      setCopied(true);
      setShowOptions(false);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Chat invite failed:", err);
      setError("チャット招待リンクの生成に失敗しました。");
      setTimeout(() => setError(null), 3000);
    } finally {
      setSharing(false);
    }
  };

  const canShare = typeof navigator !== "undefined" && !!navigator.share;

  return (
    <div className="space-y-2">
      {/* 【既存】シェアボタン */}
      <button
        onClick={() => setShowOptions(!showOptions)}
        disabled={sharing}
        className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white text-sm font-medium py-2 px-3 rounded transition"
      >
        {sharing ? "準備中..." : "📤 シェア"}
      </button>

      {/* 【新規】シェアオプション */}
      {showOptions && (
        <div className="bg-blue-50 p-3 rounded-lg space-y-2 border border-blue-200">
          <button
            onClick={handleCopyUrl}
            disabled={sharing}
            className="w-full text-left px-3 py-2 bg-white hover:bg-gray-50 border border-blue-300 text-blue-700 rounded text-sm font-medium transition"
          >
            📋 URLコピー（通常共有）
          </button>
          <button
            onClick={handleInviteToChat}
            disabled={sharing}
            className="w-full text-left px-3 py-2 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white rounded text-sm font-medium transition"
          >
            💬 プランチャットに招待 ✨
          </button>
        </div>
      )}

      {/* 【新規】プランチャット参加者数表示 */}
      {planChatMembers > 0 && (
        <div className="bg-purple-50 p-3 rounded-lg border border-purple-200">
          <p className="text-xs text-purple-700">
            👥 <strong>{planChatMembers}人</strong> がこのプランで旅しています
            <a
              href="#plan-chat"
              className="ml-2 text-purple-600 underline hover:text-purple-800"
            >
              チャットに参加
            </a>
          </p>
        </div>
      )}

      {/* エラー表示 */}
      {error && (
        <p className="text-xs text-red-600 bg-red-50 p-2 rounded">
          {error}
        </p>
      )}

      {/* コピー完了メッセージ */}
      {copied && (
        <p className="text-xs text-green-600 bg-green-50 p-2 rounded">
          ✓ コピーしました
        </p>
      )}
    </div>
  );
}
```

**検証項目：**
```
[ ] ShareButton が 2つのオプション（URL / Chat招待）を表示
[ ] "プランチャットに招待" クリック → Backend API 呼び出し
[ ] invite URL がクリップボードにコピーされる
[ ] 参加者数が表示される
[ ] エラーハンドリング（alert なし）
```

### Task 2.2: PlanChatPanel.tsx 新規作成

**ファイル：** `frontend/src/components/PlanChatPanel.tsx` (新規)

```typescript
"use client";

import { useState, useEffect, useRef } from "react";
import { Itinerary } from "@/lib/api";

interface ChatMessage {
  id: string;
  author: string;
  content: string;
  timestamp: string;
  pubkey?: string;
}

interface ChatMember {
  pubkey: string;
  displayName: string;
  joinedAt: string;
}

interface PlanChatPanelProps {
  planId: string;
  itinerary: Itinerary;
  onClose: () => void;
}

export function PlanChatPanel({ planId, itinerary, onClose }: PlanChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [members, setMembers] = useState<ChatMember[]>([]);
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadChatData();
    // TODO: Nostr relay に接続してリアルタイムリスニング
    // const subscription = subscribeToChannel(channelId);
  }, [planId]);

  const loadChatData = async () => {
    try {
      setLoading(true);
      const apiBase = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";
      
      const res = await fetch(`${apiBase}/api/plan/${planId}/chat-members`);
      if (res.ok) {
        const data = await res.json();
        setMembers(data.members || []);
        // TODO: メッセージは Nostr relay から取得
      }
    } catch (err) {
      console.error("Failed to load chat:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim()) return;

    try {
      const apiBase = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";
      
      await fetch(`${apiBase}/api/plan/${planId}/chat-message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: newMessage,
          timestamp: new Date().toISOString(),
        }),
      });

      setNewMessage("");
      // TODO: Nostr relay にイベントをパブリッシュ
    } catch (err) {
      console.error("Failed to send message:", err);
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col">
        
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-200 bg-gradient-to-r from-purple-500 to-pink-500">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-white text-lg">
                💬 {itinerary.title}
              </h3>
              <p className="text-purple-100 text-xs">
                {members.length}人が参加中
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:bg-white/20 rounded-full p-2 transition"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
          {loading ? (
            <p className="text-center text-gray-500 text-sm">読み込み中...</p>
          ) : messages.length === 0 ? (
            <p className="text-center text-gray-500 text-sm py-8">
              まだメッセージがありません。
              <br />
              このプランで旅しているユーザーとチャットを始めましょう！
            </p>
          ) : (
            messages.map((msg) => (
              <div key={msg.id} className="text-sm">
                <div className="flex items-baseline gap-2">
                  <span className="font-medium text-gray-900">{msg.author}</span>
                  <span className="text-xs text-gray-500">
                    {new Date(msg.timestamp).toLocaleTimeString("ja-JP")}
                  </span>
                </div>
                <p className="text-gray-700 mt-0.5 ml-0 break-words">{msg.content}</p>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="px-4 py-3 border-t border-gray-200 bg-white flex gap-2">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === "Enter" && newMessage.trim()) {
                handleSendMessage();
              }
            }}
            placeholder="メッセージを入力..."
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <button
            onClick={handleSendMessage}
            disabled={!newMessage.trim()}
            className="px-4 py-2 bg-purple-500 hover:bg-purple-600 disabled:bg-gray-300 text-white rounded-lg text-sm font-medium transition"
          >
            送信
          </button>
        </div>
      </div>
    </div>
  );
}
```

**検証項目：**
```
[ ] PlanChatPanel が表示される
[ ] メッセージ送信ボタンが機能
[ ] 参加者数が表示
[ ] メッセージがスクロール自動
[ ] close ボタンで閉じられる
```

### Task 2.3: SavedPlansPanel.tsx に統合

**ファイル：** `frontend/src/components/SavedPlansPanel.tsx` (拡張)

```typescript
// 既存の imports に追加
import { PlanChatPanel } from "./PlanChatPanel";

// SavedPlansPanel コンポーネント内に追加
const [openChatPlanId, setOpenChatPlanId] = useState<string | null>(null);

// 保存プラン表示セクションに追加
{opened && (
  <div className="p-3 space-y-3">
    {/* 【新規】プランチャットセクション */}
    <div className="bg-gradient-to-r from-purple-50 to-pink-50 p-4 rounded-lg border border-purple-200">
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-semibold text-purple-900">💬 このプランのチャット</h4>
        {planChatMembers[plan.id] > 0 && (
          <span className="text-xs bg-white text-purple-700 px-2 py-1 rounded">
            {planChatMembers[plan.id]}人参加中
          </span>
        )}
      </div>
      <p className="text-sm text-purple-700 mb-3">
        同じプランで旅しているユーザーと交流できます
      </p>
      <button
        onClick={() => setOpenChatPlanId(plan.id)}
        className="w-full bg-purple-500 hover:bg-purple-600 text-white py-2 rounded-lg text-sm font-medium transition"
      >
        💬 チャットに参加
      </button>
    </div>

    {/* 既存コンポーネント */}
    <ShareButton itinerary={plan.itinerary} planId={plan.id} />
    <RoutePopularity itinerary={plan.itinerary} planId={plan.id} />
    {/* ... その他既存コンポーネント ... */}
  </div>
)}

{/* PlanChatPanel をモーダルで表示 */}
{openChatPlanId && (
  <PlanChatPanel
    planId={openChatPlanId}
    itinerary={plans.find(p => p.id === openChatPlanId)!.itinerary}
    onClose={() => setOpenChatPlanId(null)}
  />
)}
```

**検証項目：**
```
[ ] SavedPlansPanel に "💬 このプランのチャット" が表示
[ ] 参加者数が動的に更新
[ ] "チャットに参加" ボタンで PlanChatPanel が開く
[ ] close でパネルが閉じる
```

---

## 🔗 Phase 3: Nostr/Bitchat 統合（Week 2-3）

### Task 3.1: Nostr Relay 接続（Frontend）

**ファイル：** `frontend/src/lib/bitchat.ts` (新規)

```typescript
/**
 * Nostr Relay との接続・メッセージ管理
 * 
 * 使用ライブラリ: nostr-tools, nostr-relaypool
 */

import { SimplePool } from "nostr-tools/pool";
import { EventTemplate, finalizeEvent, getEventHash, verifyEvent } from "nostr-tools";

const relayUrls = [
  "wss://relay.damus.io",
  "wss://relay.nostr.band",
  "wss://nos.lol",
  // 暫定: 複数のリレーに接続してメッセージ冗長化
];

class BitchatManager {
  private pool: SimplePool;
  private subscriptions: Map<string, any> = new Map();

  constructor() {
    this.pool = new SimplePool();
  }

  /**
   * プランベース Bitchat チャンネルにサブスクライブ
   */
  subscribeToPlannChannel(channelId: string, onMessage: (event: any) => void) {
    const sub = this.pool.subscribeMany(
      relayUrls,
      [
        {
          kinds: [42], // Channel message
          "#e": [channelId],
          limit: 100,
        },
      ],
      {
        onevent: (event) => {
          // メッセージ受信
          onMessage(event);
        },
        onclose: () => {
          console.log(`Channel ${channelId} subscription closed`);
        },
      }
    );

    this.subscriptions.set(channelId, sub);
    return sub;
  }

  /**
   * メッセージをパブリッシュ
   */
  async publishMessage(
    channelId: string,
    content: string,
    privateKey: string,
    day?: number,
    location?: string
  ) {
    const tags = [
      ["e", channelId, "root"],
      ["u", `bitchat://channel/${channelId}`],
    ];

    if (day) tags.push(["day", String(day)]);
    if (location) tags.push(["location", location]);

    const event: EventTemplate = {
      kind: 42,
      content: content,
      tags: tags,
      created_at: Math.floor(Date.now() / 1000),
    };

    // TODO: 秘密鍵でサイン
    // const signedEvent = finalizeEvent(event, privateKey);

    // リレーにパブリッシュ
    const promises = relayUrls.map((url) =>
      this.pool.publish([url], event)
    );

    await Promise.all(promises);
  }

  /**
   * サブスクリプションをクローズ
   */
  closeSubscription(channelId: string) {
    const sub = this.subscriptions.get(channelId);
    if (sub) {
      sub.close();
      this.subscriptions.delete(channelId);
    }
  }

  /**
   * 全サブスクリプションをクローズ
   */
  closeAll() {
    this.subscriptions.forEach((sub) => sub.close());
    this.subscriptions.clear();
    this.pool.close();
  }
}

export const bitchatManager = new BitchatManager();
```

**npm 依存関係を追加：**
```bash
npm install nostr-tools
```

**検証項目：**
```
[ ] Nostr Relay 接続成功
[ ] メッセージ受信可能
[ ] メッセージパブリッシュ成功
[ ] 複数リレーへの冗長接続
[ ] エラーハンドリング
```

### Task 3.2: Nostr 秘密鍵管理（Frontend）

**ファイル：** `frontend/src/lib/nostr-keys.ts` (新規)

```typescript
/**
 * Nostr 秘密鍵管理
 * 
 * ※セキュリティ注意:
 * - ブラウザローカルストレージには保存しない
 * - IndexedDB に暗号化して保存
 * - または ユーザーが NIP-07 拡張（Alby等）を使用
 */

import { generateSecretKey, getPublicKey } from "nostr-tools";

class NostrKeyManager {
  /**
   * 新しいキーペアを生成
   */
  static generateNewKeyPair() {
    const secretKey = generateSecretKey();
    const publicKey = getPublicKey(secretKey);
    
    return {
      secretKey: Array.from(secretKey), // Uint8Array → Array
      publicKey,
    };
  }

  /**
   * 既存のキーペアを localStorage から取得
   * ※暫定: 本番では NIP-07 拡張を使用すべき
   */
  static getOrCreateKeyPair() {
    let keys = localStorage.getItem("nostr_keys");
    
    if (!keys) {
      const newKeys = this.generateNewKeyPair();
      localStorage.setItem("nostr_keys", JSON.stringify(newKeys));
      return newKeys;
    }
    
    return JSON.parse(keys);
  }

  /**
   * NIP-07 拡張からキーを取得（推奨）
   * ユーザーが Nostr ウォレット（Alby等）をインストールしている場合
   */
  static async getKeyFromExtension() {
    if (!window.nostr) {
      throw new Error("Nostr 拡張がインストールされていません");
    }

    const publicKey = await window.nostr.getPublicKey();
    return { publicKey, isExtension: true };
  }
}

export default NostrKeyManager;
```

**検証項目：**
```
[ ] キーペア生成成功
[ ] localStorage から取得できる
[ ] NIP-07 拡張検出可能
[ ] ユーザーが拡張を使用できる
```

---

## 🧪 Phase 4: 統合テスト（Week 3）

### Test 4.1: エンドツーエンドテスト

```
【シナリオ】
1. ユーザー A がプランを作成
2. "💬 プランチャットに招待" をクリック
3. チャンネル ID が生成される
4. 招待 URL をユーザー B に送信
5. ユーザー B が URL をクリック
6. Bitchat チャンネルに自動参加
7. リアルタイムでメッセージ交換
8. "見えない同行者" 体験確認

【検証項目】
[ ] Backend API が正常に動作
[ ] Frontend UI が正確に表示
[ ] Nostr Relay への接続成功
[ ] メッセージの送受信成功
[ ] リアルタイム同期
[ ] エラーハンドリング
[ ] パフォーマンス（応答時間 < 2秒）
```

### Test 4.2: 負荷テスト

```
【シナリオ】
複数ユーザー（3-5人）が同時にメッセージを送信

【検証項目】
[ ] メッセージ順序が保持される
[ ] メッセージ損失なし
[ ] レスポンス時間の劣化なし
[ ] Relay 接続の安定性
```

---

## 📋 実装チェックリスト

### Backend (Task 1)
```
[ ] 1.1 プラン ID ↔ チャンネル ID マッピング完成
[ ] 1.2 Backend API エンドポイント完成
    [ ] POST /api/route/share-with-chat
    [ ] GET /api/plan/{planId}/chat-members
    [ ] POST /api/plan/{planId}/chat-message
[ ] 1.3 Nostr イベント構造定義完成
[ ] 全 API テスト完了
```

### Frontend (Task 2)
```
[ ] 2.1 ShareButton.tsx 拡張完成
    [ ] URL コピー機能
    [ ] チャット招待機能
    [ ] 参加者数表示
[ ] 2.2 PlanChatPanel.tsx 新規作成
    [ ] メッセージ送受信 UI
    [ ] 参加者リスト表示
    [ ] スクロール自動機能
[ ] 2.3 SavedPlansPanel.tsx 統合完成
    [ ] チャットセクション表示
    [ ] パネルオープン・クローズ
[ ] Frontend ビルド成功（TypeScript エラーなし）
```

### Nostr 統合 (Task 3)
```
[ ] 3.1 Nostr Relay 接続機能完成
    [ ] 複数リレーへの接続
    [ ] メッセージリスニング
    [ ] パブリッシング
[ ] 3.2 秘密鍵管理完成
    [ ] キー生成
    [ ] localStorage 保存
    [ ] NIP-07 拡張対応
```

### 統合テスト (Task 4)
```
[ ] 4.1 エンドツーエンドテスト完了
    [ ] 複数ユーザーで実テスト
    [ ] メッセージ送受信確認
    [ ] リアルタイム同期確認
[ ] 4.2 負荷テスト完了
[ ] 本番デプロイ OK
```

---

## 🚀 デプロイ基準

### Green Light (デプロイ OK)
```
✅ すべてのエンドツーエンドテスト成功
✅ Nostr Relay 接続安定
✅ Frontend/Backend ともにエラーなし
✅ 複数ユーザーで実テスト成功
✅ パフォーマンス基準達成（応答 < 2秒）
```

### Yellow Light (要確認)
```
⚠️ 軽微なバグ残存（Critical でない）
⚠️ リアルタイム同期にたまに遅延
⚠️ Nostr Relay が1つダウン（他は健全）

→ 修正してから本番デプロイ
```

### Red Light (デプロイ NG)
```
❌ クラッシュやデータ損失
❌ メッセージ受信できない
❌ Relay 接続失敗
❌ 複数ユーザー同時使用不可

→ 原因調査・修正必須
```

---

## 📅 実装スケジュール案

```
Week 1:
├─ Day 1-2: Backend API 実装（Task 1）
├─ Day 3-4: Frontend 基本 UI（Task 2.1-2.2）
└─ Day 5: 簡易統合テスト

Week 2:
├─ Day 1-2: Nostr Relay 統合（Task 3）
├─ Day 3-4: SavedPlansPanel 統合（Task 2.3）
└─ Day 5: エンドツーエンドテスト（Task 4.1）

Week 3:
├─ Day 1-2: 負荷テスト・バグ修正（Task 4.2）
├─ Day 3-4: パフォーマンス最適化
└─ Day 5: 本番デプロイ判定・実施
```

---

## 💡 Notes

- Nostr Relay の選定:
  - 高いアップタイムが必要なため、複数リレーに接続
  - Damus, nostr.band, nos.lol など複数の信頼できるリレー
  - フォールバック機構を実装

- セキュリティ:
  - 秘密鍵は localStorage に保存しない（本番）
  - NIP-07 拡張を推奨（Alby, 他）
  - メッセージは署名・検証を実装

- スケーラビリティ:
  - Nostr の設計によって、自然にスケール
  - 複数リレーで冗長化
  - ユーザー数増加での性能劣化を監視

