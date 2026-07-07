from typing import Optional
from pydantic import BaseModel, Field
import httpx
from app.config import settings


class RakutenHotelSearchParams(BaseModel):
    """楽天トラベル施設検索API パラメータ (新プラットフォーム版)"""
    # いずれか必須: classcodes / hotelNo / lat+lng
    large_class_code: Optional[str] = Field(None, description="大区分コード")
    middle_class_code: Optional[str] = Field(None, description="中区分コード")
    small_class_code: Optional[str] = Field(None, description="小区分コード")
    detail_class_code: Optional[str] = Field(None, description="細区分コード")
    hotel_no: Optional[str] = Field(None, description="施設番号（カンマ区切りで最大15件）")
    latitude: Optional[float] = Field(None, description="緯度（世界測地系・度）", ge=-90, le=90)
    longitude: Optional[float] = Field(None, description="経度（世界測地系・度）", ge=-180, le=180)
    search_radius: float = Field(3.0, description="検索半径 0.1〜3.0km", ge=0.1, le=3.0)
    datum_type: int = Field(1, description="測地系 1:世界測地系（必須）")

    checkin_date: Optional[str] = Field(None, description="チェックイン日 YYYY-MM-DD")
    checkout_date: Optional[str] = Field(None, description="チェックアウト日 YYYY-MM-DD")
    adult_num: int = Field(2, description="大人人数", ge=1, le=9)
    children_num: int = Field(0, description="子供人数", ge=0, le=9)
    room_num: int = Field(1, description="部屋数", ge=1, le=9)
    min_charge: Optional[int] = Field(None, description="最低料金")
    max_charge: Optional[int] = Field(None, description="最高料金")
    sort: str = Field("+roomCharge", description="並び順: +roomCharge, -roomCharge, standard")
    hits: int = Field(30, description="1ページあたり取得件数 1〜30", ge=1, le=30)
    page: int = Field(1, description="ページ番号 1〜100", ge=1, le=100)
    squeeze_condition: Optional[str] = Field(None, description="絞込条件: kinen, onsen 等")


class RakutenVacantSearchParams(BaseModel):
    """楽天トラベル空室検索API パラメータ"""
    hotel_no: str = Field(..., description="施設番号（必須）")
    checkin_date: str = Field(..., description="チェックイン日 YYYY-MM-DD（必須）")
    checkout_date: str = Field(..., description="チェックアウト日 YYYY-MM-DD（必須）")
    adult_num: int = Field(2, description="大人人数", ge=1, le=9)
    children_num: int = Field(0, description="子供人数", ge=0, le=9)
    room_num: int = Field(1, description="部屋数", ge=1, le=9)
    min_charge: Optional[int] = Field(None, description="最低料金")
    max_charge: Optional[int] = Field(None, description="最高料金")
    sort: str = Field("+roomCharge", description="並び順")
    hits: int = Field(30, description="取得件数 1〜30", ge=1, le=30)
    page: int = Field(1, description="ページ番号", ge=1, le=100)


class HotelBasicInfo(BaseModel):
    hotel_no: int
    hotel_name: str
    hotel_information_url: str
    plan_list_url: str
    dp_plan_list_url: str
    review_url: str
    hotel_kana_name: Optional[str] = None
    hotel_special: Optional[str] = None
    hotel_min_charge: Optional[int] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    postal_code: Optional[str] = None
    address1: Optional[str] = None
    address2: Optional[str] = None
    telephone_no: Optional[str] = None
    fax_no: Optional[str] = None
    access: Optional[str] = None
    parking_information: Optional[str] = None
    nearest_station: Optional[str] = None
    hotel_image_url: Optional[str] = None
    hotel_thumbnail_url: Optional[str] = None
    room_image_url: Optional[str] = None
    room_thumbnail_url: Optional[str] = None
    hotel_map_image_url: Optional[str] = None
    review_count: Optional[int] = None
    review_average: Optional[float] = None
    user_review: Optional[str] = None


class HotelRatingInfo(BaseModel):
    service_average: Optional[float] = None
    location_average: Optional[float] = None
    room_average: Optional[float] = None
    equipment_average: Optional[float] = None
    bath_average: Optional[float] = None
    meal_average: Optional[float] = None


class HotelSearchItem(BaseModel):
    hotel_basic_info: Optional[HotelBasicInfo] = None
    hotel_rating_info: Optional[HotelRatingInfo] = None

    class Config:
        populate_by_name = True

    # エイリアス設定
    hotelBasicInfo: Optional[HotelBasicInfo] = Field(None, alias="hotelBasicInfo")
    hotelRatingInfo: Optional[HotelRatingInfo] = Field(None, alias="hotelRatingInfo")


class VacantPlan(BaseModel):
    plan_id: Optional[int] = None
    plan_name: Optional[str] = None
    plan_information_url: Optional[str] = None
    room_type: Optional[str] = None
    price: Optional[int] = None
    price_with_tax: Optional[int] = None
    meal_info: Optional[str] = None
    cancel_policy: Optional[str] = None


class RakutenTravelTool:
    BASE_URL = "https://openapi.rakuten.co.jp/engine/api/Travel"
    ALLOWED_ORIGIN = "https://faction-scavenger-late.ngrok-free.dev"  # 許可ドメイン

    def __init__(self):
        self.application_id = settings.rakuten_application_id
        self.affiliate_id = settings.rakuten_affiliate_id
        self.access_key = settings.rakuten_access_key
        self.client = httpx.AsyncClient(timeout=30.0)

    def _base_params(self) -> dict:
        params = {
            "applicationId": self.application_id,
            "format": "json",
            "formatVersion": 2,
        }
        if self.access_key:
            params["accessKey"] = self.access_key
        if self.affiliate_id:
            params["affiliateId"] = self.affiliate_id
        return params

    def _headers(self) -> dict:
        return {
            "Origin": self.ALLOWED_ORIGIN,
            "Referer": self.ALLOWED_ORIGIN + "/",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }

    def _validate_search_params(self, params: RakutenHotelSearchParams) -> None:
        """検索パラメータのバリデーション（いずれか必須）"""
        has_class_codes = any([
            params.large_class_code,
            params.middle_class_code,
            params.small_class_code,
            params.detail_class_code,
        ])
        has_hotel_no = params.hotel_no is not None
        has_coords = params.latitude is not None and params.longitude is not None

        if not (has_class_codes or has_hotel_no or has_coords):
            raise ValueError(
                "検索には以下のいずれかが必須です: "
                "largeClassCode等の区分コード, hotelNo, latitude+longitude"
            )

    async def search_hotels(self, params: RakutenHotelSearchParams) -> dict:
        """施設検索API (新プラットフォーム)"""
        self._validate_search_params(params)
        url = f"{self.BASE_URL}/SimpleHotelSearch/20170426"
        query = self._base_params()

        param_map = {
            "large_class_code": "largeClassCode",
            "middle_class_code": "middleClassCode",
            "small_class_code": "smallClassCode",
            "detail_class_code": "detailClassCode",
            "hotel_no": "hotelNo",
            "latitude": "latitude",
            "longitude": "longitude",
            "search_radius": "searchRadius",
            "datum_type": "datumType",
            "checkin_date": "checkinDate",
            "checkout_date": "checkoutDate",
            "adult_num": "adultNum",
            "children_num": "childrenNum",
            "room_num": "roomNum",
            "min_charge": "minCharge",
            "max_charge": "maxCharge",
            "sort": "sort",
            "hits": "hits",
            "page": "page",
            "squeeze_condition": "squeezeCondition",
        }

        for key, api_key in param_map.items():
            value = getattr(params, key)
            if value is not None:
                query[api_key] = value

        try:
            response = await self.client.get(url, params=query, headers=self._headers())
            response.raise_for_status()
            data = response.json()
            return data
        except httpx.HTTPStatusError as e:
            raise Exception(f"Rakuten API error: {e.response.status_code} - {e.response.text}")
        except Exception as e:
            raise Exception(f"Rakuten API request failed: {str(e)}")

    async def search_vacant_hotels(self, params: RakutenVacantSearchParams) -> dict:
        """空室検索API (新プラットフォーム)"""
        url = f"{self.BASE_URL}/VacantHotelSearch/20170426"
        query = self._base_params()

        param_map = {
            "hotel_no": "hotelNo",
            "checkin_date": "checkinDate",
            "checkout_date": "checkoutDate",
            "adult_num": "adultNum",
            "children_num": "childrenNum",
            "room_num": "roomNum",
            "min_charge": "minCharge",
            "max_charge": "maxCharge",
            "sort": "sort",
            "hits": "hits",
            "page": "page",
        }

        for key, api_key in param_map.items():
            value = getattr(params, key)
            if value is not None:
                query[api_key] = value

        try:
            response = await self.client.get(url, params=query, headers=self._headers())
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            raise Exception(f"Rakuten Vacant API error: {e.response.status_code} - {e.response.text}")
        except Exception as e:
            raise Exception(f"Rakuten Vacant API request failed: {str(e)}")

    def _parse_hotels(self, data: dict) -> list[dict]:
        """レスポンスの hotels 配列を正規化
        各ホテルは配列で返る: [ {hotelBasicInfo:...}, {hotelRatingInfo:...}, ... ]
        """
        result = []
        hotels = data.get("hotels", [])
        for item in hotels:
            if not isinstance(item, list):
                continue
            merged = {}
            for elem in item:
                if isinstance(elem, dict):
                    merged.update(elem)
            if merged:
                result.append(merged)
        return result

    async def search_by_area(self, area_name: str, checkin: Optional[str] = None, checkout: Optional[str] = None,
                             adults: int = 2, rooms: int = 1, hits: int = 20) -> list:
        """エリア名で検索（主要都市の緯度経度を内部マップから取得）"""
        area_coords = {
            "京都": (35.0116, 135.7681),
            "東京": (35.6762, 139.6503),
            "大阪": (34.6937, 135.5023),
            "福岡": (33.5904, 130.4017),
            "札幌": (43.0618, 141.3545),
            "沖縄": (26.2124, 127.6809),
            "名古屋": (35.1815, 136.9066),
            "広島": (34.3853, 132.4553),
            "仙台": (38.2682, 140.8719),
            "金沢": (36.5946, 136.6256),
        }
        coords = area_coords.get(area_name)
        if not coords:
            # フォールバック: 区分コードでの検索を試みる（要調査）
            raise ValueError(f"未対応エリア: {area_name}。緯度経度を直接指定してください。")
        return await self.search_by_location(
            lat=coords[0], lng=coords[1], radius=3.0,
            checkin=checkin, checkout=checkout,
            adults=adults, rooms=rooms, hits=hits
        )

    async def search_by_location(self, lat: float, lng: float, radius: float = 3.0,
                                  checkin: Optional[str] = None, checkout: Optional[str] = None,
                                  adults: int = 2, rooms: int = 1, hits: int = 20) -> list:
        """緯度経度で検索（世界測地系）"""
        params = RakutenHotelSearchParams(
            latitude=lat,
            longitude=lng,
            search_radius=radius,
            datum_type=1,
            checkin_date=checkin,
            checkout_date=checkout,
            adult_num=adults,
            room_num=rooms,
            hits=hits,
            sort="+roomCharge",
        )
        result = await self.search_hotels(params)
        return self._parse_hotels(result)

    async def get_vacancy(self, hotel_no: int, checkin: str, checkout: str,
                          adults: int = 2, rooms: int = 1) -> list:
        """空室・プラン詳細取得"""
        params = RakutenVacantSearchParams(
            hotel_no=str(hotel_no),
            checkin_date=checkin,
            checkout_date=checkout,
            adult_num=adults,
            room_num=rooms,
            sort="+roomCharge",
        )
        result = await self.search_vacant_hotels(params)
        hotels = result.get("hotels", [])
        if not hotels:
            return []

        # 空室APIの構造: [ [ {hotelBasicInfo:...}, {roomInfo:...} ] ]
        first = hotels[0]
        if isinstance(first, list):
            for elem in first:
                if isinstance(elem, dict):
                    if "roomInfo" in elem:
                        # roomInfo はプラン情報のリスト
                        return elem.get("roomInfo", [])
                    if "hotel" in elem:
                        hotel_data = elem.get("hotel", {})
                        if isinstance(hotel_data, dict) and "roomInfo" in hotel_data:
                            return hotel_data.get("roomInfo", [])
        return []

    async def close(self):
        await self.client.aclose()


# シングルトンインスタンス
rakuten_travel_tool = RakutenTravelTool()