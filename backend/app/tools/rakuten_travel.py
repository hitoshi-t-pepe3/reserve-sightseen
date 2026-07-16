import asyncio
import re
from datetime import date, timedelta
from typing import Optional
from pydantic import BaseModel, Field
import httpx
from app.config import settings

# 誰でも予約できるとは限らない「条件付き限定プラン」を示す語。
# 例: 「70歳以上+今年の干支+当日誕生日」がすべて該当する場合のみ適用される特典プラン。
# こうしたプランの金額を一般的な「最安料金」として表示すると実勢とかけ離れる。
_RESTRICTED_PLAN_PATTERN = re.compile(
    "|".join([
        "歳以上", "歳未満", "干支", "誕生日", "記念日", "夫婦の日",
        "シニア", "学生限定", "女性限定", "カップル限定", "会員限定",
        "抽選", "組限定", "名様限定", "先着", "本日限定",
    ])
)


# エリア名 → 緯度経度（世界測地系）。チャットのツール定義からも参照される。
AREA_COORDS: dict[str, tuple[float, float]] = {
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
                             adults: int = 2, rooms: int = 1, hits: int = 20,
                             use_realistic_price: bool = True, realistic_price_limit: int = 10,
                             squeeze_condition: Optional[str] = None, sort_by: str = "price_asc") -> list:
        """エリア名で検索（主要都市の緯度経度を内部マップから取得）"""
        coords = AREA_COORDS.get(area_name)
        if not coords:
            # 呼び出し側（routes/hotels.py・チャットツール）が Google Places の
            # ジオコーディングにフォールバックする
            raise ValueError(f"未対応エリア: {area_name}。緯度経度を直接指定してください。")
        return await self.search_by_location(
            lat=coords[0], lng=coords[1], radius=3.0,
            checkin=checkin, checkout=checkout,
            adults=adults, rooms=rooms, hits=hits,
            use_realistic_price=use_realistic_price,
            realistic_price_limit=realistic_price_limit,
            squeeze_condition=squeeze_condition,
            sort_by=sort_by,
        )

    async def search_by_location(self, lat: float, lng: float, radius: float = 3.0,
                                  checkin: Optional[str] = None, checkout: Optional[str] = None,
                                  adults: int = 2, rooms: int = 1, hits: int = 20,
                                  use_realistic_price: bool = True,
                                  realistic_price_limit: int = 10,
                                  squeeze_condition: Optional[str] = None,
                                  sort_by: str = "price_asc") -> list:
        """緯度経度で検索（世界測地系）

        use_realistic_price=True の場合、上位 realistic_price_limit 件について
        空室検索APIから実勢最安値（限定特典プラン除く）を取得し hotelMinCharge を差し替える。

        sort_by: "price_asc"（安い順・デフォルト）/ "price_desc"（高い順）/
                 "rating"（評価・レビュー件数優先、リラックスできる高評価宿を上位に）。
                 rating は楽天APIの sort パラメータに無いため取得後にこちらで並べ替える。
        """
        api_sort = "-roomCharge" if sort_by == "price_desc" else "+roomCharge"
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
            sort=api_sort,
            squeeze_condition=squeeze_condition,
        )
        result = await self.search_hotels(params)
        hotels = self._parse_hotels(result)

        if use_realistic_price and hotels:
            target = hotels[:realistic_price_limit]
            await self.enrich_with_realistic_prices(
                target, checkin=checkin, checkout=checkout, adults=max(adults, 1), rooms=rooms
            )

        # 価格比較用: じゃらんnet の検索ページへのリンク（APIキー不要）
        from app.tools.jalan_travel import build_jalan_search_url
        for hotel in hotels:
            basic_info = hotel.get("hotelBasicInfo")
            if isinstance(basic_info, dict) and basic_info.get("hotelName"):
                url = build_jalan_search_url(basic_info["hotelName"])
                if url:
                    basic_info["jalanSearchUrl"] = url

        if sort_by == "rating":
            def rating_key(hotel: dict) -> tuple:
                basic = hotel.get("hotelBasicInfo") or {}
                avg = basic.get("reviewAverage") or 0
                count = basic.get("reviewCount") or 0
                return (avg, count)
            hotels.sort(key=rating_key, reverse=True)

        return hotels

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

    @staticmethod
    def _group_plans(room_info: list) -> list[dict]:
        """roomInfo のフラットな配列を、プラン単位 {plan: roomBasicInfo, charges: [dailyCharge,...]} にグループ化する。
        構造: [{roomBasicInfo:...}, {dailyCharge:...}, {roomBasicInfo:...}, {dailyCharge:...}, ...]
        直前の roomBasicInfo に、後続の dailyCharge 群が紐づく。
        """
        plans: list[dict] = []
        current: Optional[dict] = None
        for elem in room_info:
            if not isinstance(elem, dict):
                continue
            if "roomBasicInfo" in elem:
                current = {"plan": elem["roomBasicInfo"], "charges": []}
                plans.append(current)
            elif "dailyCharge" in elem and current is not None:
                current["charges"].append(elem["dailyCharge"])
        return plans

    @classmethod
    def _is_restricted_plan(cls, plan_name: str) -> bool:
        """年齢・記念日・抽選等、一般ユーザーが誰でも予約できるわけではない限定プランか判定"""
        if not plan_name:
            return False
        return bool(_RESTRICTED_PLAN_PATTERN.search(plan_name))

    async def get_realistic_min_charge(self, hotel_no: int, checkin: str, checkout: str,
                                        adults: int = 1, rooms: int = 1) -> Optional[dict]:
        """一般条件（限定特典プランを除く）での実勢最安値を取得する。

        施設検索APIが返す hotelMinCharge は「年齢70歳以上+当日誕生日」等の
        極めて限定的な条件を満たす場合のみ有効な特典プランの金額を含むことがあり、
        一般ユーザー向けの「最安料金」としては実態と乖離する。
        そのため空室検索APIから実際のプラン一覧を取得し、限定条件プランを除外した
        上で最安値を再計算する。

        一般プランが1件もなく限定プランしか空室が無い場合、その金額を「最安料金」として
        差し替えるのは誤解を招くため差し替えを行わない（呼び出し側で hotelMinCharge は
        元の値を維持し、only_restricted_available=True を見て注記を出す）。

        Returns:
            {"charge": Optional[int], "plan_name": str, "restricted_excluded": bool,
             "only_restricted_available": bool} または該当プランなしなら None
        """
        room_info = await self.get_vacancy(hotel_no, checkin, checkout, adults, rooms)
        plans = self._group_plans(room_info)
        if not plans:
            return None

        def total_charge(p: dict) -> Optional[int]:
            totals = [c.get("total") for c in p["charges"] if isinstance(c.get("total"), (int, float))]
            return sum(totals) if totals else None

        general_plans = [p for p in plans if not self._is_restricted_plan(p["plan"].get("planName", ""))]
        restricted_excluded = len(general_plans) < len(plans)

        if not general_plans:
            # 一般プランが存在せず、限定プランしか取得できない → 実勢最安値としては採用しない
            return {
                "charge": None,
                "plan_name": plans[0]["plan"].get("planName") if plans else None,
                "restricted_excluded": False,
                "only_restricted_available": True,
            }

        priced = [(total_charge(p), p) for p in general_plans]
        priced = [(t, p) for t, p in priced if t is not None]
        if not priced:
            return None

        min_charge, min_plan = min(priced, key=lambda x: x[0])
        return {
            "charge": min_charge,
            "plan_name": min_plan["plan"].get("planName"),
            "restricted_excluded": restricted_excluded,
            "only_restricted_available": False,
        }

    async def enrich_with_realistic_prices(self, hotels: list[dict], checkin: Optional[str] = None,
                                            checkout: Optional[str] = None, adults: int = 1,
                                            rooms: int = 1, concurrency: int = 2) -> list[dict]:
        """ホテル一覧の hotelMinCharge を、一般条件での実勢最安値に差し替える。

        checkin/checkout 未指定の場合は「明日〜明後日」を仮の宿泊日として使う
        （施設検索APIの hotelMinCharge も日付指定なしだと同様の仮定で算出されるため）。

        楽天トラベル空室検索APIはレート制限が厳しいため、並列数は低めに抑え、
        429 発生時は簡易リトライする。
        """
        if not checkin or not checkout:
            tomorrow = date.today() + timedelta(days=1)
            checkin = checkin or tomorrow.isoformat()
            checkout = checkout or (tomorrow + timedelta(days=1)).isoformat()

        semaphore = asyncio.Semaphore(concurrency)

        async def fetch_one(hotel: dict) -> None:
            # hotel は _parse_hotels() の出力形式: {"hotelBasicInfo": {...}, "hotelRatingInfo": {...}}
            basic_info = hotel.get("hotelBasicInfo")
            if not isinstance(basic_info, dict):
                return
            hotel_no = basic_info.get("hotelNo")
            if not hotel_no:
                return
            realistic = None
            async with semaphore:
                for attempt in range(3):
                    try:
                        realistic = await self.get_realistic_min_charge(
                            hotel_no, checkin, checkout, adults=adults, rooms=rooms
                        )
                        break
                    except Exception as e:
                        if "429" in str(e) and attempt < 2:
                            await asyncio.sleep(1.5 * (attempt + 1))
                            continue
                        realistic = None
                        break

            if realistic is None:
                # 空室が取れない場合、施設検索APIの値は参考値である旨を明示
                basic_info["hotelMinChargeUnavailable"] = True
            elif realistic["only_restricted_available"]:
                # 限定特典プランしか空室がない → 施設検索APIの値(元のhotelMinCharge)を
                # そのまま「限定条件プラン」として明示する。一般ユーザー向け金額としては提示しない。
                basic_info["hotelMinChargeRestrictedOnly"] = True
                basic_info["hotelMinChargePlanName"] = realistic["plan_name"]
            else:
                basic_info["hotelMinCharge"] = realistic["charge"]
                basic_info["hotelMinChargePlanName"] = realistic["plan_name"]
                basic_info["hotelMinChargeRestrictedExcluded"] = realistic["restricted_excluded"]

        await asyncio.gather(*(fetch_one(h) for h in hotels))
        return hotels

    async def close(self):
        await self.client.aclose()


# シングルトンインスタンス
rakuten_travel_tool = RakutenTravelTool()