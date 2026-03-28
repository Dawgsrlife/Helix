from enum import Enum

from pydantic_settings import BaseSettings


class Evo2Mode(str, Enum):
    LOCAL = "local"
    NIM_API = "nim_api"
    MOCK = "mock"


class StructureMode(str, Enum):
    ALPHAFOLD_API = "alphafold_api"
    COLABFOLD = "colabfold"
    ESMFOLD = "esmfold"
    MOCK = "mock"


class Settings(BaseSettings):
    # Evo2
    evo2_mode: Evo2Mode = Evo2Mode.MOCK
    evo2_nim_api_key: str = ""
    evo2_nim_api_url: str = "https://build.nvidia.com/arc/evo2-40b"
    evo2_model_path: str = "arcinstitute/evo2_7b"

    # Structure prediction
    structure_mode: StructureMode = StructureMode.MOCK
    alphafold_api_key: str = ""

    # Intent parsing
    intent_llm: str = "claude"
    anthropic_api_key: str = ""
    openai_api_key: str = ""
    gemini_api_key: str = ""
    intent_allow_live_calls: bool = False

    # Infrastructure
    redis_url: str = "redis://localhost:6379/0"
    celery_broker: str = "redis://localhost:6379/1"
    frontend_url: str = "http://localhost:3000"
    port: int = 8000

    # Hugging Face
    hugging_face_token: str = ""

    # Allow extra env vars (teammates may add keys we don't own)
    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}


settings = Settings()
