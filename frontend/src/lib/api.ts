const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'https://faction-scavenger-late.ngrok-free.dev';

export interface HotelBasicInfo {
  hotelNo: number;
  hotelName: string;
  hotelInformationUrl: string;
  planListUrl: string;
  hotelMinCharge: number;
  latitude: number;
  longitude: number;
  address1: string;
  address2: string;
  hotelThumbnailUrl?: string;
  hotelImageUrl?: string;
  // 部屋の写真（楽天APIのレスポンスにそのまま含まれる。ホテル外観と別カットのため
  // 画像スライドの2枚目として使う）
  roomImageUrl?: string;
  reviewCount?: number;
  reviewAverage?: number;
  hotelSpecial?: string;
  nearestStation?: string;
  access?: string;
  parkingInformation?: string;
  // 実勢最安値（限定特典プラン除く）の付随情報。バックエンドで空室検索APIから算出される。
  hotelMinChargePlanName?: string;
  hotelMinChargeRestrictedExcluded?: boolean;
  // true の場合、空室として取得できたのが年齢/記念日限定等の特典プランのみで
  // hotelMinCharge は一般ユーザー向けの実勢価格ではないことを示す。
  hotelMinChargeRestrictedOnly?: boolean;
  hotelMinChargeUnavailable?: boolean;
  // じゃらんnet の同名ホテル検索ページ（価格比較用・バックエンドで生成）
  jalanSearchUrl?: string;
}

export interface HotelRatingInfo {
  serviceAverage?: number;
  locationAverage?: number;
  roomAverage?: number;
  equipmentAverage?: number;
  bathAverage?: number;
  mealAverage?: number;
}

export interface HotelSearchResult {
  hotelBasicInfo: HotelBasicInfo;
  hotelRatingInfo?: HotelRatingInfo;
}

export interface RoomBasicInfo {
  roomNo: number;
  roomName: string;
  roomBasicCharge: number;
  capacity: number;
  roomImageUrl?: string;
  mealInfo?: string;
  cancelPolicy?: string;
}

export interface HotelSearchResponse {
  hotels: HotelSearchResult[];
  count: number;
}

export interface VacancyResponse {
  hotel_no: number;
  plans: RoomBasicInfo[];
  count: number;
}

export type HotelSortBy = 'price_asc' | 'price_desc' | 'rating';

export async function searchHotelsByArea(
  area: string,
  checkin?: string,
  checkout?: string,
  adults: number = 2,
  rooms: number = 1,
  hits: number = 20,
  sortBy: HotelSortBy = 'price_asc'
): Promise<HotelSearchResponse> {
  const params = new URLSearchParams({
    area,
    adults: String(adults),
    rooms: String(rooms),
    hits: String(hits),
    sort_by: sortBy,
  });
  if (checkin) params.append('checkin', checkin);
  if (checkout) params.append('checkout', checkout);

  const res = await fetch(`${API_BASE}/api/hotels/search-area?${params}`, {
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`Search failed: ${res.status}`);
  return res.json();
}

export async function searchHotelsByLocation(
  lat: number,
  lng: number,
  radius: number = 3.0,
  checkin?: string,
  checkout?: string,
  adults: number = 2,
  rooms: number = 1,
  hits: number = 20
): Promise<HotelSearchResponse> {
  const params = new URLSearchParams({
    lat: String(lat),
    lng: String(lng),
    radius: String(radius),
    adults: String(adults),
    rooms: String(rooms),
    hits: String(hits),
  });
  if (checkin) params.append('checkin', checkin);
  if (checkout) params.append('checkout', checkout);

  const res = await fetch(`${API_BASE}/api/hotels/search-location?${params}`, {
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`Search failed: ${res.status}`);
  return res.json();
}

export interface SearchContext {
  area?: string;
  checkin?: string;
  checkout?: string;
  adults?: number;
}

export interface ItineraryItem {
  time?: string | null;
  name: string;
  category: 'spot' | 'meal' | 'hotel' | 'move';
  description?: string | null;
  durationMin?: number | null;
  mapUrl?: string;
  // Google マップ経路リンク。散歩・ドライブは現在地起点、旅行プランは直前の地点起点
  navUrl?: string;
  // 散歩・ドライブでの「直前の地点から」の経路リンク（2箇所目以降）
  prevNavUrl?: string;
  // スポットの座標（周辺チャットの geohash チャンネル用。ツール結果から引き継ぐ）
  lat?: number | null;
  lng?: number | null;
}

export interface ItineraryDay {
  label: string;
  items: ItineraryItem[];
}

export type Transport = 'train' | 'bus' | 'car' | 'plane';

export interface Itinerary {
  title: string;
  mode: 'walk' | 'drive' | 'travel';
  // 旅行の主な移動手段（経路リンクの種類に反映される）
  transport?: Transport | null;
  // チケット予約導線（バス=楽天トラベル高速バス、飛行機=楽パック。アフィリエイトリンク）
  booking?: { label: string; url: string } | null;
  days: ItineraryDay[];
}

export interface ChatApiResponse {
  response: string;
  hotels: HotelSearchResult[];
  search_context?: SearchContext | null;
  itinerary?: Itinerary | null;
}

export async function sendChatMessage(
  message: string,
  conversationHistory: { role: string; content: string }[],
  userLocation?: { lat: number; lng: number } | null,
  transport?: Transport | null
): Promise<ChatApiResponse> {
  const res = await fetch(`${API_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      conversation_history: conversationHistory,
      ...(userLocation ? { user_location: userLocation } : {}),
      ...(transport ? { transport } : {}),
    }),
  });
  if (!res.ok) throw new Error(`API Error: ${res.status}`);
  return res.json();
}

// 楽天トラベルの予約ページURLに宿泊日・人数をプリセットする。
// planListUrl はアフィリエイトリンク（?pc=<エンコード済み実URL>）形式で、
// pc 内の f_* パラメータはリダイレクト先のプラン一覧ページまで引き継がれる（確認済み）。
export function buildReserveUrl(
  planListUrl: string | undefined,
  checkin?: string,
  checkout?: string,
  adults: number = 2,
  rooms: number = 1
): string | undefined {
  if (!planListUrl) return undefined;
  if (!checkin || !checkout) return planListUrl;

  const [y1, m1, d1] = checkin.split('-').map(Number);
  const [y2, m2, d2] = checkout.split('-').map(Number);
  if (!y1 || !m1 || !d1 || !y2 || !m2 || !d2) return planListUrl;

  try {
    const url = new URL(planListUrl);
    const pc = url.searchParams.get('pc');
    if (pc) {
      // pc は URL エンコード済みの文字列。デコードしてパラメータを追加し、再度エンコード
      const decodedPc = decodeURIComponent(pc);
      const params = new URLSearchParams(decodedPc);
      params.set('f_nen1', String(y1));
      params.set('f_tuki1', String(m1));
      params.set('f_hi1', String(d1));
      params.set('f_nen2', String(y2));
      params.set('f_tuki2', String(m2));
      params.set('f_hi2', String(d2));
      params.set('f_otona_su', String(adults));
      params.set('f_heya_su', String(rooms));
      url.searchParams.set('pc', params.toString());
      return url.toString();
    }
    return planListUrl;
  } catch {
    return planListUrl;
  }
}

export async function getHotelVacancy(
  hotelNo: number,
  checkin: string,
  checkout: string,
  adults: number = 2,
  rooms: number = 1
): Promise<VacancyResponse> {
  const params = new URLSearchParams({
    checkin,
    checkout,
    adults: String(adults),
    rooms: String(rooms),
  });
  const res = await fetch(`${API_BASE}/api/hotels/vacancy/${hotelNo}?${params}`, {
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`Vacancy failed: ${res.status}`);
  return res.json();
}

// Google Places 検索結果（バックエンドは snake_case のまま返す）
export interface PlaceSearchResult {
  place_id: string;
  name: string;
  address: string;
  location: { lat: number; lng: number };
  rating?: number | null;
  user_ratings_total?: number | null;
}

// 工程の地図編集モードで「目的地を検索して座標を確認してから追加する」ために使う
export async function searchPlaces(
  query: string,
  near?: { lat: number; lng: number }
): Promise<PlaceSearchResult[]> {
  const params = new URLSearchParams({ query });
  if (near) params.append('location', `${near.lat},${near.lng}`);
  const res = await fetch(`${API_BASE}/api/places/search?${params}`);
  if (!res.ok) throw new Error(`Place search failed: ${res.status}`);
  const data = await res.json();
  return data.results || [];
}