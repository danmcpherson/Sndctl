"""Configuration settings for Sound Control."""

import os
from pathlib import Path
from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables or defaults."""
    
    # Server settings
    host: str = "127.0.0.1"
    port: int = 8000
    debug: bool = False
    
    # Data directory for macros, etc.
    data_directory: str = "data"
    
    # soco-cli HTTP API settings
    soco_cli_port: int = 8001
    soco_cli_executable_path: str | None = None
    soco_cli_use_local_cache: bool = False
    
    # OpenAI settings for voice control (standalone mode)
    openai_api_key: str | None = None
    
    # sndctl-server settings (server mode - preferred)
    # When configured, ephemeral tokens are obtained from the server
    # instead of calling OpenAI directly with a local API key
    sndctl_server_url: str | None = None  # e.g., "https://sndctl.app"
    sndctl_device_id: str | None = None   # 12-character hex device ID
    sndctl_device_secret: str | None = None  # 64-character hex device secret
    
    # Auto-upgrade settings
    # Ring determines upgrade priority: 0 = canary (immediate), 1-3 = staged rollout
    # Higher rings get updates later after lower rings validate stability
    upgrade_ring: int = 3  # Default to most conservative ring
    upgrade_enabled: bool = True  # Whether auto-upgrades are enabled
    upgrade_check_hour: int = 4  # Hour (0-23) to check for upgrades (local time)
    
    # Static files directory
    wwwroot_path: str = "../wwwroot"
    
    class Config:
        env_prefix = "SNDCTL_"
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
