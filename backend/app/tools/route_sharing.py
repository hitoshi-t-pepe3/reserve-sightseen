import base64
import json
import hashlib
import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class SharedRoute(BaseModel):
    title: str
    mode: str  # travel, walk, drive
    transport: Optional[str] = None
    days: list[dict]
    plan_id: Optional[str] = None


class ShareResponse(BaseModel):
    share_id: str
    share_url: str
    expires_at: Optional[str] = None


class RouteSharingManager:
    """ルート情報のシェア・復元を管理"""

    def encode_route(self, route: dict) -> str:
        """ルート情報を Base64 エンコード"""
        try:
            json_str = json.dumps(route, ensure_ascii=False)
            encoded = base64.urlsafe_b64encode(json_str.encode()).decode()
            return encoded
        except Exception as e:
            raise Exception(f"Route encoding failed: {str(e)}")

    def decode_route(self, share_id: str) -> Optional[dict]:
        """Base64 をデコードしてルート情報を復元"""
        try:
            # URL-safe Base64 をパディング込みで復元
            padding = 4 - (len(share_id) % 4)
            if padding != 4:
                share_id += "=" * padding

            decoded_bytes = base64.urlsafe_b64decode(share_id)
            decoded_str = decoded_bytes.decode()
            route_dict = json.loads(decoded_str)
            return route_dict
        except Exception as e:
            print(f"Route decoding failed: {e}")
            return None

    def generate_share_url(self, route: dict, base_url: str = "https://reserve-sightseen.app") -> str:
        """ルート情報からシェア URL を生成"""
        share_id = self.encode_route(route)
        return f"{base_url}/routes/{share_id}"

    def generate_chat_channel_id(self, plan_id: str) -> str:
        """プラン ID からプランベース Bitchat チャンネル ID を生成（SHA256）"""
        hash_obj = hashlib.sha256(plan_id.encode())
        return f"plan_{hash_obj.hexdigest()[:32]}"

    def create_shared_plan_with_chat(self, route_data: dict) -> dict:
        """プランと Bitchat チャンネルを同時に作成"""
        plan_id = route_data.get("planId") or str(uuid.uuid4())
        channel_id = self.generate_chat_channel_id(plan_id)

        return {
            "planId": plan_id,
            "shareUrl": f"/routes/{plan_id}",
            "chatChannelId": channel_id,
            "chatInviteUrl": f"bitchat://channel/{channel_id}",
            "createdAt": datetime.utcnow().isoformat()
        }


# シングルトンインスタンス
route_sharing_manager = RouteSharingManager()
