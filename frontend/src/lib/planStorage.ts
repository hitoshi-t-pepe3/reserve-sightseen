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

// 手動追加スポットの地図・経路リンクを、バックエンドと同じ形式で組み立てる。
// 散歩・ドライブは現在地起点（origin 省略で端末の現在地になる）、
// 旅行はその日の直前のスポット起点。
export function buildManualItem(
  name: string,
  time: string | undefined,
  itinerary: Itinerary,
  dayIndex: number
): ItineraryItem {
  const query = name.trim();
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

  const base = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}`;
  const items = itinerary.days[dayIndex]?.items ?? [];
  const prev = [...items].reverse().find((i) => i.category !== "move");

  let navUrl = base;
  // 散歩・ドライブでの「直前の地点から」の経路（現在地からのリンクと併記される）
  let prevNavUrl: string | undefined;
  if (itinerary.mode === "travel") {
    if (prev) navUrl += `&origin=${encodeURIComponent(prev.name)}`;
  } else if (prev) {
    prevNavUrl = `${base}&origin=${encodeURIComponent(prev.name)}`;
  }
  if (travelmode) {
    navUrl += `&travelmode=${travelmode}`;
    if (prevNavUrl) prevNavUrl += `&travelmode=${travelmode}`;
  }

  return {
    time: time?.trim() || null,
    name: query,
    category: "spot",
    description: null,
    durationMin: null,
    mapUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`,
    navUrl,
    ...(prevNavUrl ? { prevNavUrl } : {}),
  };
}
