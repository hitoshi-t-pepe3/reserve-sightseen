import { HotelBasicInfo } from "./api";

export interface FavoriteHotel extends HotelBasicInfo {
  favoredAt: string; // ISO 8601
}

const STORAGE_KEY = "rs-favorite-hotels";

export function getFavorites(): FavoriteHotel[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function persist(hotels: FavoriteHotel[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(hotels));
}

export function isFavorited(hotelNo: number): boolean {
  return getFavorites().some((h) => h.hotelNo === hotelNo);
}

export function toggleFavorite(hotel: HotelBasicInfo): FavoriteHotel[] {
  const favorites = getFavorites();
  const index = favorites.findIndex((h) => h.hotelNo === hotel.hotelNo);

  if (index >= 0) {
    // 既に favorites にあれば削除
    favorites.splice(index, 1);
  } else {
    // なければ追加
    favorites.unshift({
      ...hotel,
      favoredAt: new Date().toISOString(),
    });
  }

  persist(favorites);
  return favorites;
}

export function removeFavorite(hotelNo: number): FavoriteHotel[] {
  const favorites = getFavorites().filter((h) => h.hotelNo !== hotelNo);
  persist(favorites);
  return favorites;
}

export function clearAllFavorites(): void {
  localStorage.removeItem(STORAGE_KEY);
}
