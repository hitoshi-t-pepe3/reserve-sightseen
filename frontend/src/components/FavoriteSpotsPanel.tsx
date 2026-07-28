"use client";

import { useEffect, useState } from "react";
import { ItineraryItem } from "@/lib/api";
import { getFavoriteSpots, removeFavoriteSpot, FavoriteSpot } from "@/lib/spotFavorites";

interface FavoriteSpotsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect?: (spot: FavoriteSpot) => void;
}

export function FavoriteSpotsPanel({ isOpen, onClose, onSelect }: FavoriteSpotsPanelProps) {
  const [spots, setSpots] = useState<FavoriteSpot[]>([]);
  const [pendingDeleteName, setPendingDeleteName] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSpots(getFavoriteSpots());
      setPendingDeleteName(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleDelete = (spot: FavoriteSpot) => {
    if (pendingDeleteName !== spot.name) {
      setPendingDeleteName(spot.name);
      return;
    }
    setPendingDeleteName(null);
    setSpots(removeFavoriteSpot(spot.name));
  };

  const getCategoryEmoji = (category: ItineraryItem["category"]) => {
    const emojis: Record<ItineraryItem["category"], string> = {
      spot: "🎌",
      meal: "🍽️",
      hotel: "🏨",
      move: "🚗",
    };
    return emojis[category] || "📍";
  };

  return (
    <div className="bg-white border-t border-gray-200 rounded-t-2xl shadow-2xl flex flex-col max-h-[80vh]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <h2 className="font-semibold text-gray-900">
          📌 お気に入りスポット
          <span className="ml-2 text-xs font-normal text-gray-500">
            {spots.length}件
          </span>
        </h2>
        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500"
          aria-label="閉じる"
        >
          ✕
        </button>
      </div>

      <div className="overflow-y-auto px-4 py-3">
        {spots.length === 0 ? (
          <p className="text-sm text-gray-500 py-6 text-center">
            お気に入りスポットはまだありません。
            <br />
            散歩モードやプランで、スポットの❤️ボタンから登録できます。
          </p>
        ) : (
          <div className="space-y-2">
            {spots.map((spot) => (
              <div
                key={spot.name}
                className="flex items-start justify-between p-3 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors cursor-pointer"
                onClick={() => onSelect?.(spot)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{getCategoryEmoji(spot.category)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {spot.name}
                      </p>
                      {spot.description && (
                        <p className="text-xs text-gray-500 line-clamp-1 mt-0.5">
                          {spot.description}
                        </p>
                      )}
                      {spot.time && (
                        <p className="text-xs text-gray-400 mt-1">時刻: {spot.time}</p>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(spot);
                  }}
                  className={`shrink-0 ml-2 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    pendingDeleteName === spot.name
                      ? "bg-red-600 text-white"
                      : "bg-red-50 text-red-600 hover:bg-red-100"
                  }`}
                >
                  {pendingDeleteName === spot.name ? "削除" : "×"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
