"use client";

import { useState } from "react";
import { HotelBasicInfo, searchHotelsByArea, buildReserveUrl } from "@/lib/api";
import { HotelCard } from "./HotelCard";

interface HotelSearchPanelProps {
  isOpen: boolean;
  onClose: () => void;
  area?: string;
  checkin?: string;
  checkout?: string;
  adults?: number;
  rooms?: number;
  onSearchComplete?: (hotels: HotelBasicInfo[]) => void;
}

export function HotelSearchPanel({
  isOpen,
  onClose,
  area,
  checkin: initialCheckin,
  checkout: initialCheckout,
  adults: initialAdults = 2,
  rooms = 1,
  onSearchComplete,
}: HotelSearchPanelProps) {
  const [query, setQuery] = useState(area ?? "");
  const [checkin, setCheckin] = useState(initialCheckin ?? "");
  const [checkout, setCheckout] = useState(initialCheckout ?? "");
  const [adults, setAdults] = useState(initialAdults);
  const [results, setResults] = useState<HotelBasicInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const data = await searchHotelsByArea(
        query.trim(),
        checkin || undefined,
        checkout || undefined,
        adults,
        rooms,
        20
      );

      // APIレスポンスの構造を変換: {hotelBasicInfo, hotelRatingInfo} -> HotelBasicInfo
      const hotels = (data.hotels || [])
        .map((h) => h.hotelBasicInfo)
        .filter((hotel): hotel is HotelBasicInfo => !!hotel && !!hotel.hotelNo);

      setResults(hotels);
      onSearchComplete?.(hotels);
    } catch (err) {
      setError(err instanceof Error ? err.message : "検索エラー");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      {/* Header */}
      <div className="border-b border-gray-200 p-4 flex items-center gap-3">
        <button
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <h2 className="font-semibold text-gray-900 flex-1">宿泊施設を検索</h2>
      </div>

      {/* Search Form */}
      <form onSubmit={handleSearch} className="p-4 border-b border-gray-100 space-y-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="エリア名（例: 京都, 東京, 沖縄）"
            className="flex-1 px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "検索中..." : "検索"}
          </button>
        </div>
        <div className="flex flex-wrap gap-2 items-center text-sm">
          <label className="flex items-center gap-1 text-gray-600">
            チェックイン
            <input
              type="date"
              value={checkin}
              onChange={(e) => setCheckin(e.target.value)}
              className="px-2 py-1.5 border border-gray-300 rounded-lg"
            />
          </label>
          <label className="flex items-center gap-1 text-gray-600">
            チェックアウト
            <input
              type="date"
              value={checkout}
              onChange={(e) => setCheckout(e.target.value)}
              className="px-2 py-1.5 border border-gray-300 rounded-lg"
            />
          </label>
          <label className="flex items-center gap-1 text-gray-600">
            大人
            <select
              value={adults}
              onChange={(e) => setAdults(Number(e.target.value))}
              className="px-2 py-1.5 border border-gray-300 rounded-lg"
            >
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>{n}名</option>
              ))}
            </select>
          </label>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>

      {/* Results */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : results.length === 0 ? (
          <div className="flex items-center justify-center h-64 text-gray-500">
            <p>エリアを入力して検索してください</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {results.map((hotel) => (
              <HotelCard
                key={hotel.hotelNo}
                hotel={hotel}
                reserveUrl={buildReserveUrl(hotel.planListUrl, checkin || undefined, checkout || undefined, adults, rooms)}
                onSelect={(h) => {
                  // 親に選択を通知するためカスタムイベント発火
                  window.dispatchEvent(
                    new CustomEvent("hotel-selected", { detail: h })
                  );
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Close Button */}
      <div className="border-t border-gray-200 p-4">
        <button
          onClick={onClose}
          className="w-full px-4 py-3 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors"
        >
          閉じる
        </button>
      </div>
    </div>
  );
}
