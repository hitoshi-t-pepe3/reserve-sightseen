# プランベース Bitchat 設計書

**提案：** 場所ベースではなく、**プラン共有者同士が自動的にコミュニティ化**する新しい Bitchat 実装

---

## 🎯 コンセプト

### 現在の問題点
```
❌ 場所ベース Bitchat
- GPS 周辺チャット（半径500m など）
- ランダムなユーザーが集まる
- 旅行プランとの関連性が薄い
- 「同じ目的のユーザー」が揃わない

🎯 プランベース Bitchat へ
- 同じ旅行プランでシェアされたユーザーが参加
- プランの目的・スケジュールが共通
- 「同じプランで旅している仲間」との交流
- より濃い、より有用な情報交換
```

### ビジョン
```
旅行プラン「京都3日間」をシェア
  ↓
ユーザー A, B, C が同じプランで旅行
  ↓
自動的に「京都3日間プラン」チャットルームに参加
  ↓
"Day 1: 清水寺にいます" "ここ混んでますね" "おすすめのお店は？"
  ↓
プラン旅行が「見えない同行者との旅」に進化 ✨
```

---

## 🏗️ 技術設計

### 1. プラン ID とチャンネル生成

#### Step 1: ShareButton の改善
```typescript
// 既存: Base64 URL エンコード
const shareUrl = `/routes/${base64EncodedData}`

// 新機能: プラン ID + Bitchat チャンネル生成
interface SharedPlan {
  planId: string;           // UUID (例: "abc123def456")
  planData: ItineraryData;  // Base64 エンコード
  planHash: string;         // SHA256 hash（チャンネル ID に使用）
  creatorId: string;        // シェア元ユーザー ID
  createdAt: string;        // ISO 8601 timestamp
}

// チャンネル ID の生成ルール
const channelId = `plan_${sha256(planHash)}`
// 例: plan_5a7f9e2c3b1d4a6f8e9c2b5d7f3a1c6e
```

#### Step 2: Backend API 拡張
```
POST /api/route/share-with-chat
Request:
{
  "itinerary": { ... },
  "title": "京都3日間",
  "planId": "abc123def456"
}

Response:
{
  "shareUrl": "/routes/plan_5a7f9e2c3b1d...",
  "chatChannelId": "plan_5a7f9e2c3b1d...",
  "chatInviteUrl": "bitchat://channel/plan_5a7f9e2c3b1d..."
}
```

### 2. Bitchat 統合

#### プランベース チャンネル構造
```
Root Channel: plan_5a7f9e2c3b1d...
├─ Display Name: "京都3日間プラン"
├─ Description: "清水寺、伏見稲荷、蹴上など効率的に巡るプラン"
├─ Members: [ユーザーA, ユーザーB, ユーザーC, ...]
│
├─ Sub-Channel: Day 1 (optional)
│  └─ "清水寺周辺・河原町" (自動生成)
│
├─ Sub-Channel: Day 2 (optional)
│  └─ "伏見稲荷・蹴上" (自動生成)
│
└─ Sub-Channel: Day 3 (optional)
   └─ "そのほか観光地" (自動生成)
```

#### Nostr イベント構造
```json
{
  "kind": 42,  // Channel message
  "tags": [
    ["e", "plan_5a7f9e2c3b1d", "root"],
    ["u", "bitchat://channel/plan_5a7f9e2c3b1d"],
    ["plan", "京都3日間"],
    ["day", "1"],
    ["location", "清水寺周辺"]
  ],
  "content": "いまここ清水寺の舞台にいます。ものすごい眺めです！"
}
```

---

## 🎨 UI/UX 改善案

### 1. ShareButton の拡張

#### Before（現在）
```
┌─────────────────────────────┐
│ 📤 シェア / 📋 URLコピー     │
└─────────────────────────────┘
```

#### After（プランベース）
```
┌──────────────────────────────────────────┐
│ 📤 シェア                                 │
│  ├─ 📋 URLコピー（通常共有）              │
│  └─ 💬 プランチャットに招待（推奨）✨     │
│                                          │
│ 💬 プランチャット                         │
│  └─ "〇〇人がこのプランで旅しています"    │
└──────────────────────────────────────────┘
```

#### 実装例（React）
```typescript
export function ShareButton({ itinerary, planId }: ShareButtonProps) {
  const [showShareOptions, setShowShareOptions] = useState(false);
  const [planMembers, setPlanMembers] = useState<number>(0);

  // プラン参加者数を取得（Bitchat から）
  useEffect(() => {
    if (planId) {
      fetchPlanChatMembers(planId).then(setPlanMembers);
    }
  }, [planId]);

  const handleCopyUrl = async () => {
    // 既存の URL コピー機能
  };

  const handleInviteToChat = async () => {
    // 新規: プランチャット招待
    const channelId = generateChannelId(planId);
    const inviteUrl = `bitchat://channel/${channelId}`;
    
    // クリップボードにコピー
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    
    // または直接 Bitchat を開く
    window.open(inviteUrl, '_blank');
  };

  return (
    <div className="space-y-2">
      <button onClick={() => setShowShareOptions(!showShareOptions)}
              className="w-full bg-blue-500 hover:bg-blue-600 text-white py-2 px-3 rounded">
        📤 シェア
      </button>

      {showShareOptions && (
        <div className="bg-blue-50 p-3 rounded-lg space-y-2">
          <button onClick={handleCopyUrl}
                  className="w-full bg-white border border-blue-300 text-blue-700 py-2 rounded text-sm">
            📋 URLコピー（通常共有）
          </button>
          <button onClick={handleInviteToChat}
                  className="w-full bg-gradient-to-r from-purple-500 to-pink-500 text-white py-2 rounded text-sm font-medium">
            💬 プランチャットに招待 ✨
          </button>
        </div>
      )}

      {planMembers > 0 && (
        <div className="bg-purple-50 p-3 rounded-lg border border-purple-200">
          <p className="text-xs text-purple-700">
            👥 <strong>{planMembers}人</strong> がこのプランで旅しています
            <a href={`#chat-${planId}`} className="ml-2 text-purple-600 underline">
              チャットに参加
            </a>
          </p>
        </div>
      )}
    </div>
  );
}
```

### 2. 保存プラン画面への統合

#### SavedPlansPanel.tsx の改善
```typescript
// 保存プランのヘッダーに チャット参加者数を表示
<div className="flex items-center justify-between px-3 py-2.5 bg-gray-50">
  <button onClick={() => setOpenId(opened ? null : plan.id)}
          className="flex-1 min-w-0 text-left">
    <p className="text-sm font-medium text-gray-900 truncate">
      {MODE_BADGES[plan.itinerary.mode]} {plan.itinerary.title}
    </p>
    <p className="text-xs text-gray-500">
      {savedDate.toLocaleDateString("ja-JP")} 保存
    </p>
  </button>

  {/* 新規: プランチャット参加者数を表示 */}
  {planChatMembers[plan.id] > 0 && (
    <div className="shrink-0 px-2.5 py-1.5 bg-purple-50 text-purple-700 rounded-lg text-xs font-medium">
      👥 {planChatMembers[plan.id]}人
    </div>
  )}

  {/* 既存のボタン */}
  <button className="shrink-0 px-2.5 py-1.5 bg-blue-50 text-blue-700 rounded-lg">
    {opened ? "閉じる" : "開く"}
  </button>
</div>

{opened && (
  <div className="p-3 space-y-3">
    {/* 新規: プランチャットセクション */}
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
      <button onClick={() => openPlanChat(plan.id)}
              className="w-full bg-purple-500 hover:bg-purple-600 text-white py-2 rounded-lg text-sm font-medium">
        💬 チャットに参加
      </button>
    </div>

    {/* 既存のコンポーネント */}
    <ShareButton itinerary={plan.itinerary} planId={plan.id} />
    <RoutePopularity itinerary={plan.itinerary} planId={plan.id} />
    <ItineraryTimeline {...timelineProps} />
  </div>
)}
```

### 3. プランチャット表示コンポーネント（新規）

#### PlanChatPanel.tsx
```typescript
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

  useEffect(() => {
    // Bitchat からプランチャンネルのメッセージを取得
    loadPlanChatMessages(planId);
    loadChatMembers(planId);
  }, [planId]);

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
            <button onClick={onClose}
                    className="text-white hover:bg-white/20 rounded-full p-2">
              ✕
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading ? (
            <p className="text-center text-gray-500">読み込み中...</p>
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
                  <span className="text-xs text-gray-500">{msg.time}</span>
                </div>
                <p className="text-gray-700 ml-0 mt-0.5">{msg.content}</p>
              </div>
            ))
          )}
        </div>

        {/* Input */}
        <div className="px-4 py-3 border-t border-gray-200 flex gap-2">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter' && newMessage.trim()) {
                sendPlanChatMessage(planId, newMessage);
                setNewMessage("");
              }
            }}
            placeholder="メッセージを入力..."
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
          <button onClick={() => {
            sendPlanChatMessage(planId, newMessage);
            setNewMessage("");
          }}
                  className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg text-sm font-medium">
            送信
          </button>
        </div>
      </div>
    </div>
  );
}
```

---

## 🔄 ユーザーフロー

### シーン 1: プランをシェアして Bitchat 招待

```
ユーザーA（京都プランを作成）
  │
  ├─ "💬 プランチャットに招待" をクリック
  │   ↓
  ├─ チャンネル ID 生成: plan_5a7f9e...
  │   ↓
  ├─ Bitchat チャンネル自動作成
  │   ↓
  └─ 友人に「bitchat://channel/plan_5a7f9e...」を送信

ユーザーB（友人）
  │
  ├─ リンクをクリック
  │   ↓
  ├─ Bitchat チャンネルに自動参加
  │   ↓
  └─ "京都3日間プラン" チャットで見える
```

### シーン 2: 旅行中にプランチャットで交流

```
Day 1 午前: ユーザーA 清水寺に到着
  │
  ├─ チャットに投稿: "清水寺の舞台から京都市街が見えます。素晴らしい！"
  │
  └─ ユーザーB（別の場所）がリアルタイムで見える
      │
      └─ 返信: "写真撮ってください！次の地点は？"

Day 1 昼: ユーザーB も清水寺に到着
  │
  ├─ チャットに投稿: "ここは本当に混んでますね。おすすめランチはどこ？"
  │
  └─ ユーザーA が回答: "伏見稲荷の帰りに〇〇というカフェ寄りました。オススメ！"

Day 2: ユーザーC も同じプランで旅行開始
  │
  ├─ 参加: "同じプランで旅行してます。よろしくお願いします！"
  │
  └─ ユーザーA, B が歓迎: "いらっしゃい！今から伏見稲荷です。" など
```

---

## 📊 実装の優位性

### 従来の場所ベース Bitchat
```
❌ ランダムな出会い（意図しない人が集まる）
❌ プランとの関連性が不明確
❌ 目的が曖昧（何の話をしていいか不明）
❌ 情報品質がばらつく
❌ 「同行者」感が薄い
```

### プランベース Bitchat（新規）
```
✅ 共通の目的（同じプランで旅している）
✅ 高度な関連性（プラン内容が完全に共有）
✅ 明確な文脈（Day 別、地点別の話題）
✅ より有用な情報交換（プラン特有のTips）
✅ 強い「一体感」と「見えない同行者」感
✅ 友人 + 見えない同行者のハイブリッド体験
```

---

## 🛠️ 実装ロードマップ

### Phase 1: Backend 基盤（Week 1-2）
```
1. プラン ID + チャンネル ID 生成ロジック
2. Nostr イベント構造の設計
3. Bitchat チャンネル作成 API
4. メッセージ送受信 API
5. 参加者管理 API
```

### Phase 2: Frontend 実装（Week 3-4）
```
1. ShareButton の拡張
2. PlanChatPanel コンポーネント
3. SavedPlansPanel との統合
4. メッセージ表示・送信 UI
5. 参加者表示 UI
```

### Phase 3: テスト・最適化（Week 5）
```
1. 複数ユーザー同時テスト
2. Bitchat との統合テスト
3. パフォーマンス測定
4. UX 改善
```

---

## 💡 追加機能アイデア

### 将来の拡張機能
```
◆ Day ベースのサブチャンネル自動生成
  - "京都3日間 → Day 1: 清水寺周辺"
  - より細粒度な議論が可能

◆ 進捗状況の可視化
  - "ユーザーA は Day 1 の清水寺に到着"
  - "ユーザーB は Day 2 準備中"
  - リアルタイム位置情報（オプト・イン）

◆ プランへのコメント・レビュー集約
  - "伏見稲荷の所要時間は実際は1時間必要"
  - "〇〇はクローズしていた"
  - プラン改善への フィードバック

◆ グループフォトシェア
  - 旅行中に撮った写真を Bitchat で共有
  - 同じプランの仲間の写真も見える

◆ グループ割り勘管理
  - "昼食: 合計5000円、3人で割る"
  - プランベースのグループ決済
```

---

## 🎯 まとめ

**プランベース Bitchat** により：

1. **場所ベースチャットは不要に** ← ご指摘の通り！
2. **同じプラン = 自動的にコミュニティ化**
3. **「見えない同行者」が実現** ← アプリ最大の価値
4. **ネットワーク効果が加速** - 多くの人が同じプランで旅すればするほど価値が高まる
5. **プランシェアが社交的に** - 単なる情報共有ではなく「仲間と旅する」体験に

**結果：Reserve Sightseen が単なる旅行計画アプリから、*社交的な旅行プラットフォーム* へ進化** ✨

