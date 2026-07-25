import asyncio
import os
import re
from datetime import datetime
from math import atan2, cos, radians, sin, sqrt
from urllib.parse import quote
from zoneinfo import ZoneInfo
from typing import Any, Dict, List, Optional

import vertexai
from vertexai.generative_models import (
    Content,
    FunctionDeclaration,
    GenerativeModel,
    Part,
    Tool,
)

from app.config import settings
from app.tools.rakuten_travel import AREA_COORDS, rakuten_travel_tool
from app.tools.google_places import google_places_tool

# Initialize Vertex AI
_initialized = False
_model = None

# ツール呼び出しの往復上限。ホテル検索+観光地検索+日程表登録+まとめで通常3〜4回で収束する。
_MAX_TOOL_TURNS = 6


def _system_instruction() -> str:
    now = datetime.now(ZoneInfo("Asia/Tokyo"))
    weekdays = ["月", "火", "水", "木", "金", "土", "日"]
    today = f"{now.strftime('%Y-%m-%d')}（{weekdays[now.weekday()]}）"
    return f"""あなたは旅行プラン提案アシスタント「ReserveSightseen」です。
今日は {today} です。「来週末」「明日」などの相対的な日付は、この日付を基準に YYYY-MM-DD 形式へ変換してください。過去の日付が指定されたら翌年ではなく、日付の確認をしてください。

## 絶対のルール（違反禁止）
- 回答は必ず日本語で書きます。英語で回答してはいけません（ユーザーが他言語を希望した場合のみ例外）。
- ホテル名・料金を回答に書いてよいのは、search_hotels の結果を受け取った後だけです。ツールを呼ばずに知識からホテルを提案することは禁止です。
- 観光地を提案する前に必ず search_tourist_spots（現在地周辺なら search_spots_nearby）を呼びます。
- 行き先・宿泊日・人数が揃ったら、文章を書き始める前にまずツールを呼び出してください。これは会話が何往復目でも同じです。
- create_itinerary を呼ぶときは、必ず検索結果から抽出したスポット・ホテルデータを含めてください。検索結果なしに空の days を渡すことは禁止です。

## 進め方
1. プラン作成には「行き先」「チェックイン日・チェックアウト日」「人数」が必要です。足りない情報だけを1回のメッセージで簡潔に質問してください（既に会話に出ている情報は聞き直さない）。
2. 3つが揃ったら、必ず search_hotels と search_tourist_spots を呼び出し、実データに基づいて提案してください。
3. プランを提案するときは、必ず create_itinerary を呼んで日程表を登録してください（時刻の目安・観光/食事/宿の区別・ツール結果の address / lat / lng を含める）。日程表はアプリがタイムラインUIで表示します。
4. 本文は次だけを簡潔に書いてください（行程の詳細は日程表に任せて繰り返さない。「日程表を登録しました」のようなシステム的な文も書かない。日程表の JSON・データ構造は本文に含めない。プランの魅力の要約から書き出す）:
   - プランの狙い・見どころの1〜2文の要約
   - **おすすめホテル**（search_hotels を使った場合のみ）: ツール結果の上位2〜3件。ホテル名・1泊料金・特徴を短く。最後に「気になるホテルは、下のホテルカードの『楽天トラベルで予約』ボタンからそのまま予約できます」と案内
   - 散歩コースなどホテルが不要な提案では、ホテルの話は書かない

## 場所の指定について
- search_hotels の location には都市名だけでなく、駅名・コンサート会場名・テーマパーク名・観光地名など任意の場所を渡せます（内部で座標に解決して周辺3km圏を検索します）。
- ツール結果の resolvedLocation を見て、意図と違う場所に解決されていたら（例: 同名の別地域）ユーザーに確認してください。

## テーマ別ガイド
ユーザーの目的に合わせて聞くこと・提案の重点を変えてください:
- **推し活・遠征**（コンサート・イベント）: 会場名と公演日を確認し、search_hotels に会場名を渡して徒歩圏の宿を優先。終演後の移動が楽なこと、翌朝の物販・入場列に備えやすいことを重視して紹介する。
- **乗り鉄**: 乗りたい路線・列車・区間を確認。始発や乗り換えに便利な駅名で search_hotels し、駅近を優先。プランは列車の乗車体験を軸に組む。
- **聖地巡礼**: 作品名を確認し、search_tourist_spots の query に「作品名 聖地」を渡して検索。結果が乏しければ舞台になった土地名で再検索し、巡礼順のモデルコースにする。
- **温泉**: search_hotels の onsen=true を使い、温泉宿だけに絞る。
- **散歩**（現在地あり・宿泊なし）: search_spots_nearby を呼び、徒歩で2〜3時間で回れる3〜5箇所を選んで create_itinerary（mode=walk、days は1要素）で散歩コースを登録する。ホテル検索はしない（泊まりたいと言われた場合を除く）。search_spots_nearby の結果は現在地に近い順に並んでおり、各スポットに distanceM（距離メートル）・walkMinutes（徒歩分）が付いている。**最初の目的地は必ず walkMinutes が5以下（現在地から徒歩5分以内）の候補から選ぶこと。** 2件目以降は徒歩5分の制約なしで、魅力・順路を優先して選んでよい。
- **ドライブ**（現在地あり・車で回りたい）: search_spots_nearby を radius_m=15000 程度で呼び、車で半日〜1日で回れる3〜6箇所を選んで create_itinerary（mode=drive、days は1要素）でドライブコースを登録する。ホテル検索はしない（泊まりたいと言われた場合を除く）。
- 散歩・ドライブ共通: 各スポットに必ず time（目安時刻）と durationMin（滞在の目安分）を入れる。ユーザーが出発地点・スタート地点に戻ることを希望したら、最後の項目として name=「出発地点へ戻る」・category=move・lat/lng=現在地の座標（システム情報の値）を入れる。
- ユーザーが「全体で約◯分」「◯時間くらいで」のように全体の所要時間を指定した場合、スポット数・各滞在時間・移動時間の目安を合計してその時間に収まるようスポット数を調整すること（多すぎるスポットを詰め込まない）。

## 移動手段
- ユーザーが旅行の移動手段（電車・バス・車・飛行機）を指定・希望したら、create_itinerary の transport に渡してください（電車=train, バス=bus, 車=car, 飛行機=plane）。経路リンクの種類がそれに合わせて切り替わります。
- 電車・バス・飛行機の場合は、往路・復路の乗車を category=move の項目として必ず行程に入れてください（例: name=「東京駅発 新幹線（新大阪行き）」time=09:00、name=「バスタ新宿発 高速バス（大阪行き）」time=08:00）。move 項目は「ツール結果のみ」の制約の対象外で、一般知識にもとづく目安でよい（description に「時刻は目安です」と添える。実在しない具体的な便名は書かない）。

## スポットの地図リンク
ツール結果の各スポットには mapUrl が付いています。スポットを紹介するときは必ず [スポット名](mapUrl) の形式でリンクにしてください。URLを自作してはいけません。

## 制約
- ホテル名・料金・観光地名はツールの結果だけを使い、創作しないでください。
- 料金が取得できないホテルは「料金は要確認」と書いてください。
- 曜日は計算を誤りやすいため、日付に曜日を書き添えないでください（今日の曜日のみ上に示した通り）。
- 回答は日本語で、Markdownの見出し・箇条書きを使って読みやすく。長すぎないように。"""


_SEARCH_HOTELS_DECL = FunctionDeclaration(
    name="search_hotels",
    description=(
        "楽天トラベルで場所名からホテルを検索する。都市名・駅名・コンサート会場名・"
        "テーマパーク名・観光地名など任意の場所を指定でき、その周辺3km圏の宿を返す。"
        "宿泊日と人数を指定すると空室の実勢最安料金つきで返す。"
    ),
    parameters={
        "type": "object",
        "properties": {
            "location": {
                "type": "string",
                "description": "場所名（例: 京都、京セラドーム大阪、金沢駅、箱根湯本）",
            },
            "checkin": {"type": "string", "description": "チェックイン日 YYYY-MM-DD"},
            "checkout": {"type": "string", "description": "チェックアウト日 YYYY-MM-DD"},
            "adults": {"type": "integer", "description": "大人の人数（デフォルト2）"},
            "onsen": {"type": "boolean", "description": "true で温泉宿に絞る"},
            "sort_by": {
                "type": "string",
                "enum": ["price_asc", "price_desc", "rating"],
                "description": "並び順。price_asc=安い順(デフォルト)、price_desc=高い順、rating=評価が高い順（のんびり・リラックス重視の希望に）",
            },
        },
        "required": ["location"],
    },
)

_SEARCH_SPOTS_DECL = FunctionDeclaration(
    name="search_tourist_spots",
    description=(
        "Google Places で観光スポット・飲食店を検索する。"
        "query には「京都 観光」のようなエリア指定のほか、「作品名 聖地」のような"
        "テーマ検索も渡せる。"
    ),
    parameters={
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "検索語（例: 京都、ぼっち・ざ・ろっく 聖地、下呂 食べ歩き）",
            },
            "category": {
                "type": "string",
                "enum": ["sightseeing", "restaurant"],
                "description": "sightseeing=観光スポット, restaurant=飲食店",
            },
        },
        "required": ["query"],
    },
)

_SEARCH_NEARBY_DECL = FunctionDeclaration(
    name="search_spots_nearby",
    description=(
        "ユーザーの現在地など、指定座標の周辺スポットを検索する（散歩モード用）。"
        "現在地はメッセージ冒頭の [システム情報: ...] に書かれた lat/lng を使うこと。"
    ),
    parameters={
        "type": "object",
        "properties": {
            "lat": {"type": "number", "description": "緯度"},
            "lng": {"type": "number", "description": "経度"},
            "category": {
                "type": "string",
                "enum": ["sightseeing", "cafe", "restaurant", "park"],
                "description": "スポット種別（デフォルト sightseeing）",
            },
            "radius_m": {
                "type": "integer",
                "description": "検索半径メートル。徒歩（散歩）は1500程度、車（ドライブ）は10000〜20000。デフォルト1500、最大20000",
            },
        },
        "required": ["lat", "lng"],
    },
)

_CREATE_ITINERARY_DECL = FunctionDeclaration(
    name="create_itinerary",
    description=(
        "旅行・散歩プランを日程表として登録する。プラン（散歩コース含む）を提案する"
        "ときは、検索ツールの結果を使って必ずこれを呼ぶこと。登録した日程表はアプリが"
        "タイムラインUIで表示するため、本文には日程の詳細を繰り返し書かなくてよい。"
    ),
    parameters={
        "type": "object",
        "properties": {
            "title": {"type": "string", "description": "プラン名（例: 京都1泊2日 歴史とグルメの旅）"},
            "mode": {
                "type": "string",
                "enum": ["walk", "drive", "travel"],
                "description": "walk=徒歩の散歩コース, drive=車で回るドライブコース, travel=旅行プラン",
            },
            "transport": {
                "type": "string",
                "enum": ["train", "bus", "car", "plane"],
                "description": "travel モードの主な移動手段。ユーザーが指定・希望したら必ず渡す",
            },
            "days": {
                "type": "array",
                "description": "日ごとのスケジュール。散歩コースは1要素",
                "items": {
                    "type": "object",
                    "properties": {
                        "label": {"type": "string", "description": "例: 1日目（2026-07-25） / 散歩コース"},
                        "items": {
                            "type": "array",
                            "description": "時系列順の行程",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "time": {"type": "string", "description": "目安時刻 HH:MM（例 10:00）"},
                                    "name": {"type": "string", "description": "スポット名・店名・ホテル名"},
                                    "category": {
                                        "type": "string",
                                        "enum": ["spot", "meal", "hotel", "move"],
                                        "description": "spot=観光, meal=食事, hotel=宿, move=移動",
                                    },
                                    "description": {"type": "string", "description": "1文の説明"},
                                    "durationMin": {"type": "integer", "description": "滞在目安（分）"},
                                    "address": {"type": "string", "description": "検索ツール結果の address をそのまま入れる"},
                                    "lat": {"type": "number", "description": "検索ツール結果の lat をそのまま入れる"},
                                    "lng": {"type": "number", "description": "検索ツール結果の lng をそのまま入れる"},
                                },
                                "required": ["name", "category"],
                            },
                        },
                    },
                    "required": ["label", "items"],
                },
            },
        },
        "required": ["title", "days"],
    },
)

_TRAVEL_TOOL = Tool(
    function_declarations=[
        _SEARCH_HOTELS_DECL,
        _SEARCH_SPOTS_DECL,
        _SEARCH_NEARBY_DECL,
        _CREATE_ITINERARY_DECL,
    ]
)


def _init_vertex_ai():
    global _initialized, _model
    if _initialized:
        return

    project_id = settings.gcp_project_id or os.environ.get("GOOGLE_CLOUD_PROJECT", "")
    location = settings.gcp_location or "us-central1"

    if project_id:
        vertexai.init(project=project_id, location=location)
        # Using the cheapest available model: gemini-2.5-flash-lite
        _model = GenerativeModel(
            "gemini-2.5-flash-lite",
            tools=[_TRAVEL_TOOL],
            system_instruction=_system_instruction(),
        )

    _initialized = True


def _get_model():
    _init_vertex_ai()
    return _model


def _build_history(conversation_history: Optional[List[Dict[str, str]]]) -> List[Content]:
    history = []
    if conversation_history:
        for msg in conversation_history:
            role = "user" if msg.get("role") == "user" else "model"
            history.append(Content(role=role, parts=[Part.from_text(msg.get("content", ""))]))
    return history


def _extract_function_calls(response) -> list:
    calls = []
    try:
        for part in response.candidates[0].content.parts:
            fc = getattr(part, "function_call", None)
            if fc is not None and fc.name:
                calls.append(fc)
    except (IndexError, AttributeError):
        pass
    return calls


def _extract_text(response) -> str:
    try:
        parts = response.candidates[0].content.parts
        return "".join(p.text for p in parts if getattr(p, "text", None))
    except (IndexError, AttributeError):
        return ""


# 「8月22日（木）」「2026-08-22(土)」のような日付直後の曜日表記。
# モデルは曜日計算を高頻度で誤る（プロンプトで禁止しても書いてくる）ため、
# 誤情報を出すくらいなら機械的に削る。
_WEEKDAY_AFTER_DATE = re.compile(
    r"((?:\d{1,2}月\d{1,2}日|\d{4}-\d{2}-\d{2}|\d{1,2}/\d{1,2}))\s*[（(][月火水木金土日]曜?[）)]"
)

# モデルがまれに出力する HTML の改行タグ（フロントは Markdown 描画のため素通りする）
_BR_TAG = re.compile(r"<br\s*/?>", re.IGNORECASE)


def _clean_response_text(text: str) -> str:
    text = _BR_TAG.sub("\n", text)
    return _WEEKDAY_AFTER_DATE.sub(r"\1", text)


_MD_URL = re.compile(r"\]\([^)]*\)")
_JA_CHARS = re.compile(r"[ぁ-んァ-ヶ一-龠]")


def _looks_non_japanese(text: str) -> bool:
    """応答が日本語になっていないか判定する。

    flash-lite は指示があってもまれに英語で回答する。日本語の地名を含む英語文でも
    かな・漢字の比率が明確に下がるため、比率で機械判定してリトライにつなげる。
    """
    body = _MD_URL.sub("]", text)  # URL 内のエンコード文字列はノイズなので除外
    if len(body) < 80:
        return False  # 短い相づち等は誤判定しやすいので対象外
    ratio = len(_JA_CHARS.findall(body)) / len(body)
    return ratio < 0.15


def _compact_hotels(hotels: List[dict]) -> List[dict]:
    """LLM に渡す用の要約。トークン量と創作リスクを抑えるため必要項目のみ。"""
    compact = []
    for h in hotels:
        basic = h.get("hotelBasicInfo") or {}
        rating = h.get("hotelRatingInfo") or {}
        price_unreliable = basic.get("hotelMinChargeRestrictedOnly") or basic.get(
            "hotelMinChargeUnavailable"
        )
        compact.append(
            {
                "hotelName": basic.get("hotelName"),
                "minChargePerNight": None if price_unreliable else basic.get("hotelMinCharge"),
                "priceNote": "要確認（日程により変動）" if price_unreliable else None,
                "reviewAverage": basic.get("reviewAverage"),
                "reviewCount": basic.get("reviewCount"),
                "nearestStation": basic.get("nearestStation"),
                "special": (basic.get("hotelSpecial") or "")[:80] or None,
                "serviceAverage": rating.get("serviceAverage"),
            }
        )
    return compact


def _map_url(name: str, address: str = "") -> str:
    """スポット名からGoogleマップの検索リンクを生成（LLMにURLを自作させない）"""
    query = quote(f"{name} {address}".strip())
    return f"https://www.google.com/maps/search/?api=1&query={query}"


def _haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """2点間の直線距離（メートル）"""
    r = 6371000
    phi1, phi2 = radians(lat1), radians(lat2)
    dphi = radians(lat2 - lat1)
    dlambda = radians(lng2 - lng1)
    a = sin(dphi / 2) ** 2 + cos(phi1) * cos(phi2) * sin(dlambda / 2) ** 2
    return 2 * r * atan2(sqrt(a), sqrt(1 - a))


# 徒歩の概算速度（分速）。5分以内の判定などに使う目安値
_WALK_M_PER_MIN = 80


def _compact_spots(spots: list, origin: Optional[tuple] = None) -> list[dict]:
    rows = []
    for s in spots:
        lat = (s.location or {}).get("lat")
        lng = (s.location or {}).get("lng")
        row = {
            "name": s.name,
            "rating": s.rating,
            "reviews": s.user_ratings_total,
            "address": s.address,
            "mapUrl": _map_url(s.name, s.address),
            # 日程表の地点ごとの周辺チャット（geohash チャンネル）用
            "lat": lat,
            "lng": lng,
        }
        if origin and lat is not None and lng is not None:
            dist = _haversine_m(origin[0], origin[1], lat, lng)
            row["distanceM"] = round(dist)
            row["walkMinutes"] = max(1, round(dist / _WALK_M_PER_MIN))
        rows.append(row)
    # 現在地（origin）指定時は近い順に並べ、最初の数件が確実に近距離候補になるようにする
    if origin:
        rows.sort(key=lambda r: r.get("distanceM", float("inf")))
    return rows[:8]


async def _run_search_hotels(args: Dict[str, Any], state: Dict[str, Any]) -> dict:
    location = str(args.get("location") or args.get("area") or "").strip()
    checkin = args.get("checkin") or None
    checkout = args.get("checkout") or None
    onsen = bool(args.get("onsen"))
    sort_by = args.get("sort_by") if args.get("sort_by") in ("price_asc", "price_desc", "rating") else "price_asc"
    try:
        adults = int(args.get("adults") or 2)
    except (TypeError, ValueError):
        adults = 2

    # 場所名 → 座標。主要都市は内部マップ、それ以外は Google Places で解決する
    coords = AREA_COORDS.get(location)
    resolved_name = location
    if coords:
        lat, lng = coords
    else:
        place = await asyncio.to_thread(google_places_tool.geocode_place, location)
        if not place:
            return {"error": f"「{location}」の場所を特定できませんでした。別の表記を試してください。"}
        lat, lng = place["lat"], place["lng"]
        resolved_name = f"{place['name']}（{place['address']}）"

    try:
        hotels = await rakuten_travel_tool.search_by_location(
            lat=lat,
            lng=lng,
            radius=3.0,
            checkin=checkin,
            checkout=checkout,
            adults=adults,
            hits=8,
            realistic_price_limit=5,
            squeeze_condition="onsen" if onsen else None,
            sort_by=sort_by,
        )
    except Exception as e:
        return {"error": f"ホテル検索に失敗しました: {e}"}

    if not hotels:
        return {
            "resolvedLocation": resolved_name,
            "hotels": [],
            "count": 0,
            "note": "周辺3km圏に該当する宿が見つかりませんでした。近隣の駅名や市街地名で再検索してください。",
        }

    hotels = hotels[:6]
    state["hotels"] = hotels
    state["search_context"] = {
        "area": location,
        "checkin": checkin,
        "checkout": checkout,
        "adults": adults,
    }
    return {
        "resolvedLocation": resolved_name,
        "hotels": _compact_hotels(hotels),
        "count": len(hotels),
    }


async def _run_search_spots(args: Dict[str, Any]) -> dict:
    query = str(args.get("query") or args.get("area") or "").strip()
    category = args.get("category") or "sightseeing"
    try:
        # googlemaps クライアントは同期実装のためスレッドに逃がす
        if category == "restaurant":
            spots = await asyncio.to_thread(google_places_tool.search_restaurants, query)
        else:
            spots = await asyncio.to_thread(google_places_tool.search_tourist_spots, query)
    except Exception as e:
        return {"error": f"観光地検索に失敗しました: {e}"}

    return {"spots": _compact_spots(spots)}


_NEARBY_CATEGORY_TO_TYPE = {
    "sightseeing": "tourist_attraction",
    "cafe": "cafe",
    "restaurant": "restaurant",
    "park": "park",
}


async def _run_search_nearby(args: Dict[str, Any]) -> dict:
    try:
        lat = float(args["lat"])
        lng = float(args["lng"])
    except (KeyError, TypeError, ValueError):
        return {"error": "lat/lng が不正です。メッセージ冒頭の [現在地: lat,lng] を渡してください。"}

    category = args.get("category") or "sightseeing"
    try:
        radius = min(int(args.get("radius_m") or 1500), 20000)
    except (TypeError, ValueError):
        radius = 1500

    try:
        spots = await asyncio.to_thread(
            google_places_tool.search_nearby,
            lat, lng, radius, _NEARBY_CATEGORY_TO_TYPE.get(category, "tourist_attraction"),
        )
    except Exception as e:
        return {"error": f"周辺スポット検索に失敗しました: {e}"}

    if not spots:
        return {"spots": [], "note": "周辺にスポットが見つかりませんでした。radius_m を広げて再試行してください。"}

    return {"spots": _compact_spots(spots, origin=(lat, lng))}


def _to_plain(value: Any) -> Any:
    """proto-plus の MapComposite / RepeatedComposite をネスト込みで素の Python 型へ変換する"""
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    if hasattr(value, "items"):
        return {k: _to_plain(v) for k, v in value.items()}
    try:
        return [_to_plain(v) for v in value]
    except TypeError:
        return value


def _rakuten_affiliate_url(target: str) -> str:
    """楽天の任意ページをアフィリエイトリンク化する（ID未設定なら素のURL）"""
    aff = settings.rakuten_affiliate_id
    if not aff:
        return target
    encoded = quote(target, safe="")
    return f"https://hb.afl.rakuten.co.jp/hgc/{aff}/?pc={encoded}&m={encoded}"


# 移動手段ごとのチケット予約導線（楽天トラベルは高速バス・楽パックも
# アフィリエイト成果対象のため、既存の RAKUTEN_AFFILIATE_ID をそのまま使う）
_BOOKING_LINKS = {
    "bus": {
        "label": "🚌 楽天トラベルで高速バスを予約",
        "target": "https://travel.rakuten.co.jp/bus/",
    },
    "plane": {
        "label": "✈️ 航空券＋宿セット（楽パック）を探す",
        "target": "https://travel.rakuten.co.jp/package/",
    },
}


def _dir_url(origin: Optional[str], dest: str, travelmode: Optional[str]) -> str:
    """Google マップ経路リンク。origin を省略すると端末の現在地が起点になる"""
    url = f"https://www.google.com/maps/dir/?api=1&destination={quote(dest)}"
    if origin:
        url += f"&origin={quote(origin)}"
    if travelmode:
        url += f"&travelmode={travelmode}"
    return url


def _fallback_current_location(state: Dict[str, Any]) -> tuple:
    loc = state.get("user_location") or {}
    try:
        return float(loc["lat"]), float(loc["lng"])
    except (KeyError, TypeError, ValueError):
        return None, None


async def _run_create_itinerary(args: Dict[str, Any], state: Dict[str, Any]) -> dict:
    # タイトル・日ラベルにも誤った曜日が混入するため本文と同じ除去を通す
    title = _clean_response_text(str(args.get("title") or "プラン")).strip()
    mode = args.get("mode") if args.get("mode") in ("walk", "drive", "travel") else "travel"
    transport = args.get("transport") if args.get("transport") in ("train", "bus", "car", "plane") else None

    # 経路リンクの移動手段。散歩=徒歩・ドライブ=車。旅行は指定に応じて
    # 電車/バス=transit・車=driving（飛行機は Google マップ非対応のため transit で代用）
    if mode == "walk":
        travelmode = "walking"
    elif mode == "drive":
        travelmode = "driving"
    else:
        travelmode = {"train": "transit", "bus": "transit", "car": "driving", "plane": "transit"}.get(transport)
    # 散歩・ドライブは移動のたびに位置が変わるので、経路の起点は常にクリック時の現在地
    from_current = mode in ("walk", "drive")

    days_out = []
    days_input = args.get("days") or []
    print(f"[DEBUG] create_itinerary: title={title}, mode={mode}, days_input count={len(days_input)}, days type={type(days_input)}")
    if not isinstance(days_input, list):
        print(f"[DEBUG] create_itinerary: ERROR - days_input is not a list")
        return {"error": f"days は配列である必要があります。受け取った値: {type(days_input)}"}

    for day_idx, day in enumerate(days_input):
        if not isinstance(day, dict):
            print(f"[DEBUG] create_itinerary: warning - skipping non-dict day at index {day_idx}")
            continue
        items_out = []
        prev_query = None  # 直前の訪問地点（経路リンクの起点）
        day_items = day.get("items") or []
        print(f"[DEBUG] create_itinerary: day[{day_idx}] has {len(day_items)} items, items type={type(day_items)}")
        if not isinstance(day_items, list):
            print(f"[DEBUG] create_itinerary: warning - day[{day_idx}].items is not a list: {type(day_items)}")
            continue

        for item_idx, item in enumerate(day_items):
            if not isinstance(item, dict):
                print(f"[DEBUG] create_itinerary: warning - day[{day_idx}].items[{item_idx}] is not a dict: {type(item)}")
                continue
            name = str(item.get("name") or "").strip()
            if not name:
                print(f"[DEBUG] create_itinerary: warning - day[{day_idx}].items[{item_idx}] has no name")
                continue
            category = item.get("category") if item.get("category") in ("spot", "meal", "hotel", "move") else "spot"
            address = str(item.get("address") or "").strip()
            query = f"{name} {address}".strip()

            duration = None
            try:
                if item.get("durationMin") is not None:
                    duration = int(item["durationMin"])
            except (TypeError, ValueError):
                pass

            lat = lng = None
            try:
                if item.get("lat") is not None and item.get("lng") is not None:
                    lat, lng = float(item["lat"]), float(item["lng"])
            except (TypeError, ValueError):
                pass

            out: Dict[str, Any] = {
                "time": str(item["time"]) if item.get("time") else None,
                "name": name,
                "category": category,
                "description": str(item["description"]) if item.get("description") else None,
                "durationMin": duration,
                "mapUrl": _map_url(name, address),
                "lat": lat,
                "lng": lng,
            }
            if category != "move":
                if from_current:
                    # 散歩・ドライブは「現在地から」と「前の地点から」の両方を出す
                    out["navUrl"] = _dir_url(None, query, travelmode)
                    if prev_query:
                        out["prevNavUrl"] = _dir_url(prev_query, query, travelmode)
                elif prev_query:
                    out["navUrl"] = _dir_url(prev_query, query, travelmode)
                prev_query = query
            elif from_current and "戻る" in name:
                # 「出発地点へ戻る」等の周回コース末尾の move 項目。
                # モデルが lat/lng を tool call に渡し忘れることがあるため、
                # 実際にユーザーから受け取った現在地座標をサーバー側で補完する
                if lat is None or lng is None:
                    lat, lng = _fallback_current_location(state)
                    out["lat"], out["lng"] = lat, lng
                if lat is not None and lng is not None:
                    # 地名では検索できないため座標を直接目的地にする
                    out["navUrl"] = _dir_url(None, f"{lat},{lng}", travelmode)
            items_out.append(out)

        if items_out:
            label = _clean_response_text(str(day.get("label") or "")).strip()
            days_out.append({"label": label, "items": items_out})
            print(f"[DEBUG] create_itinerary: added day with {len(items_out)} items")
        else:
            print(f"[DEBUG] create_itinerary: day skipped (no items)")

    print(f"[DEBUG] create_itinerary: days_out total count={len(days_out)}")
    if not days_out:
        print(f"[DEBUG] create_itinerary: WARNING - no days with items, creating fallback itinerary")
        # If no items were provided, create a fallback itinerary with an empty placeholder
        # This prevents silent failures and gives the user feedback
        state["itinerary"] = {
            "title": title,
            "mode": mode,
            "transport": transport,
            "booking": None,
            "days": [],  # Empty days - Frontend will show error message
        }
        return {"status": "ok", "message": "日程表を登録しましたが、スポット情報が見つかりませんでした。具体的なスポット名を入れてもう一度お試しください。"}

    booking = None
    link = _BOOKING_LINKS.get(transport or "") if mode == "travel" else None
    if link:
        booking = {"label": link["label"], "url": _rakuten_affiliate_url(link["target"])}

    state["itinerary"] = {
        "title": title,
        "mode": mode,
        "transport": transport,
        "booking": booking,
        "days": days_out,
    }
    print(f"[DEBUG] create_itinerary: SUCCESS - set state['itinerary'] with {len(days_out)} days")
    return {
        "status": "ok",
        "message": "日程表を登録しました。アプリの画面にタイムラインUIで自動表示されるため、本文は日程表のデータや構造を含めず、プランの魅力の要約とホテル案内のみ簡潔に書いてください。",
    }


async def _execute_tool(name: str, args: Dict[str, Any], state: Dict[str, Any]) -> dict:
    state["tool_called"] = True
    print(f"[DEBUG] _execute_tool: calling {name}")
    if name == "search_hotels":
        return await _run_search_hotels(args, state)
    if name == "search_tourist_spots":
        return await _run_search_spots(args)
    if name == "search_spots_nearby":
        return await _run_search_nearby(args)
    if name == "create_itinerary":
        result = await _run_create_itinerary(args, state)
        print(f"[DEBUG] _execute_tool: create_itinerary returned, state['itinerary']={bool(state.get('itinerary'))}")
        return result
    return {"error": f"未知のツール: {name}"}


_TRANSPORT_LABELS = {"train": "電車", "bus": "バス", "car": "車", "plane": "飛行機"}


async def chat_with_gemini(
    user_message: str,
    conversation_history: List[Dict[str, str]] = None,
    system_prompt: str = None,  # 互換のため残置（サーバー側の指示を常に使用）
    user_location: Optional[Dict[str, float]] = None,
    transport: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Chat with Gemini model via Vertex AI, with travel tools (function calling).

    Args:
        user_location: {"lat": float, "lng": float}。散歩・ドライブモード等で
            search_spots_nearby に渡すため、メッセージ冒頭に付与する。
        transport: 旅行の移動手段の希望（train/bus/car/plane）。UIの選択チップから渡る。

    Returns:
        {"text": str, "hotels": list[dict], "search_context": dict | None}
    """
    model = _get_model()
    if not model:
        return {
            "text": "申し訳ありませんが、現在チャット機能は利用できません。GCP プロジェクト設定が不足しています。",
            "hotels": [],
            "search_context": None,
            "itinerary": None,
        }

    message = user_message
    sys_notes = []
    # 現在地つきの周辺コース依頼（散歩=徒歩 / ドライブ=車）。日程表の必須チェックにも使う
    nearby_mode = None
    if user_location and "lat" in user_location and "lng" in user_location:
        if "散歩" in user_message:
            nearby_mode = "walk"
        elif "ドライブ" in user_message:
            nearby_mode = "drive"
        sys_notes.append(
            f"ユーザーの現在地は lat={user_location['lat']}, lng={user_location['lng']} です。"
            "周辺検索にはこの座標を使うこと。"
        )
        if nearby_mode:
            label = "散歩" if nearby_mode == "walk" else "ドライブ"
            radius_hint = "radius_m=15000 程度で" if nearby_mode == "drive" else ""
            sys_notes.append(
                f"{label}の依頼なので、必ず search_spots_nearby を{radius_hint}呼び、"
                f"その結果から create_itinerary(mode={nearby_mode}) で日程表を登録すること。"
            )
    if transport in _TRANSPORT_LABELS:
        ride_note = ""
        if transport != "car":
            ride_note = f"乗る{_TRANSPORT_LABELS[transport]}の便・目安時刻を category=move の項目として行程に入れること。"
        sys_notes.append(
            f"ユーザーの移動手段の希望は{_TRANSPORT_LABELS[transport]}です。"
            f"create_itinerary を呼ぶときは transport='{transport}' を渡すこと。{ride_note}"
        )
    if sys_notes:
        message = f"[システム情報: {''.join(sys_notes)}回答は日本語で。]\n{user_message}"

    # flash-lite はまれに壊れた function call を出力する
    # （SDK が ResponseValidationError / "Finish reason: 9" で失敗する）ほか、
    # 指示を無視して英語で答えたり日程表登録を省いたりする。
    # いずれも一過性の失敗なので、会話を最初からやり直す形で最大3回試行する。
    _max_attempts = 3
    last_error: Optional[Exception] = None
    for _attempt in range(_max_attempts):
        state: Dict[str, Any] = {
            "hotels": [],
            "search_context": None,
            "itinerary": None,
            "tool_called": False,
            "user_location": user_location,
        }
        attempt_message = message
        if _attempt > 0:
            notes = ["必ず日本語で回答してください"]
            if user_location and nearby_mode:
                notes.append(
                    f"必ず search_spots_nearby を呼び、その結果から create_itinerary(mode={nearby_mode}) で日程表を登録してください"
                )
            if transport in ("train", "bus", "plane"):
                notes.append(
                    f"往路・復路の{_TRANSPORT_LABELS[transport]}の乗車を category=move の項目として必ず日程表に入れてください"
                )
            attempt_message = f"{message}\n（重要: {'。'.join(notes)}）"
        try:
            chat = model.start_chat(history=_build_history(conversation_history))
            response = await chat.send_message_async(attempt_message)

            for tool_turn in range(_MAX_TOOL_TURNS):
                calls = _extract_function_calls(response)
                if not calls:
                    print(f"[DEBUG] chat_with_gemini attempt {_attempt}: no more tool calls after {tool_turn} turns")
                    break
                print(f"[DEBUG] chat_with_gemini attempt {_attempt} turn {tool_turn}: {len(calls)} tool calls")
                response_parts = []
                for call in calls:
                    args = _to_plain(call.args) if call.args else {}
                    result = await _execute_tool(call.name, args, state)
                    response_parts.append(
                        Part.from_function_response(name=call.name, response={"content": result})
                    )
                response = await chat.send_message_async(response_parts)

            text = _clean_response_text(_extract_text(response))
            print(f"[DEBUG] chat_with_gemini: after tool calls, state['itinerary']={bool(state['itinerary'])}, text_len={len(text)}")
            if not text:
                # 本文が空でも日程表やホテルが取れていれば成果はあるので、
                # エラー風の文言ではなく案内文にする
                if state["itinerary"] or state["hotels"]:
                    text = "プランをまとめました！下の日程表"
                    if state["hotels"]:
                        text += "とホテルカード（『楽天トラベルで予約』ボタンつき）"
                    text += "をご覧ください。"
                else:
                    text = "申し訳ありません、応答を生成できませんでした。もう一度お試しください。"

            is_last_attempt = _attempt == _max_attempts - 1

            if not is_last_attempt and _looks_non_japanese(text):
                last_error = Exception("応答が日本語になりませんでした")
                continue

            # 散歩・ドライブモード（現在地つきの依頼）なのに日程表が登録されなかった
            # 場合はやり直す（ツールを呼ばず知識で書く／日程表登録を省くのが
            # flash-lite の頻出失敗。最終試行まで失敗したらそのまま返す）
            if (
                not is_last_attempt
                and user_location
                and nearby_mode
                and not state["itinerary"]
            ):
                last_error = Exception("散歩/ドライブモードで日程表が生成されませんでした")
                continue

            # 移動手段（電車・バス・飛行機）指定なのに乗車の行程（move）が
            # 入らないのも flash-lite の頻出失敗。日程表があってもやり直す
            if (
                not is_last_attempt
                and transport in ("train", "bus", "plane")
                and state["itinerary"]
                and not any(
                    item["category"] == "move"
                    for day in state["itinerary"]["days"]
                    for item in day["items"]
                )
            ):
                last_error = Exception("移動手段指定なのに乗車の行程が入りませんでした")
                continue

            print(f"[DEBUG] chat_with_gemini: SUCCESS, returning itinerary={bool(state['itinerary'])}")
            return {
                "text": text,
                "hotels": state["hotels"],
                "search_context": state["search_context"],
                "itinerary": state["itinerary"],
            }

        except Exception as e:
            last_error = e
            print(f"[DEBUG] chat_with_gemini: exception in attempt {_attempt}: {str(e)}")
            continue

    print(f"[DEBUG] chat_with_gemini: ALL ATTEMPTS FAILED, last_error={str(last_error)}")
    return {
        "text": f"申し訳ありませんが、エラーが発生しました: {str(last_error)}",
        "hotels": [],
        "search_context": None,
        "itinerary": None,
    }


async def stream_chat_with_gemini(
    user_message: str,
    conversation_history: List[Dict[str, str]] = None,
    system_prompt: str = None,
):
    """
    Stream chat with Gemini model via Vertex AI.
    ツール呼び出しには非対応（/api/chat を使用すること）。
    """
    model = _get_model()
    if not model:
        return

    try:
        history = _build_history(conversation_history)
        chat = model.start_chat(history=history)

        prompt = f"{system_prompt}\n\nユーザー: {user_message}" if system_prompt else user_message

        response = await chat.send_message_async(prompt, stream=True)

        async for chunk in response:
            # ツールがバインドされているため function_call チャンクが混ざり得る。
            # その場合 chunk.text は例外を投げるので読み飛ばす。
            try:
                text = chunk.text
            except (ValueError, AttributeError):
                continue
            if text:
                yield text

    except Exception as e:
        yield f"エラーが発生しました: {str(e)}"
