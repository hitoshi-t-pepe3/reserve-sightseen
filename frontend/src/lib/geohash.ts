// ジオハッシュのエンコーダ（座標 → geohash）。
// 周辺チャットのチャンネルIDに使う。精度6文字 ≒ 1.2km × 0.6km のブロック。
const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

export function encodeGeohash(lat: number, lng: number, precision = 6): string {
  let minLat = -90,
    maxLat = 90,
    minLng = -180,
    maxLng = 180;
  let hash = "";
  let bits = 0;
  let bit = 0;
  let evenBit = true; // 経度から始める

  while (hash.length < precision) {
    if (evenBit) {
      const mid = (minLng + maxLng) / 2;
      if (lng >= mid) {
        bits = (bits << 1) | 1;
        minLng = mid;
      } else {
        bits = bits << 1;
        maxLng = mid;
      }
    } else {
      const mid = (minLat + maxLat) / 2;
      if (lat >= mid) {
        bits = (bits << 1) | 1;
        minLat = mid;
      } else {
        bits = bits << 1;
        maxLat = mid;
      }
    }
    evenBit = !evenBit;
    if (++bit === 5) {
      hash += BASE32[bits];
      bit = 0;
      bits = 0;
    }
  }
  return hash;
}
