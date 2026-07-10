import asyncio
import os
from datetime import datetime
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

# ツール呼び出しの往復上限。ホテル検索+観光地検索+まとめで通常2〜3回で収束する。
_MAX_TOOL_TURNS = 4


def _system_instruction() -> str:
    now = datetime.now(ZoneInfo("Asia/Tokyo"))
    weekdays = ["月", "火", "水", "木", "金", "土", "日"]
    today = f"{now.strftime('%Y-%m-%d')}（{weekdays[now.weekday()]}）"
    areas = "、".join(AREA_COORDS.keys())
    return f"""あなたは旅行プラン提案アシスタント「ReserveSightseen」です。
今日は {today} です。「来週末」「明日」などの相対的な日付は、この日付を基準に YYYY-MM-DD 形式へ変換してください。過去の日付が指定されたら翌年ではなく、日付の確認をしてください。

## 絶対のルール（違反禁止）
- ホテル名・料金を回答に書いてよいのは、search_hotels の結果を受け取った後だけです。ツールを呼ばずに知識からホテルを提案することは禁止です。
- 観光地を提案する前に必ず search_tourist_spots を呼びます。
- 行き先・宿泊日・人数が揃ったら、文章を書き始める前にまずツールを呼び出してください。これは会話が何往復目でも同じです。

## 進め方
1. プラン作成には「行き先」「チェックイン日・チェックアウト日」「人数」が必要です。足りない情報だけを1回のメッセージで簡潔に質問してください（既に会話に出ている情報は聞き直さない）。
2. 3つが揃ったら、必ず search_hotels と search_tourist_spots を呼び出し、実データに基づいて提案してください。
3. 提案は次の構成でまとめてください:
   - **旅行プラン**: 1日ごとに「午前・午後・夜」のモデルコース（観光地はツール結果から選ぶ）
   - **おすすめホテル**: ツール結果の上位2〜3件。ホテル名・1泊料金・特徴（最寄り駅や評価）を短く
4. 最後に「気になるホテルは、下のホテルカードの『楽天トラベルで予約』ボタンからそのまま予約できます」と案内してください。

## 制約
- ホテル名・料金・観光地名はツールの結果だけを使い、創作しないでください。
- 料金が取得できないホテルは「料金は要確認」と書いてください。
- 対応エリア: {areas}。それ以外の行き先を希望されたら、対応エリアの中から近い候補を提案してください。
- 曜日は計算を誤りやすいため、日付に曜日を書き添えないでください（今日の曜日のみ上に示した通り）。
- 回答は日本語で、Markdownの見出し・箇条書きを使って読みやすく。長すぎないように。"""


_SEARCH_HOTELS_DECL = FunctionDeclaration(
    name="search_hotels",
    description=(
        "楽天トラベルでエリア名からホテルを検索する。宿泊日と人数を指定すると"
        "空室の実勢最安料金つきで返す。対応エリア: " + "、".join(AREA_COORDS.keys())
    ),
    parameters={
        "type": "object",
        "properties": {
            "area": {"type": "string", "description": "エリア名（例: 京都）"},
            "checkin": {"type": "string", "description": "チェックイン日 YYYY-MM-DD"},
            "checkout": {"type": "string", "description": "チェックアウト日 YYYY-MM-DD"},
            "adults": {"type": "integer", "description": "大人の人数（デフォルト2）"},
        },
        "required": ["area"],
    },
)

_SEARCH_SPOTS_DECL = FunctionDeclaration(
    name="search_tourist_spots",
    description="Google Places でエリアの観光スポットまたは飲食店を検索する。",
    parameters={
        "type": "object",
        "properties": {
            "area": {"type": "string", "description": "エリア名（例: 京都）"},
            "category": {
                "type": "string",
                "enum": ["sightseeing", "restaurant"],
                "description": "sightseeing=観光スポット, restaurant=飲食店",
            },
        },
        "required": ["area"],
    },
)

_TRAVEL_TOOL = Tool(function_declarations=[_SEARCH_HOTELS_DECL, _SEARCH_SPOTS_DECL])


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


async def _run_search_hotels(args: Dict[str, Any], state: Dict[str, Any]) -> dict:
    area = str(args.get("area") or "").strip()
    checkin = args.get("checkin") or None
    checkout = args.get("checkout") or None
    try:
        adults = int(args.get("adults") or 2)
    except (TypeError, ValueError):
        adults = 2

    try:
        hotels = await rakuten_travel_tool.search_by_area(
            area_name=area,
            checkin=checkin,
            checkout=checkout,
            adults=adults,
            hits=8,
            realistic_price_limit=5,
        )
    except ValueError:
        return {
            "error": f"「{area}」は未対応エリアです。",
            "supported_areas": list(AREA_COORDS.keys()),
        }
    except Exception as e:
        return {"error": f"ホテル検索に失敗しました: {e}"}

    hotels = hotels[:6]
    state["hotels"] = hotels
    state["search_context"] = {
        "area": area,
        "checkin": checkin,
        "checkout": checkout,
        "adults": adults,
    }
    return {"hotels": _compact_hotels(hotels), "count": len(hotels)}


async def _run_search_spots(args: Dict[str, Any]) -> dict:
    area = str(args.get("area") or "").strip()
    category = args.get("category") or "sightseeing"
    try:
        # googlemaps クライアントは同期実装のためスレッドに逃がす
        if category == "restaurant":
            spots = await asyncio.to_thread(google_places_tool.search_restaurants, area)
        else:
            spots = await asyncio.to_thread(google_places_tool.search_tourist_spots, area)
    except Exception as e:
        return {"error": f"観光地検索に失敗しました: {e}"}

    return {
        "spots": [
            {
                "name": s.name,
                "rating": s.rating,
                "reviews": s.user_ratings_total,
                "address": s.address,
            }
            for s in spots[:8]
        ]
    }


async def _execute_tool(name: str, args: Dict[str, Any], state: Dict[str, Any]) -> dict:
    if name == "search_hotels":
        return await _run_search_hotels(args, state)
    if name == "search_tourist_spots":
        return await _run_search_spots(args)
    return {"error": f"未知のツール: {name}"}


async def chat_with_gemini(
    user_message: str,
    conversation_history: List[Dict[str, str]] = None,
    system_prompt: str = None,  # 互換のため残置（サーバー側の指示を常に使用）
) -> Dict[str, Any]:
    """
    Chat with Gemini model via Vertex AI, with travel tools (function calling).

    Returns:
        {"text": str, "hotels": list[dict], "search_context": dict | None}
    """
    model = _get_model()
    if not model:
        return {
            "text": "申し訳ありませんが、現在チャット機能は利用できません。GCP プロジェクト設定が不足しています。",
            "hotels": [],
            "search_context": None,
        }

    state: Dict[str, Any] = {"hotels": [], "search_context": None}

    try:
        chat = model.start_chat(history=_build_history(conversation_history))
        response = await chat.send_message_async(user_message)

        for _ in range(_MAX_TOOL_TURNS):
            calls = _extract_function_calls(response)
            if not calls:
                break
            response_parts = []
            for call in calls:
                args = {key: value for key, value in call.args.items()} if call.args else {}
                result = await _execute_tool(call.name, args, state)
                response_parts.append(
                    Part.from_function_response(name=call.name, response={"content": result})
                )
            response = await chat.send_message_async(response_parts)

        text = _extract_text(response)
        if not text:
            text = "申し訳ありません、応答を生成できませんでした。もう一度お試しください。"

        return {"text": text, "hotels": state["hotels"], "search_context": state["search_context"]}

    except Exception as e:
        return {
            "text": f"申し訳ありませんが、エラーが発生しました: {str(e)}",
            "hotels": [],
            "search_context": None,
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
