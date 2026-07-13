// Bitchat と同じリレー選択: permissionlesstech/georelays の CSV から
// チャンネル座標に地理的に近いリレーを選ぶ。
// kind 20000（ephemeral）はリレー間で保存・転送されないため、
// Bitchat ユーザーと同じリレーに繋がないとメッセージが届かない。
const CSV_URL =
  "https://raw.githubusercontent.com/permissionlesstech/georelays/refs/heads/main/nostr_relays.csv";

export const FALLBACK_RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.snort.social",
];

interface RelayEntry {
  host: string;
  lat: number;
  lng: number;
}

let directory: Promise<RelayEntry[]> | null = null;

function parseCsv(text: string): RelayEntry[] {
  return text
    .split("\n")
    .slice(1) // ヘッダー行
    .map((line) => {
      const [host, lat, lng] = line.split(",");
      return { host: (host || "").trim(), lat: parseFloat(lat), lng: parseFloat(lng) };
    })
    .filter((e) => e.host && Number.isFinite(e.lat) && Number.isFinite(e.lng));
}

function loadDirectory(): Promise<RelayEntry[]> {
  if (!directory) {
    directory = fetch(CSV_URL)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then(parseCsv)
      .catch(() => {
        directory = null; // 次回リトライできるように
        return [];
      });
  }
  return directory;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

// チャンネル座標に近い順に最大 count 件のリレーURLを返す（Bitchat と同じ考え方）。
// ディレクトリが取れないときは大手リレーにフォールバック
export async function relaysNear(lat: number, lng: number, count = 5): Promise<string[]> {
  const entries = await loadDirectory();
  if (entries.length === 0) return FALLBACK_RELAYS;
  return entries
    .map((e) => ({ url: `wss://${e.host}`, d: haversineKm(lat, lng, e.lat, e.lng) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, count)
    .map((e) => e.url);
}
