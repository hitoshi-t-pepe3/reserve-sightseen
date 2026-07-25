export const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID;

type EventParams = Record<string, string | number | boolean | undefined>;

declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[];
  }
}

export function trackEvent(event: string, params?: EventParams) {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event, ...params });
}

export type AffiliateSource = "rakuten" | "jalan" | "nippon_travel";

interface HotelItemData {
  item_id?: string;
  item_name?: string;
  affiliation?: string;
  currency?: string;
  value?: number;
}

// ホテルをGA4 ecommerce itemとしてトラッキング
export function trackHotelView(hotelData: HotelItemData) {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer || [];

  window.dataLayer.push({
    event: "view_item",
    ecommerce: {
      items: [
        {
          item_id: hotelData.item_id || "",
          item_name: hotelData.item_name || "",
          affiliation: hotelData.affiliation,
          currency: hotelData.currency || "JPY",
          value: hotelData.value,
        },
      ],
    },
  });
}

// アフィリエイトクリック追跡（GA4 add_to_cart + custom event）
export function trackAffiliateClick(
  affiliate: AffiliateSource,
  params?: EventParams & { hotel_name?: string; price?: number; hotel_id?: string }
) {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer || [];

  // GA4 ecommerce event: add_to_cart（予約クリックを「カートに追加」として計測）
  window.dataLayer.push({
    event: "add_to_cart",
    ecommerce: {
      items: [
        {
          item_id: params?.hotel_id || "",
          item_name: params?.hotel_name || "",
          affiliation: affiliate,
          currency: "JPY",
          value: params?.price,
          quantity: 1,
        },
      ],
    },
  });

  // Custom event for affiliate-specific tracking
  trackEvent("affiliate_click", { affiliate, ...params });
}

// 予約完了（ラッピングHTML埋め込み用・Rakuten等のreferrer確認で判定）
export function trackBookingClick(
  affiliate: AffiliateSource,
  hotelData: HotelItemData
) {
  if (typeof window === "undefined") return;

  trackAffiliateClick(affiliate, {
    hotel_name: hotelData.item_name,
    hotel_id: hotelData.item_id,
    price: hotelData.value,
    surface: "booking",
  });
}
