// 最小限の Service Worker。
// PWA インストール要件を満たすためのもので、キャッシュ戦略は持たない
// （fetch に respondWith を使わないため、全リクエストは通常どおりネットワークへ流れる。
//  下手にキャッシュすると Next.js のビルド資産が古いまま残る事故が起きやすい）。
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // パススルー（インターセプトしない）
});
