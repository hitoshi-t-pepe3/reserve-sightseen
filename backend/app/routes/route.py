from fastapi import APIRouter, HTTPException
from app.tools.route_optimizer import (
    RouteOptimizer,
    OptimizeRouteRequest,
    OptimizeRouteResponse,
    route_optimizer,
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
    """
    try:
        return route_optimizer.optimize_route(request)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Route optimization error: {str(e)}")
