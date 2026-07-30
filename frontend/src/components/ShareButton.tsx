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

  // ルート情報を Base64 エンコードして URL 化
  const generateShareUrl = async () => {
    try {
      setSharing(true);
      setError(null);

      // ルート情報を JSON 化
      const routeData = {
        title: itinerary.title,
        mode: itinerary.mode,
        transport: itinerary.transport,
        days: itinerary.days,
        planId: planId,
      };

      // JSON を文字列化 → Base64 エンコード
      const jsonStr = JSON.stringify(routeData);
      const encoded = btoa(unescape(encodeURIComponent(jsonStr)));

      // シェア URL を構成
      const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
      const shareUrl = `${baseUrl}/routes/${encoded}`;

      // クリップボードにコピー（フォールバック付き）
      try {
        await navigator.clipboard.writeText(shareUrl);
      } catch {
        // フォールバック: 従来の方法で text area に貼り付け
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

  // ネイティブシェア API を試す
  const handleNativeShare = async () => {
    try {
      const shareUrl = await generateShareUrl();
      if (!shareUrl) return;

      if (navigator.share) {
        await navigator.share({
          title: itinerary.title || "旅行プラン",
          text: `「${itinerary.title}」という旅行プランを見つけました！`,
          url: shareUrl,
        });
      }
    } catch (error) {
      console.error("Native share failed:", error);
    }
  };

  const handleCopyShare = async () => {
    await generateShareUrl();
  };

  // ネイティブシェア API が利用可能かチェック
  const canShare = typeof navigator !== "undefined" && !!navigator.share;

  return (
    <div className="flex gap-2">
      {canShare ? (
        <button
          onClick={handleNativeShare}
          disabled={sharing}
          className="flex-1 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white text-sm font-medium py-2 px-3 rounded transition"
        >
          {sharing ? "準備中..." : "📤 シェア"}
        </button>
      ) : (
        <button
          onClick={handleCopyShare}
          disabled={sharing}
          className="flex-1 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white text-sm font-medium py-2 px-3 rounded transition"
        >
          {copied ? "✓ コピーしました" : "📋 URLコピー"}
        </button>
      )}
    </div>
  );
}
