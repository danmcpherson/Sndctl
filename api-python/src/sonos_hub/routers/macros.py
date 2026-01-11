"""Macro API router - /api/macro/* endpoints."""

import logging
from typing import Any

from fastapi import APIRouter, File, HTTPException, Query, Response, UploadFile

from ..models import Macro, MacroExecuteRequest
from ..services import MacroService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/macro", tags=["macro"])

# This will be set by the main app
_macro_service: MacroService | None = None


def init_router(macro_service: MacroService) -> None:
    """Initialize the router with services."""
    global _macro_service
    _macro_service = macro_service


def _get_macro_service() -> MacroService:
    """Get the macro service."""
    if _macro_service is None:
        raise RuntimeError("Services not initialized")
    return _macro_service


@router.get("")
async def get_all_macros() -> list[Macro]:
    """Get all macros."""
    return await _get_macro_service().get_all_macros()


@router.get("/info")
async def get_macros_info() -> dict:
    """Get macros file information."""
    return _get_macro_service().get_macros_file_info()


@router.get("/export")
async def export_macros() -> Response:
    """Export the macros file for download."""
    try:
        content = await _get_macro_service().get_macros_file_content()
        return Response(
            content=content.encode("utf-8"),
            media_type="text/plain",
            headers={"Content-Disposition": "attachment; filename=macros.txt"},
        )
    except Exception as e:
        logger.error("Failed to export macros: %s", e)
        raise HTTPException(status_code=500, detail="Failed to export macros")


@router.get("/execute/{name}")
async def execute_macro_by_name(name: str) -> Any:
    """Execute a macro by name (GET - browser friendly)."""
    if not name:
        raise HTTPException(status_code=400, detail="Macro name is required")
    
    try:
        return await _get_macro_service().execute_macro(name, [])
    except Exception as e:
        logger.error("Failed to execute macro %s: %s", name, e)
        raise HTTPException(status_code=500, detail=f"Failed to execute macro: {e}")


@router.get("/{name}")
async def get_macro(name: str) -> Macro:
    """Get a specific macro by name."""
    macro = await _get_macro_service().get_macro(name)
    if macro is None:
        raise HTTPException(status_code=404, detail=f"Macro '{name}' not found")
    return macro


@router.post("")
async def save_macro(macro: Macro) -> Macro:
    """Create or update a macro."""
    if not macro.name:
        raise HTTPException(status_code=400, detail="Macro name is required")
    if not macro.definition:
        raise HTTPException(status_code=400, detail="Macro definition is required")
    
    result = await _get_macro_service().save_macro(macro)
    if result:
        return macro
    raise HTTPException(status_code=500, detail="Failed to save macro")


@router.delete("/{name}")
async def delete_macro(name: str) -> dict:
    """Delete a macro."""
    result = await _get_macro_service().delete_macro(name)
    if result:
        return {"message": f"Macro '{name}' deleted successfully"}
    raise HTTPException(status_code=404, detail=f"Macro '{name}' not found")


@router.post("/{name}/duplicate")
async def duplicate_macro(name: str) -> Macro:
    """Duplicate a macro with a new name."""
    result = await _get_macro_service().duplicate_macro(name)
    if result:
        return result
    raise HTTPException(status_code=404, detail=f"Macro '{name}' not found")


@router.post("/execute")
async def execute_macro(request: MacroExecuteRequest) -> Any:
    """Execute a macro (POST with JSON body)."""
    if not request.macro_name:
        raise HTTPException(status_code=400, detail="Macro name is required")
    
    try:
        return await _get_macro_service().execute_macro(request.macro_name, request.arguments)
    except Exception as e:
        logger.error("Failed to execute macro %s: %s", request.macro_name, e)
        raise HTTPException(status_code=500, detail=f"Failed to execute macro: {e}")


@router.post("/reload")
async def reload_macros() -> dict:
    """Reload all macros in the soco-cli server."""
    result = await _get_macro_service().reload_macros()
    if result:
        return {"message": "Macros reloaded successfully"}
    raise HTTPException(status_code=500, detail="Failed to reload macros")


@router.post("/import")
async def import_macros(
    file: UploadFile = File(None),
    merge: bool = Query(default=False),
) -> dict:
    """Import macros from an uploaded file."""
    logger.warning(
        "Import request received. File: %s, Length: %s, Merge: %s",
        file.filename if file else "null",
        file.size if file else 0,
        merge,
    )
    
    if file is None or file.size == 0:
        raise HTTPException(status_code=400, detail="No file uploaded or file is empty")
    
    try:
        content = await file.read()
        content_str = content.decode("utf-8")
        
        result = await _get_macro_service().import_macros(content_str, merge=merge)
        
        return {
            "success": result.success,
            "message": result.message,
            "importedCount": result.imported_count,
        }
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="File must be valid UTF-8 text")
    except Exception as e:
        logger.error("Failed to import macros: %s", e)
        raise HTTPException(status_code=500, detail=f"Failed to import macros: {e}")
