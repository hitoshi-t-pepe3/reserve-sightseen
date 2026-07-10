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

export async function searchHotelsByArea(
  area: string,
  checkin?: string,
  checkout?: string,
  adults: number = 2,
  rooms: number = 1,
  hits: number = 20
): Promise<HotelSearchResponse> {
  const params = new URLSearchParams({
    area,
    adults: String(adults),
    rooms: String(rooms),
    hits: String(hits),
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