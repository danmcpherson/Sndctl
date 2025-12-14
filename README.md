# Sonos Sound Hub

Self-hosted Sonos control UI and API built for Raspberry Pi. A thin web layer over the fantastic [soco-cli](https://github.com/avantrec/soco-cli) library. Runs fully offline with a lightweight vanilla JS frontend and an ASP.NET Core backend.

## Quick Start (Raspberry Pi)

### Easiest: install via APT (self-contained binary)

```bash
curl -fsSL https://danmcpherson.github.io/SonosSoundHub/KEY.gpg | sudo gpg --dearmor -o /usr/share/keyrings/sonos-sound-hub.gpg
ARCH=$(dpkg --print-architecture)
echo "deb [arch=${ARCH} signed-by=/usr/share/keyrings/sonos-sound-hub.gpg] https://danmcpherson.github.io/SonosSoundHub stable main" | sudo tee /etc/apt/sources.list.d/sonos-sound-hub.list
sudo apt-get update
sudo apt-get install sonos-sound-hub
# Install soco-cli: see https://github.com/avantrec/soco-cli for installation instructions
```

**Run at startup (optional):**
```bash
sudo systemctl enable sonos-sound-hub
sudo systemctl start sonos-sound-hub
```

**Run in foreground:**
```bash
sonos-sound-hub
```

- The script auto-detects `dpkg --print-architecture` (arm64 or armhf) and uses the matching repo build.
- Binary is self-contained; no .NET runtime needed.
- Install [soco-cli](https://github.com/avantrec/soco-cli) separately (required dependency).
- A systemd service file is installed automatically; use `systemctl enable/start` to run at startup.

### Manual install (clone & run)

1. **Install prerequisites**
   ```bash
   sudo apt update
   sudo apt install -y git curl python3 python3-pip python3-venv pipx
   pipx ensurepath
   ```

2. **Install soco-cli**
   - Follow the installation instructions at https://github.com/avantrec/soco-cli

3. **Clone and run**
   ```bash
   git clone https://github.com/danmcpherson/SonosSoundHub.git
   cd SonosSoundHub/api
   dotnet restore
   dotnet run
   ```

### Install from a release artifact (tarball)

1. Grab the latest tarball from GitHub Releases (choose `linux-arm64` for 64-bit Pi OS, `linux-arm` for 32-bit).
   ```bash
   curl -LO https://github.com/danmcpherson/SonosSoundHub/releases/latest/download/sonos-sound-hub-linux-arm64.tar.gz
   ```
2. Extract and run ([soco-cli](https://github.com/avantrec/soco-cli) still required):
   ```bash
   mkdir -p ~/sonos-sound-hub
   tar -xzf sonos-sound-hub-linux-arm64.tar.gz -C ~/sonos-sound-hub
   cd ~/sonos-sound-hub
   ./api
   ```

**Open the UI**
- On the Pi: `http://localhost:5000`
- From another device: `http://<pi-ip-or-hostname>:5000`

The app listens on all network interfaces (0.0.0.0:5000), auto-starts the soco-cli HTTP API server, discovers speakers, and serves the web UI.

## Why This Project

- Runs entirely on-device—no cloud, no accounts
- One-line APT install with automated updates via GitHub Actions
- Self-contained binary (no .NET runtime required)
- Optimized for Raspberry Pi ARM (armhf and arm64)
- Simple, fail-fast design using .NET 8 + vanilla JS
- SQLite-backed, file-based data in `data/`

## Requirements

### For APT Install (Recommended)
- Raspberry Pi 3B+ or newer (works on 32-bit or 64-bit Pi OS)
- Python 3.11+ with `pipx`
- [soco-cli](https://github.com/avantrec/soco-cli) for Sonos control
- Network access to your Sonos speakers (same LAN)

### For Development
- Raspberry Pi 3B+ or newer (64-bit OS recommended)
- .NET 8 SDK
- Python 3.11+ with `pipx`
- [soco-cli](https://github.com/avantrec/soco-cli) for Sonos control
- Network access to your Sonos speakers (same LAN)

## Configuration

Edit `api/appsettings.json` (or `appsettings.Development.json`) to adjust runtime settings:

```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Data Source=data/app.db"
  },
  "DataDirectory": "data",
  "SocoCli": {
    "Port": 8000,
    "UseLocalCache": false
  }
}
```

Note: The macros file path is automatically derived from `DataDirectory` (always `data/macros.txt`).

- Database lives under `data/` (gitignored). Created automatically on first run.
- Adjust `SocoCli:Port` if 8000 is in use.
- Set `ASPNETCORE_ENVIRONMENT=Development` for verbose errors while developing.

## Run Locally (development)

```bash
cd api
dotnet run
```

- Default URL: `http://localhost:5000`
- VS Code tasks: `run`, `build`, `clean`, `publish`
- Hot reload available via `dotnet watch run` (optional).

## Publish and Deploy to Raspberry Pi (release)

1. Publish on your dev machine (or on the Pi):
   ```bash
   cd api
   dotnet publish -c Release -o ./publish
   ```

2. Copy the publish folder to the Pi:
   ```bash
   scp -r api/publish/ pi@<pi-hostname-or-ip>:/home/pi/sonos-sound-hub/
   ```

3. Run on the Pi:
   ```bash
   cd /home/pi/sonos-sound-hub
   dotnet api.dll
   ```

4. Optional: systemd service for auto-start
   ```bash
   sudo systemctl enable sonos-sound-hub
   sudo systemctl start sonos-sound-hub
   sudo systemctl status sonos-sound-hub
   ```

## Features

- **One-line APT install** with signed repository and automated releases
- **Self-contained deployment** (no .NET runtime dependency)
- **Sonos discovery and control** via [soco-cli](https://github.com/avantrec/soco-cli)
- **Macro management** backed by `data/macros.txt`
- **REST API** (ASP.NET Core) with camelCase JSON
- **SQLite storage** - zero external services
- **Vanilla JS frontend** served from `wwwroot/`
- **ARM-optimized** single-file binaries for armhf and arm64

## Project Structure

```
.
├── api/                      # ASP.NET Core Web API + frontend
│   ├── Controllers/          # API endpoints
│   ├── Services/             # Sonos + macro services
│   ├── Models/               # DTOs and EF models
│   ├── wwwroot/              # HTML, JS, CSS
│   ├── data/                 # SQLite DB and macros.txt (gitignored)
│   ├── Program.cs            # Entry point
│   └── appsettings*.json     # Configuration
├── SETUP.md                  # soco-cli and tooling setup
├── TEST_ENVIRONMENT.md       # Sample endpoints and UI
└── README.md
```

## Development Tips

- Keep `soco-cli` running on the same host; the app launches it automatically.
- If ports conflict, change `SocoCli:Port` and the app port via `ASPNETCORE_URLS` (example: `http://0.0.0.0:5002`).
- For debugging in VS Code, use the included tasks/launch config.

## Troubleshooting

- **APT key errors:** Ensure you've run the full install script including the `gpg --dearmor` step. If you see NO_PUBKEY errors, re-add the key.
- **Package not found:** Run `sudo apt-get update` and verify your architecture matches (armhf for 32-bit, arm64 for 64-bit). Check with `dpkg --print-architecture`.
- **Binary not found after install:** The symlink should be at `/usr/local/bin/sonos-sound-hub`. Run `hash -r` to refresh your shell's command cache.
- **Service not starting:** Check logs with `sudo journalctl -u sonos-sound-hub -f`. Ensure soco-cli is installed and the binary has execute permissions.
- **Port in use (5000 or 8000):** `lsof -i :5000` or `lsof -i :8000`, then stop the conflicting process or change the port in config.
- **Speakers not discovered:** ensure the Pi is on the same LAN as Sonos, power-cycle a speaker, or run `sonos-discover`.
- **Refresh cached speaker list:** if `SocoCli:UseLocalCache` is enabled, use the **Rediscover** button in the UI to run `/rediscover` (this overwrites the local speaker cache file and replaces the cached list).
- **soco-cli not found:** Follow the installation guide at https://github.com/avantrec/soco-cli.
- **Database issues:** delete `api/data/app.db` to regenerate (data loss) or confirm `DataDirectory` points to a writable path.

## License

MIT
