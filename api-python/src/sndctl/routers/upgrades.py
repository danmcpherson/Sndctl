"""API router for upgrade management."""

from fastapi import APIRouter, HTTPException

from sndctl.models.upgrade import UpgradeCheckResponse, UpgradeState
from sndctl.services.upgrade_service import get_upgrade_service

router = APIRouter(prefix="/upgrades", tags=["upgrades"])


@router.get("/status", response_model=UpgradeState)
async def get_upgrade_status() -> UpgradeState:
    """Get the current upgrade system status.
    
    Returns current version, ring assignment, last check time,
    and any pending upgrade operations.
    """
    service = get_upgrade_service()
    return service.state


@router.post("/check", response_model=UpgradeCheckResponse)
async def check_for_upgrade() -> UpgradeCheckResponse:
    """Manually trigger an upgrade check.
    
    Contacts the update server to check if a new version is available
    for this device's ring assignment.
    
    Returns:
        UpgradeCheckResponse with update availability and version info.
    
    Raises:
        HTTPException: If server is not configured or check fails.
    """
    service = get_upgrade_service()
    
    try:
        return await service.check_for_upgrade()
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.post("/apply")
async def apply_upgrade() -> dict:
    """Manually trigger an upgrade if one is available.
    
    This will check for updates, download the package, install it,
    and restart the service if an update is available.
    
    Returns:
        Status message indicating the result.
    
    Raises:
        HTTPException: If upgrade process fails.
    """
    service = get_upgrade_service()
    
    try:
        upgraded = await service.perform_upgrade()
        if upgraded:
            return {"status": "upgrading", "message": "Upgrade in progress, service will restart"}
        else:
            return {"status": "current", "message": "No upgrade available or not eligible"}
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
