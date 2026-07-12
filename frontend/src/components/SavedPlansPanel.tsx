"use client";

import { useEffect, useState } from "react";
import { ItineraryTimeline } from "./ItineraryTimeline";
import {
  SavedPlan,
  MAX_SAVED_PLANS,
  loadPlans,
  deletePlan,
  updatePlan,
  buildManualItem,
  relinkItem,
  nextSpotIndex,
} from "@/lib/planStorage";

const MODE_BADGES: Record<string, string> = {
  walk: "🚶 散歩",
  drive: "🚗 ドライブ",
  travel: "🧳 旅行",
};

interface SavedPlansPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

// 保存したプラン（最大10件・この端末の localStorage）の一覧・閲覧・編集パネル
export function SavedPlansPanel({ isOpen, onClose }: SavedPlansPanelProps) {
  const [plans, setPlans] = useState<SavedPlan[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) setPlans(loadPlans());
  }, [isOpen]);

  if (!isOpen) return null;

  const handleDelete = (plan: SavedPlan) => {
    if (!confirm(`「${plan.itinerary.title}」を削除しますか？`)) return;
    setPlans(deletePlan(plan.id));
    if (openId === plan.id) setOpenId(null);
  };

  const handleAddItem = (plan: SavedPlan, dayIndex: number, name: string, time?: string) => {
    const itinerary = structuredClone(plan.itinerary);
    const day = itinerary.days[dayIndex];
    if (!day) return;
    day.items.push(buildManualItem(name, time, itinerary, dayIndex));
    setPlans(updatePlan(plan.id, itinerary));
  };

  const handleEditItem = (
    plan: SavedPlan,
    dayIndex: number,
    itemIndex: number,
    name: string,
    time?: string
  ) => {
    const itinerary = structuredClone(plan.itinerary);
    const item = itinerary.days[dayIndex]?.items[itemIndex];
    if (!item) return;
    const nameChanged = item.name !== name;
    item.name = name;
    item.time = time || null;
    if (nameChanged) {
      // 自身と、自分を起点にしている次のスポットの経路リンクを組み直す
      relinkItem(itinerary, dayIndex, itemIndex);
      const next = nextSpotIndex(itinerary.days[dayIndex].items, itemIndex + 1);
      if (next >= 0) relinkItem(itinerary, dayIndex, next);
    }
    setPlans(updatePlan(plan.id, itinerary));
  };

  const handleDeleteItem = (plan: SavedPlan, dayIndex: number, itemIndex: number) => {
    const itinerary = structuredClone(plan.itinerary);
    const items = itinerary.days[dayIndex]?.items;
    if (!items || !items[itemIndex]) return;
    if (!confirm(`「${items[itemIndex].name}」を行程から削除しますか？`)) return;
    const wasSpot = items[itemIndex].category !== "move";
    items.splice(itemIndex, 1);
    if (wasSpot) {
      // 削除した地点を起点にしていた次のスポットの経路リンクを組み直す
      const next = nextSpotIndex(items, itemIndex);
      if (next >= 0) relinkItem(itinerary, dayIndex, next);
    }
    // 日が空になったら日ごと削除（バックエンドは空の日を許さないため表示も揃える）
    itinerary.days = itinerary.days.filter((d) => d.items.length > 0);
    setPlans(updatePlan(plan.id, itinerary));
  };

  return (
    <div className="bg-white border-t border-gray-200 rounded-t-2xl shadow-2xl flex flex-col max-h-[80vh]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <h2 className="font-semibold text-gray-900">
          📚 保存プラン
          <span className="ml-2 text-xs font-normal text-gray-500">
            {plans.length}/{MAX_SAVED_PLANS}件（この端末に保存）
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

      <div className="overflow-y-auto px-4 py-3 space-y-3">
        {plans.length === 0 && (
          <p className="text-sm text-gray-500 py-6 text-center">
            保存したプランはまだありません。
            <br />
            チャットで提案された日程表の「💾 保存」ボタンから保存できます。
          </p>
        )}

        {plans.map((plan) => {
          const opened = openId === plan.id;
          const savedDate = new Date(plan.savedAt);
          return (
            <div key={plan.id} className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2.5 bg-gray-50">
                <button
                  onClick={() => setOpenId(opened ? null : plan.id)}
                  className="flex-1 min-w-0 text-left"
                >
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {MODE_BADGES[plan.itinerary.mode] ?? ""} {plan.itinerary.title}
                  </p>
                  <p className="text-xs text-gray-500">
                    {savedDate.toLocaleDateString("ja-JP")} 保存
                  </p>
                </button>
                <button
                  onClick={() => setOpenId(opened ? null : plan.id)}
                  className="shrink-0 px-2.5 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium hover:bg-blue-100"
                >
                  {opened ? "閉じる" : "開く"}
                </button>
                <button
                  onClick={() => handleDelete(plan)}
                  className="shrink-0 px-2.5 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-medium hover:bg-red-100"
                >
                  削除
                </button>
              </div>
              {opened && (
                <div className="p-3">
                  <ItineraryTimeline
                    itinerary={plan.itinerary}
                    onAddItem={(dayIndex, name, time) => handleAddItem(plan, dayIndex, name, time)}
                    onEditItem={(dayIndex, itemIndex, name, time) =>
                      handleEditItem(plan, dayIndex, itemIndex, name, time)
                    }
                    onDeleteItem={(dayIndex, itemIndex) => handleDeleteItem(plan, dayIndex, itemIndex)}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
