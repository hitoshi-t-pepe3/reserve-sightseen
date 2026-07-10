"use client";

import { useState, useEffect, useCallback } from "react";
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
  "来週末に札幌へ1泊、ひとり旅。グルメ中心がいい",
];

export function ChatWindow() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHotelSearch, setShowHotelSearch] = useState(false);
  // 直近のチャット検索条件。手動ホテル検索パネルの初期値・予約URLに引き継ぐ。
  const [searchContext, setSearchContext] = useState<SearchContext>({});

  const sendMessage = useCallback(async (content: string) => {
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

      const data = await sendChatMessage(content, conversationHistory);

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
  }, [messages]);

  // Welcome message on first load
  useEffect(() => {
    if (messages.length === 0) {
      const welcomeMessage: Message = {
        id: generateId(),
        role: "assistant",
        content:
          "こんにちは！旅行プランのお手伝いをします。\n\n「行き先」「日付」「人数」を教えていただくと、実際のホテルの空室・料金と観光スポットを調べて、予約までできるプランを提案します。",
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
        <div className="px-4 pb-2 flex flex-wrap gap-2">
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
