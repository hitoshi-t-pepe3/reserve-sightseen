from typing import Optional, Literal
from pydantic import BaseModel, Field
from googlemaps import Client as GoogleMapsClient
from app.config import settings


class Location(BaseModel):
    name: str = Field(..., description="地点名")
    lat: float = Field(..., description="緯度")
    lng: float = Field(..., description="経度")


class OptimizeRouteRequest(BaseModel):
    origin: Location = Field(..., description="出発地点")
    waypoints: list[Location] = Field(..., description="経由地点リスト")
    destination: Optional[Location] = Field(None, description="到着地点（省略時はorigin）")


class OptimizedWaypoint(BaseModel):
    name: str
    lat: float
    lng: float
    order: int
    distance_from_prev_km: float
    duration_from_prev_minutes: int
    description: Optional[str] = None  # ルートの説明（例：「清水寺方面へ」）


class OptimizeRouteResponse(BaseModel):
    optimized_order: list[OptimizedWaypoint]
    total_distance_km: float
    total_duration_minutes: int
    route_summary: Optional[str] = None  # ルート全体の説明（例：「京都東山エリアを効率的に巡ります」）
    recommended_transport: Optional[str] = None  # 推奨交通手段（例：「徒歩と電車」）


class RouteOptimizer:
    def __init__(self):
        self.client = GoogleMapsClient(key=settings.google_places_api_key)

    def calculate_distances(self, locations: list[tuple[float, float]]) -> dict:
        """Distance Matrix API で複数地点間の距離・時間を計算"""
        if len(locations) < 2:
            return {}

        try:
            response = self.client.distance_matrix(
                origins=locations[0:1],
                destinations=locations[1:],
                mode="walking",
                language="ja"
            )

            distances = {}
            rows = response.get("rows", [])
            if rows:
                elements = rows[0].get("elements", [])
                for i, element in enumerate(elements):
                    if element.get("status") == "OK":
                        distance_text = element.get("distance", {}).get("text", "")
                        distance_value = element.get("distance", {}).get("value", 0)  # メートル
                        duration_value = element.get("duration", {}).get("value", 0)  # 秒
                        distances[i + 1] = {
                            "distance_m": distance_value,
                            "distance_km": distance_value / 1000,
                            "distance_text": distance_text,
                            "duration_sec": duration_value,
                            "duration_min": duration_value // 60,
                        }
            return distances
        except Exception as e:
            raise Exception(f"Distance Matrix API error: {str(e)}")

    def optimize_route(self, request: OptimizeRouteRequest) -> OptimizeRouteResponse:
        """貪欲法でルートを最適化"""
        if not request.waypoints:
            return OptimizeRouteResponse(optimized_order=[], total_distance_km=0, total_duration_minutes=0)

        destination = request.destination or request.origin

        # 全地点を座標リストに
        locations = [(request.origin.lat, request.origin.lng)]
        waypoint_map = {0: request.origin}

        for i, wp in enumerate(request.waypoints, 1):
            locations.append((wp.lat, wp.lng))
            waypoint_map[i] = wp

        # 貪欲法: 出発地から最も近い地点を訪問、以降最も近い未訪問地点を訪問
        visited = {0}  # 出発地はすでに訪問
        current_idx = 0
        optimized_indices = []
        total_distance_km = 0
        total_duration_minutes = 0

        while len(visited) < len(waypoint_map):
            # 現在位置から全未訪問地点への距離を取得
            distances = self.calculate_distances([locations[current_idx]] + [locations[j] for j in range(1, len(locations)) if j not in visited])

            if not distances:
                break

            # 最も近い未訪問地点を選択
            min_distance = float("inf")
            next_idx = None
            relative_idx = 0

            for rel_idx, (abs_idx) in enumerate([j for j in range(1, len(locations)) if j not in visited], 1):
                if rel_idx in distances and distances[rel_idx]["distance_m"] < min_distance:
                    min_distance = distances[rel_idx]["distance_m"]
                    next_idx = abs_idx
                    relative_idx = rel_idx

            if next_idx is None:
                break

            visited.add(next_idx)
            optimized_indices.append(next_idx)

            if relative_idx in distances:
                total_distance_km += distances[relative_idx]["distance_km"]
                total_duration_minutes += distances[relative_idx]["duration_min"]

            current_idx = next_idx

        # 最後に帰路（最後の地点 → 目的地）
        if optimized_indices and destination != request.origin:
            last_loc = locations[optimized_indices[-1]]
            dest_loc = (destination.lat, destination.lng)
            return_distances = self.calculate_distances([last_loc, dest_loc])
            if 1 in return_distances:
                total_distance_km += return_distances[1]["distance_km"]
                total_duration_minutes += return_distances[1]["duration_min"]

        # 結果を構築
        optimized_waypoints = []
        prev_loc = locations[0]
        for order, idx in enumerate(optimized_indices, 1):
            wp = waypoint_map[idx]
            dist_data = self.calculate_distances([prev_loc, (wp.lat, wp.lng)])
            distance_km = dist_data[1]["distance_km"] if 1 in dist_data else 0
            duration_min = dist_data[1]["duration_min"] if 1 in dist_data else 0

            optimized_waypoints.append(OptimizedWaypoint(
                name=wp.name,
                lat=wp.lat,
                lng=wp.lng,
                order=order,
                distance_from_prev_km=round(distance_km, 2),
                duration_from_prev_minutes=int(duration_min),
            ))
            prev_loc = (wp.lat, wp.lng)

        # ルート説明文と推奨交通手段を生成
        route_summary = self._generate_route_summary(request.origin.name, optimized_waypoints, total_distance_km)
        recommended_transport = self._generate_recommended_transport(total_distance_km, len(optimized_waypoints))

        return OptimizeRouteResponse(
            optimized_order=optimized_waypoints,
            total_distance_km=round(total_distance_km, 2),
            total_duration_minutes=int(total_duration_minutes),
            route_summary=route_summary,
            recommended_transport=recommended_transport,
        )

    def _generate_route_summary(self, origin_name: str, waypoints: list[OptimizedWaypoint], total_distance_km: float) -> str:
        """ルート全体の説明文を生成"""
        if not waypoints:
            return ""

        place_names = [wp.name for wp in waypoints[:3]]  # 最初の3つまで
        if len(waypoints) > 3:
            place_names.append(f"など{len(waypoints)}箇所")

        places_text = "・".join(place_names)
        distance_text = f"総距離約{total_distance_km}km" if total_distance_km > 0 else ""

        return f"{places_text}を効率的に巡ります。{distance_text}"

    def _generate_recommended_transport(self, total_distance_km: float, num_waypoints: int) -> str:
        """推奨交通手段を生成"""
        if total_distance_km <= 5:
            return "徒歩"
        elif total_distance_km <= 15:
            return "徒歩と電車"
        elif total_distance_km <= 30:
            return "電車とバス"
        else:
            return "電車"


# シングルトンインスタンス
route_optimizer = RouteOptimizer()
