"""Service for managing auto-upgrades with ring-based deployment."""

import asyncio
import hashlib
import logging
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

import httpx

from sndctl.config import get_settings
from sndctl.models.upgrade import (
    UpgradeCheckRequest,
    UpgradeCheckResponse,
    UpgradeState,
    UpgradeStatus,
    VersionInfo,
)

logger = logging.getLogger(__name__)

# Package version - read from installed package or pyproject.toml
_VERSION: str | None = None


def get_current_version() -> str:
    """Get the currently installed version.
    
    Returns:
        Version string like "1.0.0" or "0.0.0-dev" if unknown.
    """
    global _VERSION
    if _VERSION is not None:
        return _VERSION
    
    try:
        # Try to get from installed package metadata
        from importlib.metadata import version
        _VERSION = version("sndctl")
        return _VERSION
    except Exception:
        pass
    
    try:
        # Try to read from pyproject.toml
        pyproject = Path(__file__).parent.parent.parent.parent / "pyproject.toml"
        if pyproject.exists():
            content = pyproject.read_text()
            for line in content.split("\n"):
                if line.startswith("version"):
                    _VERSION = line.split("=")[1].strip().strip('"').strip("'")
                    return _VERSION
    except Exception:
        pass
    
    _VERSION = "0.0.0-dev"
    return _VERSION


class UpgradeService:
    """Manages checking for and applying upgrades.
    
    Implements ring-based deployment where devices in lower rings
    receive updates before devices in higher rings.
    """
    
    def __init__(self):
        self._state = UpgradeState(
            status=UpgradeStatus.IDLE,
            current_version=get_current_version(),
            ring=get_settings().upgrade_ring,
            upgrade_enabled=get_settings().upgrade_enabled,
            last_check=None,
            last_upgrade=None,
        )
        self._lock = asyncio.Lock()
    
    @property
    def state(self) -> UpgradeState:
        """Get current upgrade state."""
        return self._state
    
    async def check_for_upgrade(self) -> UpgradeCheckResponse:
        """Check if an upgrade is available for this device.
        
        Returns:
            UpgradeCheckResponse with available version info if update exists.
        
        Raises:
            RuntimeError: If check fails due to network or server error.
        """
        settings = get_settings()
        
        if not settings.sndctl_server_url:
            logger.warning("No server URL configured, cannot check for upgrades")
            raise RuntimeError("Server URL not configured")
        
        async with self._lock:
            self._state.status = UpgradeStatus.CHECKING
            
            try:
                request = UpgradeCheckRequest(
                    device_id=settings.sndctl_device_id or "unknown",
                    current_version=get_current_version(),
                    ring=settings.upgrade_ring,
                )
                
                async with httpx.AsyncClient(timeout=30.0) as client:
                    response = await client.post(
                        f"{settings.sndctl_server_url}/api/v1/upgrades/check",
                        json=request.model_dump(by_alias=True),
                        headers={
                            "X-Device-Id": settings.sndctl_device_id or "",
                            "X-Device-Secret": settings.sndctl_device_secret or "",
                        },
                    )
                    response.raise_for_status()
                    
                    data = response.json()
                    result = UpgradeCheckResponse(
                        update_available=data.get("updateAvailable", False),
                        current_version=get_current_version(),
                        latest_version=VersionInfo(**data["latestVersion"]) if data.get("latestVersion") else None,
                    )
                
                self._state.last_check = datetime.now()
                self._state.status = UpgradeStatus.IDLE
                
                logger.info(
                    "Upgrade check complete: update_available=%s, current=%s, latest=%s",
                    result.update_available,
                    result.current_version,
                    result.latest_version.version if result.latest_version else None,
                )
                
                return result
                
            except Exception as e:
                self._state.status = UpgradeStatus.FAILED
                self._state.error_message = str(e)
                logger.error("Upgrade check failed: %s", e)
                raise RuntimeError(f"Upgrade check failed: {e}") from e
    
    async def download_package(self, version_info: VersionInfo) -> Path:
        """Download an upgrade package.
        
        Args:
            version_info: Information about the version to download.
        
        Returns:
            Path to the downloaded package file.
        
        Raises:
            RuntimeError: If download fails or checksum doesn't match.
        """
        async with self._lock:
            self._state.status = UpgradeStatus.DOWNLOADING
            self._state.pending_version = version_info.version
            
            try:
                download_dir = Path("/tmp/sndctl-upgrades")
                download_dir.mkdir(exist_ok=True)
                
                # Determine filename from URL
                filename = version_info.download_url.split("/")[-1]
                download_path = download_dir / filename
                
                logger.info("Downloading %s to %s", version_info.download_url, download_path)
                
                async with httpx.AsyncClient(timeout=300.0) as client:
                    async with client.stream("GET", version_info.download_url) as response:
                        response.raise_for_status()
                        
                        with open(download_path, "wb") as f:
                            async for chunk in response.aiter_bytes(chunk_size=8192):
                                f.write(chunk)
                
                # Verify checksum
                sha256 = hashlib.sha256()
                with open(download_path, "rb") as f:
                    for chunk in iter(lambda: f.read(8192), b""):
                        sha256.update(chunk)
                
                calculated_checksum = sha256.hexdigest()
                if calculated_checksum != version_info.checksum:
                    download_path.unlink()
                    raise RuntimeError(
                        f"Checksum mismatch: expected {version_info.checksum}, "
                        f"got {calculated_checksum}"
                    )
                
                logger.info("Download complete, checksum verified")
                return download_path
                
            except Exception as e:
                self._state.status = UpgradeStatus.FAILED
                self._state.error_message = str(e)
                logger.error("Download failed: %s", e)
                raise RuntimeError(f"Download failed: {e}") from e
    
    async def install_package(self, package_path: Path) -> None:
        """Install a downloaded package.
        
        Args:
            package_path: Path to the downloaded .deb package.
        
        Raises:
            RuntimeError: If installation fails.
        """
        async with self._lock:
            self._state.status = UpgradeStatus.INSTALLING
            
            try:
                # Run dpkg to install the package
                result = await asyncio.to_thread(
                    subprocess.run,
                    ["sudo", "dpkg", "-i", str(package_path)],
                    capture_output=True,
                    text=True,
                )
                
                if result.returncode != 0:
                    raise RuntimeError(f"dpkg failed: {result.stderr}")
                
                logger.info("Package installed successfully")
                
                # Clean up the downloaded package
                package_path.unlink(missing_ok=True)
                
                self._state.last_upgrade = datetime.now()
                self._state.status = UpgradeStatus.COMPLETE
                
            except Exception as e:
                self._state.status = UpgradeStatus.FAILED
                self._state.error_message = str(e)
                logger.error("Installation failed: %s", e)
                raise RuntimeError(f"Installation failed: {e}") from e
    
    async def perform_upgrade(self) -> bool:
        """Check for and apply any available upgrade.
        
        This is the main entry point for the automated upgrade process.
        
        Returns:
            True if an upgrade was performed, False otherwise.
        """
        settings = get_settings()
        
        if not settings.upgrade_enabled:
            logger.info("Auto-upgrades are disabled")
            return False
        
        try:
            # Check for available upgrade
            check_result = await self.check_for_upgrade()
            
            if not check_result.update_available or not check_result.latest_version:
                logger.info("No update available")
                return False
            
            version_info = check_result.latest_version
            
            # Check if our ring is eligible for this update
            if settings.upgrade_ring < version_info.min_ring:
                logger.info(
                    "Ring %d not eligible for version %s (min_ring=%d)",
                    settings.upgrade_ring,
                    version_info.version,
                    version_info.min_ring,
                )
                return False
            
            logger.info("Starting upgrade to version %s", version_info.version)
            
            # Download the package
            package_path = await self.download_package(version_info)
            
            # Install the package
            await self.install_package(package_path)
            
            # Request service restart
            self._state.status = UpgradeStatus.RESTARTING
            await self._request_restart()
            
            return True
            
        except Exception as e:
            logger.error("Upgrade failed: %s", e)
            self._state.status = UpgradeStatus.FAILED
            self._state.error_message = str(e)
            return False
    
    async def _request_restart(self) -> None:
        """Request the service to restart after upgrade.
        
        This creates a file that signals the service should restart,
        then exits the process. Systemd will automatically restart it.
        """
        logger.info("Requesting service restart...")
        
        # Give time for any pending responses to complete
        await asyncio.sleep(1)
        
        # systemctl restart will be handled by the upgrade script
        # We just need to exit cleanly
        sys.exit(0)


# Global service instance
_upgrade_service: UpgradeService | None = None


def get_upgrade_service() -> UpgradeService:
    """Get the global upgrade service instance."""
    global _upgrade_service
    if _upgrade_service is None:
        _upgrade_service = UpgradeService()
    return _upgrade_service
