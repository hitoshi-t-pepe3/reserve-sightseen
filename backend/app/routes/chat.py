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
    system_prompt: Optional[str] = None


class ChatResponse(BaseModel):
    response: str


@router.post("", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """
    Chat with Gemini model.
    """
    try:
        response = await chat_with_gemini(
            user_message=request.message,
            conversation_history=request.conversation_history,
            system_prompt=request.system_prompt
        )
        return ChatResponse(response=response)
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