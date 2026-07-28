"use client";

import { useMemo } from "react";
import { Itinerary } from "@/lib/api";

interface ItineraryMapViewProps {
  itinerary: Itinerary;
}

export function ItineraryMapView({ itinerary }: ItineraryMapViewProps) {
  const mapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

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

  // 地点がない場合は表示しない
  if (locations.length === 0) {
    return (
      <div className="p-4 text-center text-gray-500 text-sm">
        地図表示できる地点がありません（緯度・経度が必要です）
      </div>
    );
  }

  // 地図の中心と同じズームレベルを計算
  if (!mapsApiKey) {
    return (
      <div className="p-4 text-center text-gray-500 text-sm">
        Google Maps API キーが設定されていません
      </div>
    );
  }

  // マーカー用のURL形式を作成（複数の marker パラメータ）
  const mapUrl = new URL("https://www.google.com/maps/embed/v1/directions");
  mapUrl.searchParams.set("key", mapsApiKey);

  // 出発地を最初の地点、目的地を最後の地点にする
  if (locations.length > 1) {
    mapUrl.searchParams.set("origin", `${locations[0].lat},${locations[0].lng}`);
    mapUrl.searchParams.set(
      "destination",
      `${locations[locations.length - 1].lat},${locations[locations.length - 1].lng}`
    );

    // 経由地（中間地点）を指定
    const waypoints = locations
      .slice(1, -1)
      .map((loc) => `${loc.lat},${loc.lng}`)
      .join("|");
    if (waypoints) {
      mapUrl.searchParams.set("waypoints", waypoints);
    }
  } else if (locations.length === 1) {
    // 地点が1つの場合は中心に表示
    mapUrl.searchParams.set("center", `${locations[0].lat},${locations[0].lng}`);
    mapUrl.searchParams.set("zoom", "15");
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
        <p className="text-xs text-gray-600">
          📍 {locations.length}件の地点を地図に表示（電車・車で移動する場合）
        </p>
      </div>
    </div>
  );
}
