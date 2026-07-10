from typing import Optional
from pydantic import BaseModel, Field
from googlemaps import Client as GoogleMapsClient
from app.config import settings


class PlaceSearchParams(BaseModel):
    query: str = Field(..., description="検索クエリ（例: '京都 温泉', '東京 ラーメン'）")
    location: Optional[str] = Field(None, description="中心地点 'lat,lng'")
    radius: int = Field(5000, description="検索半径（メートル）", ge=100, le=50000)
    language: str = Field("ja", description="言語コード")
    type_: Optional[str] = Field(None, description="場所タイプ（restaurant, tourist_attraction, lodging等）", alias="type")


class PlaceResult(BaseModel):
    place_id: str
    name: str
    address: str
    location: dict  # {"lat": float, "lng": float}
    rating: Optional[float] = None
    user_ratings_total: Optional[int] = None
    types: list[str] = []
    price_level: Optional[int] = None
    photo_reference: Optional[str] = None
    website: Optional[str] = None
    phone: Optional[str] = None


class GooglePlacesTool:
    def __init__(self):
        self.client = GoogleMapsClient(key=settings.google_places_api_key)

    def geocode_place(self, query: str, language: str = "ja") -> Optional[dict]:
        """任意の場所名（都市・駅・会場・観光地など）を座標に解決する。

        Places Text Search の先頭結果を採用。ホテル検索の中心点として使うため、
        名前と住所も返して呼び出し側が「どことして解決されたか」を確認できるようにする。
        """
        try:
            response = self.client.places(query=query, language=language)
            results = response.get("results") or []
            if not results:
                return None
            top = results[0]
            loc = top["geometry"]["location"]
            return {
                "name": top.get("name", query),
                "address": top.get("formatted_address", ""),
                "lat": loc["lat"],
                "lng": loc["lng"],
            }
        except Exception:
            return None

    def search_nearby(self, lat: float, lng: float, radius: int = 1500,
                      type_: Optional[str] = None, keyword: Optional[str] = None,
                      language: str = "ja") -> list[PlaceResult]:
        """現在地などの座標周辺のスポットを検索（散歩モード用）"""
        try:
            kwargs = {
                "location": (lat, lng),
                "radius": radius,
                "language": language,
            }
            if type_:
                kwargs["type"] = type_
            if keyword:
                kwargs["keyword"] = keyword

            response = self.client.places_nearby(**kwargs)

            results = []
            for place in response.get("results", []):
                results.append(PlaceResult(
                    place_id=place.get("place_id", ""),
                    name=place.get("name", ""),
                    address=place.get("vicinity", place.get("formatted_address", "")),
                    location={
                        "lat": place["geometry"]["location"]["lat"],
                        "lng": place["geometry"]["location"]["lng"]
                    },
                    rating=place.get("rating"),
                    user_ratings_total=place.get("user_ratings_total"),
                    types=place.get("types", []),
                    price_level=place.get("price_level"),
                    photo_reference=place.get("photos", [{}])[0].get("photo_reference") if place.get("photos") else None,
                ))
            return results
        except Exception as e:
            raise Exception(f"Google Places Nearby API error: {str(e)}")

    def search_places(self, params: PlaceSearchParams) -> list[PlaceResult]:
        """Google Places API (New) で場所を検索"""
        try:
            # Text Search を使用
            kwargs = {
                "query": params.query,
                "language": params.language,
            }

            if params.location:
                lat, lng = params.location.split(",")
                kwargs["location"] = (float(lat), float(lng))
                kwargs["radius"] = params.radius

            if params.type_:
                kwargs["type"] = params.type_

            response = self.client.places(**kwargs)

            results = []
            for place in response.get("results", []):
                results.append(PlaceResult(
                    place_id=place.get("place_id", ""),
                    name=place.get("name", ""),
                    address=place.get("formatted_address", place.get("vicinity", "")),
                    location={
                        "lat": place["geometry"]["location"]["lat"],
                        "lng": place["geometry"]["location"]["lng"]
                    },
                    rating=place.get("rating"),
                    user_ratings_total=place.get("user_ratings_total"),
                    types=place.get("types", []),
                    price_level=place.get("price_level"),
                    photo_reference=place.get("photos", [{}])[0].get("photo_reference") if place.get("photos") else None,
                ))

            return results

        except Exception as e:
            raise Exception(f"Google Places API error: {str(e)}")

    def get_place_details(self, place_id: str, language: str = "ja") -> Optional[PlaceResult]:
        """Place ID から詳細情報を取得"""
        try:
            response = self.client.place(
                place_id=place_id,
                language=language,
                fields=[
                    "place_id", "name", "formatted_address", "geometry",
                    "rating", "user_ratings_total", "types", "price_level",
                    "website", "formatted_phone_number", "photos"
                ]
            )

            place = response.get("result", {})
            if not place:
                return None

            return PlaceResult(
                place_id=place.get("place_id", ""),
                name=place.get("name", ""),
                address=place.get("formatted_address", ""),
                location={
                    "lat": place["geometry"]["location"]["lat"],
                    "lng": place["geometry"]["location"]["lng"]
                },
                rating=place.get("rating"),
                user_ratings_total=place.get("user_ratings_total"),
                types=place.get("types", []),
                price_level=place.get("price_level"),
                website=place.get("website"),
                phone=place.get("formatted_phone_number"),
                photo_reference=place.get("photos", [{}])[0].get("photo_reference") if place.get("photos") else None,
            )

        except Exception as e:
            raise Exception(f"Google Places Details API error: {str(e)}")

    def search_tourist_spots(self, area: str, radius: int = 10000) -> list[PlaceResult]:
        """観光スポットを検索"""
        return self.search_places(PlaceSearchParams(
            query=f"{area} 観光スポット",
            radius=radius,
            type_="tourist_attraction"
        ))

    def search_restaurants(self, area: str, cuisine: Optional[str] = None, radius: int = 5000) -> list[PlaceResult]:
        """飲食店を検索"""
        query = f"{area} {cuisine or ''} レストラン".strip()
        return self.search_places(PlaceSearchParams(
            query=query,
            radius=radius,
            type_="restaurant"
        ))

    def search_hotels(self, area: str, radius: int = 10000) -> list[PlaceResult]:
        """宿泊施設を検索（Google Placesベース）"""
        return self.search_places(PlaceSearchParams(
            query=f"{area} ホテル 旅館",
            radius=radius,
            type_="lodging"
        ))


# シングルトンインスタンス
google_places_tool = GooglePlacesTool()