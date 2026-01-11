"""Configuration settings for Sound Control."""

import os
from pathlib import Path
from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables or defaults."""
    
    # Server settings
    host: str = "127.0.0.1"
    port: int = 5000
    debug: bool = False
    
    # Data directory for macros, etc.
    data_directory: str = "data"
    
    # soco-cli HTTP API settings
    soco_cli_port: int = 8000
    soco_cli_executable_path: str | None = None
    soco_cli_use_local_cache: bool = False
    
    # OpenAI settings for voice control
    openai_api_key: str | None = None
    
    # Static files directory
    wwwroot_path: str = "../wwwroot"
    
    class Config:
        env_prefix = "SONOS_HUB_"
        env_file = ".env"
        env_file_encoding = "utf-8"
    
    @property
    def soco_cli_url(self) -> str:
        """Get the soco-cli server URL."""
        return f"http://localhost:{self.soco_cli_port}"
    
    @property
    def macros_file_path(self) -> Path:
        """Get the absolute path to the macros file."""
        return Path(self.data_directory).resolve() / "macros.txt"
    
    @property
    def macros_metadata_path(self) -> Path:
        """Get the absolute path to the macros metadata file."""
        return Path(self.data_directory).resolve() / "macros-metadata.json"


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
