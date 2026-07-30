from fastapi import APIRouter, HTTPException
from app.tools.route_optimizer import (
    RouteOptimizer,
    OptimizeRouteRequest,
    OptimizeRouteResponse,
    route_optimizer,
)
from app.tools.route_recommendations import (
    RecommendationRequest,
    RouteRecommendationsResponse,
    route_recommender,
)

router = APIRouter()


@router.post("/route/optimize", response_model=OptimizeRouteResponse, tags=["route"])
async def optimize_route(request: OptimizeRouteRequest) -> OptimizeRouteResponse:
    """
    複数地点を巡るルートを最適化する。

    貪欲法で、出発地から最も近い地点を最初に訪問し、
    以降は現在位置から最も近い未訪問地点を順に訪問するルートを提案。

    Request:
    - origin: 出発地点 (lat, lng, name)
    - waypoints: 経由地点リスト
    - destination: 到着地点（省略時はorigin。往復ルートの終点）

    Response:
    - optimized_order: 最適化順序のリスト（order番号付き）
    - total_distance_km: 総距離
    - total_duration_minutes: 総所要時間
    - route_summary: ルート全体の説明
    - recommended_transport: 推奨交通手段
    """
    try:
        return route_optimizer.optimize_route(request)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Route optimization error: {str(e)}")


@router.post("/route/recommendations", response_model=RouteRecommendationsResponse, tags=["route"])
async def get_route_recommendations(request: RecommendationRequest) -> RouteRecommendationsResponse:
    """
    ルート上の立ち寄りスポット推奨を取得する。

    Request:
    - route_waypoints: ルートの経由地点リスト (lat, lng)
    - keywords: 検索キーワード（デフォルト：飲食店、レストラン、カフェ、お土産）
    - radius_m: 各地点周辺の検索半径（デフォルト：500m）
    - limit_per_location: 各地点ごとの推奨数（デフォルト：3）

    Response:
    - recommendations: 推奨スポットリスト（評価順）
    - summary: 推奨スポットの要約
    """
    try:
        return route_recommender.get_recommendations(request)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Recommendations error: {str(e)}")
