from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}

    # Rakuten Travel API
    rakuten_application_id: str = ""
    rakuten_affiliate_id: str = ""

    # Jalan Web Service
    jalan_affiliate_id: str = ""

    # Google Places API
    google_places_api_key: str = ""

    # Claude API
    anthropic_api_key: str = ""

    # App
    app_name: str = "ReserveSightseen"
    debug: bool = False


settings = Settings()