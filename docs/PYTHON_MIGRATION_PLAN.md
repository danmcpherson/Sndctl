# Python Migration: Historical Reference

> **✅ MIGRATION COMPLETED & .NET CODE REMOVED** - January 2026
>
> This migration has been successfully completed. The Python/FastAPI backend is now 
> the only implementation, located in `/api-python/`. The legacy .NET code has been
> removed from the repository.

## Architecture Summary

This document is preserved as a historical reference for the migration from .NET 8/ASP.NET Core to Python/FastAPI. The primary driver was **Raspberry Pi Zero W compatibility** - .NET 8 does not support ARMv6 architecture.

### Technology Stack

| Component | Implementation |
|-----------|----------------|
| Web Framework | FastAPI |
| HTTP Server | Uvicorn |
| Database | sqlite3 (stdlib) |
| Sonos Control | Hybrid: SoCo library + soco-cli for macros |
| Static Files | Starlette (built into FastAPI) |
| Caching | cachetools / functools.lru_cache |
| JSON | Pydantic (FastAPI native) |

---

## Architecture Decision: Hybrid Sonos Control

### Why Hybrid?

**Use direct SoCo library for:**
- Speaker discovery (`soco.discover()`)
- Basic playback (play, pause, next, previous)
- Volume control
- Track info
- Group management
- Favorites/queue browsing

**Keep soco-cli HTTP API for:**
- Macro execution (leverages existing parser, parameter substitution, chained commands)
- Complex commands not easily mapped to SoCo
- Features that soco-cli has added on top of SoCo

### Architecture Diagram

```
                    ┌─────────────────────────────────────┐
                    │       Python FastAPI Backend        │
                    └─────────────────────────────────────┘
                           │                    │
            Simple commands│                    │Macros & complex
                           ▼                    ▼
                    ┌─────────────┐      ┌──────────────────┐
                    │ SoCo Library│      │ soco-cli HTTP API│
                    │  (direct)   │      │   (subprocess)   │
                    └─────────────┘      └──────────────────┘
                           │                    │
                           └────────┬───────────┘
                                    ▼
                           ┌─────────────────┐
                           │  Sonos Speakers │
                           └─────────────────┘
```

---

## Project Structure

```
api-python/
├── pyproject.toml              # Dependencies and project metadata
├── README.md                   # Python API documentation
├── src/
│   └── sonos_hub/
│       ├── __init__.py
│       ├── main.py             # FastAPI app entry point
│       ├── config.py           # Settings (from appsettings.json)
│       ├── models/
│       │   ├── __init__.py
│       │   ├── speaker.py      # Speaker, TrackInfo, etc.
│       │   ├── macro.py        # Macro, MacroParameter
│       │   └── responses.py    # API response models
│       ├── routers/
│       │   ├── __init__.py
│       │   ├── sonos.py        # /api/sonos/* endpoints
│       │   ├── macros.py       # /api/macro/* endpoints
│       │   └── voice.py        # /api/voice/* endpoints
│       └── services/
│           ├── __init__.py
│           ├── sonos_service.py    # Direct SoCo integration
│           ├── soco_cli_service.py # soco-cli process management
│           └── macro_service.py    # Macro file handling
├── data/                       # Symlink to ../api/data or copy
│   ├── macros.txt
│   └── macros-metadata.json
└── tests/
    ├── __init__.py
    ├── test_sonos.py
    └── test_macros.py
```

---

## Phase 1: Project Setup & Core Infrastructure

**Duration:** 2-4 hours  
**Goal:** Runnable Python app that serves static files

### Tasks

1. **Create `pyproject.toml`**
   ```toml
   [project]
   name = "sonos-hub"
   version = "0.1.0"
   requires-python = ">=3.9"
   dependencies = [
       "fastapi>=0.109.0",
       "uvicorn[standard]>=0.27.0",
       "soco>=0.30.0",
       "httpx>=0.25.0",
       "python-multipart>=0.0.9",
       "cachetools>=5.3.0",
       "pydantic-settings>=2.0.0",
   ]
   
   [project.optional-dependencies]
   dev = ["pytest", "pytest-asyncio", "httpx"]
   ```

2. **Create FastAPI app with static file serving**
   - Mount `/` to serve `wwwroot/` static files
   - Mount `/api` for API routes
   - Configure CORS if needed

3. **Port configuration loading**
   - Read from `appsettings.json` or environment variables
   - Settings: DataDirectory, SocoCli port, OpenAI API key

4. **Verify static frontend loads**
   - `http://localhost:5000/app.html` should work

### Acceptance Criteria
- [ ] `uvicorn sonos_hub.main:app` starts successfully
- [ ] Static files served at root
- [ ] `/api/version` returns `{"version": "dev"}`

---

## Phase 2: Sonos Service - Direct SoCo Integration

**Duration:** 8-12 hours  
**Goal:** Replace soco-cli wrapper for basic operations with direct SoCo library

### Endpoint Mapping

| .NET Endpoint | SoCo Implementation | Priority |
|---------------|---------------------|----------|
| `GET /api/sonos/speakers` | `soco.discover()` → list of names | High |
| `GET /api/sonos/speakers/{name}` | Get device, return volume/state/track | High |
| `POST /api/sonos/speakers/{name}/playpause` | `device.play()` or `device.pause()` | High |
| `POST /api/sonos/speakers/{name}/volume/{v}` | `device.volume = v` | High |
| `GET /api/sonos/speakers/{name}/volume` | `device.volume` | High |
| `POST /api/sonos/speakers/{name}/next` | `device.next()` | High |
| `POST /api/sonos/speakers/{name}/previous` | `device.previous()` | High |
| `POST /api/sonos/speakers/{name}/mute` | `device.mute = not device.mute` | High |
| `GET /api/sonos/speakers/{name}/track` | `device.get_current_track_info()` | High |
| `GET /api/sonos/groups` | Iterate devices, check `device.group` | Medium |
| `POST /api/sonos/speakers/{name}/group/{coord}` | `device.join(coordinator)` | Medium |
| `POST /api/sonos/speakers/{name}/ungroup` | `device.unjoin()` | Medium |
| `GET /api/sonos/speakers/{name}/favorites` | `device.music_library.get_sonos_favorites()` | Medium |
| `GET /api/sonos/speakers/{name}/queue` | `device.get_queue()` | Medium |
| `POST /api/sonos/speakers/{name}/play-favorite/{name}` | Find favorite, `device.play_uri()` | Medium |
| `POST /api/sonos/rediscover` | Clear cache, `soco.discover()` | Low |

### SoCo Service Implementation

```python
# src/sonos_hub/services/sonos_service.py
import soco
from functools import lru_cache
from typing import Optional
import asyncio

class SonosService:
    def __init__(self):
        self._devices: dict[str, soco.SoCo] = {}
        self._discovery_lock = asyncio.Lock()
    
    async def discover(self, force: bool = False) -> list[str]:
        """Discover Sonos speakers on the network."""
        async with self._discovery_lock:
            if force or not self._devices:
                # Run blocking discovery in thread pool
                devices = await asyncio.to_thread(soco.discover)
                self._devices = {d.player_name: d for d in (devices or [])}
            return list(self._devices.keys())
    
    def get_device(self, name: str) -> Optional[soco.SoCo]:
        """Get a device by name."""
        return self._devices.get(name)
    
    async def get_speaker_info(self, name: str) -> dict:
        """Get detailed speaker info."""
        device = self.get_device(name)
        if not device:
            return None
        
        # Run blocking SoCo calls in thread pool
        def _get_info():
            track = device.get_current_track_info()
            return {
                "name": device.player_name,
                "ip": device.ip_address,
                "volume": device.volume,
                "mute": device.mute,
                "playbackState": device.get_current_transport_info().get("current_transport_state"),
                "currentTrack": track.get("title"),
                "artist": track.get("artist"),
                "album": track.get("album"),
                "albumArtUri": track.get("album_art"),
            }
        
        return await asyncio.to_thread(_get_info)
```

### Tasks

1. **Create `SonosService` class** with device discovery and caching
2. **Implement speaker info endpoint** - volume, mute, track info
3. **Implement playback controls** - play/pause, next, previous
4. **Implement volume controls** - get/set volume, mute toggle
5. **Implement group management** - list groups, join, unjoin
6. **Implement favorites** - list, play favorite
7. **Implement queue** - list, play from queue

### Acceptance Criteria
- [ ] `GET /api/sonos/speakers` returns list of speakers
- [ ] `GET /api/sonos/speakers/{name}` returns speaker details
- [ ] Playback controls work (play/pause/next/prev)
- [ ] Volume controls work
- [ ] Frontend can control speakers

---

## Phase 3: soco-cli Integration for Macros

**Duration:** 4-6 hours  
**Goal:** Port soco-cli process management and macro execution

### Why Keep soco-cli for Macros?

The macro functionality in soco-cli provides:
- Macro file parsing (`name = commands`)
- Chained commands (`:` separator)
- Parameter substitution (`$1`, `$2`...)
- Wait/sleep commands
- Conditional logic

Reimplementing this would be significant effort with little benefit.

### Implementation

```python
# src/sonos_hub/services/soco_cli_service.py
import asyncio
import subprocess
from pathlib import Path

class SocoCliService:
    def __init__(self, port: int = 8000, macros_path: Path = None):
        self._port = port
        self._macros_path = macros_path
        self._process: subprocess.Popen = None
    
    @property
    def server_url(self) -> str:
        return f"http://localhost:{self._port}"
    
    def is_running(self) -> bool:
        return self._process is not None and self._process.poll() is None
    
    async def start(self) -> bool:
        if self.is_running():
            return True
        
        args = ["sonos-http-api-server", "--port", str(self._port)]
        if self._macros_path:
            args.extend(["--macros", str(self._macros_path)])
        
        self._process = subprocess.Popen(
            args,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        
        # Wait for server to be ready
        for _ in range(30):
            await asyncio.sleep(0.1)
            if self.is_running():
                return True
        return False
    
    def stop(self) -> bool:
        if self._process:
            self._process.terminate()
            self._process = None
            return True
        return False
```

### Tasks

1. **Port `SocoCliService`** - process management for soco-cli HTTP API
2. **Port `MacroService`** - file parsing, metadata handling
3. **Implement macro CRUD endpoints** - list, get, create, update, delete
4. **Implement macro execution** - delegate to soco-cli HTTP API
5. **Port macro metadata handling** - descriptions, categories, favorites

### Acceptance Criteria
- [ ] soco-cli server starts automatically when needed
- [ ] `GET /api/macro` returns list of macros
- [ ] `POST /api/macro/execute` executes a macro
- [ ] Macro CRUD operations work
- [ ] Frontend macros page works

---

## Phase 4: Voice Controller

**Duration:** 4-6 hours  
**Goal:** Port OpenAI Realtime API integration

### Endpoint Mapping

| .NET Endpoint | Python Implementation |
|---------------|----------------------|
| `POST /api/voice/session` | Create ephemeral token via OpenAI API |
| `GET /api/voice/status` | Check if API key configured |
| `POST /api/voice/apikey` | Store user-provided API key |
| `DELETE /api/voice/apikey` | Clear stored API key |
| `POST /api/voice/tool-result` | Handle tool execution results |

### Implementation

```python
# src/sonos_hub/routers/voice.py
from fastapi import APIRouter, HTTPException
import httpx

router = APIRouter(prefix="/api/voice", tags=["voice"])

# In-memory API key storage
_user_api_key: str | None = None

@router.post("/session")
async def create_session(voice: str = "verse"):
    api_key = _user_api_key or settings.openai_api_key
    if not api_key:
        raise HTTPException(400, "OpenAI API key not configured")
    
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://api.openai.com/v1/realtime/sessions",
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "model": "gpt-4o-realtime-preview-2024-12-17",
                "voice": voice,
                "instructions": get_system_instructions(),
                "tools": get_sonos_tools(),
                # ... other config
            }
        )
        return response.json()
```

### Tasks

1. **Port session creation endpoint** - ephemeral token generation
2. **Port tool definitions** - Sonos functions exposed to AI
3. **Port API key handling** - in-memory storage
4. **Port tool result handling** - execute Sonos commands from AI

### Acceptance Criteria
- [ ] Voice status endpoint works
- [ ] API key can be saved/retrieved
- [ ] Session creation returns valid token
- [ ] Voice control works end-to-end

---

## Phase 5: Testing & Polish

**Duration:** 4-8 hours  
**Goal:** Ensure feature parity and stability

### Tasks

1. **Test all endpoints against existing frontend**
   - Macros page
   - Speakers page
   - Voice page
   - All controls

2. **Error handling**
   - Proper HTTP status codes
   - Consistent error response format
   - Logging

3. **Performance testing on Pi Zero W**
   - Startup time
   - Memory usage
   - Response latency

4. **Documentation**
   - Update README
   - API documentation (auto-generated by FastAPI)
   - Deployment instructions

### Acceptance Criteria
- [ ] All frontend features work
- [ ] No regressions from .NET version
- [ ] Runs on Raspberry Pi Zero W
- [ ] Memory usage < 100MB

---

## Phase 6: Deployment

**Duration:** 2-4 hours  
**Goal:** Production-ready deployment on Raspberry Pi

### Tasks

1. **Update systemd service file**
   ```ini
   [Unit]
   Description=Sound Control
   After=network.target
   
   [Service]
   Type=simple
   User=pi
   WorkingDirectory=/opt/sonos-hub
   ExecStart=/opt/sonos-hub/.venv/bin/uvicorn sonos_hub.main:app --host 127.0.0.1 --port 5000
   Restart=always
   
   [Install]
   WantedBy=multi-user.target
   ```

2. **Update packaging (nfpm)**
   - Change from .NET to Python
   - Include virtual environment or system Python
   - Update dependencies

3. **Update Caddy configuration** (if needed)
   - Should work as-is (same port 5000)

4. **Test on actual Raspberry Pi Zero W**
   - Full end-to-end testing
   - Performance validation

### Acceptance Criteria
- [ ] Service starts on boot
- [ ] Survives reboot
- [ ] Works with Caddy reverse proxy
- [ ] Package can be installed cleanly

---

## Migration Checklist

### Pre-Migration
- [ ] Document all API endpoints currently in use
- [ ] Backup current macros and configuration
- [ ] Test current .NET version to establish baseline

### During Migration
- [ ] Phase 1: Project setup complete
- [ ] Phase 2: Sonos service complete
- [ ] Phase 3: Macro service complete
- [ ] Phase 4: Voice controller complete
- [ ] Phase 5: Testing complete
- [ ] Phase 6: Deployment complete

### Post-Migration
- [ ] Remove .NET code (or archive)
- [ ] Update CI/CD pipelines
- [ ] Update documentation
- [ ] Monitor for issues

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| SoCo library missing features | Fall back to soco-cli for those commands |
| Performance issues on Pi Zero | Profile and optimize; async everywhere |
| Frontend incompatibility | Keep exact same API contract |
| soco-cli not available | Include in package dependencies |

---

## Estimated Timeline

| Phase | Duration | Cumulative |
|-------|----------|------------|
| Phase 1: Setup | 2-4 hours | 2-4 hours |
| Phase 2: Sonos Service | 8-12 hours | 10-16 hours |
| Phase 3: Macros | 4-6 hours | 14-22 hours |
| Phase 4: Voice | 4-6 hours | 18-28 hours |
| Phase 5: Testing | 4-8 hours | 22-36 hours |
| Phase 6: Deployment | 2-4 hours | 24-40 hours |

**Total: 3-5 working days**

---

## Dependencies

### Python Packages
```
fastapi>=0.109.0
uvicorn[standard]>=0.27.0
soco>=0.30.0
httpx>=0.25.0
python-multipart>=0.0.9
cachetools>=5.3.0
pydantic-settings>=2.0.0
```

### System Requirements
- Python 3.9+ (3.11 recommended)
- soco-cli (installed via pipx)
- Network access to Sonos speakers

---

## Success Metrics

1. **Compatibility**: Runs on Raspberry Pi Zero W (ARMv6)
2. **Memory**: < 100MB RAM usage (vs ~200MB+ for .NET)
3. **Startup**: < 5 seconds (vs 20-30 seconds for .NET)
4. **Feature Parity**: All existing features work
5. **Performance**: Response times comparable to .NET version
