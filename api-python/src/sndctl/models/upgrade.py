"""Models for auto-upgrade functionality."""

from datetime import datetime
from enum import Enum
from pydantic import BaseModel, Field


class UpgradeRing(int, Enum):
    """Deployment ring for staged rollouts.
    
    Lower numbers receive updates first, allowing validation before
    wider deployment.
    """
    CANARY = 0  # Immediate updates for testing
    EARLY = 1   # Early adopters, 1 day after canary
    GENERAL = 2  # General availability, 3 days after canary
    CONSERVATIVE = 3  # Most stable, 7 days after canary


class VersionInfo(BaseModel):
    """Version information for an available release."""
    version: str = Field(..., description="Semantic version string (e.g., '1.2.3')")
    release_date: datetime = Field(..., description="When this version was released")
    download_url: str = Field(..., description="URL to download the package")
    checksum: str = Field(..., description="SHA256 checksum of the package")
    release_notes: str | None = Field(None, description="Optional release notes")
    min_ring: int = Field(
        default=0,
        ge=0,
        le=3,
        description="Minimum ring that can receive this update (0-3)"
    )

    class Config:
        populate_by_name = True
        alias_generator = lambda s: ''.join(
            word.capitalize() if i else word 
            for i, word in enumerate(s.split('_'))
        )


class UpgradeCheckRequest(BaseModel):
    """Request payload for checking available upgrades."""
    device_id: str = Field(..., description="Unique device identifier")
    current_version: str = Field(..., description="Currently installed version")
    ring: int = Field(
        default=3,
        ge=0,
        le=3,
        description="Device's deployment ring (0-3)"
    )
    
    class Config:
        populate_by_name = True
        alias_generator = lambda s: ''.join(
            word.capitalize() if i else word 
            for i, word in enumerate(s.split('_'))
        )


class UpgradeCheckResponse(BaseModel):
    """Response from upgrade check endpoint."""
    update_available: bool = Field(..., description="Whether an update is available")
    current_version: str = Field(..., description="Currently installed version")
    latest_version: VersionInfo | None = Field(
        None,
        description="Information about the latest available version"
    )
    
    class Config:
        populate_by_name = True
        alias_generator = lambda s: ''.join(
            word.capitalize() if i else word 
            for i, word in enumerate(s.split('_'))
        )


class UpgradeStatus(str, Enum):
    """Status of an upgrade operation."""
    IDLE = "idle"
    CHECKING = "checking"
    DOWNLOADING = "downloading"
    INSTALLING = "installing"
    RESTARTING = "restarting"
    COMPLETE = "complete"
    FAILED = "failed"


class UpgradeState(BaseModel):
    """Current state of the upgrade system."""
    status: UpgradeStatus = Field(default=UpgradeStatus.IDLE)
    current_version: str = Field(..., description="Currently installed version")
    ring: int = Field(..., description="Device's deployment ring")
    upgrade_enabled: bool = Field(..., description="Whether auto-upgrades are enabled")
    last_check: datetime | None = Field(None, description="Last upgrade check time")
    last_upgrade: datetime | None = Field(None, description="Last successful upgrade time")
    pending_version: str | None = Field(None, description="Version being installed")
    error_message: str | None = Field(None, description="Error message if failed")
    
    class Config:
        populate_by_name = True
        alias_generator = lambda s: ''.join(
            word.capitalize() if i else word 
            for i, word in enumerate(s.split('_'))
        )
