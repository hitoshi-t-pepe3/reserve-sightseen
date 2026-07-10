from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from app.services.gemini_chat import chat_with_gemini, stream_chat_with_gemini
from fastapi.responses import StreamingResponse

router = APIRouter(prefix="/chat", tags=["chat"])


class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str


class ChatRequest(BaseModel):
    message: str
    conversation_history: Optional[List[dict]] = []
    system_prompt: Optional[str] = None  # 互換のため受けるが、サーバー側の指示を常に使用


class SearchContext(BaseModel):
    area: Optional[str] = None
    checkin: Optional[str] = None
    checkout: Optional[str] = None
    adults: Optional[int] = None


class ChatResponse(BaseModel):
    response: str
    # チャット中にツールが検索したホテル（/api/hotels/search-area と同じ構造）。
    # フロントはこれをカード表示し、予約導線につなげる。
    hotels: List[dict] = []
    search_context: Optional[SearchContext] = None


@router.post("", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """
    Chat with Gemini model (travel tools enabled).
    """
    try:
        result = await chat_with_gemini(
            user_message=request.message,
            conversation_history=request.conversation_history,
        )
        return ChatResponse(
            response=result["text"],
            hotels=result["hotels"],
            search_context=result["search_context"],
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/stream")
async def chat_stream(request: ChatRequest):
    """
    Chat with Gemini model (streaming response).
    """
    async def generate():
        async for chunk in stream_chat_with_gemini(
            user_message=request.message,
            conversation_history=request.conversation_history,
            system_prompt=request.system_prompt
        ):
            yield f"data: {chunk}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")