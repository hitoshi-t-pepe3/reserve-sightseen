import { Itinerary, ItineraryItem } from "./api";

// 保存プランは端末の localStorage に持つ（アカウント不要・この端末/ブラウザ内のみ）
export interface SavedPlan {
  id: string;
  savedAt: string; // ISO 8601
  itinerary: Itinerary;
}

const STORAGE_KEY = "rs-saved-plans";
export const MAX_SAVED_PLANS = 10;

export function loadPlans(): SavedPlan[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function persist(plans: SavedPlan[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(plans));
}

export function savePlan(
  itinerary: Itinerary
): { ok: true; plans: SavedPlan[] } | { ok: false; reason: string } {
  const plans = loadPlans();
  if (plans.length >= MAX_SAVED_PLANS) {
    return {
      ok: false,
      reason: `保存できるのは${MAX_SAVED_PLANS}件までです。「保存プラン」から不要なプランを削除してください。`,
    };
  }
  const plan: SavedPlan = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    savedAt: new Date().toISOString(),
    itinerary,
  };
  const next = [plan, ...plans];
  persist(next);
  return { ok: true, plans: next };
}

export function deletePlan(id: string): SavedPlan[] {
  const next = loadPlans().filter((p) => p.id !== id);
  persist(next);
  return next;
}

export function updatePlan(id: string, itinerary: Itinerary): SavedPlan[] {
  const next = loadPlans().map((p) => (p.id === id ? { ...p, itinerary } : p));
  persist(next);
  return next;
}

// スポット名から地図・経路リンクを、バックエンドと同じ形式で組み立てる。
// 散歩・ドライブは現在地起点（origin 省略で端末の現在地になる）+ 直前スポット起点の併記、
// 旅行は直前スポット起点のみ。
function buildLinks(
  name: string,
  itinerary: Itinerary,
  prevName?: string
): Pick<ItineraryItem, "mapUrl" | "navUrl" | "prevNavUrl"> {
  const travelmode =
    itinerary.mode === "walk"
      ? "walking"
      : itinerary.mode === "drive"
        ? "driving"
        : itinerary.transport === "car"
          ? "driving"
          : itinerary.transport
            ? "transit"
            : undefined;

  const base = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(name)}`;
  const suffix = travelmode ? `&travelmode=${travelmode}` : "";
  const fromPrev = prevName
    ? `${base}&origin=${encodeURIComponent(prevName)}${suffix}`
    : undefined;

  return {
    mapUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`,
    ...(itinerary.mode === "travel"
      ? { navUrl: fromPrev, prevNavUrl: undefined }
      : { navUrl: `${base}${suffix}`, prevNavUrl: fromPrev }),
  };
}

function prevSpotName(items: ItineraryItem[], beforeIndex: number): string | undefined {
  return items
    .slice(0, beforeIndex)
    .reverse()
    .find((i) => i.category !== "move")?.name;
}

// 手動追加スポットを組み立てる（その日の末尾に追加される想定）
export function buildManualItem(
  name: string,
  time: string | undefined,
  itinerary: Itinerary,
  dayIndex: number
): ItineraryItem {
  const query = name.trim();
  const items = itinerary.days[dayIndex]?.items ?? [];
  return {
    time: time?.trim() || null,
    name: query,
    category: "spot",
    description: null,
    durationMin: null,
    ...buildLinks(query, itinerary, prevSpotName(items, items.length)),
  };
}

// 指定項目の経路リンクを現在の並びに合わせて組み直す。
// 項目の削除・名前変更のあと、その項目自身と「次のスポット」（起点が変わる）に使う。
// 注: 組み直したリンクは住所なしのスポット名だけで検索される（バックエンド生成時より粗い）。
export function relinkItem(itinerary: Itinerary, dayIndex: number, itemIndex: number) {
  const items = itinerary.days[dayIndex]?.items ?? [];
  const item = items[itemIndex];
  if (!item || item.category === "move") return;
  Object.assign(item, buildLinks(item.name, itinerary, prevSpotName(items, itemIndex)));
}

// itemIndex 以降で最初のスポット（move 以外）の位置。なければ -1
export function nextSpotIndex(items: ItineraryItem[], fromIndex: number): number {
  for (let i = fromIndex; i < items.length; i++) {
    if (items[i].category !== "move") return i;
  }
  return -1;
}
