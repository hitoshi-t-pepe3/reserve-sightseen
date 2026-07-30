"use client";

import { useState, useEffect, useRef } from "react";
import { Itinerary } from "@/lib/api";

interface Message {
  id: string;
  author: string;
  content: string;
  timestamp: string;
  day?: number;
  location?: string;
}

interface PlanChatPanelProps {
  planId: string;
  itinerary?: Itinerary;
  onClose: () => void;
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

export function PlanChatPanel({
  planId,
  itinerary,
  onClose,
}: PlanChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [memberCount, setMemberCount] = useState<number>(0);
  const [inputValue, setInputValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // メンバー情報を取得
  const fetchChatMembers = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/plan/${planId}/chat-members`);
      if (response.ok) {
        const data = await response.json();
        setMemberCount(data.member_count);
      }
    } catch (error) {
      console.error("Failed to fetch chat members:", error);
    }
  };

  useEffect(() => {
    fetchChatMembers();
    const interval = setInterval(fetchChatMembers, 5000);
    return () => clearInterval(interval);
  }, [planId]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    try {
      setLoading(true);
      setError(null);

      const messageData = {
        author_pubkey: `user_${Math.random().toString(36).substr(2, 9)}`,
        display_name: "あなた",
        content: inputValue,
        day: 1,
      };

      const response = await fetch(
        `${API_BASE}/api/plan/${planId}/chat-message`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(messageData),
        }
      );

      if (!response.ok) {
        throw new Error("メッセージ送信に失敗しました");
      }

      // ローカルで即座にメッセージを表示（Nostr リレーと同期される）
      const newMessage: Message = {
        id: Date.now().toString(),
        author: "あなた",
        content: inputValue,
        timestamp: new Date().toLocaleTimeString("ja-JP", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };

      setMessages((prev) => [...prev, newMessage]);
      setInputValue("");
      await fetchChatMembers();
    } catch (error) {
      console.error("Failed to send message:", error);
      setError("メッセージ送信に失敗しました。もう一度お試しください。");
      setTimeout(() => setError(null), 3000);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end z-50">
      <div className="w-full sm:max-w-md bg-white rounded-t-xl sm:rounded-lg shadow-xl flex flex-col h-screen sm:h-auto sm:max-h-[600px] overflow-hidden">
        {/* ヘッダー */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gradient-to-r from-purple-50 to-pink-50">
          <div className="flex-1">
            <h2 className="font-bold text-gray-800">
              💬 {itinerary?.title || "プランチャット"}
            </h2>
            <p className="text-xs text-gray-600 mt-1">
              👥 {memberCount}人が参加中
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
          >
            ✕
          </button>
        </div>

        {/* メッセージ領域 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">
              <div className="text-center">
                <p className="text-2xl mb-2">💬</p>
                <p>
                  プランチャットはまだメッセージがありません。
                </p>
                <p className="text-xs mt-2">
                  同じプランを共有している人たちと、ここで話ができます。
                </p>
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg) => (
                <div key={msg.id} className="space-y-1">
                  <div className="flex items-baseline gap-2">
                    <span className="font-medium text-sm text-gray-800">
                      {msg.author}
                    </span>
                    <span className="text-xs text-gray-500">{msg.timestamp}</span>
                  </div>
                  <div className="bg-white p-2 rounded text-sm text-gray-700 border border-gray-200">
                    {msg.content}
                  </div>
                  {msg.location && (
                    <p className="text-xs text-gray-500 ml-2">
                      📍 {msg.location}
                    </p>
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* エラーメッセージ */}
        {error && (
          <div className="px-4 py-2 bg-red-50 border-t border-red-200">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* 入力フィールド */}
        <form onSubmit={handleSendMessage} className="border-t border-gray-200 p-3 bg-white">
          <div className="flex gap-2">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="メッセージを入力..."
              disabled={loading}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:bg-gray-100"
            />
            <button
              type="submit"
              disabled={loading || !inputValue.trim()}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white text-sm font-medium rounded-lg transition"
            >
              {loading ? "送信中..." : "送信"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
