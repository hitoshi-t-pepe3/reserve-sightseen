import os
from typing import List, Dict, Any, Optional
import vertexai
from vertexai.generative_models import GenerativeModel, Content, Part
from app.config import settings

# Initialize Vertex AI
_initialized = False
_model = None


def _init_vertex_ai():
    global _initialized, _model
    if _initialized:
        return

    project_id = settings.gcp_project_id or os.environ.get("GOOGLE_CLOUD_PROJECT", "")
    location = settings.gcp_location or "us-central1"

    if project_id:
        vertexai.init(project=project_id, location=location)
        # Using the cheapest available model: gemini-2.5-flash-lite
        _model = GenerativeModel("gemini-2.5-flash-lite")

    _initialized = True


def _get_model():
    _init_vertex_ai()
    return _model


async def chat_with_gemini(
    user_message: str,
    conversation_history: List[Dict[str, str]] = None,
    system_prompt: str = None
) -> str:
    """
    Chat with Gemini model via Vertex AI.

    Args:
        user_message: User's message
        conversation_history: List of previous messages with 'role' and 'content'
        system_prompt: Optional system prompt

    Returns:
        Response text from Gemini
    """
    model = _get_model()
    if not model:
        return "申し訳ありませんが、現在チャット機能は利用できません。GCP プロジェクト設定が不足しています。"

    try:
        # Build conversation history as Vertex AI Content objects
        history = []
        if conversation_history:
            for msg in conversation_history:
                role = "user" if msg.get("role") == "user" else "model"
                history.append(Content(role=role, parts=[Part.from_text(msg.get("content", ""))]))

        chat = model.start_chat(history=history)

        if system_prompt:
            prompt = f"{system_prompt}\n\nユーザー: {user_message}"
        else:
            prompt = user_message

        response = await chat.send_message_async(prompt)

        return response.text

    except Exception as e:
        return f"申し訳ありませんが、エラーが発生しました: {str(e)}"


async def stream_chat_with_gemini(
    user_message: str,
    conversation_history: List[Dict[str, str]] = None,
    system_prompt: str = None
):
    """
    Stream chat with Gemini model via Vertex AI.
    """
    model = _get_model()
    if not model:
        return

    try:
        history = []
        if conversation_history:
            for msg in conversation_history:
                role = "user" if msg.get("role") == "user" else "model"
                history.append(Content(role=role, parts=[Part.from_text(msg.get("content", ""))]))

        chat = model.start_chat(history=history)

        prompt = f"{system_prompt}\n\nユーザー: {user_message}" if system_prompt else user_message

        response = await chat.send_message_async(prompt, stream=True)

        async for chunk in response:
            if chunk.text:
                yield chunk.text

    except Exception as e:
        yield f"エラーが発生しました: {str(e)}"