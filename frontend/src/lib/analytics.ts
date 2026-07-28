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

export interface HotelItemData {
  item_id: string;
  item_name: string;
  affiliation: string;
  currency: string;
  value?: number;
}

export function trackHotelView(data: HotelItemData) {
  trackEvent("view_item", data as unknown as EventParams);
}

export function trackAffiliateClick(
  affiliate: AffiliateSource,
  params?: EventParams
) {
  trackEvent("affiliate_click", { affiliate, ...params });
}

export function trackBookingClick(params?: EventParams) {
  trackEvent("booking_click", params);
}
