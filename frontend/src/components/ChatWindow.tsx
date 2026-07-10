"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Message } from "@/types/chat";
import { MessageList } from "./MessageList";
import { MessageInput } from "./MessageInput";
import { HotelSearchPanel } from "./HotelSearchPanel";
import { sendChatMessage, HotelBasicInfo, SearchContext } from "@/lib/api";

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

export function ChatWindow() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHotelSearch, setShowHotelSearch] = useState(false);
  // 直近のチャット検索条件。手動ホテル検索パネルの初期値・予約URLに引き継ぐ。
  const [searchContext, setSearchContext] = useState<SearchContext>({});
  // 位置情報の許可を一度得たら、以降のメッセージにも現在地を添える（散歩モードの続きの会話用）
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);

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

      const data = await sendChatMessage(content, conversationHistory, locationOverride ?? userLocation);

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
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "送信に失敗しました");
    } finally {
      setIsLoading(false);
    }
  }, [messages, userLocation]);

  // 散歩モード: 位置情報の許可を取り、現在地つきで散歩プランを依頼する
  const startWalkMode = useCallback(() => {
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
        sendMessage("いまいる場所の周辺で、歩いて回れる散歩プランを作って", loc);
      },
      () => {
        setLocating(false);
        setError("位置情報を取得できませんでした。ブラウザの位置情報の許可を確認してください。");
      },
      { enableHighAccuracy: false, timeout: 10000 }
    );
  }, [sendMessage]);

  // PWA ショートカット（ホーム画面アイコン長押し）からの起動:
  // /?mode=walk → 散歩モード、/?mode=hotel → 宿泊検索パネル
  const shortcutHandled = useRef(false);
  useEffect(() => {
    if (shortcutHandled.current) return;
    shortcutHandled.current = true;
    const mode = new URLSearchParams(window.location.search).get("mode");
    if (mode === "walk") {
      startWalkMode();
    } else if (mode === "hotel") {
      setShowHotelSearch(true);
    }
  }, [startWalkMode]);

  // Welcome message on first load
  useEffect(() => {
    if (messages.length === 0) {
      const welcomeMessage: Message = {
        id: generateId(),
        role: "assistant",
        content:
          "こんにちは！旅行プランのお手伝いをします。\n\n「行き先」「日付」「人数」を教えていただくと、実際のホテルの空室・料金と観光スポットを調べて、予約までできるプランを提案します。\n\n行き先は都市名のほか、駅名・コンサート会場・観光地などでもOK。下のボタンから「いまから散歩」や趣味のテーマも選べます。",
        timestamp: new Date(),
      };
      setMessages([welcomeMessage]);
    }
  }, []);

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
        <button
          onClick={() => setShowHotelSearch(true)}
          className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-100 transition-colors"
        >
          🏨 宿泊検索
        </button>
      </header>

      {/* Messages */}
      <MessageList messages={messages} isLoading={isLoading} />

      {/* Suggestions */}
      {showSuggestions && (
        <div className="px-4 pb-2 space-y-2">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={startWalkMode}
              disabled={locating}
              className="px-3 py-2 bg-green-600 text-white rounded-full text-sm hover:bg-green-700 disabled:opacity-60 transition-colors font-medium"
            >
              {locating ? "現在地を取得中..." : "📍 いまから散歩プラン"}
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
        <MessageInput onSend={sendMessage} disabled={isLoading} />
      </div>

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
