"""Sonos-related Pydantic models."""

from pydantic import BaseModel, ConfigDict


def to_camel(string: str) -> str:
    """Convert snake_case to camelCase."""
    components = string.split("_")
    return components[0] + "".join(x.title() for x in components[1:])


class CamelCaseModel(BaseModel):
    """Base model that converts snake_case to camelCase for JSON."""
    
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
    )


class Speaker(CamelCaseModel):
    """Represents a Sonos speaker on the network."""
    
    name: str = ""
    ip: str = ""
    is_coordinator: bool = False
    group_name: str | None = None
    volume: int | None = None
    is_muted: bool | None = None
    current_track: str | None = None
    playback_state: str | None = None
    battery_level: int | None = None
    is_offline: bool = False
    error_message: str | None = None


class SocoCliResponse(CamelCaseModel):
    """Response from soco-cli HTTP API."""
    
    speaker: str = ""
    action: str = ""
    args: list[str] = []
    exit_code: int = 0
    result: str = ""
    error_msg: str = ""


class SocoServerStatus(CamelCaseModel):
    """Status of the soco-cli HTTP API server."""
    
    is_running: bool = False
    process_id: int | None = None
    server_url: str | None = None
    started_at: str | None = None


class SonosCommandRequest(CamelCaseModel):
    """Request to execute a command."""
    
    speaker: str = ""
    action: str = ""
    args: list[str] = []


class TrackInfo(CamelCaseModel):
    """Current track information."""
    
    title: str = ""
    artist: str = ""
    album: str = ""
    album_art_uri: str | None = None
    duration: str | None = None
    position: str | None = None


class ListItem(CamelCaseModel):
    """Represents a numbered list item (favorites, playlists)."""
    
    number: int
    name: str = ""


class QueueItem(CamelCaseModel):
    """Represents a queue item with full track info."""
    
    number: int
    title: str = ""
    artist: str = ""
    album: str = ""
    is_current: bool = False


class ShareLinkRequest(CamelCaseModel):
    """Request to add a share link to the queue."""
    
    url: str = ""
