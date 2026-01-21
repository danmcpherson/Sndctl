"""Voice API router - /api/voice/* endpoints for OpenAI Realtime API."""

import logging
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException

from ..config import Settings
from ..models import ApiKeyRequest

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/voice", tags=["voice"])

# Store API key in memory (for user-provided keys)
_user_provided_api_key: str | None = None

# This will be set by the main app
_settings: Settings | None = None

# Available voices
AVAILABLE_VOICES = ["verse", "alloy", "ash", "ballad", "coral", "echo", "sage", "shimmer"]


def init_router(settings: Settings) -> None:
    """Initialize the router with settings."""
    global _settings
    _settings = settings


def _get_settings() -> Settings:
    """Get the settings."""
    if _settings is None:
        raise RuntimeError("Settings not initialized")
    return _settings


def _get_api_key() -> str | None:
    """Get the effective API key (user-provided or from config).
    
    Returns None if server mode is configured (uses sndctl-server instead).
    """
    settings = _get_settings()
    
    # If server mode is configured, we don't need a local API key
    if settings.sndctl_server_url and settings.sndctl_device_id and settings.sndctl_device_secret:
        return None
    
    # User-provided key takes precedence
    if _user_provided_api_key:
        return _user_provided_api_key
    return settings.openai_api_key


def _is_server_mode() -> bool:
    """Check if server mode is configured (ephemeral tokens from sndctl-server)."""
    settings = _get_settings()
    return bool(
        settings.sndctl_server_url 
        and settings.sndctl_device_id 
        and settings.sndctl_device_secret
    )


def _get_system_instructions() -> str:
    """Get the system instructions for the voice assistant."""
    return """You are a helpful voice assistant for controlling a Sonos speaker system. You help users:

- Play, pause, and control music playback
- Adjust volume on speakers
- Group and ungroup speakers
- Play favorites, playlists, and radio stations
- Browse and play music from the local library (artists, albums, tracks, genres)
- Run automation macros
- Get information about what's playing

Be concise and friendly in your responses. When executing commands, confirm what you did briefly.

Speaker names in this system may include: Kitchen, Living Room, Bedroom, Office, Dining Room, etc.
Users may refer to speakers casually - match to the closest speaker name.

When users ask about macros, list them briefly. When they want to run one, use the run_macro function.

For library requests:
- Use search_library to find artists, albums, or tracks by name
- Use browse_library_artists/albums/tracks/genres to list items
- Use play_library_item to play something from the library

Always respond conversationally and confirm actions you take."""


def _get_sonos_tools() -> list[dict]:
    """Get the Sonos tools for the voice assistant."""
    return [
        # Speaker Discovery
        {
            "type": "function",
            "name": "list_speakers",
            "description": "Get a list of all discovered Sonos speakers on the network",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
        {
            "type": "function",
            "name": "get_speaker_info",
            "description": "Get detailed information about a speaker including volume, playback state, current track, and battery level",
            "parameters": {
                "type": "object",
                "properties": {
                    "speaker": {"type": "string", "description": "Name of the Sonos speaker"},
                },
                "required": ["speaker"],
            },
        },
        # Playback Control
        {
            "type": "function",
            "name": "play_pause",
            "description": "Toggle play/pause on a Sonos speaker",
            "parameters": {
                "type": "object",
                "properties": {
                    "speaker": {"type": "string", "description": "Name of the Sonos speaker"},
                },
                "required": ["speaker"],
            },
        },
        {
            "type": "function",
            "name": "next_track",
            "description": "Skip to the next track on a Sonos speaker",
            "parameters": {
                "type": "object",
                "properties": {
                    "speaker": {"type": "string", "description": "Name of the Sonos speaker"},
                },
                "required": ["speaker"],
            },
        },
        {
            "type": "function",
            "name": "previous_track",
            "description": "Go back to the previous track on a Sonos speaker",
            "parameters": {
                "type": "object",
                "properties": {
                    "speaker": {"type": "string", "description": "Name of the Sonos speaker"},
                },
                "required": ["speaker"],
            },
        },
        {
            "type": "function",
            "name": "get_current_track",
            "description": "Get information about the currently playing track",
            "parameters": {
                "type": "object",
                "properties": {
                    "speaker": {"type": "string", "description": "Name of the Sonos speaker"},
                },
                "required": ["speaker"],
            },
        },
        # Volume Control
        {
            "type": "function",
            "name": "get_volume",
            "description": "Get the current volume level of a speaker (0-100)",
            "parameters": {
                "type": "object",
                "properties": {
                    "speaker": {"type": "string", "description": "Name of the Sonos speaker"},
                },
                "required": ["speaker"],
            },
        },
        {
            "type": "function",
            "name": "set_volume",
            "description": "Set the volume level of a speaker (0-100)",
            "parameters": {
                "type": "object",
                "properties": {
                    "speaker": {"type": "string", "description": "Name of the Sonos speaker"},
                    "volume": {"type": "integer", "description": "Volume level from 0 to 100"},
                },
                "required": ["speaker", "volume"],
            },
        },
        {
            "type": "function",
            "name": "toggle_mute",
            "description": "Toggle mute on/off for a speaker",
            "parameters": {
                "type": "object",
                "properties": {
                    "speaker": {"type": "string", "description": "Name of the Sonos speaker"},
                },
                "required": ["speaker"],
            },
        },
        # Grouping
        {
            "type": "function",
            "name": "get_groups",
            "description": "Get all current speaker groups",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
        {
            "type": "function",
            "name": "group_speakers",
            "description": "Group a speaker with another speaker (the coordinator)",
            "parameters": {
                "type": "object",
                "properties": {
                    "speaker": {"type": "string", "description": "Name of the speaker to add to the group"},
                    "coordinator": {"type": "string", "description": "Name of the speaker that will be the group coordinator"},
                },
                "required": ["speaker", "coordinator"],
            },
        },
        {
            "type": "function",
            "name": "ungroup_speaker",
            "description": "Remove a speaker from its current group",
            "parameters": {
                "type": "object",
                "properties": {
                    "speaker": {"type": "string", "description": "Name of the Sonos speaker to ungroup"},
                },
                "required": ["speaker"],
            },
        },
        {
            "type": "function",
            "name": "party_mode",
            "description": "Group all speakers together (party mode)",
            "parameters": {
                "type": "object",
                "properties": {
                    "speaker": {"type": "string", "description": "Name of the speaker to be the coordinator"},
                },
                "required": ["speaker"],
            },
        },
        {
            "type": "function",
            "name": "ungroup_all",
            "description": "Ungroup all speakers - each speaker will play independently",
            "parameters": {
                "type": "object",
                "properties": {
                    "speaker": {"type": "string", "description": "Any speaker name"},
                },
                "required": ["speaker"],
            },
        },
        {
            "type": "function",
            "name": "set_group_volume",
            "description": "Set the volume for all speakers in a group",
            "parameters": {
                "type": "object",
                "properties": {
                    "speaker": {"type": "string", "description": "Name of any speaker in the group"},
                    "volume": {"type": "integer", "description": "Volume level from 0 to 100"},
                },
                "required": ["speaker", "volume"],
            },
        },
        # Playback Modes
        {
            "type": "function",
            "name": "set_shuffle",
            "description": "Enable or disable shuffle mode",
            "parameters": {
                "type": "object",
                "properties": {
                    "speaker": {"type": "string", "description": "Name of the Sonos speaker"},
                    "enabled": {"type": "boolean", "description": "True to enable shuffle, false to disable"},
                },
                "required": ["speaker", "enabled"],
            },
        },
        {
            "type": "function",
            "name": "set_repeat",
            "description": "Set the repeat mode",
            "parameters": {
                "type": "object",
                "properties": {
                    "speaker": {"type": "string", "description": "Name of the Sonos speaker"},
                    "mode": {"type": "string", "description": "Repeat mode: 'off', 'one', or 'all'"},
                },
                "required": ["speaker", "mode"],
            },
        },
        {
            "type": "function",
            "name": "set_sleep_timer",
            "description": "Set a sleep timer to stop playback after a duration",
            "parameters": {
                "type": "object",
                "properties": {
                    "speaker": {"type": "string", "description": "Name of the Sonos speaker"},
                    "minutes": {"type": "integer", "description": "Number of minutes until playback stops (0 to cancel)"},
                },
                "required": ["speaker", "minutes"],
            },
        },
        # Favorites & Playlists
        {
            "type": "function",
            "name": "list_favorites",
            "description": "Get all Sonos favorites",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
        {
            "type": "function",
            "name": "play_favorite",
            "description": "Play a Sonos favorite by name",
            "parameters": {
                "type": "object",
                "properties": {
                    "speaker": {"type": "string", "description": "Name of the Sonos speaker"},
                    "favorite_name": {"type": "string", "description": "Name of the favorite to play"},
                },
                "required": ["speaker", "favorite_name"],
            },
        },
        {
            "type": "function",
            "name": "list_playlists",
            "description": "Get all Sonos playlists",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
        {
            "type": "function",
            "name": "list_radio_stations",
            "description": "Get favorite radio stations",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
        {
            "type": "function",
            "name": "play_radio",
            "description": "Play a radio station by name",
            "parameters": {
                "type": "object",
                "properties": {
                    "speaker": {"type": "string", "description": "Name of the Sonos speaker"},
                    "station_name": {"type": "string", "description": "Name of the radio station to play"},
                },
                "required": ["speaker", "station_name"],
            },
        },
        # Queue Management
        {
            "type": "function",
            "name": "get_queue",
            "description": "Get the current playback queue",
            "parameters": {
                "type": "object",
                "properties": {
                    "speaker": {"type": "string", "description": "Name of the Sonos speaker"},
                },
                "required": ["speaker"],
            },
        },
        {
            "type": "function",
            "name": "clear_queue",
            "description": "Clear all tracks from the queue",
            "parameters": {
                "type": "object",
                "properties": {
                    "speaker": {"type": "string", "description": "Name of the Sonos speaker"},
                },
                "required": ["speaker"],
            },
        },
        {
            "type": "function",
            "name": "play_from_queue",
            "description": "Play a specific track from the queue by its position number",
            "parameters": {
                "type": "object",
                "properties": {
                    "speaker": {"type": "string", "description": "Name of the Sonos speaker"},
                    "track_number": {"type": "integer", "description": "Position of the track in the queue (1-based)"},
                },
                "required": ["speaker", "track_number"],
            },
        },
        {
            "type": "function",
            "name": "add_favorite_to_queue",
            "description": "Add a favorite to the end of the queue",
            "parameters": {
                "type": "object",
                "properties": {
                    "speaker": {"type": "string", "description": "Name of the Sonos speaker"},
                    "favorite_name": {"type": "string", "description": "Name of the favorite to add"},
                },
                "required": ["speaker", "favorite_name"],
            },
        },
        {
            "type": "function",
            "name": "add_playlist_to_queue",
            "description": "Add a playlist to the end of the queue",
            "parameters": {
                "type": "object",
                "properties": {
                    "speaker": {"type": "string", "description": "Name of the Sonos speaker"},
                    "playlist_name": {"type": "string", "description": "Name of the playlist to add"},
                },
                "required": ["speaker", "playlist_name"],
            },
        },
        # Macros
        {
            "type": "function",
            "name": "list_macros",
            "description": "Get all available Sonos macros (automated sequences of commands)",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
        {
            "type": "function",
            "name": "get_macro",
            "description": "Get details of a specific macro including its definition",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "Name of the macro"},
                },
                "required": ["name"],
            },
        },
        {
            "type": "function",
            "name": "run_macro",
            "description": "Execute a macro to run a predefined sequence of Sonos commands",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "Name of the macro to execute"},
                    "arguments": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Optional arguments to pass to the macro",
                    },
                },
                "required": ["name"],
            },
        },
        # Music Library
        {
            "type": "function",
            "name": "search_library",
            "description": "Search the local music library for artists, albums, or tracks matching a search term",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Search term to find in the library"},
                    "category": {
                        "type": "string",
                        "enum": ["artists", "albums", "tracks"],
                        "description": "Category to search in (default: albums)",
                    },
                },
                "required": ["query"],
            },
        },
        {
            "type": "function",
            "name": "browse_library_artists",
            "description": "List artists from the local music library",
            "parameters": {
                "type": "object",
                "properties": {
                    "max_items": {"type": "integer", "description": "Maximum number of artists to return (default: 20)"},
                },
                "required": [],
            },
        },
        {
            "type": "function",
            "name": "browse_library_albums",
            "description": "List albums from the local music library",
            "parameters": {
                "type": "object",
                "properties": {
                    "max_items": {"type": "integer", "description": "Maximum number of albums to return (default: 20)"},
                },
                "required": [],
            },
        },
        {
            "type": "function",
            "name": "browse_library_tracks",
            "description": "List tracks from the local music library",
            "parameters": {
                "type": "object",
                "properties": {
                    "max_items": {"type": "integer", "description": "Maximum number of tracks to return (default: 20)"},
                },
                "required": [],
            },
        },
        {
            "type": "function",
            "name": "browse_library_genres",
            "description": "List genres from the local music library",
            "parameters": {
                "type": "object",
                "properties": {
                    "max_items": {"type": "integer", "description": "Maximum number of genres to return (default: 20)"},
                },
                "required": [],
            },
        },
        {
            "type": "function",
            "name": "play_library_item",
            "description": "Play an artist, album, track, or genre from the local music library",
            "parameters": {
                "type": "object",
                "properties": {
                    "speaker": {"type": "string", "description": "Name of the Sonos speaker"},
                    "name": {"type": "string", "description": "Name of the artist, album, track, or genre to play"},
                    "category": {
                        "type": "string",
                        "enum": ["artists", "albums", "tracks", "genres"],
                        "description": "Category of the item (default: albums)",
                    },
                },
                "required": ["speaker", "name"],
            },
        },
    ]


@router.post("/session")
async def create_session(voice: str = "verse") -> Any:
    """Get an ephemeral session token for the OpenAI Realtime API.
    
    In server mode: Proxies to sndctl-server which holds the API key.
    In standalone mode: Calls OpenAI directly with local API key.
    """
    # Validate voice selection
    if voice.lower() not in AVAILABLE_VOICES:
        voice = "verse"
    
    # Check if server mode is configured
    if _is_server_mode():
        return await _create_session_via_server(voice)
    
    # Standalone mode: use local API key
    api_key = _get_api_key()
    
    if not api_key:
        logger.warning("OpenAI API key not configured and server mode not enabled")
        raise HTTPException(
            status_code=400,
            detail={
                "error": "OpenAI API key not configured",
                "message": "Configure sndctl-server connection or enter your API key in Voice settings",
            },
        )
    
    return await _create_session_direct(api_key, voice)


async def _create_session_via_server(voice: str) -> Any:
    """Create a session by proxying through sndctl-server.
    
    The server holds the OpenAI API key and returns ephemeral tokens.
    """
    settings = _get_settings()
    
    server_url = settings.sndctl_server_url.rstrip("/")
    device_id = settings.sndctl_device_id
    device_secret = settings.sndctl_device_secret
    
    logger.info("Creating voice session via sndctl-server: %s", server_url)
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{server_url}/api/voice/session",
                headers={
                    "Content-Type": "application/json",
                    "X-Device-Secret": device_secret,
                },
                json={
                    "deviceId": device_id,
                    "voice": voice.lower(),
                    "instructions": _get_system_instructions(),
                    "tools": _get_sonos_tools(),
                },
                timeout=30.0,
            )
            
            if response.status_code == 401:
                logger.error("sndctl-server authentication failed: invalid device secret")
                raise HTTPException(
                    status_code=401,
                    detail={
                        "error": "Device authentication failed",
                        "message": "Invalid device credentials. Check SNDCTL_DEVICE_ID and SNDCTL_DEVICE_SECRET.",
                    },
                )
            
            if response.status_code == 403:
                logger.error("Device has been revoked on sndctl-server")
                raise HTTPException(
                    status_code=403,
                    detail={
                        "error": "Device revoked",
                        "message": "This device has been revoked. Contact support.",
                    },
                )
            
            if response.status_code == 404:
                logger.error("Device not found on sndctl-server")
                raise HTTPException(
                    status_code=404,
                    detail={
                        "error": "Device not found",
                        "message": "Device is not registered. Check SNDCTL_DEVICE_ID.",
                    },
                )
            
            if response.status_code == 429:
                logger.warning("Rate limited by sndctl-server")
                raise HTTPException(
                    status_code=429,
                    detail={
                        "error": "Rate limited",
                        "message": "Too many voice session requests. Try again later.",
                    },
                )
            
            if response.status_code != 200:
                logger.error(
                    "sndctl-server session creation failed: %d %s",
                    response.status_code, response.text
                )
                raise HTTPException(
                    status_code=502,
                    detail={
                        "error": "Server error",
                        "message": "Failed to create voice session via server.",
                    },
                )
            
            return response.json()
            
    except httpx.TimeoutException:
        logger.error("Timeout connecting to sndctl-server")
        raise HTTPException(
            status_code=504,
            detail={
                "error": "Server timeout",
                "message": "sndctl-server did not respond in time.",
            },
        )
    except httpx.HTTPError as e:
        logger.error("Failed to connect to sndctl-server: %s", e)
        raise HTTPException(
            status_code=502,
            detail={
                "error": "Server connection failed",
                "message": f"Could not connect to sndctl-server: {e}",
            },
        )


async def _create_session_direct(api_key: str, voice: str) -> Any:
    """Create a session by calling OpenAI directly (standalone mode)."""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.openai.com/v1/realtime/sessions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "gpt-4o-realtime-preview-2024-12-17",
                    "voice": voice.lower(),
                    "instructions": _get_system_instructions(),
                    "tools": _get_sonos_tools(),
                    "tool_choice": "auto",
                    "input_audio_transcription": {"model": "whisper-1"},
                    "turn_detection": {
                        "type": "server_vad",
                        "threshold": 0.5,
                        "prefix_padding_ms": 300,
                        "silence_duration_ms": 500,
                    },
                },
                timeout=30.0,
            )
            
            if response.status_code != 200:
                logger.error(
                    "OpenAI session creation failed: %d %s",
                    response.status_code, response.text
                )
                
                if response.status_code == 401:
                    raise HTTPException(
                        status_code=401,
                        detail={"error": "Invalid API key", "message": "The provided API key is not valid"},
                    )
                
                raise HTTPException(
                    status_code=response.status_code,
                    detail={"error": "Failed to create session", "details": response.text},
                )
            
            return response.json()
            
    except httpx.HTTPError as e:
        logger.error("Failed to create OpenAI session: %s", e)
        raise HTTPException(
            status_code=500,
            detail={"error": "Failed to create session", "message": str(e)},
        )


@router.get("/status")
async def get_status() -> dict:
    """Check if voice feature is configured.
    
    Returns status based on configuration mode:
    - Server mode: configured if sndctl-server credentials are set
    - Standalone mode: configured if OpenAI API key is set
    """
    server_mode = _is_server_mode()
    api_key = _get_api_key()
    
    if server_mode:
        # Check subscription status with sndctl-server
        return await _get_server_status()
    elif api_key:
        return {
            "configured": True,
            "enabled": True,
            "mode": "standalone",
            "availableVoices": AVAILABLE_VOICES,
            "message": "Voice control is configured with local API key",
        }
    else:
        return {
            "configured": False,
            "enabled": False,
            "mode": "none",
            "availableVoices": AVAILABLE_VOICES,
            "message": "Voice control is not available",
        }


async def _get_server_status() -> dict:
    """Get voice status from sndctl-server, including subscription info."""
    settings = _get_settings()
    
    server_url = settings.sndctl_server_url.rstrip("/")
    device_id = settings.sndctl_device_id
    device_secret = settings.sndctl_device_secret
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{server_url}/api/voice/status",
                params={"deviceId": device_id},
                headers={"X-Device-Secret": device_secret},
                timeout=10.0,
            )
            
            if response.status_code == 200:
                server_status = response.json()
                return {
                    "configured": True,
                    "enabled": server_status.get("enabled", False),
                    "mode": "server",
                    "serverUrl": server_url,
                    "deviceId": device_id,
                    "subscription": server_status.get("subscription", "none"),
                    "subscribeUrl": server_status.get("subscribeUrl", f"{server_url}/app/subscribe"),
                    "availableVoices": AVAILABLE_VOICES,
                    "message": server_status.get("message", ""),
                }
            elif response.status_code == 401:
                logger.error("Invalid device credentials for status check")
                return {
                    "configured": False,
                    "enabled": False,
                    "mode": "server",
                    "error": "invalid_credentials",
                    "message": "Device authentication failed",
                }
            elif response.status_code == 404:
                logger.error("Device not found on server")
                return {
                    "configured": False,
                    "enabled": False,
                    "mode": "server",
                    "error": "device_not_found",
                    "message": "Device not registered",
                }
            else:
                logger.error("Server status check failed: %d", response.status_code)
                return {
                    "configured": True,
                    "enabled": False,
                    "mode": "server",
                    "error": "server_error",
                    "message": "Could not check subscription status",
                }
                
    except httpx.TimeoutException:
        logger.error("Timeout checking server status")
        return {
            "configured": True,
            "enabled": False,
            "mode": "server",
            "error": "timeout",
            "message": "Server did not respond",
        }
    except httpx.HTTPError as e:
        logger.error("Failed to check server status: %s", e)
        return {
            "configured": True,
            "enabled": False,
            "mode": "server",
            "error": "connection_failed",
            "message": "Could not connect to server",
        }


@router.post("/apikey")
async def save_api_key(request: ApiKeyRequest) -> dict:
    """Save user-provided API key."""
    global _user_provided_api_key
    
    if not request.api_key:
        raise HTTPException(status_code=400, detail={"error": "API key is required"})
    
    # Basic validation - OpenAI keys start with "sk-"
    if not request.api_key.startswith("sk-"):
        raise HTTPException(
            status_code=400,
            detail={"error": "Invalid API key format. OpenAI API keys start with 'sk-'"},
        )
    
    _user_provided_api_key = request.api_key
    logger.info("User provided OpenAI API key saved (in memory only)")
    
    return {
        "success": True,
        "message": "API key saved. Note: This key is stored in memory and will be lost when the server restarts.",
    }


@router.delete("/apikey")
async def clear_api_key() -> dict:
    """Clear user-provided API key."""
    global _user_provided_api_key
    _user_provided_api_key = None
    logger.info("User-provided API key cleared")
    return {"success": True, "message": "API key cleared"}
