"use client";

import { useCallback } from "react";
import { Message } from "@/types/chat";
import { MessageBubble } from "./MessageBubble";
import { HotelCard } from "./HotelCard";
import { ItineraryTimeline } from "./ItineraryTimeline";
import { buildReserveUrl } from "@/lib/api";

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
          {/* 日程表（create_itinerary の結果）をタイムライン表示 */}
          {message.itinerary && <ItineraryTimeline itinerary={message.itinerary} />}
          {/* チャット中に検索されたホテルをカードで表示（予約導線つき） */}
          {message.hotels && message.hotels.length > 0 && (
            <div className="flex gap-3 overflow-x-auto pb-2 mb-4 -mx-4 px-4">
              {message.hotels.map((hotel) => (
                <div key={hotel.hotelNo} className="w-72 shrink-0">
                  <HotelCard
                    hotel={hotel}
                    reserveUrl={buildReserveUrl(
                      hotel.planListUrl,
                      message.searchContext?.checkin ?? undefined,
                      message.searchContext?.checkout ?? undefined,
                      message.searchContext?.adults ?? 2
                    )}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      {isLoading && (
        <div ref={endRef} className="flex justify-start mb-4">
          <div className="bg-gray-100 text-gray-900 px-4 py-2.5 rounded-2xl rounded-bl-md animate-pulse">
            <div className="flex gap-1">
              <span>▌</span>
              <span>プランを作成中...（ホテル・観光地を検索しています）</span>
            </div>
          </div>
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
}
