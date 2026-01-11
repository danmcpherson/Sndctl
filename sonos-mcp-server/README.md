# Sonos MCP Server

An MCP (Model Context Protocol) server that exposes Sonos speaker control to AI assistants like Claude, GPT-4, and others.

## Overview

This MCP server wraps the Sound Control REST API, allowing AI tools to control your Sonos speakers through natural language. It supports:

- **Speaker control**: play, pause, volume, mute, next/previous track
- **Speaker grouping**: party mode, group/ungroup speakers
- **Favorites & playlists**: list and play favorites, playlists, radio stations
- **Queue management**: view queue, add tracks, clear queue
- **Macros**: execute predefined automation sequences

## Prerequisites

1. **Python 3.10+** installed
2. **Sound Control API running** at `http://localhost:5000` (or configure via environment variable)
3. **soco-cli** installed and working

## Installation

### Using pip (recommended)

```bash
cd sonos-mcp-server
pip install -e .
```

### Using pipx (isolated environment)

```bash
cd sonos-mcp-server
pipx install -e .
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SONOS_API_URL` | `http://localhost:5000` | URL of the Sound Control API |

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "sonos": {
      "command": "python",
      "args": ["-m", "sonos_mcp_server"],
      "env": {
        "SONOS_API_URL": "http://localhost:5000"
      }
    }
  }
}
```

Or if installed with pipx:

```json
{
  "mcpServers": {
    "sonos": {
      "command": "sonos-mcp-server",
      "env": {
        "SONOS_API_URL": "http://localhost:5000"
      }
    }
  }
}
```

### VS Code with GitHub Copilot

Create `.vscode/mcp.json` in your workspace:

```json
{
  "servers": {
    "sonos": {
      "type": "stdio",
      "command": "python",
      "args": ["-m", "sonos_mcp_server"],
      "cwd": "${workspaceFolder}/sonos-mcp-server",
      "env": {
        "SONOS_API_URL": "http://localhost:5000"
      }
    }
  }
}
```

### Remote Raspberry Pi

If your Sound Control runs on a Raspberry Pi:

```json
{
  "mcpServers": {
    "sonos": {
      "command": "sonos-mcp-server",
      "env": {
        "SONOS_API_URL": "http://raspberrypi.local:5000"
      }
    }
  }
}
```

## Available Tools

### Speaker Discovery
| Tool | Description |
|------|-------------|
| `list_speakers` | Get all discovered Sonos speakers |
| `rediscover_speakers` | Trigger fresh speaker discovery |
| `get_speaker_info` | Get detailed speaker status |

### Playback Control
| Tool | Description |
|------|-------------|
| `play_pause` | Toggle play/pause |
| `next_track` | Skip to next track |
| `previous_track` | Go to previous track |
| `get_current_track` | Get current track info |

### Volume Control
| Tool | Description |
|------|-------------|
| `get_volume` | Get current volume (0-100) |
| `set_volume` | Set volume level |
| `toggle_mute` | Toggle mute on/off |

### Speaker Grouping
| Tool | Description |
|------|-------------|
| `get_groups` | Get current groups |
| `group_speakers` | Group two speakers |
| `ungroup_speaker` | Remove from group |
| `party_mode` | Group all speakers |
| `ungroup_all` | Ungroup all |
| `set_group_volume` | Set volume for group |

### Playback Modes
| Tool | Description |
|------|-------------|
| `set_shuffle` | Enable/disable shuffle |
| `set_repeat` | Set repeat mode (off/one/all) |
| `set_sleep_timer` | Set sleep timer |

### Favorites & Playlists
| Tool | Description |
|------|-------------|
| `list_favorites` | Get all Sonos favorites |
| `play_favorite` | Play a favorite |
| `list_playlists` | Get all playlists |
| `list_radio_stations` | Get radio stations |
| `play_radio` | Play a radio station |

### Queue Management
| Tool | Description |
|------|-------------|
| `get_queue` | Get current queue |
| `clear_queue` | Clear the queue |
| `play_from_queue` | Play track from queue |
| `add_favorite_to_queue` | Add favorite to queue |
| `add_playlist_to_queue` | Add playlist to queue |

### Macros
| Tool | Description |
|------|-------------|
| `list_macros` | Get all macros |
| `get_macro` | Get macro details |
| `run_macro` | Execute a macro |

## Example Prompts

Once configured, you can use natural language with your AI assistant:

- "What Sonos speakers are available?"
- "Play my Jazz playlist on the Kitchen speaker"
- "Set the Living Room volume to 40"
- "Group all speakers for party mode"
- "What's currently playing in the Bedroom?"
- "Run the morning routine macro"
- "Add BBC Radio 4 to the queue"
- "Skip to the next track on Office"

## Development

### Running locally

```bash
cd sonos-mcp-server
pip install -e .
python -m sonos_mcp_server
```

### Testing with MCP Inspector

```bash
npx @modelcontextprotocol/inspector python -m sonos_mcp_server
```

## Troubleshooting

### "Connection refused" errors

Make sure the Sound Control API is running:

```bash
sudo systemctl status sndctrl
```

### Tools not appearing

1. Check the MCP server is properly configured in your AI tool
2. Restart the AI application after config changes
3. Verify Python path is correct

### Speaker commands failing

1. Check speakers are discovered: use `list_speakers` first
2. Ensure speaker names match exactly (case-sensitive)
3. Check Sound Control logs for errors

## License

MIT
