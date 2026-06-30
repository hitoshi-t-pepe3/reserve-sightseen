"use client";

import { useCallback } from "react";
import { Message } from "@/types/chat";

interface MessageListProps {
  messages: Message[];
  isLoading?: boolean;
}

export function MessageList({ messages, isLoading }: MessageListProps) {
  const endRef = useCallback((node: HTMLDivElement | null) => {
    if (node) node.scrollIntoView({ behavior: "smooth" });
  }, []);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500">
        <p className="text-center">
          旅行のご希望を教えてください。行き先、日数、予算、好みなど何でもお聞かせください。
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2">
      {messages.map((message) => (
        <div key={message.id} className="w-full">
          <MessageBubble message={message} />
        </div>
      ))}
      {isLoading && (
        <div ref={endRef} className="flex justify-start mb-4">
          <div className="bg-gray-100 text-gray-900 px-4 py-2.5 rounded-2xl rounded-bl-md animate-pulse">
            <div className="flex gap-1">
              <span>▌</span>
              <span>入力中...</span>
            </div>
          </div>
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
}

// Lazy import to avoid circular dependency
import { MessageBubble } from "./MessageBubble";