import { SearchContext } from "./api";

export interface SearchHistoryItem extends SearchContext {
  id: string;
  searchedAt: string; // ISO 8601
}

const STORAGE_KEY = "rs-search-history";
export const MAX_SEARCH_HISTORY = 20;

export function getSearchHistory(): SearchHistoryItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function persist(items: SearchHistoryItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function addToSearchHistory(context: SearchContext): SearchHistoryItem[] {
  const history = getSearchHistory();

  // 同じ条件が既にあれば、最新のものを最初に移動（重複排除）
  const existingIndex = history.findIndex(
    (h) => h.area === context.area &&
           h.checkin === context.checkin &&
           h.checkout === context.checkout &&
           h.adults === context.adults
  );

  if (existingIndex >= 0) {
    const [existing] = history.splice(existingIndex, 1);
    existing.searchedAt = new Date().toISOString();
    history.unshift(existing);
  } else {
    const newItem: SearchHistoryItem = {
      ...context,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      searchedAt: new Date().toISOString(),
    };
    history.unshift(newItem);
  }

  // 最大件数を超えたら古い分を削除
  if (history.length > MAX_SEARCH_HISTORY) {
    history.splice(MAX_SEARCH_HISTORY);
  }

  persist(history);
  return history;
}

export function removeFromSearchHistory(id: string): SearchHistoryItem[] {
  const history = getSearchHistory().filter((h) => h.id !== id);
  persist(history);
  return history;
}

export function clearSearchHistory(): void {
  localStorage.removeItem(STORAGE_KEY);
}
