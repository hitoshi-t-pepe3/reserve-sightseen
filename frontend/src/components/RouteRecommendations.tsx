"use client";

import { useState, useEffect } from "react";
import { Itinerary } from "@/lib/api";

interface RecommendedPlace {
  name: string;
  category: string;
  lat: number;
  lng: number;
  rating?: number;
  address: string;
  distance_from_route_m: number;
  nearest_waypoint_name: string;
}

interface RouteRecommendationsResponse {
  recommendations: RecommendedPlace[];
  summary: string;
}

interface RouteRecommendationsProps {
  itinerary: Itinerary;
}

const CATEGORY_ICONS: Record<string, string> = {
  restaurant: "🍽️",
  cafe: "☕",
  shop: "🛍️",
  bar: "🍺",
};

const CATEGORY_LABELS: Record<string, string> = {
  restaurant: "飲食店",
  cafe: "カフェ",
  shop: "お土産",
  bar: "バー",
};

export function RouteRecommendations({ itinerary }: RouteRecommendationsProps) {
  const [recommendations, setRecommendations] = useState<RecommendedPlace[]>([]);
  const [summary, setSummary] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchRecommendations = async () => {
      try {
        setLoading(true);

        // イテラリーからウェイポイントの座標を抽出
        const waypoints: Array<{ lat: number; lng: number }> = [];
        itinerary.days.forEach((day) => {
          day.items.forEach((item) => {
            if (item.lat != null && item.lng != null && item.category !== "move") {
              waypoints.push({ lat: item.lat, lng: item.lng });
            }
          });
        });

        if (waypoints.length < 2) {
          setLoading(false);
          return;
        }

        const apiBase = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";
        const response = await fetch(`${apiBase}/api/route/recommendations`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            route_waypoints: waypoints,
            keywords: ["飲食店", "レストラン", "カフェ", "お土産屋"],
            radius_m: 500,
            limit_per_location: 3,
          }),
        });

        if (response.ok) {
          const data: RouteRecommendationsResponse = await response.json();
          setRecommendations(data.recommendations);
          setSummary(data.summary);
        }
      } catch (error) {
        console.warn("Route recommendations failed:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchRecommendations();
  }, [itinerary]);

  if (loading || recommendations.length === 0) {
    return null;
  }

  return (
    <div className="w-full bg-gradient-to-br from-amber-50 to-orange-50 rounded-lg overflow-hidden border border-amber-200">
      <div className="p-4 space-y-3">
        <div className="space-y-1">
          <h3 className="font-semibold text-gray-800 text-sm">
            💡 ルート沿いのおすすめ
          </h3>
          <p className="text-xs text-gray-600">{summary}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {recommendations.slice(0, 6).map((place, idx) => (
            <div
              key={idx}
              className="bg-white rounded-lg p-2 border border-amber-100 hover:shadow-sm transition-shadow"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-xs text-gray-800 truncate">
                    {CATEGORY_ICONS[place.category] || "📍"} {place.name}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {place.address}
                  </p>
                  {place.rating && (
                    <p className="text-xs text-amber-600 font-medium">
                      ⭐ {place.rating.toFixed(1)}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        <p className="text-xs text-gray-500 text-center pt-2">
          地図をクリックして詳細を確認できます
        </p>
      </div>
    </div>
  );
}
