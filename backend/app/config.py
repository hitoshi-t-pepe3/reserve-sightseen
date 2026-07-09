from pydantic_settings import BaseSettings
from pydantic import field_validator
from typing import List, Union
import json


class Settings(BaseSettings):
    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}

    # Rakuten Travel API
    rakuten_application_id: str = ""
    rakuten_affiliate_id: str = ""
    rakuten_access_key: str = ""

    # Jalan Web Service
    jalan_affiliate_id: str = ""

    # Google Places API
    google_places_api_key: str = ""

    # Claude API
    anthropic_api_key: str = ""

    # Gemini API (legacy, API-key based; unused when Vertex AI is configured)
    gemini_api_key: str = ""

    # Vertex AI (GCP project-based Gemini access)
    gcp_project_id: str = ""
    gcp_location: str = "asia-northeast1"

    # App
    app_name: str = "ReserveSightseeing"
    debug: bool = False

    # CORS origins - Union で文字列も受け付ける
    cors_origins: Union[List[str], str] = [
        "http://localhost:3000",
        "https://faction-scavenger-late.ngrok-free.dev",
    ]

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except json.JSONDecodeError:
                return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v

    # Union を List に正規化
    @field_validator("cors_origins", mode="after")
    @classmethod
    def normalize_cors_origins(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except json.JSONDecodeError:
                return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v


settings = Settings()
