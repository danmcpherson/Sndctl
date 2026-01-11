# Sound Control - Python Backend

Python/FastAPI backend for Sound Control. This is the primary implementation, optimized for Raspberry Pi Zero W and all ARM devices.

## Requirements

- Python 3.9+
- [soco-cli](https://github.com/avantrec/soco-cli) installed via pipx

## Quick Start

```bash
# Create virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -e .

# Run the server
SNDCTL_DATA_DIRECTORY="../data" \
SNDCTL_WWWROOT_PATH="../wwwroot" \
python -m uvicorn sndctl.main:app --host 0.0.0.0 --port 5001
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SNDCTL_HOST` | `127.0.0.1` | Host to bind to |
| `SNDCTL_PORT` | `5000` | Port to bind to |
| `SNDCTL_DEBUG` | `false` | Enable debug mode |
| `SNDCTL_DATA_DIRECTORY` | `data` | Path to data directory (macros, etc.) |
| `SNDCTL_WWWROOT_PATH` | `../wwwroot` | Path to static web files |
| `SNDCTL_SOCO_CLI_PORT` | `8000` | Port for soco-cli HTTP API |
| `SNDCTL_SOCO_CLI_USE_LOCAL_CACHE` | `false` | Use local speaker cache (for Docker/containers) |
| `SNDCTL_OPENAI_API_KEY` | *(none)* | OpenAI API key for voice control |

## API Endpoints

### Core
- `GET /api/version` - API version info
- `GET /api/sonos/status` - soco-cli server status
- `POST /api/sonos/start` - Start soco-cli server
- `POST /api/sonos/stop` - Stop soco-cli server

### Speakers
- `GET /api/sonos/speakers` - List all speakers
- `GET /api/sonos/speakers/{name}` - Get speaker info
- `POST /api/sonos/speakers/{name}/play` - Play
- `POST /api/sonos/speakers/{name}/pause` - Pause
- `POST /api/sonos/speakers/{name}/next` - Next track
- `POST /api/sonos/speakers/{name}/previous` - Previous track
- `POST /api/sonos/speakers/{name}/volume/{level}` - Set volume
- `POST /api/sonos/speakers/{name}/mute` - Toggle mute

### Grouping
- `POST /api/sonos/speakers/{name}/group/{coordinator}` - Group speakers
- `POST /api/sonos/speakers/{name}/ungroup` - Ungroup speaker
- `POST /api/sonos/speakers/{name}/party-mode` - Party mode

### Macros
- `GET /api/macro` - List all macros
- `GET /api/macro/{name}` - Get macro details
- `POST /api/macro/{name}/execute` - Execute macro
- `POST /api/macro` - Create macro
- `PUT /api/macro/{name}` - Update macro
- `DELETE /api/macro/{name}` - Delete macro

### Favorites & Playlists
- `GET /api/sonos/favorites` - List favorites
- `POST /api/sonos/speakers/{name}/play-favorite/{favorite}` - Play favorite
- `GET /api/sonos/playlists` - List playlists
- `POST /api/sonos/speakers/{name}/play-playlist/{playlist}` - Play playlist

### Voice Control
- `GET /api/voice/status` - Voice API status
- `POST /api/voice/session` - Create OpenAI session
- `POST /api/voice/api-key` - Save API key

## Development

```bash
# Install with dev dependencies
pip install -e ".[dev]"

# Run with auto-reload
uvicorn sndctl.main:app --reload --port 5001
```

## Project Structure

```
src/sndctl/
├── main.py              # FastAPI app entry point
├── config.py            # Settings from env vars
├── models/              # Pydantic models
│   ├── sonos.py         # Speaker, track, favorites models
│   ├── macro.py         # Macro models
│   └── voice.py         # Voice/OpenAI models
├── routers/             # API route handlers
│   ├── sonos.py         # /api/sonos/* endpoints
│   ├── macros.py        # /api/macro/* endpoints
│   └── voice.py         # /api/voice/* endpoints
└── services/            # Business logic
    ├── soco_cli_service.py      # Manages soco-cli process
    ├── sonos_command_service.py # HTTP client to soco-cli
    └── macro_service.py         # File-based macro storage
```

## Docker / Container Usage

In container environments where multicast discovery doesn't work, you can use the speaker cache:

1. Run the cache setup script to scan for speakers
2. Set `SNDCTL_SOCO_CLI_USE_LOCAL_CACHE=true`
3. The soco-cli will use the cached speaker list instead of multicast discovery
