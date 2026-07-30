"use client";

import { useMemo } from "react";
import type { JSX } from "react";

interface SeasonalRouteSuggestionProps {
  latitude?: number;
  longitude?: number;
}

const SEASONAL_SPOTS: Record<string, { keywords: string[]; emoji: string; description: string }> = {
  spring: {
    keywords: ["桜", "梅", "春", "お花見"],
    emoji: "🌸",
    description: "春の桜・梅スポット",
  },
  summer: {
    keywords: ["花火", "祭り", "涼しい", "夏"],
    emoji: "🎆",
    description: "夏の祭り・涼スポット",
  },
  autumn: {
    keywords: ["紅葉", "秋", "紅い", "もみじ"],
    emoji: "🍁",
    description: "秋の紅葉スポット",
  },
  winter: {
    keywords: ["雪", "冬", "温泉", "イルミネーション"],
    emoji: "❄️",
    description: "冬のスポット・温泉",
  },
};

function getCurrentSeason(): string {
  const month = new Date().getMonth() + 1;
  if (month >= 3 && month <= 5) return "spring";
  if (month >= 6 && month <= 8) return "summer";
  if (month >= 9 && month <= 11) return "autumn";
  return "winter";
}

export function SeasonalRouteSuggestion(): JSX.Element {
  const season = useMemo(() => getCurrentSeason(), []);
  const seasonalInfo = SEASONAL_SPOTS[season];

  return (
    <div className="bg-gradient-to-r from-purple-50 to-pink-50 p-4 rounded-lg border border-purple-200 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-2xl">{seasonalInfo.emoji}</span>
        <div>
          <h4 className="font-semibold text-gray-800 text-sm">
            {seasonalInfo.description}
          </h4>
          <p className="text-xs text-gray-600">
            今の季節におすすめのスポットが含まれたルートです
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        {seasonalInfo.keywords.map((keyword) => (
          <span
            key={keyword}
            className="text-xs bg-white px-2 py-1 rounded border border-purple-200 text-purple-700"
          >
            #{keyword}
          </span>
        ))}
      </div>
    </div>
  );
}
