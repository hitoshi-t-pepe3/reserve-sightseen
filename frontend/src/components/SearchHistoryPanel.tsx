"use client";

import { useEffect, useState } from "react";
import { getSearchHistory, removeFromSearchHistory, SearchHistoryItem } from "@/lib/searchHistory";

interface SearchHistoryPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (item: SearchHistoryItem) => void;
}

export function SearchHistoryPanel({ isOpen, onClose, onSelect }: SearchHistoryPanelProps) {
  const [history, setHistory] = useState<SearchHistoryItem[]>([]);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setHistory(getSearchHistory());
      setPendingDeleteId(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleDelete = (item: SearchHistoryItem) => {
    if (pendingDeleteId !== item.id) {
      setPendingDeleteId(item.id);
      return;
    }
    setPendingDeleteId(null);
    setHistory(removeFromSearchHistory(item.id));
  };

  const handleSelectSearch = (item: SearchHistoryItem) => {
    onSelect(item);
    onClose();
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return date.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
    } else if (date.toDateString() === yesterday.toDateString()) {
      return "昨日";
    } else {
      return date.toLocaleDateString("ja-JP");
    }
  };

  return (
    <div className="bg-white border-t border-gray-200 rounded-t-2xl shadow-2xl flex flex-col max-h-[80vh]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <h2 className="font-semibold text-gray-900">
          🔍 検索履歴
          <span className="ml-2 text-xs font-normal text-gray-500">
            {history.length}件
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

      <div className="overflow-y-auto px-4 py-3">
        {history.length === 0 ? (
          <p className="text-sm text-gray-500 py-6 text-center">
            検索履歴はまだありません。
            <br />
            チャットで検索すると履歴が保存されます。
          </p>
        ) : (
          <div className="space-y-2">
            {history.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors"
              >
                <button
                  onClick={() => handleSelectSearch(item)}
                  className="flex-1 text-left min-w-0"
                >
                  <p className="text-sm font-medium text-gray-900">
                    {item.area || "エリア未指定"}
                    {item.checkin && ` • ${item.checkin}`}
                    {item.adults && ` • ${item.adults}人`}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {formatDate(item.searchedAt)}
                  </p>
                </button>
                <button
                  onClick={() => handleDelete(item)}
                  className={`shrink-0 ml-2 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    pendingDeleteId === item.id
                      ? "bg-red-600 text-white"
                      : "bg-red-50 text-red-600 hover:bg-red-100"
                  }`}
                >
                  {pendingDeleteId === item.id ? "削除" : "×"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
