import { Itinerary, ItineraryItem } from "./api";

// ホテル予約情報（旅行プランと一緒に保存）
export interface ReservationInfo {
  hotelName?: string;
  checkinDate?: string; // YYYY-MM-DD
  checkoutDate?: string; // YYYY-MM-DD
  reservationNumber?: string;
  confirmationUrl?: string; // 楽天トラベルなど
  reservedAt?: string; // 予約した日時 ISO 8601
}

// 保存プランは端末の localStorage に持つ（アカウント不要・この端末/ブラウザ内のみ）
export interface SavedPlan {
  id: string;
  savedAt: string; // ISO 8601
  itinerary: Itinerary;
  reservation?: ReservationInfo; // ホテル予約情報（オプション）
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

export function updateReservation(id: string, reservation: ReservationInfo): SavedPlan[] {
  const next = loadPlans().map((p) => (p.id === id ? { ...p, reservation } : p));
  persist(next);
  return next;
}

// スポット名から地図・経路リンクを、バックエンドと同じ形式で組み立てる。
// 散歩・ドライブは現在地起点（origin 省略で端末の現在地になる）+ 直前スポット起点の併記、
// 旅行は直前スポット起点のみ。
function buildLinks(
  name: string,
  itinerary: Itinerary,
  prevName?: string,
  linkQuery?: string
): Pick<ItineraryItem, "mapUrl" | "navUrl" | "prevNavUrl"> {
  const query = linkQuery || name;
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
  const suffix = travelmode ? `&travelmode=${travelmode}` : "";
  const fromPrev = prevName
    ? `${base}&origin=${encodeURIComponent(prevName)}${suffix}`
    : undefined;

  return {
    mapUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`,
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

// Google Places で確認済みの場所（名前・住所・座標）から目的地を組み立てる。
// バックエンドの create_itinerary と同じく「名前 住所」をリンクの検索クエリにする
export function buildResolvedItem(
  place: { name: string; address: string; lat: number; lng: number },
  time: string | undefined,
  durationMin: number | undefined,
  itinerary: Itinerary,
  dayIndex: number,
  insertIndex?: number
): ItineraryItem {
  const items = itinerary.days[dayIndex]?.items ?? [];
  const at = insertIndex ?? items.length;
  const linkQuery = `${place.name} ${place.address}`.trim();
  return {
    time: time?.trim() || null,
    name: place.name,
    category: "spot",
    description: null,
    durationMin: durationMin ?? null,
    lat: place.lat,
    lng: place.lng,
    ...buildLinks(place.name, itinerary, prevSpotName(items, at), linkQuery),
  };
}

// ---- 時刻の自動計算 ----
// 地図編集モードでの追加・並べ替え・滞在時間変更のたびに、以降の項目の
// 目安時刻を「前の項目の時刻 + 滞在時間 + 移動バッファ」で連鎖的に組み直す
const DEFAULT_DURATION_MIN = 30;
const TRAVEL_BUFFER_MIN = 15;

function timeToMinutes(t?: string | null): number | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

function minutesToTime(mins: number): string {
  const wrapped = ((mins % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// fromIndex 以降の time を、直前の項目（fromIndex-1）の時刻+滞在時間+移動バッファを
// 起点に連鎖的に再計算する。起点の時刻が分からない場合は何もしない（既存の値を尊重）
export function recalcTimesFrom(itinerary: Itinerary, dayIndex: number, fromIndex: number) {
  const items = itinerary.days[dayIndex]?.items;
  if (!items || fromIndex >= items.length) return;

  let cursor: number | null;
  if (fromIndex === 0) {
    cursor = timeToMinutes(items[0].time);
    if (cursor == null) return;
  } else {
    const prev = items[fromIndex - 1];
    const prevStart = timeToMinutes(prev.time);
    if (prevStart == null) return;
    cursor = prevStart + (prev.durationMin ?? DEFAULT_DURATION_MIN) + TRAVEL_BUFFER_MIN;
  }

  for (let i = fromIndex; i < items.length; i++) {
    items[i].time = minutesToTime(cursor);
    cursor += (items[i].durationMin ?? DEFAULT_DURATION_MIN) + TRAVEL_BUFFER_MIN;
  }
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

// 地図編集モード: Google Places で確認済みの場所を追加し、以降の時刻を連鎖再計算する
export function withAddedResolvedItem(
  itinerary: Itinerary,
  dayIndex: number,
  place: { name: string; address: string; lat: number; lng: number },
  time?: string,
  durationMin?: number,
  insertIndex?: number
): Itinerary {
  const next = structuredClone(itinerary);
  const items = next.days[dayIndex]?.items;
  if (!items) return next;
  const at = Math.max(0, Math.min(insertIndex ?? items.length, items.length));
  items.splice(at, 0, buildResolvedItem(place, time, durationMin, next, dayIndex, at));
  const after = nextSpotIndex(items, at + 1);
  if (after >= 0) relinkItem(next, dayIndex, after);
  // 挿入した項目自身の時刻から連鎖再計算する（ユーザーが time を指定していれば尊重されず
  // 上書きされる点に注意。手動時刻指定より一貫性のある連鎖計算を優先する）
  recalcTimesFrom(next, dayIndex, at);
  return next;
}

// 地図編集モード: 隣接項目と入れ替える（「交代」）。経路リンクと時刻を組み直す
export function withMovedItem(
  itinerary: Itinerary,
  dayIndex: number,
  index: number,
  direction: -1 | 1
): Itinerary {
  const next = structuredClone(itinerary);
  const items = next.days[dayIndex]?.items;
  if (!items) return next;
  const target = index + direction;
  if (target < 0 || target >= items.length) return next;
  [items[index], items[target]] = [items[target], items[index]];
  const from = Math.min(index, target);
  const firstSpot = nextSpotIndex(items, from);
  if (firstSpot >= 0) relinkItem(next, dayIndex, firstSpot);
  const secondSpot = nextSpotIndex(items, firstSpot + 1);
  if (secondSpot >= 0) relinkItem(next, dayIndex, secondSpot);
  recalcTimesFrom(next, dayIndex, from);
  return next;
}

// 地図編集モード: 滞在時間を変更し、以降の時刻を連鎖再計算する
export function withUpdatedDuration(
  itinerary: Itinerary,
  dayIndex: number,
  itemIndex: number,
  durationMin: number | null
): Itinerary {
  const next = structuredClone(itinerary);
  const item = next.days[dayIndex]?.items[itemIndex];
  if (!item) return next;
  item.durationMin = durationMin;
  recalcTimesFrom(next, dayIndex, itemIndex + 1);
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
