"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Itinerary, searchPlaces, PlaceSearchResult } from "@/lib/api";
import {
  withAddedResolvedItem,
  withMovedItem,
  withUpdatedDuration,
  withDeletedItem,
} from "@/lib/planStorage";

// Leaflet は window に依存するため SSR を無効化して読み込む
const LeafletMap = dynamic(() => import("./LeafletMapInner"), { ssr: false });

interface ItineraryMapEditorProps {
  itinerary: Itinerary;
  onSave: (next: Itinerary) => void;
  onClose: () => void;
}

// 工程を地図で見ながら編集するモード（無料の OpenStreetMap タイルを使用）。
// 目的地は Google Places 検索で候補を確認してから追加し、追加・並べ替え・
// 滞在時間の変更に応じて以降の目安時刻を自動で再計算する。
export function ItineraryMapEditor({ itinerary, onSave, onClose }: ItineraryMapEditorProps) {
  const [working, setWorking] = useState<Itinerary>(itinerary);
  const [dayIndex, setDayIndex] = useState(0);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [candidates, setCandidates] = useState<PlaceSearchResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null);

  const items = working.days[dayIndex]?.items ?? [];
  const lastSpotWithCoords = [...items].reverse().find((it) => it.lat != null && it.lng != null);
  const near = lastSpotWithCoords
    ? { lat: lastSpotWithCoords.lat as number, lng: lastSpotWithCoords.lng as number }
    : (currentLocation ?? undefined);

  const runSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setSearchError(null);
    try {
      const results = await searchPlaces(query.trim(), near);
      setCandidates(results.slice(0, 5));
      if (results.length === 0) setSearchError("見つかりませんでした。別のキーワードで試してください。");
    } catch {
      setSearchError("検索に失敗しました。しばらくしてから再度お試しください。");
    } finally {
      setSearching(false);
    }
  };

  const addCandidate = (c: PlaceSearchResult) => {
    const next = withAddedResolvedItem(
      working,
      dayIndex,
      { name: c.name, address: c.address, lat: c.location.lat, lng: c.location.lng },
      undefined,
      undefined,
      items.length
    );
    setWorking(next);
    setCandidates([]);
    setQuery("");
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCurrentLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  const moveUp = (i: number) => setWorking(withMovedItem(working, dayIndex, i, -1));
  const moveDown = (i: number) => setWorking(withMovedItem(working, dayIndex, i, 1));
  const setDuration = (i: number, mins: number) =>
    setWorking(withUpdatedDuration(working, dayIndex, i, Number.isFinite(mins) ? mins : null));
  const remove = (i: number) => setWorking(withDeletedItem(working, dayIndex, i));

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-white">
      {/* Header */}
      <div className="border-b border-gray-200 p-3 flex items-center gap-2">
        <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100" aria-label="閉じる">
          ✕
        </button>
        <h2 className="font-semibold flex-1">🗺️ 地図で工程を編集</h2>
        <button
          onClick={() => onSave(working)}
          className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          保存
        </button>
      </div>

      {/* 日の切り替え（複数日プランのみ） */}
      {working.days.length > 1 && (
        <div className="flex gap-1 px-3 py-2 border-b border-gray-100 overflow-x-auto">
          {working.days.map((d, i) => (
            <button
              key={i}
              onClick={() => setDayIndex(i)}
              className={`px-3 py-1 rounded-full text-xs shrink-0 ${
                i === dayIndex ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600"
              }`}
            >
              {d.label || `${i + 1}日目`}
            </button>
          ))}
        </div>
      )}

      {/* 地図（OpenStreetMap・無料） */}
      <div className="h-64 shrink-0 border-b border-gray-200">
        <LeafletMap items={items} currentLocation={currentLocation} />
      </div>

      {/* 目的地の検索・追加 */}
      <div className="px-3 py-2 border-b border-gray-100 space-y-2">
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runSearch()}
            placeholder="目的地を検索して追加（例: 清水寺）"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
          <button
            onClick={runSearch}
            disabled={searching || !query.trim()}
            className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-50 shrink-0"
          >
            {searching ? "検索中" : "検索"}
          </button>
          <button
            onClick={useCurrentLocation}
            disabled={locating}
            className="px-3 py-2 bg-indigo-50 text-indigo-700 rounded-lg text-sm shrink-0"
          >
            {locating ? "取得中" : "📍現在地"}
          </button>
        </div>
        {searchError && <p className="text-xs text-red-600">{searchError}</p>}
        {candidates.length > 0 && (
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {candidates.map((c) => (
              <button
                key={c.place_id}
                onClick={() => addCandidate(c)}
                className="w-full text-left px-3 py-2 bg-gray-50 hover:bg-blue-50 rounded-lg text-sm transition-colors"
              >
                <span className="font-medium">{c.name}</span>
                <span className="block text-xs text-gray-500 truncate">{c.address}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 行程一覧（並べ替え・滞在時間・削除） */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2 border border-gray-200 rounded-lg p-2">
            <span className="w-6 h-6 flex items-center justify-center rounded-full bg-blue-600 text-white text-xs shrink-0">
              {i + 1}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{item.name}</p>
              <p className="text-xs text-gray-400">{item.time ?? "--:--"}</p>
            </div>
            <label className="flex items-center gap-1 text-xs text-gray-500 shrink-0">
              滞在
              <input
                type="number"
                min={0}
                step={5}
                value={item.durationMin ?? ""}
                onChange={(e) => setDuration(i, e.target.value === "" ? 0 : Number(e.target.value))}
                className="w-14 px-1 py-1 border border-gray-300 rounded"
              />
              分
            </label>
            <button
              onClick={() => moveUp(i)}
              disabled={i === 0}
              className="w-6 h-6 disabled:opacity-30"
              aria-label={`${item.name}を上に移動`}
            >
              ↑
            </button>
            <button
              onClick={() => moveDown(i)}
              disabled={i === items.length - 1}
              className="w-6 h-6 disabled:opacity-30"
              aria-label={`${item.name}を下に移動`}
            >
              ↓
            </button>
            <button
              onClick={() => remove(i)}
              className="w-6 h-6 text-red-500"
              aria-label={`${item.name}を削除`}
            >
              🗑️
            </button>
          </div>
        ))}
        {items.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-6">
            まだ行程がありません。上の検索から目的地を追加してください。
          </p>
        )}
      </div>
    </div>
  );
}
