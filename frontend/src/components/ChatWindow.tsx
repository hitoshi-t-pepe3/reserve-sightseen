"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Message } from "@/types/chat";
import { MessageList } from "./MessageList";
import { MessageInput } from "./MessageInput";
import { HotelSearchPanel } from "./HotelSearchPanel";
import { SavedPlansPanel } from "./SavedPlansPanel";
import { NearbyChat, ChatChannel } from "./NearbyChat";
import { encodeGeohash, decodeGeohashCenter } from "@/lib/geohash";
import { sendChatMessage, HotelBasicInfo, SearchContext, Transport } from "@/lib/api";

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// 初回に表示する入力例。「行き先・日付・人数」が揃うとプラン提案まで一気に進むことを示す。
const SUGGESTIONS = [
  "7月25日から京都に1泊、大人2人。歴史とグルメを楽しみたい",
  "8月の土日に沖縄へ2泊、大人2人。ビーチでのんびりしたい",
];

// 趣味テーマ。選ぶとテーマに沿った聞き取り（会場名・作品名など）から始まる。
const THEMES = [
  { label: "🎤 推し活・遠征", starter: "推し活の遠征プランを相談したい。コンサート会場の近くに泊まりたい" },
  { label: "🚃 乗り鉄", starter: "乗り鉄の旅を計画したい" },
  { label: "⛩️ 聖地巡礼", starter: "アニメの聖地巡礼プランを作りたい" },
  { label: "♨️ 温泉", starter: "温泉宿でゆっくりする旅がしたい" },
];

// 旅行プランの移動手段チップ。選ぶと以降のチャットに希望として渡り、
// 日程表の経路リンクの種類（transit/driving）に反映される
const TRANSPORTS: { value: Transport; label: string }[] = [
  { value: "train", label: "🚄 電車" },
  { value: "bus", label: "🚌 バス" },
  { value: "car", label: "🚗 車" },
  { value: "plane", label: "✈️ 飛行機" },
];

// 現在地起点コースの種類ごとの依頼文（散歩=徒歩 / ドライブ=車）
const NEARBY_STARTERS = {
  walk: "いまいる場所の周辺で、歩いて回れる散歩プランを作って",
  drive: "いまいる場所の周辺で、車で回れるドライブプランを作って",
} as const;

export function ChatWindow() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHotelSearch, setShowHotelSearch] = useState(false);
  const [showSavedPlans, setShowSavedPlans] = useState(false);
  // 直近のチャット検索条件。手動ホテル検索パネルの初期値・予約URLに引き継ぐ。
  const [searchContext, setSearchContext] = useState<SearchContext>({});
  // 位置情報の許可を一度得たら、以降のメッセージにも現在地を添える（散歩・ドライブモードの続きの会話用）
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  // 旅行の移動手段の希望。選択中は毎メッセージでバックエンドに渡る
  const [transport, setTransport] = useState<Transport | null>(null);
  // 散歩・ドライブで最後に出発地点へ戻る周回コースにするか
  const [returnToStart, setReturnToStart] = useState(false);
  // 周辺チャット（Nostr）。ON/OFF は localStorage に保持し次回起動時に復元
  const [nearbyChatOn, setNearbyChatOn] = useState(false);
  // チャンネルID（geohash）の手動指定。位置情報の誤差で Bitchat と隣のブロックに
  // ずれたとき、Bitchat 側の表示に合わせるために使う
  // （日程表の地点の「💬」チャットは ItineraryTimeline 内にインライン表示される）
  const [chatGhOverride, setChatGhOverride] = useState<string | null>(null);

  const sendMessage = useCallback(async (
    content: string,
    locationOverride?: { lat: number; lng: number }
  ) => {
    const userMessage: Message = {
      id: generateId(),
      role: "user",
      content,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);
    setError(null);

    try {
      const conversationHistory = messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role, content: m.content }));

      const data = await sendChatMessage(content, conversationHistory, locationOverride ?? userLocation, transport);

      // API のホテル構造 {hotelBasicInfo, hotelRatingInfo} をカード用にフラット化
      const hotels: HotelBasicInfo[] = (data.hotels || [])
        .map((h) => h.hotelBasicInfo)
        .filter((b): b is HotelBasicInfo => !!b && !!b.hotelNo);

      if (data.search_context) {
        setSearchContext(data.search_context);
      }

      const assistantMessage: Message = {
        id: generateId(),
        role: "assistant",
        content: data.response || "応答を取得できませんでした。",
        timestamp: new Date(),
        hotels: hotels.length > 0 ? hotels : undefined,
        searchContext: data.search_context ?? undefined,
        itinerary: data.itinerary ?? undefined,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "送信に失敗しました");
    } finally {
      setIsLoading(false);
    }
  }, [messages, userLocation, transport]);

  // 散歩・ドライブモード: 位置情報の許可を取り、現在地つきでコースを依頼する
  const startNearbyMode = useCallback((kind: keyof typeof NEARBY_STARTERS) => {
    if (!navigator.geolocation) {
      setError("この端末では位置情報を利用できません");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLocation(loc);
        setLocating(false);
        const starter = returnToStart
          ? `${NEARBY_STARTERS[kind]}。最後は出発地点（今いる場所）に戻る周回コースにして`
          : NEARBY_STARTERS[kind];
        sendMessage(starter, loc);
      },
      () => {
        setLocating(false);
        setError("位置情報を取得できませんでした。ブラウザの位置情報の許可を確認してください。");
      },
      { enableHighAccuracy: false, timeout: 10000 }
    );
  }, [sendMessage, returnToStart]);

  // PWA ショートカット（ホーム画面アイコン長押し）からの起動:
  // /?mode=walk → 散歩モード、/?mode=hotel → 宿泊検索パネル
  const shortcutHandled = useRef(false);
  useEffect(() => {
    if (shortcutHandled.current) return;
    shortcutHandled.current = true;
    const mode = new URLSearchParams(window.location.search).get("mode");
    if (mode === "walk" || mode === "drive") {
      startNearbyMode(mode);
    } else if (mode === "hotel") {
      setShowHotelSearch(true);
    }
  }, [startNearbyMode]);

  // Welcome message on first load
  useEffect(() => {
    if (messages.length === 0) {
      const welcomeMessage: Message = {
        id: generateId(),
        role: "assistant",
        content:
          "こんにちは！旅行プランのお手伝いをします。\n\n「行き先」「日付」「人数」を教えていただくと、実際のホテルの空室・料金と観光スポットを調べて、予約までできるプランを提案します。\n\n行き先は都市名のほか、駅名・コンサート会場・観光地などでもOK。下のボタンから「いまから散歩・ドライブ」や趣味のテーマも選べます。気に入ったプランは日程表の「💾 保存」で10件まで保存できます。",
        timestamp: new Date(),
      };
      setMessages([welcomeMessage]);
    }
  }, []);

  // 周辺チャットの ON/OFF・手動チャンネルを復元
  useEffect(() => {
    setNearbyChatOn(localStorage.getItem("rs-nearby-chat-on") === "1");
    setChatGhOverride(localStorage.getItem("rs-nearby-chat-gh") || null);
  }, []);

  // 手動チャンネルの設定/解除（リロード後も保持する）
  const applyGhOverride = useCallback((gh: string | null) => {
    setChatGhOverride(gh);
    if (gh) localStorage.setItem("rs-nearby-chat-gh", gh);
    else localStorage.removeItem("rs-nearby-chat-gh");
  }, []);

  const toggleNearbyChat = useCallback(() => {
    setNearbyChatOn((prev) => {
      const next = !prev;
      localStorage.setItem("rs-nearby-chat-on", next ? "1" : "0");
      return next;
    });
  }, []);

  // 周辺チャットが現在地を必要とするときの位置取得。
  // ジオハッシュのブロックが1文字ずれると Bitchat と別チャンネルになるため高精度（GPS）で取る
  const requestLocationForChat = useCallback(() => {
    if (!navigator.geolocation) {
      setError("この端末では位置情報を利用できません");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setChatGhOverride(null);
        localStorage.removeItem("rs-nearby-chat-gh");
        setLocating(false);
      },
      () => {
        setLocating(false);
        setError("位置情報を取得できませんでした。ブラウザの位置情報の許可を確認してください。");
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }, []);

  // チャンネル決定: 手動指定 > 現在地。6文字ジオハッシュ（約1km四方）。
  // 座標はリレー選択（チャンネルに近いリレー）にも使う
  const chatChannel: ChatChannel | null = chatGhOverride
    ? { gh: chatGhOverride, label: "手動チャンネル", ...decodeGeohashCenter(chatGhOverride) }
    : userLocation
      ? { gh: encodeGeohash(userLocation.lat, userLocation.lng), label: "現在地", lat: userLocation.lat, lng: userLocation.lng }
      : null;

  // ホテル選択イベントを監視（手動検索パネルから）
  useEffect(() => {
    const handler = (e: CustomEvent) => {
      const hotel = e.detail;
      setMessages((prev) => [
        ...prev,
        {
          id: generateId(),
          role: "assistant",
          content: `「${hotel.hotelName}」\n${hotel.hotelSpecial || ""}\n${hotel.address1 || ""}${hotel.address2 || ""}\n最寄り: ${hotel.nearestStation || "－"}\n最安料金: ${hotel.hotelMinCharge ? "¥" + hotel.hotelMinCharge.toLocaleString() + "/泊〜" : "料金未定"}\n\n[詳細・予約はこちら](${hotel.planListUrl || hotel.hotelInformationUrl})`,
          timestamp: new Date(),
        },
      ]);
      setShowHotelSearch(false);
    };
    window.addEventListener("hotel-selected", handler as EventListener);
    return () => window.removeEventListener("hotel-selected", handler as EventListener);
  }, []);

  const showSuggestions = messages.length <= 1 && !isLoading;

  return (
    <div className="flex flex-col h-full bg-white relative">
      {/* Header */}
      <header className="border-b border-gray-200 px-4 py-3 bg-white sticky top-0 z-10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <div>
            <h1 className="font-semibold text-gray-900">ReserveSightseen</h1>
            <p className="text-xs text-gray-500">AI 旅行プランナー</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={toggleNearbyChat}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              nearbyChatOn
                ? "bg-indigo-600 text-white hover:bg-indigo-700"
                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
            aria-pressed={nearbyChatOn}
            title="周辺チャット（Bitchat 互換）のON/OFF"
          >
            📡 {nearbyChatOn ? "ON" : "OFF"}
          </button>
          <button
            onClick={() => setShowSavedPlans(true)}
            className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-100 transition-colors"
          >
            📚 保存プラン
          </button>
          <button
            onClick={() => setShowHotelSearch(true)}
            className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-100 transition-colors"
          >
            🏨 宿泊検索
          </button>
        </div>
      </header>

      {/* 周辺チャット（ON のときだけ接続・表示。OFF でリレー切断） */}
      {nearbyChatOn && (
        <NearbyChat
          channel={chatChannel}
          onRequestLocation={requestLocationForChat}
          locating={locating}
          onOverrideChannel={applyGhOverride}
        />
      )}

      {/* Messages */}
      <MessageList messages={messages} isLoading={isLoading} />

      {/* Suggestions */}
      {showSuggestions && (
        <div className="px-4 pb-2 space-y-2">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => startNearbyMode("walk")}
              disabled={locating}
              className="px-3 py-2 bg-green-600 text-white rounded-full text-sm hover:bg-green-700 disabled:opacity-60 transition-colors font-medium"
            >
              {locating ? "現在地を取得中..." : "📍 いまから散歩プラン"}
            </button>
            <button
              onClick={() => startNearbyMode("drive")}
              disabled={locating}
              className="px-3 py-2 bg-teal-600 text-white rounded-full text-sm hover:bg-teal-700 disabled:opacity-60 transition-colors font-medium"
            >
              {locating ? "現在地を取得中..." : "🚗 いまからドライブ"}
            </button>
            <button
              onClick={() => setReturnToStart((v) => !v)}
              className={`px-3 py-2 rounded-full text-sm border transition-colors ${
                returnToStart
                  ? "bg-green-50 text-green-800 border-green-500 font-medium"
                  : "bg-white text-gray-500 border-gray-300 hover:bg-gray-50"
              }`}
              aria-pressed={returnToStart}
              title="散歩・ドライブの最後に出発地点へ戻る周回コースにする"
            >
              🔁 出発地に戻る{returnToStart ? " ✓" : ""}
            </button>
            {THEMES.map((theme) => (
              <button
                key={theme.label}
                onClick={() => sendMessage(theme.starter)}
                className="px-3 py-2 bg-purple-50 text-purple-700 rounded-full text-sm hover:bg-purple-100 transition-colors"
              >
                {theme.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((text) => (
              <button
                key={text}
                onClick={() => sendMessage(text)}
                className="px-3 py-2 bg-blue-50 text-blue-700 rounded-full text-sm hover:bg-blue-100 transition-colors text-left"
              >
                {text}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Error Toast */}
      {error && (
        <div className="mx-4 mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Input */}
      <div className="border-t border-gray-200 px-4 py-3 bg-white sticky bottom-0">
        {/* 旅行の移動手段チップ（もう一度押すと解除） */}
        <div className="flex items-center gap-1.5 mb-2 overflow-x-auto">
          <span className="text-xs text-gray-500 shrink-0">移動手段:</span>
          {TRANSPORTS.map((t) => (
            <button
              key={t.value}
              onClick={() => setTransport((cur) => (cur === t.value ? null : t.value))}
              className={`px-2.5 py-1 rounded-full text-xs shrink-0 border transition-colors ${
                transport === t.value
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
              }`}
            >
              {t.label}
            </button>
          ))}
          <span className="text-xs text-gray-400 shrink-0">
            {transport ? "（プランに反映されます）" : "（任意）"}
          </span>
        </div>
        <MessageInput onSend={sendMessage} disabled={isLoading} />
      </div>

      {/* Saved Plans Panel */}
      {showSavedPlans && (
        <div className="absolute inset-0 z-40 pointer-events-none">
          <div className="absolute bottom-0 left-0 right-0 pointer-events-auto max-h-[80vh]">
            <SavedPlansPanel isOpen={showSavedPlans} onClose={() => setShowSavedPlans(false)} />
          </div>
        </div>
      )}

      {/* Hotel Search Panel */}
      {showHotelSearch && (
        <div className="absolute inset-0 z-40 pointer-events-none">
          <div className="absolute bottom-0 left-0 right-0 pointer-events-auto max-h-[80vh]">
            <HotelSearchPanel
              isOpen={showHotelSearch}
              onClose={() => setShowHotelSearch(false)}
              area={searchContext.area ?? undefined}
              checkin={searchContext.checkin ?? undefined}
              checkout={searchContext.checkout ?? undefined}
              adults={searchContext.adults ?? 2}
            />
          </div>
        </div>
      )}
    </div>
  );
}
