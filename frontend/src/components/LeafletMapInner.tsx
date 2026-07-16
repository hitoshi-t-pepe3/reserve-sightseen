"use client";

import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { useEffect } from "react";
import { ItineraryItem } from "@/lib/api";

// デフォルトのマーカー画像はバンドラでパスが壊れやすいため、
// 番号付きの divIcon を自前で作る（アイコン画像アセット不要）
function numberedIcon(n: number, color = "#2563eb") {
  return L.divIcon({
    html: `<div style="background:${color};color:white;border-radius:50%;width:26px;height:26px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.4)">${n}</div>`,
    className: "",
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

function currentLocationIcon() {
  return L.divIcon({
    html: `<div style="background:#16a34a;border-radius:50%;width:16px;height:16px;border:3px solid white;box-shadow:0 0 0 2px #16a34a"></div>`,
    className: "",
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 15);
    } else {
      map.fitBounds(points, { padding: [30, 30] });
    }
  }, [points, map]);
  return null;
}

interface LeafletMapInnerProps {
  items: ItineraryItem[];
  currentLocation: { lat: number; lng: number } | null;
}

// 東京駅（座標がまだ1件もないときの仮の初期表示位置）
const FALLBACK_CENTER: [number, number] = [35.681236, 139.767125];

export default function LeafletMapInner({ items, currentLocation }: LeafletMapInnerProps) {
  const spots = items
    .map((it, i) => ({ item: it, index: i }))
    .filter((x): x is { item: ItineraryItem & { lat: number; lng: number }; index: number } =>
      x.item.lat != null && x.item.lng != null
    );

  const points: [number, number][] = [
    ...spots.map((s) => [s.item.lat, s.item.lng] as [number, number]),
    ...(currentLocation ? [[currentLocation.lat, currentLocation.lng] as [number, number]] : []),
  ];

  return (
    <MapContainer center={points[0] ?? FALLBACK_CENTER} zoom={13} style={{ height: "100%", width: "100%" }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {spots.map((s, orderIndex) => (
        <Marker key={s.index} position={[s.item.lat, s.item.lng]} icon={numberedIcon(orderIndex + 1)}>
          <Popup>{s.item.name}</Popup>
        </Marker>
      ))}
      {currentLocation && (
        <Marker position={[currentLocation.lat, currentLocation.lng]} icon={currentLocationIcon()}>
          <Popup>現在地</Popup>
        </Marker>
      )}
      <FitBounds points={points} />
    </MapContainer>
  );
}
