"""Service to execute commands via the soco-cli HTTP API."""

import asyncio
import logging
from typing import Any
from urllib.parse import quote

import httpx

from ..config import Settings
from ..models import Speaker, SocoCliResponse
from .soco_cli_service import SocoCliService

logger = logging.getLogger(__name__)


class SonosCommandService:
    """Service to execute commands via the soco-cli HTTP API.
    
    Uses a semaphore to serialize requests - soco-cli cannot handle concurrent requests properly.
    """
    
    def __init__(self, settings: Settings, soco_cli_service: SocoCliService):
        """Initialize the service.
        
        Args:
            settings: Application settings.
            soco_cli_service: The soco-cli service.
        """
        self._settings = settings
        self._soco_cli_service = soco_cli_service
        self._request_lock = asyncio.Lock()
        self._client: httpx.AsyncClient | None = None
    
    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create the HTTP client."""
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(timeout=30.0)
        return self._client
    
    async def close(self) -> None:
        """Close the HTTP client."""
        if self._client:
            await self._client.aclose()
            self._client = None
    
    async def get_speakers(self) -> list[str]:
        """Get the list of speakers.
        
        Returns:
            List of speaker names.
        """
        await self._soco_cli_service.ensure_server_running()
        async with self._request_lock:
            try:
                client = await self._get_client()
                url = f"{self._soco_cli_service.server_url}/speakers"
                response = await client.get(url)
                
                if response.status_code != 200:
                    logger.error(
                        "soco-cli request failed: GET %s => %d. Body: %s",
                        url, response.status_code, response.text
                    )
                    return []
                
                result = response.json()
                if "speakers" in result:
                    return [s for s in result["speakers"] if s]
                return []
                
            except Exception as e:
                logger.error("Failed to get speakers: %s", e)
                return []
    
    async def rediscover_speakers(self) -> list[str]:
        """Trigger speaker rediscovery.
        
        Returns:
            List of discovered speaker names.
        """
        await self._soco_cli_service.ensure_server_running()
        async with self._request_lock:
            try:
                client = await self._get_client()
                url = f"{self._soco_cli_service.server_url}/rediscover"
                response = await client.get(url)
                
                if response.status_code != 200:
                    logger.error(
                        "soco-cli request failed: GET %s => %d. Body: %s",
                        url, response.status_code, response.text
                    )
                    return []
                
                result = response.json()
                if "speakers_discovered" in result:
                    return [s for s in result["speakers_discovered"] if s]
                return []
                
            except Exception as e:
                logger.error("Failed to rediscover speakers: %s", e)
                return []
    
    async def execute_command(
        self, speaker: str, action: str, *args: str
    ) -> SocoCliResponse:
        """Execute a command on a speaker.
        
        Args:
            speaker: Speaker name.
            action: Command action.
            args: Additional arguments.
            
        Returns:
            Response from soco-cli.
        """
        await self._soco_cli_service.ensure_server_running()
        async with self._request_lock:
            try:
                client = await self._get_client()
                url = f"{self._soco_cli_service.server_url}/{quote(speaker)}/{quote(action)}"
                
                if args:
                    encoded_args = "/".join(quote(arg) for arg in args)
                    url += f"/{encoded_args}"
                
                logger.debug("Executing command: %s", url)
                
                response = await client.get(url)
                
                if response.status_code != 200:
                    logger.error(
                        "soco-cli request failed: GET %s => %d. Body: %s",
                        url, response.status_code, response.text
                    )
                    return SocoCliResponse(
                        speaker=speaker,
                        action=action,
                        args=list(args),
                        exit_code=response.status_code,
                        error_msg=f"HTTP {response.status_code}",
                    )
                
                result = response.json()
                return SocoCliResponse(
                    speaker=result.get("speaker", speaker),
                    action=result.get("action", action),
                    args=result.get("args", list(args)),
                    exit_code=result.get("exit_code", 0),
                    result=result.get("result", ""),
                    error_msg=result.get("error_msg", ""),
                )
                
            except Exception as e:
                logger.error("Failed to execute command %s %s: %s", speaker, action, e)
                return SocoCliResponse(
                    speaker=speaker,
                    action=action,
                    args=list(args),
                    exit_code=-1,
                    error_msg=str(e),
                )
    
    @staticmethod
    def _is_timeout_or_connection_error(error_msg: str | None) -> bool:
        """Check if an error message indicates the speaker is offline/unreachable."""
        if not error_msg:
            return False
        
        lower_error = error_msg.lower()
        return any(s in lower_error for s in [
            "timed out", "timeout", "connection refused", "unreachable",
            "no route to host", "network is unreachable", "connecttimeouterror",
            "max retries exceeded",
        ])
    
    async def get_speaker_info(self, speaker_name: str) -> Speaker:
        """Get detailed information about a speaker.
        
        Args:
            speaker_name: Name of the speaker.
            
        Returns:
            Speaker information.
        """
        speaker = Speaker(name=speaker_name)
        
        try:
            # Get volume first as a connectivity check
            volume_response = await self.execute_command(speaker_name, "volume")
            
            if volume_response.exit_code != 0 and self._is_timeout_or_connection_error(volume_response.error_msg):
                speaker.is_offline = True
                speaker.error_message = "Speaker is offline or unreachable"
                logger.warning(
                    "Speaker %s appears to be offline: %s",
                    speaker_name, volume_response.error_msg
                )
                return speaker
            
            if volume_response.exit_code == 0:
                try:
                    speaker.volume = int(volume_response.result)
                except ValueError:
                    pass
            
            # Get mute status
            mute_response = await self.execute_command(speaker_name, "mute")
            if mute_response.exit_code != 0 and self._is_timeout_or_connection_error(mute_response.error_msg):
                speaker.is_offline = True
                speaker.error_message = "Speaker is offline or unreachable"
                return speaker
            if mute_response.exit_code == 0:
                speaker.is_muted = mute_response.result.lower() == "on"
            
            # Get playback state
            state_response = await self.execute_command(speaker_name, "playback")
            if state_response.exit_code != 0 and self._is_timeout_or_connection_error(state_response.error_msg):
                speaker.is_offline = True
                speaker.error_message = "Speaker is offline or unreachable"
                return speaker
            if state_response.exit_code == 0:
                speaker.playback_state = state_response.result
            
            # Get current track
            track_response = await self.execute_command(speaker_name, "track")
            if track_response.exit_code != 0 and self._is_timeout_or_connection_error(track_response.error_msg):
                speaker.is_offline = True
                speaker.error_message = "Speaker is offline or unreachable"
                return speaker
            if track_response.exit_code == 0:
                speaker.current_track = track_response.result
            
            # Get battery level (for portable speakers like Roam/Move)
            battery_response = await self.execute_command(speaker_name, "battery")
            if battery_response.exit_code == 0 and battery_response.result:
                try:
                    battery_str = battery_response.result.strip().replace("%", "")
                    speaker.battery_level = int(battery_str)
                except ValueError:
                    pass
                    
        except Exception as e:
            logger.error("Failed to get speaker info for %s: %s", speaker_name, e)
            speaker.error_message = str(e)
        
        return speaker
