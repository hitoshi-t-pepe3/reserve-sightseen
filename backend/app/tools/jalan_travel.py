"""じゃらん連携。

Phase 0（実装済み・キー不要）:
    build_jalan_search_url() — じゃらんnet のキーワード検索ページへのディープリンク。
    楽天のホテルカードに「じゃらんでも見る」ボタンとして表示し、価格比較の導線にする。

Phase 1（準備のみ・じゃらんWebサービスのAPIキーが必要）:
    JalanTravelTool — 宿表示API（アドバンス）のクライアント。
    利用するには https://www.jalan.net/jw/jwp0000/jww0001.do で利用登録して
    API キーを取得し、backend/.env と Secret Manager に JALAN_API_KEY を設定する。
    キー未設定の間は is_enabled() が False を返し、機能は一切露出しない。

    注意: API 実装はキー未取得のため未検証。有効化時に必ず実レスポンスで
    パラメータ（特に x/y の座標単位）とXML構造を確認すること。
"""
from typing import Optional
from urllib.parse import quote
import xml.etree.ElementTree as ET

import httpx

from app.config import settings

# じゃらんnet のキーワード検索は Shift_JIS でパーセントエンコードする必要がある
# （UTF-8 だと検索語が文字化けする。2026-07-11 に実URLで動作確認済み）。
_JALAN_KEYWORD_SEARCH = "https://www.jalan.net/uw/uwp2011/uww2011init.do?keyword="


def build_jalan_search_url(hotel_name: str) -> Optional[str]:
    """ホテル名からじゃらんnetの検索結果ページURLを生成する（APIキー不要）"""
    if not hotel_name:
        return None
    try:
        encoded = quote(hotel_name.encode("shift_jis", errors="ignore"))
    except Exception:
        return None
    if not encoded:
        return None
    return _JALAN_KEYWORD_SEARCH + encoded


class JalanTravelTool:
    """じゃらんWebサービス 宿表示API（アドバンス）クライアント。

    ドキュメント: https://www.jalan.net/jw/jwp0100/jww0102.do
    レスポンスは XML。キー未設定時は使用不可（is_enabled() で判定）。
    """

    BASE_URL = "https://jws.jalan.net/APIAdvance/HotelSearch/V1/"

    def __init__(self):
        self.api_key = settings.jalan_api_key
        self.client = httpx.AsyncClient(timeout=30.0)

    def is_enabled(self) -> bool:
        return bool(self.api_key)

    async def search_hotels_by_name(self, hotel_name: str, count: int = 5) -> list[dict]:
        """ホテル名で検索し、じゃらん側のホテル情報（ID・URL・参考料金）を返す。

        楽天の検索結果と突き合わせて価格比較に使う想定。
        """
        return await self._search({"h_name": hotel_name, "count": count})

    async def search_hotels_by_location(self, lat: float, lng: float,
                                         range_km: int = 3, count: int = 10) -> list[dict]:
        """緯度経度で周辺の宿を検索する。

        TODO(キー取得後に検証): x/y の単位がドキュメント上明確でない
        （度 or ミリ秒）。実レスポンスで確認してから調整すること。
        """
        return await self._search({
            "x": lng,
            "y": lat,
            "range": range_km,
            "count": count,
        })

    async def _search(self, params: dict) -> list[dict]:
        if not self.is_enabled():
            raise RuntimeError(
                "じゃらんAPIキーが未設定です。じゃらんWebサービスに利用登録し、"
                "JALAN_API_KEY を backend/.env と Secret Manager に設定してください。"
            )
        query = {"key": self.api_key, "xml_ptn": 1, **params}
        response = await self.client.get(self.BASE_URL, params=query)
        response.raise_for_status()
        return self._parse_hotels_xml(response.text)

    @staticmethod
    def _parse_hotels_xml(xml_text: str) -> list[dict]:
        """宿表示APIのXMLレスポンスから主要フィールドを抽出する（未検証・雛形）"""
        root = ET.fromstring(xml_text)
        # エラーレスポンス（APIキー不正等）の検出
        error = root.find(".//{*}Message")
        if error is not None and (error.text or "").strip():
            raise RuntimeError(f"じゃらんAPIエラー: {error.text.strip()}")

        hotels = []
        for hotel in root.iter():
            if not hotel.tag.endswith("Hotel"):
                continue

            def text_of(tag: str) -> Optional[str]:
                el = hotel.find(f".//{{*}}{tag}")
                return el.text if el is not None else None

            hotels.append({
                "hotelId": text_of("HotelID"),
                "hotelName": text_of("HotelName"),
                "address": text_of("HotelAddress"),
                "detailUrl": text_of("HotelDetailURL"),
                "sampleRateFrom": text_of("SampleRateFrom"),
                "pictureUrl": text_of("PictureURL"),
            })
        return hotels

    async def close(self):
        await self.client.aclose()


# シングルトンインスタンス
jalan_travel_tool = JalanTravelTool()
