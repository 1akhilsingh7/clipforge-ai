from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Central place for every environment variable the API reads.
    Using pydantic-settings means a missing/misconfigured var fails
    at process startup with a clear error, not deep inside a request.
    """

    model_config = SettingsConfigDict(env_file="../../.env", extra="ignore")

    api_secret_key: str
    database_url: str
    environment: str = "development"

    # CPU-friendly defaults for local dev. In production, set
    # whisper_device=cuda and bump the model size once you have a GPU box.
    whisper_model_size: str = "small"
    whisper_device: str = "cpu"
    whisper_compute_type: str = "int8"

    replicate_api_token: str = ""
    anthropic_api_key: str = ""

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


settings = Settings()
