from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime
import json

router = APIRouter()


class Message(BaseModel):
    id: str
    role: str
    content: str
    timestamp: datetime
    isStreaming: Optional[bool] = False


class ChatRequest(BaseModel):
    message: str
    conversationHistory: List[Message] = Field(default_factory=list)


class ChatResponse(BaseModel):
    message: str
    toolsUsed: List[str] = Field(default_factory=list)


@router.post("/chat", response_model=ChatResponse)
async def chat_endpoint(request: ChatRequest):
    """
    チャットエンドポイント（仮実装）。
    将来的には Claude API Tool Use でエージェントとして動作する。
    """
    # 仮のレスポンス: ユーザーメッセージをオウム返し + 簡単なガイド
    user_msg = request.message
    history_len = len(request.conversationHistory)

    if history_len <= 1:  # Welcome message only
        response = (
            "ありがとうございます。旅行のご希望を詳しく教えてください。\n\n"
            "例えば：\n"
            "• 行き先（例：京都、沖縄、北海道など）\n"
            "• 日数（例：2泊3日、週末だけ など）\n"
            "• 予算（例：1人5万円以内、家族で20万円など）\n"
            "• 好み（温泉、観光、グルメ、自然、アクティビティなど）\n"
            "• 同行者（ひとり旅、カップル、家族、友人グループなど）\n\n"
            "これらをお聞かせいただければ、ぴったりのプランを提案します！"
        )
    else:
        response = (
            f"「{user_msg}」ですね。承知しました。\n\n"
            "詳細な条件をもう少しお聞かせいただけますか？\n"
            "具体的なプランを作成するために、上記の項目（行き先、日数、予算、好み、同行者）を"
            "できるだけ教えてください。"
        )

    return ChatResponse(message=response, toolsUsed=[])