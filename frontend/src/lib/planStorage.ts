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

// 手動追加スポットを組み立てる（insertIndex の位置に入る想定。省略時は末尾）
export function buildManualItem(
  name: string,
  time: string | undefined,
  itinerary: Itinerary,
  dayIndex: number,
  insertIndex?: number
): ItineraryItem {
  const query = name.trim();
  const items = itinerary.days[dayIndex]?.items ?? [];
  const at = insertIndex ?? items.length;
  return {
    time: time?.trim() || null,
    name: query,
    category: "spot",
    description: null,
    durationMin: null,
    ...buildLinks(query, itinerary, prevSpotName(items, at)),
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

// ---- 日程表のイミュータブルな編集ヘルパー（新しいコピーを返す） ----
// チャット内の日程表と保存プラン画面の両方から使う

// insertIndex の位置に目的地を挿入する（省略時は末尾）。
// 挿入位置の次のスポットは起点が変わるため経路リンクを組み直す
export function withAddedItem(
  itinerary: Itinerary,
  dayIndex: number,
  name: string,
  time?: string,
  insertIndex?: number
): Itinerary {
  const next = structuredClone(itinerary);
  const items = next.days[dayIndex]?.items;
  if (!items) return next;
  const at = Math.max(0, Math.min(insertIndex ?? items.length, items.length));
  items.splice(at, 0, buildManualItem(name, time, next, dayIndex, at));
  const after = nextSpotIndex(items, at + 1);
  if (after >= 0) relinkItem(next, dayIndex, after);
  return next;
}

export function withEditedItem(
  itinerary: Itinerary,
  dayIndex: number,
  itemIndex: number,
  name: string,
  time?: string
): Itinerary {
  const next = structuredClone(itinerary);
  const item = next.days[dayIndex]?.items[itemIndex];
  if (!item) return next;
  const nameChanged = item.name !== name;
  item.name = name;
  item.time = time || null;
  if (nameChanged) {
    // 自身と、自分を起点にしている次のスポットの経路リンクを組み直す
    relinkItem(next, dayIndex, itemIndex);
    const after = nextSpotIndex(next.days[dayIndex].items, itemIndex + 1);
    if (after >= 0) relinkItem(next, dayIndex, after);
  }
  return next;
}

export function withDeletedItem(
  itinerary: Itinerary,
  dayIndex: number,
  itemIndex: number
): Itinerary {
  const next = structuredClone(itinerary);
  const items = next.days[dayIndex]?.items;
  if (!items || !items[itemIndex]) return next;
  const wasSpot = items[itemIndex].category !== "move";
  items.splice(itemIndex, 1);
  if (wasSpot) {
    // 削除した地点を起点にしていた次のスポットの経路リンクを組み直す
    const after = nextSpotIndex(items, itemIndex);
    if (after >= 0) relinkItem(next, dayIndex, after);
  }
  // 日の行程が空になったら日ごと削除（バックエンドは空の日を許さないため表示も揃える）
  next.days = next.days.filter((d) => d.items.length > 0);
  return next;
}
