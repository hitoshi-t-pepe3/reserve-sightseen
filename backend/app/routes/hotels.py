from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from app.tools.rakuten_travel import (
    rakuten_travel_tool,
    RakutenHotelSearchParams,
    RakutenVacantSearchParams,
)

router = APIRouter(prefix="/hotels", tags=["hotels"])


@router.get("/search")
async def search_hotels(
    keyword: Optional[str] = Query(None, description="キーワード"),
    large_class_code: Optional[str] = Query(None, description="大区分コード"),
    middle_class_code: Optional[str] = Query(None, description="中区分コード"),
    small_class_code: Optional[str] = Query(None, description="小区分コード"),
    detail_class_code: Optional[str] = Query(None, description="細区分コード"),
    hotel_no: Optional[str] = Query(None, description="施設番号"),
    latitude: Optional[float] = Query(None, description="緯度"),
    longitude: Optional[float] = Query(None, description="経度"),
    search_radius: float = Query(3.0, description="検索半径km"),
    datum_type: int = Query(1, description="測地系 1:世界測地系"),
    checkin_date: Optional[str] = Query(None, description="チェックイン日 YYYY-MM-DD"),
    checkout_date: Optional[str] = Query(None, description="チェックアウト日 YYYY-MM-DD"),
    adult_num: int = Query(2, description="大人人数"),
    children_num: int = Query(0, description="子供人数"),
    room_num: int = Query(1, description="部屋数"),
    min_charge: Optional[int] = Query(None, description="最低料金"),
    max_charge: Optional[int] = Query(None, description="最高料金"),
    sort: str = Query("+roomCharge", description="並び順"),
    hits: int = Query(20, description="取得件数"),
    page: int = Query(1, description="ページ番号"),
    response_type: str = Query("middle", description="レスポンスタイプ"),
    squeeze_condition: Optional[str] = Query(None, description="絞込条件"),
):
    """楽天トラベル施設検索API"""
    try:
        params = RakutenHotelSearchParams(
            keyword=keyword,
            large_class_code=large_class_code,
            middle_class_code=middle_class_code,
            small_class_code=small_class_code,
            detail_class_code=detail_class_code,
            hotel_no=hotel_no,
            latitude=latitude,
            longitude=longitude,
            search_radius=search_radius,
            datum_type=datum_type,
            checkin_date=checkin_date,
            checkout_date=checkout_date,
            adult_num=adult_num,
            children_num=children_num,
            room_num=room_num,
            min_charge=min_charge,
            max_charge=max_charge,
            sort=sort,
            hits=hits,
            page=page,
            squeeze_condition=squeeze_condition,
        )
        result = await rakuten_travel_tool.search_hotels(params)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/vacant")
async def search_vacant(
    hotel_no: str = Query(..., description="施設番号"),
    checkin_date: str = Query(..., description="チェックイン日 YYYY-MM-DD"),
    checkout_date: str = Query(..., description="チェックアウト日 YYYY-MM-DD"),
    adult_num: int = Query(2, description="大人人数"),
    children_num: int = Query(0, description="子供人数"),
    room_num: int = Query(1, description="部屋数"),
    min_charge: Optional[int] = Query(None, description="最低料金"),
    max_charge: Optional[int] = Query(None, description="最高料金"),
    sort: str = Query("+roomCharge", description="並び順"),
    hits: int = Query(20, description="取得件数"),
    page: int = Query(1, description="ページ番号"),
    response_type: str = Query("middle", description="レスポンスタイプ"),
):
    """楽天トラベル空室検索API"""
    try:
        params = RakutenVacantSearchParams(
            hotel_no=hotel_no,
            checkin_date=checkin_date,
            checkout_date=checkout_date,
            adult_num=adult_num,
            children_num=children_num,
            room_num=room_num,
            min_charge=min_charge,
            max_charge=max_charge,
            sort=sort,
            hits=hits,
            page=page,
            response_type=response_type,
        )
        result = await rakuten_travel_tool.search_vacant_hotels(params)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/search-area")
async def search_by_area(
    area: str = Query(..., description="エリア名（例: 京都, 沖縄, 東京ディズニーランド）"),
    checkin: Optional[str] = Query(None, description="チェックイン日"),
    checkout: Optional[str] = Query(None, description="チェックアウト日"),
    adults: int = Query(2, description="大人人数"),
    rooms: int = Query(1, description="部屋数"),
    hits: int = Query(20, description="取得件数"),
    use_realistic_price: bool = Query(
        True, description="施設検索APIの理論上最安値ではなく、空室検索APIから限定特典プランを除いた実勢最安値を取得する"
    ),
    realistic_price_limit: int = Query(10, description="実勢最安値を取得する上位件数（空室API呼び出し回数に直結するため上限あり）", le=20),
    sort_by: str = Query("price_asc", description="並び順: price_asc(安い順)/price_desc(高い順)/rating(評価優先)"),
):
    """エリア名でホテル検索。主要都市以外は Google Places で座標に解決して検索する"""
    try:
        try:
            hotels = await rakuten_travel_tool.search_by_area(
                area_name=area, checkin=checkin, checkout=checkout,
                adults=adults, rooms=rooms, hits=hits,
                use_realistic_price=use_realistic_price,
                realistic_price_limit=realistic_price_limit,
                sort_by=sort_by,
            )
        except ValueError:
            # 内部マップにないエリア名 → ジオコーディングにフォールバック
            import asyncio
            from app.tools.google_places import google_places_tool
            place = await asyncio.to_thread(google_places_tool.geocode_place, area)
            if not place:
                raise HTTPException(status_code=404, detail=f"場所を特定できませんでした: {area}")
            hotels = await rakuten_travel_tool.search_by_location(
                lat=place["lat"], lng=place["lng"], radius=3.0,
                checkin=checkin, checkout=checkout,
                adults=adults, rooms=rooms, hits=hits,
                use_realistic_price=use_realistic_price,
                realistic_price_limit=realistic_price_limit,
                sort_by=sort_by,
            )
        return {"hotels": hotels, "count": len(hotels)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/search-location")
async def search_by_location(
    lat: float = Query(..., description="緯度"),
    lng: float = Query(..., description="経度"),
    radius: float = Query(1.0, description="検索半径km"),
    checkin: Optional[str] = Query(None, description="チェックイン日"),
    checkout: Optional[str] = Query(None, description="チェックアウト日"),
    adults: int = Query(2, description="大人人数"),
    rooms: int = Query(1, description="部屋数"),
    hits: int = Query(20, description="取得件数"),
    use_realistic_price: bool = Query(
        True, description="施設検索APIの理論上最安値ではなく、空室検索APIから限定特典プランを除いた実勢最安値を取得する"
    ),
    realistic_price_limit: int = Query(10, description="実勢最安値を取得する上位件数（空室API呼び出し回数に直結するため上限あり）", le=20),
    sort_by: str = Query("price_asc", description="並び順: price_asc(安い順)/price_desc(高い順)/rating(評価優先)"),
):
    """緯度経度でホテル検索"""
    try:
        hotels = await rakuten_travel_tool.search_by_location(
            lat=lat, lng=lng, radius=radius, checkin=checkin, checkout=checkout,
            adults=adults, rooms=rooms, hits=hits,
            use_realistic_price=use_realistic_price,
            realistic_price_limit=realistic_price_limit,
            sort_by=sort_by,
        )
        return {"hotels": hotels, "count": len(hotels)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/vacancy/{hotel_no}")
async def get_vacancy(
    hotel_no: int,
    checkin: str = Query(..., description="チェックイン日 YYYY-MM-DD"),
    checkout: str = Query(..., description="チェックアウト日 YYYY-MM-DD"),
    adults: int = Query(2, description="大人人数"),
    rooms: int = Query(1, description="部屋数"),
):
    """特定ホテルの空室・プラン取得"""
    try:
        plans = await rakuten_travel_tool.get_vacancy(hotel_no, checkin, checkout, adults, rooms)
        return {"hotel_no": hotel_no, "plans": plans, "count": len(plans)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))