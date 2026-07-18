export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

type GtagEventParams = Record<string, string | number | boolean | undefined>;

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

export function trackEvent(action: string, params?: GtagEventParams) {
  if (typeof window === "undefined" || !window.gtag) return;
  window.gtag("event", action, params);
}

export type AffiliateSource = "rakuten" | "jalan" | "nippon_travel";

export function trackAffiliateClick(
  affiliate: AffiliateSource,
  params?: GtagEventParams
) {
  trackEvent("affiliate_click", { affiliate, ...params });
}
