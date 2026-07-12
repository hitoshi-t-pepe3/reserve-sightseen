"use client";

import { useState } from "react";
import { Itinerary, ItineraryItem } from "@/lib/api";

const CATEGORY_META: Record<ItineraryItem["category"], { icon: string; label: string }> = {
  spot: { icon: "🏛️", label: "観光" },
  meal: { icon: "🍽️", label: "食事" },
  hotel: { icon: "🏨", label: "宿" },
  move: { icon: "🚶", label: "移動" },
};

interface ItineraryTimelineProps {
  itinerary: Itinerary;
}

// 日程表のタイムライン表示。
// チェックで「回った場所」を消し込みながらたどれる（状態はこのメッセージ内のみ）。
export function ItineraryTimeline({ itinerary }: ItineraryTimelineProps) {
  const [visited, setVisited] = useState<Record<string, boolean>>({});

  const toggle = (key: string) =>
    setVisited((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="mb-4 bg-white border border-blue-200 rounded-2xl overflow-hidden shadow-sm">
      <div className="bg-blue-600 text-white px-4 py-3">
        <p className="text-xs opacity-80">{itinerary.mode === "walk" ? "散歩コース" : "旅行プラン"}</p>
        <h3 className="font-semibold">{itinerary.title}</h3>
      </div>

      {itinerary.days.map((day, di) => (
        <div key={di} className="px-4 py-3">
          {/* 1日だけの散歩コースはヘッダーと重複するのでラベルを出さない */}
          {day.label && !(itinerary.days.length === 1 && itinerary.mode === "walk") && (
            <p className="text-sm font-semibold text-blue-700 mb-2">{day.label}</p>
          )}
          <ol className="relative border-l-2 border-blue-100 ml-3 space-y-4">
            {day.items.map((item, ii) => {
              const key = `${di}-${ii}`;
              const meta = CATEGORY_META[item.category] ?? CATEGORY_META.spot;
              const done = !!visited[key];
              return (
                <li key={key} className="ml-4 relative">
                  {/* タイムライン上のドット */}
                  <span
                    className={`absolute -left-[23px] top-1.5 w-3 h-3 rounded-full border-2 ${
                      done ? "bg-green-500 border-green-500" : "bg-white border-blue-400"
                    }`}
                  />
                  <div className={done ? "opacity-50" : ""}>
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={done}
                        onChange={() => toggle(key)}
                        className="mt-1 w-4 h-4 accent-green-600 shrink-0"
                        aria-label={`${item.name} を訪問済みにする`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm ${done ? "line-through" : ""}`}>
                          {item.time && (
                            <span className="inline-block bg-blue-50 text-blue-700 rounded px-1.5 py-0.5 text-xs font-mono mr-2">
                              {item.time}
                            </span>
                          )}
                          <span className="mr-1">{meta.icon}</span>
                          <span className="font-medium text-gray-900">{item.name}</span>
                          {item.durationMin ? (
                            <span className="text-xs text-gray-400 ml-2">約{item.durationMin}分</span>
                          ) : null}
                        </p>
                        {item.description && (
                          <p className="text-sm text-gray-600 mt-0.5">{item.description}</p>
                        )}
                        <div className="flex gap-3 mt-1">
                          {item.mapUrl && (
                            <a
                              href={item.mapUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-blue-600 underline hover:text-blue-800"
                            >
                              地図
                            </a>
                          )}
                          {item.navUrl && (
                            <a
                              href={item.navUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-green-700 underline hover:text-green-900"
                            >
                              {itinerary.mode === "walk" ? "現在地から経路" : "前の地点から経路"}
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </div>
  );
}
