from typing import Optional, List
from pydantic import BaseModel, Field
from app.tools.google_places import google_places_tool, PlaceResult


class Location(BaseModel):
    lat: float
    lng: float


class RecommendationRequest(BaseModel):
    route_waypoints: List[Location] = Field(..., description="ルートの経由地点リスト")
    keywords: Optional[List[str]] = Field(
        default=["飲食店", "レストラン", "カフェ", "お土産"],
        description="検索キーワード（例：飲食店、お土産屋、カフェ）"
    )
    radius_m: int = Field(default=500, description="各地点周辺の検索半径（メートル）", ge=100, le=5000)
    limit_per_location: int = Field(default=3, description="各地点ごとの推奨数", ge=1, le=10)


class RecommendedPlace(BaseModel):
    name: str
    category: str  # restaurant, shop, cafe など
    lat: float
    lng: float
    rating: Optional[float] = None
    address: str
    distance_from_route_m: float  # ルート上の地点からの距離
    nearest_waypoint_name: str  # 最も近い経由地点の名前


class RouteRecommendationsResponse(BaseModel):
    recommendations: List[RecommendedPlace]
    summary: str  # 推奨スポットの要約


class RouteRecommender:
    def __init__(self):
        self.places_tool = google_places_tool

    def get_recommendations(self, request: RecommendationRequest) -> RouteRecommendationsResponse:
        """ルート上の立ち寄りスポット推奨を取得"""
        recommendations: List[RecommendedPlace] = []

        # 各ルートポイント周辺で検索
        for i, waypoint in enumerate(request.route_waypoints):
            for keyword in request.keywords:
                try:
                    # 周辺スポットを検索
                    results = self.places_tool.search_nearby(
                        lat=waypoint.lat,
                        lng=waypoint.lng,
                        radius=request.radius_m,
                        keyword=keyword,
                        language="ja"
                    )

                    # 上位のみを採用
                    for result in results[: request.limit_per_location]:
                        rec = RecommendedPlace(
                            name=result.name,
                            category=self._categorize(keyword, result.types),
                            lat=result.location["lat"],
                            lng=result.location["lng"],
                            rating=result.rating,
                            address=result.address,
                            distance_from_route_m=0,  # 簡略化（後で計算可能）
                            nearest_waypoint_name=f"地点{i+1}",
                        )
                        # 重複排除（同じ名前のスポットは追加しない）
                        if not any(r.name == rec.name for r in recommendations):
                            recommendations.append(rec)

                except Exception as e:
                    # 検索エラー時はスキップ
                    print(f"Recommendation search error for '{keyword}': {e}")
                    continue

        # 評価でソート
        recommendations.sort(key=lambda r: (r.rating or 0), reverse=True)
        recommendations = recommendations[: len(request.route_waypoints) * request.limit_per_location]

        # サマリーを生成
        summary = self._generate_summary(recommendations)

        return RouteRecommendationsResponse(
            recommendations=recommendations,
            summary=summary,
        )

    def _categorize(self, keyword: str, place_types: List[str]) -> str:
        """プレイスタイプからカテゴリを判定"""
        if "restaurant" in place_types or "food" in place_types:
            return "restaurant"
        elif "cafe" in place_types:
            return "cafe"
        elif "shopping" in place_types or "store" in place_types:
            return "shop"
        elif "bar" in place_types or "night_club" in place_types:
            return "bar"
        else:
            return keyword

    def _generate_summary(self, recommendations: List[RecommendedPlace]) -> str:
        """推奨スポットのサマリーを生成"""
        if not recommendations:
            return "このルート周辺に立ち寄りスポットが見つかりませんでした。"

        # カテゴリごとにカウント
        categories = {}
        for rec in recommendations:
            categories[rec.category] = categories.get(rec.category, 0) + 1

        category_text = "・".join([f"{cat}({count})" for cat, count in list(categories.items())[:3]])
        return f"ルート沿いにおすすめのスポット：{category_text}"


# シングルトンインスタンス
route_recommender = RouteRecommender()
