from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field


class NostrEvent(BaseModel):
    """基本的な Nostr イベント構造（NIP-01）"""
    id: Optional[str] = None
    pubkey: str
    created_at: int
    kind: int
    tags: List[List[str]] = Field(default_factory=list)
    content: str
    sig: Optional[str] = None


class PlanChatEvent(BaseModel):
    """プランベース Bitchat イベント（Nostr 準拠）"""
    channel_id: str
    plan_id: str
    author_pubkey: str
    content: str
    day: Optional[int] = None
    location: Optional[str] = None
    created_at: int = Field(default_factory=lambda: int(datetime.utcnow().timestamp()))

    def to_nostr_tags(self) -> List[List[str]]:
        """Nostr タグ形式に変換"""
        tags = [
            ["e", self.channel_id, "root"],
            ["u", f"bitchat://channel/{self.channel_id}"],
            ["plan", self.plan_id],
        ]
        if self.day is not None:
            tags.append(["day", str(self.day)])
        if self.location:
            tags.append(["location", self.location])
        return tags


class ChatMember(BaseModel):
    """チャットメンバー情報"""
    channel_id: str
    pubkey: str
    joined_at: datetime = Field(default_factory=datetime.utcnow)
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None


class ChatChannel(BaseModel):
    """チャットチャンネル情報"""
    channel_id: str
    plan_id: str
    title: str
    description: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    member_count: int = 0
    is_active: bool = True
