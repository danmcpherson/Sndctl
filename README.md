# Sonos Sound Hub

A self-hosted web application designed to run on Raspberry Pi for managing your Sonos sound system.

## Overview

This application provides a complete web interface for Sonos management, running entirely locally on your Raspberry Pi with no cloud dependencies.

## Architecture

- **Platform**: Raspberry Pi (ARM-compatible)
- **Frontend**: Vanilla JavaScript, HTML, CSS
- **Backend**: ASP.NET Core Web API (.NET 8)
- **Database**: SQLite (file-based)
- **Caching**: In-memory caching
- **Hosting**: Self-hosted on Raspberry Pi using Kestrel

## Project Structure

```
.
├── api/                          # ASP.NET Core Web API
│   ├── Controllers/             # API controllers
│   ├── wwwroot/                 # Frontend files (HTML, JS, CSS)
│   ├── AppDbContext.cs          # Database context
│   ├── Program.cs               # Application entry point
│   └── appsettings.json         # Configuration
├── .devcontainer/               # Dev container configuration
├── .vscode/                     # VS Code tasks and launch config
└── TEST_ENVIRONMENT.md          # Test environment documentation

```

## Getting Started

### Prerequisites

- Visual Studio Code with Dev Containers extension (for development)
- Docker Desktop (for dev container)
- Or: Raspberry Pi with .NET 8 SDK installed (for production)

### 1. Open in Dev Container

**Option A: GitHub Codespaces**
1. Click "Code" → "Codespaces" → "Create codespace on main"
2. Wait for the container to build and start

**Option B: Local Dev Container**
1. Install Docker Desktop and VS Code with Dev Containers extension
2. Clone the repository
3. Open in VS Code and click "Reopen in Container"

### 2. Run the Application

```bash
cd api
dotnet run
```

The application will start on `http://localhost:5000` (or the port shown in terminal).

**Using VS Code:**
- Press `F5` to run with debugging
- Or use Terminal → Run Task → "run"

### 3. Access the Application

Open your browser and navigate to the URL shown in the terminal (typically `http://localhost:5000` or `http://localhost:8080`).
2. Click "New repository secret"
3. Name: `AZURE_STATIC_WEB_APPS_API_TOKEN`
4. Value: (provided by the setup script)

The GitHub Actions workflow will automatically deploy on every push to `main`.

### 4. Local Development

**Start Azurite (Local Storage Emulator):**
```bash
azurite --silent --location .azurite --debug .azurite/debug.log
```

**Start the Static Web App CLI:**
```bash
swa start
```

This will:
- Serve the frontend on `http://localhost:4280`
- Run the .NET API functions
- Use Azurite for local storage

**Access the application:**
- Homepage: `http://localhost:4280`
- Dashboard (authenticated): `http://localhost:4280/app`
- API: `http://localhost:4280/api/*`

## Features

### Frontend

## Features

- ✅ Self-hosted - runs entirely on your Raspberry Pi
- ✅ No cloud dependencies - all data stored locally
- ✅ SQLite database - lightweight and efficient
- ✅ REST API - standard ASP.NET Core Web API
- ✅ Vanilla JavaScript frontend - no build step required
- ✅ ARM-compatible - optimized for Raspberry Pi

## API Endpoints

The test environment includes sample CRUD endpoints at `/api/sample`:

- `GET /api/sample` - Get all items
- `GET /api/sample/{id}` - Get item by ID
- `POST /api/sample` - Create new item
- `PUT /api/sample/{id}` - Update item
- `DELETE /api/sample/{id}` - Delete item

## Configuration

Edit `api/appsettings.json` to configure:

```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Data Source=data/app.db"
  },
  "DataDirectory": "data"
}
```

## Database

SQLite database is automatically created on first run in the `data/` directory. The database file is gitignored.

## Deploying to Raspberry Pi

1. **Publish the application:**
   ```bash
   cd api
   dotnet publish -c Release -o ./publish
   ```

2. **Copy to Raspberry Pi:**
   ```bash
   scp -r publish/ pi@raspberrypi:~/sonos-hub/
   ```

3. **Run on Raspberry Pi:**
   ```bash
   cd ~/sonos-hub
   dotnet api.dll
   ```

4. **Optional: Set up systemd service**
   
   Create `/etc/systemd/system/sonos-hub.service`:
   ```ini
   [Unit]
   Description=Sonos Sound Hub
   After=network.target

   [Service]
   WorkingDirectory=/home/pi/sonos-hub
   ExecStart=/usr/bin/dotnet /home/pi/sonos-hub/api.dll
   Restart=always
   RestartSec=10
   User=pi
   Environment=ASPNETCORE_ENVIRONMENT=Production

   [Install]
   WantedBy=multi-user.target
   ```

   Enable and start:
   ```bash
   sudo systemctl enable sonos-hub
   sudo systemctl start sonos-hub
   ```

## Development Notes

- SQLite database: `data/app.db`
- Static files: `api/wwwroot/`
- All API responses use camelCase (JavaScript convention)
- ARM-compatible - ready for Raspberry Pi

## Test Environment

See `TEST_ENVIRONMENT.md` for details about the included test environment with sample data and UI.

## Next Steps

1. Build your Sonos integration features
2. Add new API controllers in `api/Controllers/`
3. Create database models and add to `AppDbContext`
4. Extend the frontend in `api/wwwroot/`

## License

MIT
