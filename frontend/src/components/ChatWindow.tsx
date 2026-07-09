"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Message, MessageRole } from "@/types/chat";
import { MessageList } from "./MessageList";
import { MessageInput } from "./MessageInput";
import { HotelSearchPanel } from "./HotelSearchPanel";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "https://faction-scavenger-late.ngrok-free.dev";

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function ChatWindow() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHotelSearch, setShowHotelSearch] = useState(false);
  const [searchContext, setSearchContext] = useState<{ checkin?: string; checkout?: string }>({});

  // 日付をメッセージから抽出
  const extractDates = (text: string) => {
    const checkinMatch = text.match(/(\d{4}-\d{2}-\d{2})/g);
    if (checkinMatch && checkinMatch.length >= 2) {
      return { checkin: checkinMatch[0], checkout: checkinMatch[1] };
    }
    return { checkin: "2026-07-15", checkout: "2026-07-16" }; // デフォルト
  };

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
      // 会話履歴を Gemini バックエンド形式に変換
      const conversationHistory = messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role, content: m.content }));

      const response = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: content,
          conversation_history: conversationHistory,
          system_prompt:
            "あなたは旅行プランを提案する親切なアシスタントです。ユーザーの希望（行き先、日数、予算、好み、同行者）を聞きながら、日本国内の観光スポット、グルメ、宿泊施設を含む具体的な旅行プランを提案してください。",
        }),
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }

      const data = await response.json();
      const assistantMessage: Message = {
        id: generateId(),
        role: "assistant",
        content: data.response || "応答を取得できませんでした。",
        timestamp: new Date(),
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
        content: "こんにちは！旅行プランのお手伝いをします。\n\n行き先、日数、予算、好み（温泉、観光、グルメ、自然など）を教えてください。",
        timestamp: new Date(),
      };
      setMessages([welcomeMessage]);
    }
  }, []);

  // ホテル選択イベントを監視
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

  const handleHotelSearchRequested = () => {
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    const dates = lastUserMsg ? extractDates(lastUserMsg.content) : { checkin: "", checkout: "" };
    setSearchContext(dates);
    setShowHotelSearch(true);
  };

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
          onClick={handleHotelSearchRequested}
          className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-100 transition-colors"
        >
          🏨 宿泊検索
        </button>
      </header>

      {/* Messages */}
      <MessageList messages={messages} isLoading={isLoading} />

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
              checkin={searchContext.checkin}
              checkout={searchContext.checkout}
            />
          </div>
        </div>
      )}
    </div>
  );
}