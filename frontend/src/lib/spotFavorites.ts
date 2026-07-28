import { ItineraryItem } from "./api";

export interface FavoriteSpot extends ItineraryItem {
  favoredAt: string; // ISO 8601
}

const STORAGE_KEY = "rs-favorite-spots";

export function getFavoriteSpots(): FavoriteSpot[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function persist(spots: FavoriteSpot[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(spots));
}

export function isFavoritedSpot(spotName: string): boolean {
  return getFavoriteSpots().some((s) => s.name === spotName);
}

export function toggleFavoriteSpot(item: ItineraryItem): FavoriteSpot[] {
  const favorites = getFavoriteSpots();
  const index = favorites.findIndex((s) => s.name === item.name);

  if (index >= 0) {
    favorites.splice(index, 1);
  } else {
    favorites.unshift({
      ...item,
      favoredAt: new Date().toISOString(),
    });
  }

  persist(favorites);
  return favorites;
}

export function removeFavoriteSpot(spotName: string): FavoriteSpot[] {
  const spots = getFavoriteSpots().filter((s) => s.name !== spotName);
  persist(spots);
  return spots;
}

export function clearFavoriteSpots(): void {
  localStorage.removeItem(STORAGE_KEY);
}
