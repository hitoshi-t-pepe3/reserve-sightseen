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

export function trackAffiliateClick(
  affiliate: AffiliateSource,
  params?: EventParams
) {
  trackEvent("affiliate_click", { affiliate, ...params });
}
