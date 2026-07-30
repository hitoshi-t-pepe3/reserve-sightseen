"use client";

import { useState, useEffect } from "react";
import { Itinerary } from "@/lib/api";

interface RouteStat {
  planId: string;
  shareCount: number;
  viewCount: number;
  reviewCount: number;
  avgRating: number;
}

interface RoutePopularityProps {
  itinerary: Itinerary;
  planId?: string;
}

export function RoutePopularity({ itinerary, planId }: RoutePopularityProps) {
  const [stats, setStats] = useState<RouteStat | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!planId) return;

    const fetchStats = async () => {
      try {
        setLoading(true);
        // TODO: 実装時に /api/route/stats を呼ぶ
        // 今は LocalStorage から取得
        const key = `route-stats-${planId}`;
        const stored = localStorage.getItem(key);
        if (stored) {
          setStats(JSON.parse(stored));
        } else {
          // Initialize with default stats if none exist yet
          setStats({
            planId,
            shareCount: 0,
            viewCount: 0,
            reviewCount: 0,
            avgRating: 0,
          });
        }
      } catch (error) {
        console.warn("Stats fetch failed:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [planId]);

  if (loading || !stats) {
    return null;
  }

  // Only show if there's meaningful data
  if (stats.viewCount === 0 && stats.shareCount === 0 && stats.reviewCount === 0) {
    return null;
  }

  return (
    <div className="flex gap-4 text-xs text-gray-600 bg-blue-50 p-3 rounded-lg">
      {stats.viewCount > 0 && (
        <div className="flex items-center gap-1">
          <span>👁️</span>
          <span>{stats.viewCount}人が確認</span>
        </div>
      )}
      {stats.shareCount > 0 && (
        <div className="flex items-center gap-1">
          <span>🔗</span>
          <span>{stats.shareCount}回シェア</span>
        </div>
      )}
      {stats.reviewCount > 0 && (
        <div className="flex items-center gap-1">
          <span>⭐</span>
          <span>{stats.avgRating.toFixed(1)} ({stats.reviewCount}件)</span>
        </div>
      )}
    </div>
  );
}
