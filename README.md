# Sonos Sound Hub

Self-hosted Sonos control UI and API built for Raspberry Pi. Runs fully offline with a lightweight vanilla JS frontend and an ASP.NET Core backend.

## Quick Start (Raspberry Pi)

Follow these steps on a Raspberry Pi OS 64-bit install (Bullseye/Bookworm):

1. **Install prerequisites**
   ```bash
   sudo apt update
   sudo apt install -y git curl python3 python3-pip python3-venv pipx
   pipx ensurepath
   ```

2. **Install .NET 8 (ARM)**
   ```bash
   curl -sSL https://dot.net/v1/dotnet-install.sh -o dotnet-install.sh
   chmod +x dotnet-install.sh
   ./dotnet-install.sh --channel 8.0 --runtime aspnetcore
   ./dotnet-install.sh --channel 8.0 --runtime dotnet
   ./dotnet-install.sh --channel 8.0 --quality ga --install-dir "$HOME/.dotnet" --version latest
   echo 'export PATH="$HOME/.dotnet:$PATH"' >> ~/.bashrc
   echo 'export PATH="$HOME/.dotnet:$PATH"' >> ~/.profile
   source ~/.profile
   dotnet --info
   ```

3. **Install soco-cli (Sonos bridge)**
   - Prerequisite; follow the official installation guidance at https://github.com/avantrec/soco-cli.

4. **Clone and run**
   ```bash
   git clone https://github.com/danmcpherson/SonosSoundHub.git
   cd SonosSoundHub/api
   dotnet restore
   dotnet run
   ```

### Install from a release artifact (easiest on Pi)

1. Grab the latest tarball from GitHub Releases (choose `linux-arm64` for 64-bit Pi OS, `linux-arm` for 32-bit).
   ```bash
   curl -LO https://github.com/danmcpherson/SonosSoundHub/releases/latest/download/sonos-sound-hub-linux-arm64.tar.gz
   ```
2. Extract and run (assumes .NET 8 runtime and soco-cli are already installed):
   ```bash
   mkdir -p ~/sonos-sound-hub
   tar -xzf sonos-sound-hub-linux-arm64.tar.gz -C ~/sonos-sound-hub
   cd ~/sonos-sound-hub
   ./api
   ```

5. **Open the UI**
   - On the Pi: `http://localhost:5000`
   - From another device: `http://<pi-hostname-or-ip>:5000`

The app auto-starts the soco-cli HTTP API server, discovers speakers, and serves the web UI from `wwwroot/`.

## Why This Project

- Runs entirely on-device—no cloud, no accounts
- Optimized for Raspberry Pi and ARM
- Simple, fail-fast design using .NET 8 + vanilla JS
- SQLite-backed, file-based data in `data/`

## Requirements

- Raspberry Pi 3B+ or newer (64-bit OS recommended)
- .NET 8 runtime (or SDK for development)
- Python 3.11+ with `pipx`
- `soco-cli` for Sonos control
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
    "MacrosFile": "data/macros.txt",
    "UseLocalCache": false
  }
}
```

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
   ```ini
   [Unit]
   Description=Sonos Sound Hub
   After=network.target

   [Service]
   WorkingDirectory=/home/pi/sonos-sound-hub
   ExecStart=/home/pi/.dotnet/dotnet /home/pi/sonos-sound-hub/api.dll
   Restart=always
   RestartSec=10
   User=pi
   Environment=ASPNETCORE_ENVIRONMENT=Production

   [Install]
   WantedBy=multi-user.target
   ```
   ```bash
   sudo tee /etc/systemd/system/sonos-sound-hub.service >/dev/null <<'EOF'
   [Unit]
   Description=Sonos Sound Hub
   After=network.target

   [Service]
   WorkingDirectory=/home/pi/sonos-sound-hub
   ExecStart=/home/pi/.dotnet/dotnet /home/pi/sonos-sound-hub/api.dll
   Restart=always
   RestartSec=10
   User=pi
   Environment=ASPNETCORE_ENVIRONMENT=Production

   [Install]
   WantedBy=multi-user.target
   EOF
   sudo systemctl enable sonos-sound-hub
   sudo systemctl start sonos-sound-hub
   ```

## Features

- Sonos discovery and control via `soco-cli`
- Macro management backed by `data/macros.txt`
- REST API (ASP.NET Core) with camelCase JSON
- SQLite storage; zero external services
- Vanilla JS frontend served from `wwwroot/`
- ARM-friendly binaries for Raspberry Pi

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

- **Port in use (5000 or 8000):** `lsof -i :5000` or `lsof -i :8000`, then stop the conflicting process or change the port in config.
- **Speakers not discovered:** ensure the Pi is on the same LAN as Sonos, power-cycle a speaker, or run `sonos-discover`.
- **Refresh cached speaker list:** if `SocoCli:UseLocalCache` is enabled, use the **Rediscover** button in the UI to run `/rediscover` (this overwrites the local speaker cache file and replaces the cached list).
- **Permission errors with pipx:** check the soco-cli installation notes for your platform.
- **Database issues:** delete `api/data/app.db` to regenerate (data loss) or confirm `DataDirectory` points to a writable path.

## License

MIT
