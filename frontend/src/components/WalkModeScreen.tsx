"use client";

import { useEffect, useState, useRef } from "react";
import { Itinerary, ItineraryItem } from "@/lib/api";

interface WalkModeScreenProps {
  itinerary: Itinerary;
  onClose: () => void;
}

interface CurrentLocation {
  lat: number;
  lng: number;
}

interface MapMarker {
  position: { lat: number; lng: number };
  title: string;
  icon?: string;
}

export function WalkModeScreen({ itinerary, onClose }: WalkModeScreenProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const markerRefs = useRef<google.maps.Marker[]>([]);
  const currentLocationMarker = useRef<google.maps.Marker | null>(null);

  const [currentLocation, setCurrentLocation] = useState<CurrentLocation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentItemIndex, setCurrentItemIndex] = useState(0);

  // 最初の日の行程を取得（散歩は通常1日）
  const items = itinerary.days[0]?.items || [];

  // 位置情報の取得と監視
  useEffect(() => {
    if (!navigator.geolocation) {
      setError("この端末では位置情報を利用できません");
      setLoading(false);
      return;
    }

    // 初回位置情報取得
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const loc = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setCurrentLocation(loc);
        setError(null);
        setLoading(false);
      },
      () => {
        setError("位置情報を取得できませんでした");
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );

    // 位置情報を継続監視（3秒ごと）
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setCurrentLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      () => {
        // 監視時のエラーは無視
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // Google Maps の初期化
  useEffect(() => {
    if (!currentLocation || !mapContainer.current) return;

    // Google Maps スクリプトの読み込み確認
    if (typeof google === "undefined") {
      setError("Google Maps が読み込まれていません");
      return;
    }

    // マップの作成
    map.current = new google.maps.Map(mapContainer.current, {
      zoom: 16,
      center: currentLocation,
      mapTypeId: "roadmap",
    });

    // マーカーの作成
    createMarkers();
    updateCurrentLocationMarker();
  }, [currentLocation]);

  // 現在地が変わったらマップを更新
  useEffect(() => {
    if (!map.current || !currentLocation) return;
    updateCurrentLocationMarker();
  }, [currentLocation]);

  const createMarkers = () => {
    if (!map.current) return;

    // 既存のマーカーをクリア
    markerRefs.current.forEach((marker) => marker.setMap(null));
    markerRefs.current = [];

    // 行程のマーカーを作成
    items.forEach((item, index) => {
      if (!item.lat || !item.lng) return;

      const marker = new google.maps.Marker({
        position: { lat: item.lat, lng: item.lng },
        map: map.current,
        title: item.name,
        label: {
          text: `${index + 1}`,
          color: index === currentItemIndex ? "#fff" : "#000",
          fontSize: "12px",
          fontWeight: "bold",
        },
        icon: getMarkerIcon(item.category, index === currentItemIndex),
      });

      const infoWindow = new google.maps.InfoWindow({
        content: `
          <div style="padding: 8px; font-size: 12px;">
            <div style="font-weight: bold;">${item.name}</div>
            <div style="color: #666; font-size: 11px;">${item.time || "時刻未定"}</div>
            ${item.description ? `<div style="margin-top: 4px; font-size: 11px;">${item.description}</div>` : ""}
          </div>
        `,
      });

      marker.addListener("click", () => {
        // 既存の InfoWindow を閉じる
        const existingWindow = (map.current as any).currentInfoWindow;
        if (existingWindow) {
          existingWindow.close();
        }
        infoWindow.open(map.current, marker);
        (map.current as any).currentInfoWindow = infoWindow;
      });

      markerRefs.current.push(marker);
    });
  };

  const updateCurrentLocationMarker = () => {
    if (!map.current || !currentLocation) return;

    if (!currentLocationMarker.current) {
      currentLocationMarker.current = new google.maps.Marker({
        position: currentLocation,
        map: map.current,
        title: "現在地",
        icon: "http://maps.google.com/mapfiles/ms/icons/blue-dot.png",
        zIndex: 1000,
      });
    } else {
      currentLocationMarker.current.setPosition(currentLocation);
    }

    // マップの中心を現在地に移動
    map.current.setCenter(currentLocation);
  };

  const getMarkerIcon = (category: ItineraryItem["category"], isCurrentt: boolean) => {
    const icons: Record<ItineraryItem["category"], string> = {
      spot: "http://maps.google.com/mapfiles/ms/icons/orange-dot.png",
      meal: "http://maps.google.com/mapfiles/ms/icons/yellow-dot.png",
      hotel: "http://maps.google.com/mapfiles/ms/icons/purple-dot.png",
      move: "http://maps.google.com/mapfiles/ms/icons/red-dot.png",
    };
    return isCurrentt ? "http://maps.google.com/mapfiles/ms/icons/green-dot.png" : icons[category];
  };

  const handleCheckIn = (index: number) => {
    setCurrentItemIndex(index + 1);
  };

  const currentItem = items[currentItemIndex];

  return (
    <div className="fixed inset-0 bg-gray-900 z-50 flex flex-col">
      {/* ヘッダー */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-gray-900">{itinerary.title}</h2>
          <p className="text-xs text-gray-500">
            {currentItemIndex + 1} / {items.length}
          </p>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500"
        >
          ✕
        </button>
      </div>

      {/* マップ */}
      <div ref={mapContainer} className="flex-1 bg-gray-200" />

      {/* 現在の目的地パネル */}
      {loading ? (
        <div className="bg-white border-t border-gray-200 px-4 py-4 text-center">
          <p className="text-sm text-gray-600">位置情報を取得中...</p>
        </div>
      ) : error ? (
        <div className="bg-red-50 border-t border-red-200 px-4 py-3">
          <p className="text-sm text-red-600">⚠️ {error}</p>
        </div>
      ) : currentItem ? (
        <div className="bg-white border-t border-gray-200 px-4 py-4 space-y-3">
          <div>
            <p className="text-xs text-gray-500 mb-1">次の目的地</p>
            <p className="font-semibold text-gray-900">{currentItem.name}</p>
            {currentItem.description && (
              <p className="text-sm text-gray-600 mt-1">{currentItem.description}</p>
            )}
            <p className="text-xs text-gray-500 mt-2">
              {currentItem.time && `予定時刻: ${currentItem.time}`}
              {currentItem.durationMin && ` • 滞在: 約${currentItem.durationMin}分`}
            </p>
          </div>
          <button
            onClick={() => handleCheckIn(currentItemIndex)}
            className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700"
          >
            ✓ ここに到着
          </button>
        </div>
      ) : (
        <div className="bg-green-50 border-t border-green-200 px-4 py-4">
          <p className="text-sm font-semibold text-green-700">🎉 散歩完了！</p>
        </div>
      )}

      {/* 行程リスト */}
      <div className="bg-gray-50 border-t border-gray-200 max-h-[150px] overflow-y-auto">
        <div className="px-4 py-3 space-y-2">
          {items.map((item, index) => (
            <button
              key={index}
              onClick={() => setCurrentItemIndex(index)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition ${
                index < currentItemIndex
                  ? "bg-green-100 text-green-700 line-through"
                  : index === currentItemIndex
                    ? "bg-blue-100 text-blue-700 font-medium"
                    : "bg-white text-gray-700 hover:bg-gray-100"
              }`}
            >
              <span className="mr-2">
                {index < currentItemIndex ? "✓" : index === currentItemIndex ? "►" : `${index + 1}`}
              </span>
              {item.time && <span className="text-xs text-gray-500">{item.time} </span>}
              {item.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
