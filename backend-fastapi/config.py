from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8"
    )

    SECRET_KEY: str = "supersecretkey-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/fastapi_db"

    DEFAULT_ADMIN_EMAIL: str = "admin@example.com"
    DEFAULT_ADMIN_PASSWORD: str = "Tcs#1234"

    DPI_WEIGHT: float = 0.40
    SCORE_WEIGHT: float = 0.60

    OLLAMA_BASE_URL: str = "http://172.20.201.87:9007"
    OLLAMA_MODEL: str = "mistral:latest"
    OLLAMA_TIMEOUT: float = 1800.0


settings = Settings()
