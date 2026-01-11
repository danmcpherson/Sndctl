# 🔊 Sound Control

**Take back control of your speaker system.** A beautiful, self-hosted control panel that runs entirely on your local network—no cloud, no accounts, no subscriptions.

<p align="center">
  <img src="docs/screenshots/hero.png" alt="Sound Control Interface" width="800">
</p>

## ✨ Why Sound Control?

Tired of the official Sonos app's limitations? Sound Control gives you **powerful automation** and **instant control** over your entire Sonos system from any device on your network.

### 🎯 Key Benefits

- **🏠 100% Local** — Runs on a Raspberry Pi in your home. No cloud dependency, no internet required, your data stays private.
- **⚡ One-Tap Macros** — Create powerful automation sequences: "Movie Night" dims the lights, groups your speakers, sets the volume, and starts your favorite playlist—all with one tap.
- **📱 Works Everywhere** — Access from any phone, tablet, or computer. Installs as an app on iPhone and Android.
- **🔧 Set It and Forget It** — Install once, runs forever. Auto-starts on boot.

---

## 📸 Screenshots

<p align="center">
  <img src="docs/screenshots/macros-list.png" alt="Macros List" width="250">
  <img src="docs/screenshots/macro-editor.png" alt="Macro Editor" width="250">
  <img src="docs/screenshots/speakers.png" alt="Speaker Control" width="250">
</p>

<p align="center">
  <img src="docs/screenshots/speaker-details.png" alt="Speaker Details" width="250">
  <img src="docs/screenshots/grouping.png" alt="Speaker Grouping" width="250">
  <img src="docs/screenshots/mobile-home.png" alt="Mobile Home Screen" width="250">
</p>

---

## 🎛️ Features

### 🎬 Powerful Macros
Build custom automation sequences using a visual editor. Chain together any combination of:
- **Playback controls** — play, pause, skip, seek
- **Volume management** — set levels, ramp up/down, mute
- **Content playback** — favorites, playlists, radio stations, Spotify/Apple Music links
- **Speaker grouping** — party mode, room-by-room, transfers
- **Timers & delays** — sleep timers, wait commands, scheduled actions
- **EQ settings** — bass, treble, night mode, dialog enhancement

### 🔈 Speaker Control
- Real-time now playing display with album art
- Individual and group volume control
- Quick speaker grouping/ungrouping
- See what's playing across your whole home

### 📲 Mobile-First Design
- Clean, touch-friendly interface
- Install as a home screen app (PWA)
- Works on iPhone, iPad, Android, and desktop browsers
- Dark theme that looks great everywhere

---

## 🚀 Get Started

### Option 1: Pre-Built Raspberry Pi (Easiest)

**Want a plug-and-play solution?** I offer pre-configured Raspberry Pi units with Sound Control ready to go.

📧 **Visit [Sound Control](https://sndctrl.etsy.com)** for pricing and availability.

Just plug it in, connect to your network, and you're ready to control your Sonos system.

---

### Option 2: Install on Your Own Raspberry Pi

#### One-Line Install (Recommended)

```bash
curl -fsSL https://danmcpherson.github.io/Sndctrl/KEY.gpg | sudo gpg --dearmor -o /usr/share/keyrings/sndctrl.gpg
ARCH=$(dpkg --print-architecture)
echo "deb [arch=${ARCH} signed-by=/usr/share/keyrings/sndctrl.gpg] https://danmcpherson.github.io/Sndctrl stable main" | sudo tee /etc/apt/sources.list.d/sndctrl.list
sudo apt-get update
sudo apt-get install sndctrl
```

Then install the required [soco-cli](https://github.com/avantrec/soco-cli) dependency:
```bash
pipx install soco-cli
```

Set up the Python virtual environment:
```bash
cd /opt/sndctrl
sudo python3 -m venv .venv
sudo .venv/bin/pip install -e .
```

**Start on boot:**
```bash
sudo systemctl enable sndctrl
sudo systemctl start sndctrl
```

**Access the UI:** Open `http://<your-pi-ip>/` (port 80) in any browser.

**Optional: Install MCP Server for AI Assistants:**
```bash
cd /opt/sndctrl/sonos-mcp-server
sudo python3 -m venv .venv
sudo .venv/bin/pip install -e .
```

---

### Requirements

- Raspberry Pi Zero W, 3B+ or newer (32-bit or 64-bit Pi OS)
- Python 3.9+ with `pipx`
- Your Pi must be on the same network as your Sonos speakers

---

## 📱 Add to Your Home Screen

Sound Control works as a Progressive Web App (PWA). Add it to your home screen for an app-like experience:

**iPhone/iPad:** Open the URL in Safari → tap Share → "Add to Home Screen"

**Android:** Open the URL in Chrome → tap the menu → "Add to Home screen"

---

## 🤖 AI Assistant Integration (MCP Server)

Sound Control includes an MCP (Model Context Protocol) server that lets AI assistants like Claude, ChatGPT, and GitHub Copilot control your Sonos system through natural language.

### Setup

1. **Install the MCP server** (requires Python 3.10+):
   ```bash
   cd /opt/sndctrl/sonos-mcp-server
   python3 -m venv .venv
   .venv/bin/pip install -e .
   ```

2. **Configure your AI tool:**

   **Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json`):
   ```json
   {
     "mcpServers": {
       "sonos": {
         "command": "/opt/sndctrl/sonos-mcp-server/.venv/bin/python",
         "args": ["-m", "sonos_mcp_server"],
         "env": {
           "SONOS_API_URL": "http://your-pi-ip:80"
         }
       }
     }
   }
   ```

   **VS Code / GitHub Copilot** (`.vscode/mcp.json`):
   ```json
   {
     "servers": {
       "sonos": {
         "type": "stdio",
         "command": "/path/to/sonos-mcp-server/.venv/bin/python",
         "args": ["-m", "sonos_mcp_server"],
         "env": {
           "SONOS_API_URL": "http://your-pi-ip:80"
         }
       }
     }
   }
   ```

3. **Restart your AI application** to load the new tools.

### Example Commands

Once configured, you can use natural language:
- *"What Sonos speakers are available?"*
- *"Play my Jazz playlist on the Kitchen speaker"*
- *"Set the Living Room volume to 40"*
- *"Run the morning routine macro"*
- *"Group all speakers for party mode"*

### Available Tools

The MCP server exposes 28 tools for complete Sonos control:
- Speaker discovery and status
- Playback control (play, pause, next, previous)
- Volume and mute control
- Speaker grouping and party mode
- Favorites, playlists, and radio stations
- Queue management
- Macro execution

---

## ❓ Troubleshooting

| Problem | Solution |
|---------|----------|
| Speakers not found | Ensure your Pi is on the same network as your Sonos speakers |
| Can't access the UI | Check that the service is running: `sudo systemctl status sndctrl` |
| Port already in use | Another app is using port 80 or 8000. Stop it or change ports in settings |
| Permission denied on startup | The systemd service includes capability settings for port 80. Ensure you're running the latest service file. |

---

## 🙏 Acknowledgments

This project wouldn't be possible without the incredible work of the [**SoCo**](https://github.com/SoCo/SoCo) team and [**soco-cli**](https://github.com/avantrec/soco-cli).

**SoCo** (Sonos Controller) is the Python library that enables programmatic control of Sonos speakers. **soco-cli** provides the command-line interface that Sound Control uses under the hood to communicate with your Sonos system.

A huge thank you to the maintainers and contributors of these open-source projects for making Sonos automation accessible to everyone.

---

## 📄 License

MIT License - Use it, modify it, share it.
