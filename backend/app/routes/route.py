from fastapi import APIRouter, HTTPException
from datetime import datetime
from typing import Optional
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
from app.models.bitchat import PlanChatEvent, ChatChannel, ChatMember

router = APIRouter()

# In-memory storage for plan-based chat metadata (will be replaced with DB in production)
plan_chat_storage: dict = {}  # {plan_id: ChatChannel}
chat_members_storage: dict = {}  # {channel_id: [ChatMember, ...]}


def _get_or_create_chat_channel(plan_id: str) -> ChatChannel:
    """プランのチャットチャンネルを取得。未登録なら自動作成する。

    /api/route/share-with-chat（他人を招待する共有フロー）を経由していない
    プラン（保存済みプラン一覧から直接開いた自分だけのチャットなど）でも
    必ずチャットを使えるようにするため、遅延作成する。
    """
    if plan_id not in plan_chat_storage:
        channel_id = route_sharing_manager.generate_chat_channel_id(plan_id)
        plan_chat_storage[plan_id] = ChatChannel(
            channel_id=channel_id,
            plan_id=plan_id,
            title="無題のプラン",
            created_at=datetime.utcnow(),
            member_count=0,
            is_active=True,
        )
        chat_members_storage[channel_id] = []
    return plan_chat_storage[plan_id]


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


@router.post("/route/share-with-chat", tags=["bitchat"])
async def share_with_chat(route_data: dict) -> dict:
    """
    プランを Bitchat チャンネルと共に共有する。

    Request:
    - itinerary: イテラリオブジェクト（タイトルなど）
    - title: プランのタイトル
    - planId: プラン ID（省略時は自動生成）

    Response:
    - planId: プラン ID
    - shareUrl: 通常のシェア URL
    - chatChannelId: Bitchat チャンネル ID
    - chatInviteUrl: Bitchat チャンネル招待 URL
    - createdAt: 作成日時
    """
    try:
        shared_plan = route_sharing_manager.create_shared_plan_with_chat(route_data)
        plan_id = shared_plan["planId"]
        channel_id = shared_plan["chatChannelId"]

        # channel_id は plan_id から決定的に導出されるため、保存プラン一覧から
        # 直接チャットを開いて既にメッセージ・メンバーが存在する場合がある。
        # ここで無条件に上書きすると、それらを消してしまうため、既存があれば
        # タイトルだけ更新し、メンバー・メッセージ履歴は保持する。
        existing = plan_chat_storage.get(plan_id)
        plan_chat_storage[plan_id] = ChatChannel(
            channel_id=channel_id,
            plan_id=plan_id,
            title=route_data.get("title") or (existing.title if existing else "無題のプラン"),
            description=route_data.get("description") or (existing.description if existing else None),
            created_at=existing.created_at if existing else datetime.utcnow(),
            member_count=len(chat_members_storage.get(channel_id, [])),
            is_active=True,
        )
        chat_members_storage.setdefault(channel_id, [])

        return shared_plan
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Share with chat error: {str(e)}")


@router.get("/plan/{plan_id}/chat-members", tags=["bitchat"])
async def get_chat_members(plan_id: str) -> dict:
    """
    プランの Bitchat メンバー情報を取得する。

    Parameters:
    - plan_id: プラン ID

    Response:
    - plan_id: プラン ID
    - channel_id: チャンネル ID
    - title: プランのタイトル
    - member_count: メンバー数
    - members: メンバー情報リスト（最初の5人）
    """
    try:
        channel = _get_or_create_chat_channel(plan_id)
        members = chat_members_storage.get(channel.channel_id, [])[:5]

        return {
            "plan_id": plan_id,
            "channel_id": channel.channel_id,
            "title": channel.title,
            "member_count": len(members),
            "members": [
                {
                    "pubkey": m.pubkey,
                    "display_name": m.display_name,
                    "joined_at": m.joined_at.isoformat(),
                }
                for m in members
            ],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Get chat members error: {str(e)}")


@router.post("/plan/{plan_id}/chat-message", tags=["bitchat"])
async def log_chat_message(plan_id: str, message_data: dict) -> dict:
    """
    プランチャットメッセージをログに記録する（分析用）。

    Parameters:
    - plan_id: プラン ID

    Request:
    - author_pubkey: 送信者の Nostr 公開鍵
    - content: メッセージ内容
    - day: 旅行日（省略可能）
    - location: 場所（省略可能）

    Response:
    - success: 記録成功フラグ
    - message_id: メッセージ ID
    """
    try:
        channel = _get_or_create_chat_channel(plan_id)

        # メッセージをイベント化
        event = PlanChatEvent(
            channel_id=channel.channel_id,
            plan_id=plan_id,
            author_pubkey=message_data.get("author_pubkey"),
            content=message_data.get("content"),
            day=message_data.get("day"),
            location=message_data.get("location"),
        )

        # メンバー登録（初回のみ）
        members = chat_members_storage.get(channel.channel_id, [])
        if not any(m.pubkey == event.author_pubkey for m in members):
            members.append(
                ChatMember(
                    channel_id=channel.channel_id,
                    pubkey=event.author_pubkey,
                    display_name=message_data.get("display_name"),
                )
            )
            chat_members_storage[channel.channel_id] = members
            plan_chat_storage[plan_id].member_count = len(members)

        return {
            "success": True,
            "message_id": f"{channel.channel_id}:{event.created_at}",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Log chat message error: {str(e)}")
