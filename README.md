# 🔊 Sonos Sound Hub

**Take back control of your Sonos system.** A beautiful, self-hosted control panel that runs entirely on your local network—no cloud, no accounts, no subscriptions.

<p align="center">
  <img src="docs/screenshots/hero.png" alt="Sonos Sound Hub Interface" width="800">
</p>

## ✨ Why Sonos Sound Hub?

Tired of the official Sonos app's limitations? Sonos Sound Hub gives you **powerful automation** and **instant control** over your entire Sonos system from any device on your network.

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

**Want a plug-and-play solution?** I offer pre-configured Raspberry Pi units with Sonos Sound Hub ready to go.

📧 **Visit [Sonos Sound Hub](https://sonossoundhub.etsy.com)** for pricing and availability.

Just plug it in, connect to your network, and you're ready to control your Sonos system.

---

### Option 2: Install on Your Own Raspberry Pi

#### One-Line Install (Recommended)

```bash
curl -fsSL https://danmcpherson.github.io/SonosSoundHub/KEY.gpg | sudo gpg --dearmor -o /usr/share/keyrings/sonos-sound-hub.gpg
ARCH=$(dpkg --print-architecture)
echo "deb [arch=${ARCH} signed-by=/usr/share/keyrings/sonos-sound-hub.gpg] https://danmcpherson.github.io/SonosSoundHub stable main" | sudo tee /etc/apt/sources.list.d/sonos-sound-hub.list
sudo apt-get update
sudo apt-get install sonos-sound-hub
```

Then install the required [soco-cli](https://github.com/avantrec/soco-cli) dependency:
```bash
pipx install soco-cli
```

Allow the service to bind to port 80 (run once after install):
```bash
sudo setcap 'cap_net_bind_service=+ep' /opt/sonos-sound-hub/api
```

**Start on boot:**
```bash
sudo systemctl enable sonos-sound-hub
sudo systemctl start sonos-sound-hub
```

**Access the UI:** Open `http://<your-pi-ip>/` (port 80) in any browser.

---

### Requirements

- Raspberry Pi 3B+ or newer (32-bit or 64-bit Pi OS)
- Python 3.11+ with `pipx`
- Your Pi must be on the same network as your Sonos speakers

---

## 📱 Add to Your Home Screen

Sonos Sound Hub works as a Progressive Web App (PWA). Add it to your home screen for an app-like experience:

**iPhone/iPad:** Open the URL in Safari → tap Share → "Add to Home Screen"

**Android:** Open the URL in Chrome → tap the menu → "Add to Home screen"

---

## ❓ Troubleshooting

| Problem | Solution |
|---------|----------|
| Speakers not found | Ensure your Pi is on the same network as your Sonos speakers |
| Can't access the UI | Check that the service is running: `sudo systemctl status sonos-sound-hub` |
| Port already in use | Another app is using port 80 or 8000. Stop it or change ports in settings |
| Permission denied on startup | Grant low-port bind: `sudo setcap 'cap_net_bind_service=+ep' /opt/sonos-sound-hub/api` or add `AmbientCapabilities=CAP_NET_BIND_SERVICE` in the systemd unit |

---

## 🙏 Acknowledgments

This project wouldn't be possible without the incredible work of the [**SoCo**](https://github.com/SoCo/SoCo) team and [**soco-cli**](https://github.com/avantrec/soco-cli).

**SoCo** (Sonos Controller) is the Python library that enables programmatic control of Sonos speakers. **soco-cli** provides the command-line interface that Sonos Sound Hub uses under the hood to communicate with your Sonos system.

A huge thank you to the maintainers and contributors of these open-source projects for making Sonos automation accessible to everyone.

---

## 📄 License

MIT License - Use it, modify it, share it.
