"use client";

import { useState } from "react";
import { Itinerary, ItineraryItem } from "@/lib/api";
import { savePlan } from "@/lib/planStorage";

const CATEGORY_META: Record<ItineraryItem["category"], { icon: string; label: string }> = {
  spot: { icon: "🏛️", label: "観光" },
  meal: { icon: "🍽️", label: "食事" },
  hotel: { icon: "🏨", label: "宿" },
  move: { icon: "🚶", label: "移動" },
};

const MODE_LABELS: Record<Itinerary["mode"], string> = {
  walk: "散歩コース",
  drive: "ドライブコース",
  travel: "旅行プラン",
};

const TRANSPORT_LABELS: Record<string, string> = {
  train: "🚄 電車",
  bus: "🚌 バス",
  car: "🚗 車",
  plane: "✈️ 飛行機",
};

interface ItineraryTimelineProps {
  itinerary: Itinerary;
  // チャット内の表示で保存ボタンを出す（localStorage に最大10件）
  saveable?: boolean;
  // 保存プラン画面で目的地を手動追加する
  onAddItem?: (dayIndex: number, name: string, time?: string) => void;
  // 保存プラン画面で行程を編集・削除する
  onEditItem?: (dayIndex: number, itemIndex: number, name: string, time?: string) => void;
  onDeleteItem?: (dayIndex: number, itemIndex: number) => void;
}

// 日程表のタイムライン表示。
// チェックで「回った場所」を消し込みながらたどれる（状態はこのメッセージ内のみ）。
export function ItineraryTimeline({
  itinerary,
  saveable,
  onAddItem,
  onEditItem,
  onDeleteItem,
}: ItineraryTimelineProps) {
  const [visited, setVisited] = useState<Record<string, boolean>>({});
  const [saveState, setSaveState] = useState<"idle" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [addingDay, setAddingDay] = useState<number | null>(null);
  const [newName, setNewName] = useState("");
  const [newTime, setNewTime] = useState("");
  // 編集中の行程（保存プラン画面のみ）。キーは `${dayIndex}-${itemIndex}`
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editTime, setEditTime] = useState("");

  const toggle = (key: string) =>
    setVisited((prev) => ({ ...prev, [key]: !prev[key] }));

  const handleSave = () => {
    const result = savePlan(itinerary);
    if (result.ok) {
      setSaveState("saved");
      setSaveError(null);
    } else {
      setSaveState("error");
      setSaveError(result.reason);
    }
  };

  const submitAddItem = (dayIndex: number) => {
    const name = newName.trim();
    if (!name || !onAddItem) return;
    onAddItem(dayIndex, name, newTime.trim() || undefined);
    setNewName("");
    setNewTime("");
    setAddingDay(null);
  };

  const startEdit = (key: string, item: ItineraryItem) => {
    setEditingKey(key);
    setEditName(item.name);
    setEditTime(item.time ?? "");
  };

  const submitEdit = (dayIndex: number, itemIndex: number) => {
    const name = editName.trim();
    if (!name || !onEditItem) return;
    onEditItem(dayIndex, itemIndex, name, editTime.trim() || undefined);
    setEditingKey(null);
  };

  // 散歩・ドライブは現在地起点の経路リンク、旅行は直前の地点起点
  const navLabel =
    itinerary.mode === "walk" || itinerary.mode === "drive"
      ? "現在地から経路"
      : "前の地点から経路";

  return (
    <div className="mb-4 bg-white border border-blue-200 rounded-2xl overflow-hidden shadow-sm">
      <div className="bg-blue-600 text-white px-4 py-3 flex items-start justify-between gap-2">
        <div>
          <p className="text-xs opacity-80">
            {MODE_LABELS[itinerary.mode] ?? "旅行プラン"}
            {itinerary.mode === "travel" && itinerary.transport
              ? `（${TRANSPORT_LABELS[itinerary.transport] ?? itinerary.transport}）`
              : ""}
          </p>
          <h3 className="font-semibold">{itinerary.title}</h3>
        </div>
        {saveable && (
          <button
            onClick={handleSave}
            disabled={saveState === "saved"}
            className="shrink-0 px-2.5 py-1 bg-white/15 hover:bg-white/25 disabled:opacity-70 rounded-lg text-xs font-medium transition-colors"
          >
            {saveState === "saved" ? "✓ 保存済み" : "💾 保存"}
          </button>
        )}
      </div>
      {saveError && (
        <p className="px-4 py-2 bg-amber-50 text-amber-800 text-xs border-b border-amber-200">
          {saveError}
        </p>
      )}

      {itinerary.days.map((day, di) => (
        <div key={di} className="px-4 py-3">
          {/* 1日だけの散歩・ドライブコースはヘッダーと重複するのでラベルを出さない */}
          {day.label && !(itinerary.days.length === 1 && itinerary.mode !== "travel") && (
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
                      {editingKey === key && onEditItem ? (
                        <div className="flex flex-wrap items-center gap-2 flex-1">
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && submitEdit(di, ii)}
                            className="flex-1 min-w-[10rem] px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
                            autoFocus
                          />
                          <input
                            type="text"
                            value={editTime}
                            onChange={(e) => setEditTime(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && submitEdit(di, ii)}
                            placeholder="時刻(任意)"
                            className="w-20 px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
                          />
                          <button
                            onClick={() => submitEdit(di, ii)}
                            disabled={!editName.trim()}
                            className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-50"
                          >
                            保存
                          </button>
                          <button
                            onClick={() => setEditingKey(null)}
                            className="px-2 py-1.5 text-gray-500 text-sm"
                          >
                            キャンセル
                          </button>
                        </div>
                      ) : (
                      <>
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
                              {navLabel}
                            </a>
                          )}
                          {item.prevNavUrl && (
                            <a
                              href={item.prevNavUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-teal-700 underline hover:text-teal-900"
                            >
                              前の地点から経路
                            </a>
                          )}
                        </div>
                      </div>
                      {(onEditItem || onDeleteItem) && (
                        <div className="flex gap-1 shrink-0">
                          {onEditItem && (
                            <button
                              onClick={() => startEdit(key, item)}
                              className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100 text-sm"
                              aria-label={`${item.name} を編集`}
                            >
                              ✏️
                            </button>
                          )}
                          {onDeleteItem && (
                            <button
                              onClick={() => onDeleteItem(di, ii)}
                              className="w-7 h-7 flex items-center justify-center rounded hover:bg-red-50 text-sm"
                              aria-label={`${item.name} を削除`}
                            >
                              🗑️
                            </button>
                          )}
                        </div>
                      )}
                      </>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>

          {/* 保存プラン画面での目的地の手動追加 */}
          {onAddItem &&
            (addingDay === di ? (
              <div className="mt-3 ml-3 flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submitAddItem(di)}
                  placeholder="スポット名（例: 清水寺）"
                  className="flex-1 min-w-[10rem] px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
                  autoFocus
                />
                <input
                  type="text"
                  value={newTime}
                  onChange={(e) => setNewTime(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submitAddItem(di)}
                  placeholder="時刻(任意)"
                  className="w-20 px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
                />
                <button
                  onClick={() => submitAddItem(di)}
                  disabled={!newName.trim()}
                  className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-50"
                >
                  追加
                </button>
                <button
                  onClick={() => setAddingDay(null)}
                  className="px-2 py-1.5 text-gray-500 text-sm"
                >
                  キャンセル
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setAddingDay(di);
                  setNewName("");
                  setNewTime("");
                }}
                className="mt-3 ml-3 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium hover:bg-blue-100 transition-colors"
              >
                ＋ 目的地を追加
              </button>
            ))}
        </div>
      ))}

      {/* チケット予約導線（バス=楽天トラベル高速バス、飛行機=楽パック） */}
      {itinerary.booking && (
        <div className="px-4 pb-4">
          <a
            href={itinerary.booking.url}
            target="_blank"
            rel="noopener noreferrer sponsored"
            className="block text-center px-4 py-2.5 bg-[#bf0000] hover:bg-[#a50000] text-white rounded-xl text-sm font-medium transition-colors"
          >
            {itinerary.booking.label}
          </a>
        </div>
      )}
    </div>
  );
}
