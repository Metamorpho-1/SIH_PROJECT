from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional

class Settings(BaseSettings):
    PROJECT_NAME: str = "AURA-Fire"
    VERSION: str = "1.0.0"
    ENVIRONMENT: str = "development"
    LOG_LEVEL: str = "INFO"
    SECRET_KEY: str = "aura-fire-secret-key-sih-2026"

    # Database
    POSTGRES_SERVER: str = "localhost"
    POSTGRES_PORT: int = 5432
    POSTGRES_USER: str = "aura_user"
    POSTGRES_PASSWORD: str = "aura_password"
    POSTGRES_DB: str = "aura_fire_db"
    DATABASE_URL: Optional[str] = None

    # Redis & Celery
    REDIS_URL: str = "redis://localhost:6379/0"
    CELERY_BROKER_URL: str = "redis://localhost:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/0"

    # NASA FIRMS
    NASA_FIRMS_MAP_KEY: Optional[str] = None
    FIRMS_COUNTRY_CODE: str = "IND"
    FIRMS_SENSOR: str = "VIIRS_SNPP_NRT"

    # Planetary Computer STAC
    PC_STAC_API_URL: str = "https://planetarycomputer.microsoft.com/api/stac/v1"
    PC_API_KEY: Optional[str] = None

    # Open-Meteo
    OPEN_METEO_API_URL: str = "https://api.open-meteo.com/v1/forecast"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    def get_database_url(self) -> str:
        if self.DATABASE_URL:
            return self.DATABASE_URL
        return f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_SERVER}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"

settings = Settings()
