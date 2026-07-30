"use client";

import { useMemo, useState, useEffect } from "react";
import { Itinerary } from "@/lib/api";

interface ItineraryMapViewProps {
  itinerary: Itinerary;
}

interface OptimizedWaypoint {
  name: string;
  lat: number;
  lng: number;
  order: number;
  distance_from_prev_km: number;
  duration_from_prev_minutes: number;
}

interface RouteOptimizeResponse {
  optimized_order: OptimizedWaypoint[];
  total_distance_km: number;
  total_duration_minutes: number;
}

export function ItineraryMapView({ itinerary }: ItineraryMapViewProps) {
  const mapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const [optimizedRoute, setOptimizedRoute] = useState<RouteOptimizeResponse | null>(null);
  const [loading, setLoading] = useState(false);

  // すべての地点を集める
  const locations = useMemo(() => {
    const items: Array<{
      lat: number;
      lng: number;
      name: string;
      label: string;
    }> = [];

    itinerary.days.forEach((day) => {
      day.items.forEach((item) => {
        if (item.lat != null && item.lng != null) {
          items.push({
            lat: item.lat,
            lng: item.lng,
            name: item.name,
            label: item.category[0]?.toUpperCase() || "P",
          });
        }
      });
    });

    return items;
  }, [itinerary]);

  // ルート最適化を実行
  useEffect(() => {
    if (locations.length < 2 || !mapsApiKey) return;

    const optimizeRoute = async () => {
      setLoading(true);
      try {
        const apiBase = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";
        const response = await fetch(`${apiBase}/api/route/optimize`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            origin: {
              name: locations[0].name,
              lat: locations[0].lat,
              lng: locations[0].lng,
            },
            waypoints: locations.slice(1).map((loc) => ({
              name: loc.name,
              lat: loc.lat,
              lng: loc.lng,
            })),
            destination: {
              name: locations[0].name,
              lat: locations[0].lat,
              lng: locations[0].lng,
            },
          }),
        });

        if (response.ok) {
          const data = await response.json();
          setOptimizedRoute(data);
        }
      } catch (error) {
        console.warn("Route optimization failed:", error);
      } finally {
        setLoading(false);
      }
    };

    optimizeRoute();
  }, [locations, mapsApiKey]);

  // 地点がない場合は表示しない
  if (locations.length === 0) {
    return (
      <div className="p-4 text-center text-gray-500 text-sm">
        地図表示できる地点がありません（緯度・経度が必要です）
      </div>
    );
  }

  if (!mapsApiKey) {
    return (
      <div className="p-4 text-center text-gray-500 text-sm">
        Google Maps API キーが設定されていません
      </div>
    );
  }

  // 最適化されたルートを使用、無い場合は元の順序
  const orderedLocations = optimizedRoute
    ? [locations[0], ...optimizedRoute.optimized_order, locations[0]]
    : locations;

  // Google Maps Embed Directions API URL を構成
  const mapUrl = new URL("https://www.google.com/maps/embed/v1/directions");
  mapUrl.searchParams.set("key", mapsApiKey);

  if (orderedLocations.length > 1) {
    mapUrl.searchParams.set(
      "origin",
      `${orderedLocations[0].lat},${orderedLocations[0].lng}`
    );
    mapUrl.searchParams.set(
      "destination",
      `${orderedLocations[orderedLocations.length - 1].lat},${
        orderedLocations[orderedLocations.length - 1].lng
      }`
    );

    // 経由地を指定
    const waypoints = orderedLocations
      .slice(1, -1)
      .map((loc) => `${loc.lat},${loc.lng}`)
      .join("|");
    if (waypoints) {
      mapUrl.searchParams.set("waypoints", waypoints);
    }
  }

  return (
    <div className="w-full bg-gray-50 rounded-lg overflow-hidden border border-gray-200">
      <div className="relative w-full h-80">
        <iframe
          width="100%"
          height="100%"
          style={{ border: 0 }}
          loading="lazy"
          allowFullScreen
          referrerPolicy="no-referrer-when-downgrade"
          src={mapUrl.toString()}
        />
      </div>
      <div className="p-3 bg-white border-t border-gray-200">
        {loading && <p className="text-xs text-gray-500">📍 ルート最適化中...</p>}
        {optimizedRoute ? (
          <div className="text-xs text-gray-600 space-y-1">
            <p>
              📍 {locations.length}件の地点を最適順序で表示
            </p>
            <p>
              🗺️ 総距離: {optimizedRoute.total_distance_km}km | 所要時間: 約{Math.round(optimizedRoute.total_duration_minutes / 60)}時間
            </p>
          </div>
        ) : (
          <p className="text-xs text-gray-600">
            📍 {locations.length}件の地点を地図に表示
          </p>
        )}
      </div>
    </div>
  );
}
