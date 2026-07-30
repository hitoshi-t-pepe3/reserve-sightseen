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
from app.tools.route_sharing import route_sharing_manager

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


@router.post("/route/share", tags=["route"])
async def share_route(route_data: dict) -> dict:
    """
    ルート情報をシェア可能な URL に変換する。

    Request:
    - route_data: ルート情報（title, mode, transport, days など）

    Response:
    - share_id: シェア ID（Base64 エンコード済み）
    - share_url: シェア可能な URL
    """
    try:
        share_id = route_sharing_manager.encode_route(route_data)
        share_url = route_sharing_manager.generate_share_url(route_data)
        return {
            "share_id": share_id,
            "share_url": share_url,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Share error: {str(e)}")


@router.get("/route/restore/{share_id}", tags=["route"])
async def restore_route(share_id: str) -> dict:
    """
    シェア ID からルート情報を復元する。

    Parameters:
    - share_id: シェア ID（URL パスから取得）

    Response:
    - route_data: 復元されたルート情報
    """
    try:
        route_data = route_sharing_manager.decode_route(share_id)
        if not route_data:
            raise HTTPException(status_code=404, detail="Route not found")
        return route_data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Restore error: {str(e)}")
