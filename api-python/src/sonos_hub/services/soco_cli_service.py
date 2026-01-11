"""Service to manage the soco-cli HTTP API server process."""

import asyncio
import logging
import os
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from ..config import Settings

logger = logging.getLogger(__name__)


class SocoCliService:
    """Service to manage the soco-cli HTTP API server process."""
    
    def __init__(self, settings: Settings):
        """Initialize the service.
        
        Args:
            settings: Application settings.
        """
        self._settings = settings
        self._process: Optional[subprocess.Popen] = None
        self._started_at: Optional[datetime] = None
        self._start_lock = asyncio.Lock()
        self._is_starting = False
    
    @property
    def server_url(self) -> str:
        """Get the soco-cli server URL."""
        return self._settings.soco_cli_url
    
    def is_running(self) -> bool:
        """Check if the soco-cli HTTP API server is running."""
        if self._process is None:
            return False
        return self._process.poll() is None
    
    def _get_executable_path(self) -> str:
        """Resolve the full path to the sonos-http-api-server executable."""
        # Check if explicitly configured
        if self._settings.soco_cli_executable_path:
            path = Path(self._settings.soco_cli_executable_path)
            if path.exists():
                logger.info("Using configured sonos-http-api-server at: %s", path)
                return str(path)
        
        # Build list of possible paths
        possible_paths: list[str] = []
        
        # Check current user's home directory
        home_dir = Path.home()
        if home_dir:
            possible_paths.extend([
                str(home_dir / ".local" / "bin" / "sonos-http-api-server"),
                str(home_dir / ".local" / "share" / "pipx" / "venvs" / "soco-cli" / "bin" / "sonos-http-api-server"),
            ])
        
        # When running as a service, also check common user home directories
        common_users = ["danmc", "pi", "sonos"]
        for user in common_users:
            possible_paths.extend([
                f"/home/{user}/.local/bin/sonos-http-api-server",
                f"/home/{user}/.local/share/pipx/venvs/soco-cli/bin/sonos-http-api-server",
            ])
        
        # System-wide locations
        possible_paths.extend([
            "/usr/local/bin/sonos-http-api-server",
            "/opt/homebrew/bin/sonos-http-api-server",
        ])
        
        for path in possible_paths:
            if Path(path).exists():
                logger.info("Found sonos-http-api-server at: %s", path)
                return path
        
        # Log all paths checked for debugging
        logger.warning(
            "Could not find sonos-http-api-server. Checked paths: %s",
            ", ".join(possible_paths)
        )
        
        # Try to resolve from PATH using 'which' command
        resolved = self._resolve_from_path("sonos-http-api-server")
        if resolved:
            logger.info("Resolved sonos-http-api-server from PATH: %s", resolved)
            return resolved
        
        logger.warning("Could not resolve sonos-http-api-server from PATH, using command name directly")
        return "sonos-http-api-server"
    
    def _resolve_from_path(self, command: str) -> Optional[str]:
        """Resolve a command from the system PATH."""
        try:
            result = subprocess.run(
                ["which", command],
                capture_output=True,
                text=True,
                timeout=5,
            )
            if result.returncode == 0:
                path = result.stdout.strip()
                if path and Path(path).exists():
                    return path
        except Exception as e:
            logger.debug("Failed to resolve %s from PATH: %s", command, e)
        return None
    
    def get_status(self) -> dict:
        """Get the current server status."""
        return {
            "isRunning": self.is_running(),
            "processId": self._process.pid if self._process else None,
            "serverUrl": self.server_url if self.is_running() else None,
            "startedAt": self._started_at.isoformat() if self._started_at else None,
        }
    
    async def start_server(self) -> bool:
        """Start the soco-cli HTTP API server.
        
        Returns:
            True if the server started successfully.
        """
        # Quick check without lock
        if self.is_running():
            return True
        
        async with self._start_lock:
            # Double-check after acquiring lock
            if self.is_running() or self._is_starting:
                logger.info("Soco-CLI server is already running or starting")
                return True
            
            self._is_starting = True
            
            try:
                # Use the same path resolution approach as MacroService for consistency
                macros_path = self._settings.macros_file_path
                
                args = [
                    self._get_executable_path(),
                    "--port", str(self._settings.soco_cli_port),
                    "--macros", str(macros_path),
                ]
                
                logger.info("Using macros file: %s", macros_path)
                
                if self._settings.soco_cli_use_local_cache:
                    args.append("--use-local-speaker-list")
                
                logger.info("Starting soco-cli server with args: %s", " ".join(args))
                
                self._process = subprocess.Popen(
                    args,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                )
                self._started_at = datetime.now(timezone.utc)
                
                logger.info(
                    "Started soco-cli HTTP API server on port %d with executable %s",
                    self._settings.soco_cli_port,
                    args[0],
                )
                
                # Wait for the server to start and become responsive
                # Speaker discovery can take several seconds
                for i in range(10):
                    await asyncio.sleep(1)
                    if not self.is_running():
                        logger.error("soco-cli process exited unexpectedly")
                        return False
                    
                    # Try to connect
                    import httpx
                    try:
                        async with httpx.AsyncClient() as client:
                            response = await client.get(f"{self.server_url}/speakers", timeout=2)
                            if response.status_code == 200:
                                logger.info("soco-cli server is now responsive")
                                return True
                    except Exception:
                        logger.debug("Waiting for soco-cli server... (%d/10)", i + 1)
                
                logger.warning("soco-cli server started but not yet responsive")
                return True
                
            except Exception as e:
                logger.error("Failed to start soco-cli server: %s", e)
                return False
            finally:
                self._is_starting = False
    
    def stop_server(self) -> bool:
        """Stop the soco-cli HTTP API server.
        
        Returns:
            True if the server was stopped successfully.
        """
        if self._process is None:
            return True
        
        try:
            self._process.terminate()
            self._process.wait(timeout=5)
            logger.info("Stopped soco-cli server")
            return True
        except subprocess.TimeoutExpired:
            self._process.kill()
            logger.warning("Killed soco-cli server after timeout")
            return True
        except Exception as e:
            logger.error("Failed to stop soco-cli server: %s", e)
            return False
        finally:
            self._process = None
            self._started_at = None
    
    async def ensure_server_running(self) -> None:
        """Ensure the soco-cli server is running, starting it if necessary."""
        if not self.is_running():
            await self.start_server()
