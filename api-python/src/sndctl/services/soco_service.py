"""Service for direct SoCo library operations.

This service uses the SoCo Python library directly for speaker discovery,
playback control, volume, and other basic operations. This is faster and
more reliable than routing through soco-cli HTTP API.

soco-cli is still used for macro execution (complex chained commands).
"""

import asyncio
import logging
import re
import subprocess
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from functools import lru_cache
from typing import Any

import soco
from soco import SoCo
from soco.exceptions import SoCoException

from ..config import Settings
from ..models import Speaker, Favorite, QueueItem

logger = logging.getLogger(__name__)


class SoCoService:
    """Service for direct SoCo library operations."""
    
    def __init__(self, settings: Settings):
        """Initialize the service.
        
        Args:
            settings: Application settings.
        """
        self._settings = settings
        self._speakers_cache: dict[str, SoCo] = {}
        self._last_discovery: datetime | None = None
        self._discovery_lock = asyncio.Lock()
    
    def _scan_ip_for_sonos(self, ip: str) -> tuple[str, str] | None:
        """Check if a Sonos speaker exists at the given IP.
        
        Returns:
            Tuple of (ip, speaker_name) if found, None otherwise.
        """
        try:
            result = subprocess.run(
                ["curl", "-s", "--connect-timeout", "1", f"http://{ip}:1400/status/zp"],
                capture_output=True,
                text=True,
                timeout=3
            )
            if "ZPSupportInfo" in result.stdout:
                match = re.search(r'<ZoneName>([^<]+)</ZoneName>', result.stdout)
                if match:
                    return (ip, match.group(1))
        except Exception:
            pass
        return None
    
    def _discover_by_ip_scan(self, subnet: str = "192.168.1") -> dict[str, SoCo]:
        """Fallback discovery by scanning IP range.
        
        Used when multicast discovery doesn't work (e.g., Docker).
        """
        speakers: dict[str, SoCo] = {}
        ips_to_scan = [f"{subnet}.{i}" for i in range(1, 255)]
        
        logger.info("Falling back to IP scan discovery on %s.x", subnet)
        
        with ThreadPoolExecutor(max_workers=50) as executor:
            futures = {executor.submit(self._scan_ip_for_sonos, ip): ip for ip in ips_to_scan}
            for future in as_completed(futures):
                result = future.result()
                if result:
                    ip, name = result
                    try:
                        device = SoCo(ip)
                        # Verify it's reachable
                        _ = device.player_name
                        speakers[name] = device
                        logger.info("Found speaker via IP scan: %s at %s", name, ip)
                    except Exception as e:
                        logger.debug("Could not connect to %s: %s", ip, e)
        
        return speakers
    
    async def discover_speakers(self, force: bool = False) -> list[str]:
        """Discover all Sonos speakers on the network.
        
        Args:
            force: Force rediscovery even if cache is fresh.
            
        Returns:
            List of speaker names.
        """
        async with self._discovery_lock:
            # Use cached results if available and not forcing
            if not force and self._speakers_cache and self._last_discovery:
                age = (datetime.now(timezone.utc) - self._last_discovery).total_seconds()
                if age < 300:  # Cache for 5 minutes
                    return list(self._speakers_cache.keys())
            
            # Run discovery in thread pool (blocking I/O)
            try:
                speakers = await asyncio.to_thread(soco.discover, timeout=5)
                
                if speakers:
                    self._speakers_cache = {
                        speaker.player_name: speaker
                        for speaker in speakers
                        if speaker.player_name
                    }
                    self._last_discovery = datetime.now(timezone.utc)
                    logger.info("Discovered %d speakers via multicast", len(self._speakers_cache))
                    return list(self._speakers_cache.keys())
                else:
                    logger.warning("Multicast discovery found no speakers, trying IP scan")
                    # Fallback to IP scan (useful in Docker where multicast doesn't work)
                    scanned = await asyncio.to_thread(self._discover_by_ip_scan)
                    if scanned:
                        self._speakers_cache = scanned
                        self._last_discovery = datetime.now(timezone.utc)
                        logger.info("Discovered %d speakers via IP scan", len(self._speakers_cache))
                        return list(self._speakers_cache.keys())
                    return []
                    
            except Exception as e:
                logger.error("Speaker discovery failed: %s", e)
                return list(self._speakers_cache.keys())  # Return cached if discovery fails
    
    def _get_speaker(self, name: str) -> SoCo | None:
        """Get a speaker by name from cache.
        
        Args:
            name: Speaker name.
            
        Returns:
            SoCo instance or None if not found.
        """
        return self._speakers_cache.get(name)
    
    async def get_speaker_info(self, speaker_name: str) -> Speaker:
        """Get detailed information about a speaker.
        
        Args:
            speaker_name: Name of the speaker.
            
        Returns:
            Speaker information.
        """
        speaker = Speaker(name=speaker_name)
        device = self._get_speaker(speaker_name)
        
        if not device:
            # Try discovery if speaker not in cache
            await self.discover_speakers(force=True)
            device = self._get_speaker(speaker_name)
            
        if not device:
            speaker.is_offline = True
            speaker.error_message = "Speaker not found"
            return speaker
        
        try:
            # Run all blocking calls in thread pool
            info = await asyncio.to_thread(self._get_speaker_info_sync, device)
            speaker.volume = info.get("volume")
            speaker.is_muted = info.get("is_muted", False)
            speaker.playback_state = info.get("playback_state")
            speaker.current_track = info.get("current_track")
            speaker.ip_address = info.get("ip_address")
            speaker.model = info.get("model")
            speaker.is_coordinator = info.get("is_coordinator", False)
            speaker.group_members = info.get("group_members", [])
            
            # Battery level for portable speakers
            battery = info.get("battery_level")
            if battery is not None:
                speaker.battery_level = battery
                
        except SoCoException as e:
            error_str = str(e)
            # Satellite speakers (surrounds, subs) often return empty responses
            if error_str == "b''" or not error_str:
                logger.debug("Satellite speaker %s doesn't support this operation", speaker_name)
                speaker.error_message = "Satellite speaker - view main speaker"
            else:
                logger.error("SoCo error for %s: %s", speaker_name, e)
                speaker.is_offline = True
                speaker.error_message = error_str
        except Exception as e:
            logger.error("Failed to get speaker info for %s: %s", speaker_name, e)
            speaker.error_message = str(e)
        
        return speaker
    
    def _get_speaker_info_sync(self, device: SoCo) -> dict[str, Any]:
        """Synchronous helper to get speaker info (runs in thread pool)."""
        info: dict[str, Any] = {}
        
        try:
            info["volume"] = device.volume
            info["is_muted"] = device.mute
            info["ip_address"] = device.ip_address
            
            # Get playback state
            transport_info = device.get_current_transport_info()
            state = transport_info.get("current_transport_state", "UNKNOWN")
            info["playback_state"] = state
            
            # Get current track
            track_info = device.get_current_track_info()
            title = track_info.get("title", "")
            artist = track_info.get("artist", "")
            if title and artist:
                info["current_track"] = f"{artist} - {title}"
            elif title:
                info["current_track"] = title
            
            # Get speaker info
            speaker_info = device.get_speaker_info()
            info["model"] = speaker_info.get("model_name", "")
            
            # Check if coordinator
            info["is_coordinator"] = device.is_coordinator
            
            # Get group members
            if device.group:
                info["group_members"] = [
                    m.player_name for m in device.group.members
                    if m.player_name != device.player_name
                ]
            
            # Try to get battery level (for Roam, Move, etc.)
            try:
                battery_info = device.get_battery_info()
                if battery_info and "Level" in battery_info:
                    info["battery_level"] = int(battery_info["Level"])
            except (SoCoException, AttributeError):
                pass  # Not a portable speaker
                
        except Exception as e:
            logger.warning("Error getting info for %s: %s", device.player_name, e)
            raise
        
        return info
    
    async def play(self, speaker_name: str) -> bool:
        """Start playback on a speaker."""
        device = self._get_speaker(speaker_name)
        if not device:
            return False
        try:
            await asyncio.to_thread(device.play)
            return True
        except Exception as e:
            logger.error("Play failed for %s: %s", speaker_name, e)
            return False
    
    async def pause(self, speaker_name: str) -> bool:
        """Pause playback on a speaker."""
        device = self._get_speaker(speaker_name)
        if not device:
            return False
        try:
            await asyncio.to_thread(device.pause)
            return True
        except Exception as e:
            logger.error("Pause failed for %s: %s", speaker_name, e)
            return False
    
    async def stop(self, speaker_name: str) -> bool:
        """Stop playback on a speaker."""
        device = self._get_speaker(speaker_name)
        if not device:
            return False
        try:
            await asyncio.to_thread(device.stop)
            return True
        except Exception as e:
            logger.error("Stop failed for %s: %s", speaker_name, e)
            return False
    
    async def next_track(self, speaker_name: str) -> bool:
        """Skip to next track."""
        device = self._get_speaker(speaker_name)
        if not device:
            return False
        try:
            await asyncio.to_thread(device.next)
            return True
        except Exception as e:
            logger.error("Next track failed for %s: %s", speaker_name, e)
            return False
    
    async def previous_track(self, speaker_name: str) -> bool:
        """Skip to previous track."""
        device = self._get_speaker(speaker_name)
        if not device:
            return False
        try:
            await asyncio.to_thread(device.previous)
            return True
        except Exception as e:
            logger.error("Previous track failed for %s: %s", speaker_name, e)
            return False
    
    async def set_volume(self, speaker_name: str, volume: int) -> bool:
        """Set speaker volume (0-100)."""
        device = self._get_speaker(speaker_name)
        if not device:
            return False
        try:
            volume = max(0, min(100, volume))
            await asyncio.to_thread(setattr, device, "volume", volume)
            return True
        except Exception as e:
            logger.error("Set volume failed for %s: %s", speaker_name, e)
            return False
    
    async def set_mute(self, speaker_name: str, mute: bool) -> bool:
        """Set speaker mute state."""
        device = self._get_speaker(speaker_name)
        if not device:
            return False
        try:
            await asyncio.to_thread(setattr, device, "mute", mute)
            return True
        except Exception as e:
            logger.error("Set mute failed for %s: %s", speaker_name, e)
            return False
    
    def _get_any_coordinator(self) -> SoCo | None:
        """Get any coordinator speaker from the cache.
        
        Coordinators are needed for operations like getting favorites.
        Non-coordinator speakers (satellites) may fail these operations.
        
        Returns:
            A coordinator SoCo instance, or None if none found.
        """
        for device in self._speakers_cache.values():
            try:
                if device.is_coordinator:
                    return device
            except Exception:
                continue
        # Fallback to any speaker
        return next(iter(self._speakers_cache.values()), None) if self._speakers_cache else None
    
    async def get_favorites(self, speaker_name: str) -> list[Favorite]:
        """Get Sonos favorites.
        
        Args:
            speaker_name: Any speaker name (favorites are system-wide).
            
        Returns:
            List of favorites.
        """
        device = self._get_speaker(speaker_name)
        if not device:
            # Try to get a coordinator (needed for favorites)
            device = await asyncio.to_thread(self._get_any_coordinator)
            if not device:
                return []
        
        # Need to use the group coordinator
        try:
            coordinator = await asyncio.to_thread(lambda: device.group.coordinator)
            device = coordinator
        except Exception:
            pass  # Use original device if group.coordinator fails
        
        try:
            favorites = await asyncio.to_thread(self._get_favorites_sync, device)
            return favorites
        except Exception as e:
            logger.error("Failed to get favorites: %s", e)
            return []
    
    def _get_favorites_sync(self, device: SoCo) -> list[Favorite]:
        """Synchronous helper to get favorites."""
        favorites: list[Favorite] = []
        try:
            music_library = device.music_library
            sonos_favorites = music_library.get_sonos_favorites()
            
            for i, fav in enumerate(sonos_favorites):
                favorites.append(Favorite(
                    id=str(i),
                    name=fav.title,
                    album_art_uri=getattr(fav, "album_art_uri", None),
                ))
        except Exception as e:
            logger.warning("Error getting favorites: %s", e)
        
        return favorites
    
    async def play_favorite(self, speaker_name: str, favorite_name: str) -> bool:
        """Play a Sonos favorite by name.
        
        Args:
            speaker_name: Speaker to play on.
            favorite_name: Name of the favorite to play.
            
        Returns:
            True if successful.
        """
        device = self._get_speaker(speaker_name)
        if not device:
            return False
        
        try:
            result = await asyncio.to_thread(
                self._play_favorite_sync, device, favorite_name
            )
            return result
        except Exception as e:
            logger.error("Failed to play favorite %s: %s", favorite_name, e)
            return False
    
    def _play_favorite_sync(self, device: SoCo, favorite_name: str) -> bool:
        """Synchronous helper to play a favorite."""
        try:
            music_library = device.music_library
            favorites = music_library.get_sonos_favorites()
            
            for fav in favorites:
                if fav.title.lower() == favorite_name.lower():
                    # Clear queue and add favorite
                    device.clear_queue()
                    device.add_to_queue(fav)
                    device.play_from_queue(0)
                    return True
            
            logger.warning("Favorite not found: %s", favorite_name)
            return False
            
        except Exception as e:
            logger.error("Error playing favorite: %s", e)
            return False
    
    async def get_queue(self, speaker_name: str) -> list[QueueItem]:
        """Get the current queue for a speaker.
        
        Args:
            speaker_name: Speaker name.
            
        Returns:
            List of queue items.
        """
        device = self._get_speaker(speaker_name)
        if not device:
            return []
        
        try:
            queue = await asyncio.to_thread(self._get_queue_sync, device)
            return queue
        except Exception as e:
            logger.error("Failed to get queue for %s: %s", speaker_name, e)
            return []
    
    def _get_queue_sync(self, device: SoCo) -> list[QueueItem]:
        """Synchronous helper to get queue."""
        items: list[QueueItem] = []
        try:
            queue = device.get_queue()
            for i, item in enumerate(queue):
                items.append(QueueItem(
                    position=i + 1,
                    title=item.title,
                    artist=getattr(item, "creator", None),
                    album=getattr(item, "album", None),
                    album_art_uri=getattr(item, "album_art_uri", None),
                ))
        except Exception as e:
            logger.warning("Error getting queue: %s", e)
        
        return items
    
    async def get_groups(self) -> list[dict[str, Any]]:
        """Get all speaker groups.
        
        Returns:
            List of groups with coordinator and members.
        """
        # Ensure we have speakers
        if not self._speakers_cache:
            await self.discover_speakers()
        
        if not self._speakers_cache:
            return []
        
        try:
            # Get any speaker to query groups
            device = next(iter(self._speakers_cache.values()))
            groups = await asyncio.to_thread(self._get_groups_sync, device)
            return groups
        except Exception as e:
            logger.error("Failed to get groups: %s", e)
            return []
    
    def _get_groups_sync(self, device: SoCo) -> list[dict[str, Any]]:
        """Synchronous helper to get groups."""
        groups: list[dict[str, Any]] = []
        seen_coordinators: set[str] = set()
        
        try:
            # Get all zones
            zones = device.all_zones
            
            for zone in zones:
                if zone.is_coordinator:
                    coord_name = zone.player_name
                    if coord_name in seen_coordinators:
                        continue
                    seen_coordinators.add(coord_name)
                    
                    members = []
                    if zone.group:
                        members = [
                            m.player_name for m in zone.group.members
                            if m.player_name != coord_name
                        ]
                    
                    groups.append({
                        "coordinator": coord_name,
                        "members": members,
                    })
                    
        except Exception as e:
            logger.warning("Error getting groups: %s", e)
        
        return groups
    
    async def group_speakers(self, coordinator: str, member: str) -> bool:
        """Add a speaker to a group.
        
        Args:
            coordinator: Name of the coordinator speaker.
            member: Name of the speaker to add to the group.
            
        Returns:
            True if successful.
        """
        coord_device = self._get_speaker(coordinator)
        member_device = self._get_speaker(member)
        
        if not coord_device or not member_device:
            return False
        
        try:
            await asyncio.to_thread(member_device.join, coord_device)
            return True
        except Exception as e:
            logger.error("Failed to group %s with %s: %s", member, coordinator, e)
            return False
    
    async def ungroup_speaker(self, speaker_name: str) -> bool:
        """Remove a speaker from its group.
        
        Args:
            speaker_name: Name of the speaker to ungroup.
            
        Returns:
            True if successful.
        """
        device = self._get_speaker(speaker_name)
        if not device:
            return False
        
        try:
            await asyncio.to_thread(device.unjoin)
            return True
        except Exception as e:
            logger.error("Failed to ungroup %s: %s", speaker_name, e)
            return False
