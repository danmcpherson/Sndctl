"""HTTP client for Sound Control API."""

import httpx
from typing import Any


class SonosApiClient:
    """Client for the Sound Control REST API."""

    def __init__(self, base_url: str = "http://localhost:5000"):
        self.base_url = base_url.rstrip("/")
        self.client = httpx.Client(timeout=30.0)

    def _url(self, path: str) -> str:
        """Build full URL from path."""
        return f"{self.base_url}{path}"

    def _get(self, path: str) -> dict[str, Any]:
        """Make GET request and return JSON response."""
        response = self.client.get(self._url(path))
        response.raise_for_status()
        return response.json()

    def _post(self, path: str, json: dict[str, Any] | None = None) -> dict[str, Any]:
        """Make POST request and return JSON response."""
        response = self.client.post(self._url(path), json=json)
        response.raise_for_status()
        return response.json()

    def _delete(self, path: str) -> dict[str, Any]:
        """Make DELETE request and return JSON response."""
        response = self.client.delete(self._url(path))
        response.raise_for_status()
        return response.json()

    # ========================================
    # Speaker Discovery
    # ========================================

    def get_speakers(self) -> list[str]:
        """Get list of all discovered Sonos speakers."""
        return self._get("/api/sonos/speakers")

    def rediscover_speakers(self) -> list[str]:
        """Trigger speaker rediscovery."""
        return self._post("/api/sonos/rediscover")

    def get_speaker_info(self, speaker: str) -> dict[str, Any]:
        """Get detailed info about a speaker."""
        return self._get(f"/api/sonos/speakers/{speaker}")

    # ========================================
    # Playback Control
    # ========================================

    def play_pause(self, speaker: str) -> dict[str, Any]:
        """Toggle play/pause on a speaker."""
        return self._post(f"/api/sonos/speakers/{speaker}/playpause")

    def next_track(self, speaker: str) -> dict[str, Any]:
        """Skip to next track."""
        return self._post(f"/api/sonos/speakers/{speaker}/next")

    def previous_track(self, speaker: str) -> dict[str, Any]:
        """Go to previous track."""
        return self._post(f"/api/sonos/speakers/{speaker}/previous")

    def get_current_track(self, speaker: str) -> dict[str, Any]:
        """Get current track info."""
        return self._get(f"/api/sonos/speakers/{speaker}/track")

    # ========================================
    # Volume Control
    # ========================================

    def get_volume(self, speaker: str) -> int:
        """Get current volume (0-100)."""
        return self._get(f"/api/sonos/speakers/{speaker}/volume")

    def set_volume(self, speaker: str, volume: int) -> dict[str, Any]:
        """Set volume (0-100)."""
        return self._post(f"/api/sonos/speakers/{speaker}/volume/{volume}")

    def toggle_mute(self, speaker: str) -> dict[str, Any]:
        """Toggle mute on a speaker."""
        return self._post(f"/api/sonos/speakers/{speaker}/mute")

    # ========================================
    # Grouping
    # ========================================

    def get_groups(self) -> dict[str, Any]:
        """Get all speaker groups."""
        return self._get("/api/sonos/groups")

    def group_speaker(self, speaker: str, coordinator: str) -> dict[str, Any]:
        """Group a speaker with a coordinator."""
        return self._post(f"/api/sonos/speakers/{speaker}/group/{coordinator}")

    def ungroup_speaker(self, speaker: str) -> dict[str, Any]:
        """Remove speaker from its group."""
        return self._post(f"/api/sonos/speakers/{speaker}/ungroup")

    def party_mode(self, speaker: str) -> dict[str, Any]:
        """Group all speakers together."""
        return self._post(f"/api/sonos/speakers/{speaker}/party")

    def ungroup_all(self, speaker: str) -> dict[str, Any]:
        """Ungroup all speakers."""
        return self._post(f"/api/sonos/speakers/{speaker}/ungroup-all")

    def set_group_volume(self, speaker: str, volume: int) -> dict[str, Any]:
        """Set volume for entire group."""
        return self._post(f"/api/sonos/speakers/{speaker}/group-volume/{volume}")

    # ========================================
    # Playback Modes
    # ========================================

    def get_shuffle(self, speaker: str) -> dict[str, Any]:
        """Get shuffle state."""
        return self._get(f"/api/sonos/speakers/{speaker}/shuffle")

    def set_shuffle(self, speaker: str, state: str) -> dict[str, Any]:
        """Set shuffle on/off."""
        return self._post(f"/api/sonos/speakers/{speaker}/shuffle/{state}")

    def get_repeat(self, speaker: str) -> dict[str, Any]:
        """Get repeat mode."""
        return self._get(f"/api/sonos/speakers/{speaker}/repeat")

    def set_repeat(self, speaker: str, mode: str) -> dict[str, Any]:
        """Set repeat mode (off, one, all)."""
        return self._post(f"/api/sonos/speakers/{speaker}/repeat/{mode}")

    def set_sleep_timer(self, speaker: str, duration: str) -> dict[str, Any]:
        """Set sleep timer (e.g., '30m', '1h', 'off')."""
        return self._post(f"/api/sonos/speakers/{speaker}/sleep/{duration}")

    def cancel_sleep_timer(self, speaker: str) -> dict[str, Any]:
        """Cancel sleep timer."""
        return self._delete(f"/api/sonos/speakers/{speaker}/sleep")

    # ========================================
    # Favorites & Playlists
    # ========================================

    def get_favorites(self) -> dict[str, Any]:
        """Get all Sonos favorites."""
        return self._get("/api/sonos/favorites")

    def play_favorite(self, speaker: str, favorite_name: str) -> dict[str, Any]:
        """Play a favorite by name."""
        return self._post(f"/api/sonos/speakers/{speaker}/play-favorite/{favorite_name}")

    def play_favorite_number(self, speaker: str, number: int) -> dict[str, Any]:
        """Play a favorite by number."""
        return self._post(f"/api/sonos/speakers/{speaker}/play-favorite-number/{number}")

    def get_playlists(self) -> dict[str, Any]:
        """Get all Sonos playlists."""
        return self._get("/api/sonos/playlists")

    def get_radio_stations(self) -> dict[str, Any]:
        """Get favorite radio stations."""
        return self._get("/api/sonos/radio-stations")

    def play_radio(self, speaker: str, station_name: str) -> dict[str, Any]:
        """Play a radio station."""
        return self._post(f"/api/sonos/speakers/{speaker}/play-radio/{station_name}")

    # ========================================
    # Queue Management
    # ========================================

    def get_queue(self, speaker: str) -> dict[str, Any]:
        """Get current queue."""
        return self._get(f"/api/sonos/speakers/{speaker}/queue")

    def get_queue_length(self, speaker: str) -> dict[str, Any]:
        """Get queue length."""
        return self._get(f"/api/sonos/speakers/{speaker}/queue/length")

    def clear_queue(self, speaker: str) -> dict[str, Any]:
        """Clear the queue."""
        return self._delete(f"/api/sonos/speakers/{speaker}/queue")

    def play_from_queue(self, speaker: str, track_number: int) -> dict[str, Any]:
        """Play a specific track from queue."""
        return self._post(f"/api/sonos/speakers/{speaker}/queue/play/{track_number}")

    def play_queue(self, speaker: str) -> dict[str, Any]:
        """Play the queue from beginning."""
        return self._post(f"/api/sonos/speakers/{speaker}/queue/play")

    def remove_from_queue(self, speaker: str, track_number: int) -> dict[str, Any]:
        """Remove track from queue."""
        return self._delete(f"/api/sonos/speakers/{speaker}/queue/{track_number}")

    def add_favorite_to_queue(self, speaker: str, favorite_name: str) -> dict[str, Any]:
        """Add a favorite to the queue."""
        return self._post(f"/api/sonos/speakers/{speaker}/queue/add-favorite/{favorite_name}")

    def add_playlist_to_queue(self, speaker: str, playlist_name: str) -> dict[str, Any]:
        """Add a playlist to the queue."""
        return self._post(f"/api/sonos/speakers/{speaker}/queue/add-playlist/{playlist_name}")

    # ========================================
    # Macros
    # ========================================

    def get_macros(self) -> list[dict[str, Any]]:
        """Get all macros."""
        return self._get("/api/macro")

    def get_macro(self, name: str) -> dict[str, Any]:
        """Get a specific macro by name."""
        return self._get(f"/api/macro/{name}")

    def run_macro(self, name: str, arguments: list[str] | None = None) -> dict[str, Any]:
        """Execute a macro."""
        return self._post("/api/macro/execute", {
            "macroName": name,
            "arguments": arguments or []
        })

    def close(self):
        """Close the HTTP client."""
        self.client.close()
