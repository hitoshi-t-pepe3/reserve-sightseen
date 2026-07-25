"use client";

import { useEffect, useState } from "react";
import { ItineraryTimeline } from "./ItineraryTimeline";
import { WalkModeScreen } from "./WalkModeScreen";
import {
  SavedPlan,
  ReservationInfo,
  MAX_SAVED_PLANS,
  loadPlans,
  deletePlan,
  updatePlan,
  updateReservation,
  withAddedItem,
  withEditedItem,
  withDeletedItem,
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
  // 削除は2タップ確認（iOS の PWA では confirm() が使えない）
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  // 散歩モード
  const [walkModePlan, setWalkModePlan] = useState<SavedPlan | null>(null);

  useEffect(() => {
    if (isOpen) {
      setPlans(loadPlans());
      setPendingDeleteId(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // 散歩モード表示中
  if (walkModePlan) {
    return (
      <WalkModeScreen
        itinerary={walkModePlan.itinerary}
        onClose={() => setWalkModePlan(null)}
      />
    );
  }

  const handleDelete = (plan: SavedPlan) => {
    if (pendingDeleteId !== plan.id) {
      setPendingDeleteId(plan.id);
      return;
    }
    setPendingDeleteId(null);
    setPlans(deletePlan(plan.id));
    if (openId === plan.id) setOpenId(null);
  };

  const handleAddItem = (
    plan: SavedPlan,
    dayIndex: number,
    name: string,
    time?: string,
    insertIndex?: number
  ) => {
    setPlans(updatePlan(plan.id, withAddedItem(plan.itinerary, dayIndex, name, time, insertIndex)));
  };

  const handleEditItem = (
    plan: SavedPlan,
    dayIndex: number,
    itemIndex: number,
    name: string,
    time?: string
  ) => {
    setPlans(updatePlan(plan.id, withEditedItem(plan.itinerary, dayIndex, itemIndex, name, time)));
  };

  // 確認は ItineraryTimeline 側の2タップUIで済んでいる
  const handleDeleteItem = (plan: SavedPlan, dayIndex: number, itemIndex: number) => {
    setPlans(updatePlan(plan.id, withDeletedItem(plan.itinerary, dayIndex, itemIndex)));
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
                {plan.itinerary.mode === "walk" && (
                  <button
                    onClick={() => setWalkModePlan(plan)}
                    className="shrink-0 px-2.5 py-1.5 bg-green-50 text-green-700 rounded-lg text-xs font-medium hover:bg-green-100"
                  >
                    🚶 散歩
                  </button>
                )}
                <button
                  onClick={() => setOpenId(opened ? null : plan.id)}
                  className="shrink-0 px-2.5 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium hover:bg-blue-100"
                >
                  {opened ? "閉じる" : "開く"}
                </button>
                <button
                  onClick={() => handleDelete(plan)}
                  className={`shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-medium ${
                    pendingDeleteId === plan.id
                      ? "bg-red-600 text-white"
                      : "bg-red-50 text-red-600 hover:bg-red-100"
                  }`}
                >
                  {pendingDeleteId === plan.id ? "本当に削除" : "削除"}
                </button>
              </div>
              {opened && (
                <div className="p-3 space-y-3">
                  {/* チェックイン情報（旅行プランのみ） */}
                  {plan.itinerary.mode === "travel" && (
                    <ReservationPanel plan={plan} onUpdate={(res) => setPlans(updateReservation(plan.id, res))} />
                  )}
                  {/* 日程表 */}
                  <ItineraryTimeline
                    itinerary={plan.itinerary}
                    onAddItem={(dayIndex, name, time, insertIndex) =>
                      handleAddItem(plan, dayIndex, name, time, insertIndex)
                    }
                    onEditItem={(dayIndex, itemIndex, name, time) =>
                      handleEditItem(plan, dayIndex, itemIndex, name, time)
                    }
                    onDeleteItem={(dayIndex, itemIndex) => handleDeleteItem(plan, dayIndex, itemIndex)}
                    onSaveWholeItinerary={(next) => setPlans(updatePlan(plan.id, next))}
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

// チェックイン情報入力パネル（旅行プランのみ）
function ReservationPanel({
  plan,
  onUpdate,
}: {
  plan: SavedPlan;
  onUpdate: (reservation: ReservationInfo) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState<ReservationInfo>(plan.reservation || {});

  const handleSave = () => {
    onUpdate(form);
    setIsEditing(false);
  };

  const checkin = plan.reservation?.checkinDate;
  const checkout = plan.reservation?.checkoutDate;
  const hotelName = plan.reservation?.hotelName;

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
      {!isEditing ? (
        // 表示モード
        <div>
          <p className="text-xs font-semibold text-blue-700 mb-2">🏨 チェックイン情報</p>
          {hotelName || checkin ? (
            <div className="space-y-1 text-sm">
              {hotelName && <p className="font-medium text-gray-900">{hotelName}</p>}
              {checkin && checkout && (
                <p className="text-gray-600">
                  {new Date(checkin).toLocaleDateString("ja-JP")} →{" "}
                  {new Date(checkout).toLocaleDateString("ja-JP")}
                </p>
              )}
              {plan.reservation?.reservationNumber && (
                <p className="text-xs text-gray-500">予約番号: {plan.reservation.reservationNumber}</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-600">ホテル予約情報が未入力です</p>
          )}
          <button
            onClick={() => setIsEditing(true)}
            className="mt-2 text-xs text-blue-700 hover:text-blue-900 font-medium"
          >
            編集
          </button>
        </div>
      ) : (
        // 編集モード
        <div className="space-y-2">
          <div>
            <label className="text-xs font-medium text-gray-700">ホテル名</label>
            <input
              type="text"
              value={form.hotelName || ""}
              onChange={(e) => setForm({ ...form, hotelName: e.target.value })}
              placeholder="例: 京都ホテル"
              className="w-full text-sm px-2 py-1.5 border border-gray-300 rounded-lg"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium text-gray-700">チェックイン</label>
              <input
                type="date"
                value={form.checkinDate || ""}
                onChange={(e) => setForm({ ...form, checkinDate: e.target.value })}
                className="w-full text-sm px-2 py-1.5 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700">チェックアウト</label>
              <input
                type="date"
                value={form.checkoutDate || ""}
                onChange={(e) => setForm({ ...form, checkoutDate: e.target.value })}
                className="w-full text-sm px-2 py-1.5 border border-gray-300 rounded-lg"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700">予約番号</label>
            <input
              type="text"
              value={form.reservationNumber || ""}
              onChange={(e) => setForm({ ...form, reservationNumber: e.target.value })}
              placeholder="楽天トラベルの予約番号など"
              className="w-full text-sm px-2 py-1.5 border border-gray-300 rounded-lg"
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleSave}
              className="flex-1 bg-blue-600 text-white text-xs py-1.5 rounded-lg font-medium hover:bg-blue-700"
            >
              保存
            </button>
            <button
              onClick={() => setIsEditing(false)}
              className="flex-1 bg-gray-200 text-gray-700 text-xs py-1.5 rounded-lg font-medium hover:bg-gray-300"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
