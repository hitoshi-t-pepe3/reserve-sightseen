from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional
from app.tools.google_places import google_places_tool, PlaceSearchParams

router = APIRouter(prefix="/places", tags=["places"])


class PlaceSearchRequest(BaseModel):
    query: str
    location: Optional[str] = None
    radius: int = 5000
    type: Optional[str] = None


@router.get("/search")
async def search_places_search_places(
    query: str = Query(..., description="検索クエリ"),
    location: Optional[str] = Query(None, description="中心地点 lat,lng"),
    radius: int = Query(5000, description="検索半径"),
    type: Optional[str] = Query(None, description="場所タイプ"),
):
    """Google Places で場所を検索"""
    try:
        params = PlaceSearchParams(
            query=query,
            location=location,
            radius=radius,
            type_=type,
        )
        results = google_places_tool.search_places(params)
        return {"results": [r.model_dump() for r in results]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/tourist-spots")
async def search_tourist_spots(
    area: str = Query(..., description="エリア名（例: 京都, 東京, 沖縄）"),
    radius: int = Query(10000, description="検索半径"),
):
    """観光スポットを検索"""
    try:
        results = google_places_tool.search_tourist_spots(area, radius)
        return {"results": [r.model_dump() for r in results]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/restaurants")
async def search_restaurants(
    area: str = Query(..., description="エリア名"),
    cuisine: Optional[str] = Query(None, description="料理ジャンル"),
    radius: int = Query(5000, description="検索半径"),
):
    """飲食店を検索"""
    try:
        results = google_places_tool.search_restaurants(area, cuisine, radius)
        return {"results": [r.model_dump() for r in results]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/hotels")
async def search_hotels(
    area: str = Query(..., description="エリア名"),
    radius: int = Query(10000, description="検索半径"),
):
    """宿泊施設を検索"""
    try:
        results = google_places_tool.search_hotels(area, radius)
        return {"results": [r.model_dump() for r in results]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/details/{place_id}")
async def get_place_details(place_id: str):
    """Place ID から詳細情報を取得"""
    try:
        result = google_places_tool.get_place_details(place_id)
        if not result:
            raise HTTPException(status_code=404, detail="Place not found")
        return result.model_dump()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))