"use client";

import { useEffect, useState } from "react";
import { HotelBasicInfo } from "@/lib/api";
import { HotelCard } from "./HotelCard";
import { getFavorites, removeFavorite } from "@/lib/favoriteHotels";

interface FavoritesPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function FavoritesPanel({ isOpen, onClose }: FavoritesPanelProps) {
  const [favorites, setFavorites] = useState<HotelBasicInfo[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setFavorites(getFavorites().map(fav => {
        const { favoredAt, ...hotel } = fav;
        return hotel as HotelBasicInfo;
      }));
    }
  }, [isOpen, refreshKey]);

  if (!isOpen) return null;

  const handleRemove = (hotelNo: number) => {
    removeFavorite(hotelNo);
    setFavorites(favorites.filter(h => h.hotelNo !== hotelNo));
  };

  const handleFavoriteChange = () => {
    setRefreshKey(prev => prev + 1);
  };

  return (
    <div className="bg-white border-t border-gray-200 rounded-t-2xl shadow-2xl flex flex-col max-h-[80vh]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <h2 className="font-semibold text-gray-900">
          ❤️ お気に入りホテル
          <span className="ml-2 text-xs font-normal text-gray-500">
            {favorites.length}件
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
        {favorites.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-gray-500">
              お気に入りホテルはまだありません。
              <br />
              ホテルカードの❤️ボタンからお気に入り登録できます。
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {favorites.map((hotel) => (
              <div key={hotel.hotelNo} className="relative">
                <HotelCard hotel={hotel} onFavoriteChange={() => {
                  handleRemove(hotel.hotelNo);
                  handleFavoriteChange();
                }} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
