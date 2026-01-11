"""FastAPI application entry point for Sound Control."""

import logging
from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn
from fastapi import FastAPI, Request, Response
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

from . import __version__
from .config import get_settings
from .routers import macros as macros_router
from .routers import sonos as sonos_router
from .routers import voice as voice_router
from .services import MacroService, SocoCliService, SonosCommandService

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Global service instances
_soco_cli_service: SocoCliService | None = None
_command_service: SonosCommandService | None = None
_macro_service: MacroService | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan context manager."""
    global _soco_cli_service, _command_service, _macro_service
    
    settings = get_settings()
    logger.info("Starting Sound Control Python backend v%s", __version__)
    logger.info("Data directory: %s", settings.data_directory)
    logger.info("Static files: %s", settings.wwwroot_path)
    
    # Initialize services
    _soco_cli_service = SocoCliService(settings)
    _command_service = SonosCommandService(settings, _soco_cli_service)
    _macro_service = MacroService(settings, _soco_cli_service)
    
    # Initialize routers with services
    sonos_router.init_router(_soco_cli_service, _command_service)
    macros_router.init_router(_macro_service)
    voice_router.init_router(settings)
    
    logger.info("Services initialized")
    
    yield
    
    # Cleanup
    logger.info("Shutting down...")
    await _command_service.close()
    await _macro_service.close()
    _soco_cli_service.stop_server()


# Create FastAPI app
app = FastAPI(
    title="Sound Control",
    description="A web-based Sonos controller for Raspberry Pi",
    version=__version__,
    lifespan=lifespan,
)


# Custom cache control middleware for static files
@app.middleware("http")
async def add_cache_control_headers(request: Request, call_next):
    """Add cache control headers for static files."""
    response = await call_next(request)
    
    # Get the path
    path = request.url.path.lower()
    
    # Disable caching for HTML, JS, CSS files
    if any(path.endswith(ext) for ext in [".html", ".js", ".css", ".json"]):
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    elif any(path.endswith(ext) for ext in [".png", ".jpg", ".jpeg", ".gif", ".ico", ".svg", ".webp"]):
        # Cache other assets for 1 day
        response.headers["Cache-Control"] = "public, max-age=86400"
    
    return response


# Include routers
app.include_router(sonos_router.router)
app.include_router(macros_router.router)
app.include_router(voice_router.router)


@app.get("/api/version")
async def get_version():
    """Get the API version."""
    return {"version": __version__}


@app.get("/app")
async def serve_mobile_app():
    """Serve the mobile app HTML."""
    settings = get_settings()
    wwwroot = Path(settings.wwwroot_path)
    app_html = wwwroot / "app.html"
    
    if app_html.exists():
        content = app_html.read_text()
        return HTMLResponse(
            content=content,
            headers={
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "Pragma": "no-cache",
                "Expires": "0",
            },
        )
    else:
        return Response(content="Mobile app not found", status_code=404)


# Mount static files from wwwroot
# This should be done after all routes are defined
def _mount_static_files():
    """Mount static files directory."""
    settings = get_settings()
    wwwroot = Path(settings.wwwroot_path)
    
    if wwwroot.exists():
        app.mount("/", StaticFiles(directory=str(wwwroot), html=True), name="static")
        logger.info("Mounted static files from %s", wwwroot)
    else:
        logger.warning("Static files directory not found: %s", wwwroot)


_mount_static_files()


def main():
    """Run the application."""
    settings = get_settings()
    
    uvicorn.run(
        "sndctl.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
    )


if __name__ == "__main__":
    main()
