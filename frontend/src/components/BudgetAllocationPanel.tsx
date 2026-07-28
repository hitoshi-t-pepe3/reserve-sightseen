"use client";

import { useState, useEffect } from "react";
import { BudgetPlan, saveBudgetPlan, getBudgetPlan, calculateBudgetRemaining, calculateBudgetUsagePercent } from "@/lib/budgetPlanning";

interface BudgetAllocationPanelProps {
  planId: string;
  isOpen: boolean;
  onClose: () => void;
}

const BUDGET_CATEGORIES = [
  { key: "accommodation", label: "🏨 宿泊費", icon: "🏨" },
  { key: "transport", label: "🚗 交通費", icon: "🚗" },
  { key: "meals", label: "🍽️ 食事費", icon: "🍽️" },
  { key: "activities", label: "🎫 アクティビティ", icon: "🎫" },
  { key: "other", label: "📦 その他", icon: "📦" },
] as const;

export function BudgetAllocationPanel({ planId, isOpen, onClose }: BudgetAllocationPanelProps) {
  const [budget, setBudget] = useState<BudgetPlan | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const existing = getBudgetPlan(planId);
      setBudget(existing || {
        planId,
        totalBudget: null,
        accommodation: null,
        transport: null,
        meals: null,
        activities: null,
        other: null,
      });
      setIsEditing(false);
    }
  }, [isOpen, planId]);

  if (!isOpen || !budget) return null;

  const remaining = calculateBudgetRemaining(budget);
  const usagePercent = calculateBudgetUsagePercent(budget);
  const isOverBudget = remaining !== null && remaining < 0;

  const handleSave = () => {
    saveBudgetPlan(budget);
    setIsEditing(false);
  };

  const handleInputChange = (key: keyof typeof budget, value: string) => {
    const numValue = value === "" ? null : Number(value);
    setBudget({ ...budget, [key]: numValue });
  };

  return (
    <div className="bg-white border-t border-gray-200 rounded-t-2xl shadow-2xl flex flex-col max-h-[80vh]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <h2 className="font-semibold text-gray-900">💰 旅行予算管理</h2>
        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500"
          aria-label="閉じる"
        >
          ✕
        </button>
      </div>

      <div className="overflow-y-auto px-4 py-4 space-y-4">
        {/* Total Budget */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <label className="text-xs font-semibold text-blue-700 block mb-2">
            💰 総予算
          </label>
          {!isEditing ? (
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {budget.totalBudget ? `¥${budget.totalBudget.toLocaleString()}` : "未設定"}
              </p>
              <button
                onClick={() => setIsEditing(true)}
                className="mt-2 text-xs text-blue-700 hover:text-blue-900 font-medium"
              >
                編集
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <input
                type="number"
                value={budget.totalBudget || ""}
                onChange={(e) => handleInputChange("totalBudget", e.target.value)}
                placeholder="例: 200000"
                className="w-full px-3 py-2 border border-blue-300 rounded-lg text-sm"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  className="flex-1 bg-blue-600 text-white text-xs py-1.5 rounded-lg font-medium hover:bg-blue-700"
                >
                  保存
                </button>
                <button
                  onClick={() => setIsEditing(false)}
                  className="flex-1 bg-gray-200 text-gray-700 text-xs py-1.5 rounded-lg font-medium"
                >
                  キャンセル
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Budget Usage Bar */}
        {budget.totalBudget && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-700">予算使用率</span>
              <span className={`text-sm font-bold ${isOverBudget ? "text-red-600" : "text-gray-900"}`}>
                {usagePercent}%
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div
                className={`h-3 rounded-full transition-all ${
                  isOverBudget ? "bg-red-600" : "bg-blue-600"
                }`}
                style={{ width: `${Math.min(usagePercent, 100)}%` }}
              />
            </div>
            {remaining !== null && (
              <p className={`text-xs ${isOverBudget ? "text-red-600" : "text-gray-600"}`}>
                {isOverBudget ? "⚠️ 超過: " : "残額: "}
                ¥{Math.abs(remaining).toLocaleString()}
              </p>
            )}
          </div>
        )}

        {/* Budget Categories */}
        <div className="space-y-3">
          {BUDGET_CATEGORIES.map(({ key, label, icon }) => {
            const typedKey = key as keyof typeof budget;
            const value = budget[typedKey];
            return (
              <div key={key} className="border border-gray-200 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-900">{label}</span>
                  <span className="text-lg text-gray-500">{icon}</span>
                </div>
                <input
                  type="number"
                  value={value || ""}
                  onChange={(e) => {
                    handleInputChange(typedKey, e.target.value);
                  }}
                  onBlur={() => {
                    if (budget !== getBudgetPlan(planId)) {
                      saveBudgetPlan(budget);
                    }
                  }}
                  placeholder="金額を入力"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
                {value && budget.totalBudget && (
                  <p className="text-xs text-gray-500 mt-1">
                    {((value as number / budget.totalBudget) * 100).toFixed(1)}% of total
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {/* Summary */}
        {budget.totalBudget && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
            <p className="text-xs font-semibold text-gray-700">予算内訳</p>
            <div className="space-y-1 text-xs">
              {BUDGET_CATEGORIES.map(({ key, label }) => {
                const typedKey = key as keyof typeof budget;
                const value = budget[typedKey];
                return (
                  <div key={key} className="flex items-center justify-between text-gray-600">
                    <span>{label}</span>
                    <span className="font-medium">
                      {value ? `¥${value.toLocaleString()}` : "¥0"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
