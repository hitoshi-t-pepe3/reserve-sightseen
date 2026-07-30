"use client";

import { useState, useEffect } from "react";
import { Itinerary } from "@/lib/api";

interface ShareButtonProps {
  itinerary: Itinerary;
  planId?: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

export function ShareButton({ itinerary, planId }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chatMembers, setChatMembers] = useState<number>(0);
  const [loading, setLoading] = useState(false);

  // ルート情報を Base64 エンコードして URL 化
  const generateShareUrl = async () => {
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

      return shareUrl;
    } catch (error) {
      console.error("Share URL generation failed:", error);
      setError("シェア URL の生成に失敗しました。もう一度お試しください。");
      setTimeout(() => setError(null), 3000);
    } finally {
      setSharing(false);
    }
  };

  // Bitchat チャンネルを作成し、招待 URL をコピー
  const handleInviteToChat = async () => {
    try {
      setSharing(true);
      setError(null);

      const routeData = {
        title: itinerary.title,
        description: `${itinerary.days?.length || 0}日間の旅行プラン`,
        itinerary: itinerary,
        planId: planId,
      };

      const response = await fetch(`${API_BASE}/api/route/share-with-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(routeData),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`);
      }

      const data = await response.json();
      const chatInviteUrl = data.chatInviteUrl;

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
    } catch (error) {
      console.error("Chat invite creation failed:", error);
      setError("プランチャットの作成に失敗しました。もう一度お試しください。");
      setTimeout(() => setError(null), 3000);
    } finally {
      setSharing(false);
    }
  };

  // Bitchat メンバー数を取得
  const fetchPlanChatMembers = async () => {
    if (!planId) return;
    try {
      setLoading(true);
      const response = await fetch(
        `${API_BASE}/api/plan/${planId}/chat-members`
      );
      if (response.ok) {
        const data = await response.json();
        setChatMembers(data.member_count);
      }
    } catch (error) {
      console.error("Failed to fetch chat members:", error);
    } finally {
      setLoading(false);
    }
  };

  // コンポーネントマウント時と planId 変更時にメンバー数を取得
  useEffect(() => {
    if (showOptions && planId) {
      fetchPlanChatMembers();
    }
  }, [showOptions, planId]);

  const handleCopyUrl = async () => {
    await generateShareUrl();
    setShowOptions(false);
  };

  const canShare = typeof navigator !== "undefined" && !!navigator.share;

  return (
    <div className="relative">
      {/* エラーメッセージ */}
      {error && (
        <div className="mb-2 text-sm text-red-600 bg-red-50 p-2 rounded">
          {error}
        </div>
      )}

      <div className="flex gap-2">
        {/* メインボタン */}
        {canShare ? (
          <button
            onClick={() => setShowOptions(!showOptions)}
            disabled={sharing}
            className="flex-1 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white text-sm font-medium py-2 px-3 rounded transition"
          >
            {sharing ? "準備中..." : "📤 シェア"}
          </button>
        ) : (
          <button
            onClick={() => setShowOptions(!showOptions)}
            disabled={sharing}
            className="flex-1 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white text-sm font-medium py-2 px-3 rounded transition"
          >
            {copied ? "✓ コピーしました" : "📋 シェア"}
          </button>
        )}
      </div>

      {/* オプションメニュー */}
      {showOptions && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-200 rounded shadow-lg z-10">
          <button
            onClick={handleCopyUrl}
            disabled={sharing}
            className="w-full text-left px-4 py-2 hover:bg-gray-50 text-sm text-gray-700 border-b border-gray-200 transition"
          >
            📋 URLコピー（通常共有）
          </button>
          <button
            onClick={handleInviteToChat}
            disabled={sharing}
            className="w-full text-left px-4 py-2 hover:bg-purple-50 text-sm text-purple-700 transition"
          >
            <div className="flex items-center justify-between">
              <span>💬 プランチャットに招待 ✨</span>
              {loading && <span className="text-xs text-gray-500">読込中...</span>}
            </div>
            {chatMembers > 0 && (
              <div className="text-xs text-gray-600 mt-1">
                👥 {chatMembers}人がこのプランで旅しています
              </div>
            )}
          </button>
          <button
            onClick={() => setShowOptions(false)}
            className="w-full text-left px-4 py-2 hover:bg-gray-50 text-xs text-gray-500 transition"
          >
            キャンセル
          </button>
        </div>
      )}
    </div>
  );
}
