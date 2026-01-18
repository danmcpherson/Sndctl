# Auto-Upgrade System

Sound Control includes an automatic upgrade system that checks for updates daily and applies them based on a ring-based deployment strategy.

## Overview

The auto-upgrade system:
- Checks for updates at **4am local time daily** (with up to 30 minutes of random delay to avoid thundering herd)
- Uses **ring-based deployment** for staged rollouts
- Downloads, verifies, and installs packages automatically
- Restarts the service after successful upgrade

## Ring-Based Deployment

Rings allow for controlled, staged rollouts of new versions. Devices in lower rings receive updates before devices in higher rings, allowing time to identify and fix issues before wider deployment.

| Ring | Name | Description | Delay After Release |
|------|------|-------------|---------------------|
| 0 | Canary | First to receive updates, for testing | Immediate |
| 1 | Early | Early adopters | ~1 day |
| 2 | General | General availability | ~3 days |
| 3 | Conservative | Most stable, production devices | ~7 days |

### Configuring Your Ring

Set the `SNDCTL_UPGRADE_RING` environment variable in your systemd service or environment:

```bash
# In /etc/systemd/system/sndctl.service.d/override.conf
[Service]
Environment=SNDCTL_UPGRADE_RING=1
```

Or edit the service file directly:

```bash
sudo systemctl edit sndctl
```

The default ring is `3` (Conservative), which provides the most stability for production devices.

## Configuration

The following environment variables control auto-upgrade behavior:

| Variable | Default | Description |
|----------|---------|-------------|
| `SNDCTL_UPGRADE_ENABLED` | `true` | Enable/disable auto-upgrades |
| `SNDCTL_UPGRADE_RING` | `3` | Deployment ring (0-3) |
| `SNDCTL_UPGRADE_CHECK_HOUR` | `4` | Hour to check for upgrades (0-23) |

## How It Works

### Server-Side (Update Server)

The update server (configured via `SNDCTL_SERVER_URL`) provides:

1. **Check Endpoint**: `POST /api/v1/upgrades/check`
   - Receives: device ID, current version, ring
   - Returns: whether an update is available, version info, download URL

2. **Ring Control**: The server determines which versions are available for each ring based on:
   - Time since release
   - Number of successful deployments in lower rings
   - Reported issues or rollback rates

### Client-Side (Device)

1. **Systemd Timer** (`sndctl-upgrade.timer`):
   - Runs daily at 4am local time
   - Has a random delay of up to 30 minutes

2. **Upgrade Script** (`sndctl-upgrade.sh`):
   - Calls the local API to check for updates
   - Triggers the upgrade if one is available
   - Monitors service restart

3. **Upgrade Service** (`upgrade_service.py`):
   - Contacts the update server
   - Downloads and verifies the package (SHA256 checksum)
   - Installs using `dpkg`
   - Restarts the service

## Manual Operations

### Check Timer Status

```bash
systemctl status sndctl-upgrade.timer
```

### View Upgrade Logs

```bash
journalctl -u sndctl-upgrade -f
```

### Manually Trigger Upgrade Check

```bash
# Via command line
curl -X POST http://localhost:80/upgrades/check

# Or run the script
sudo /opt/sndctl/bin/sndctl-upgrade.sh
```

### Apply Upgrade Manually

```bash
curl -X POST http://localhost:80/upgrades/apply
```

### Disable Auto-Upgrades

```bash
# Disable the timer
sudo systemctl disable sndctl-upgrade.timer
sudo systemctl stop sndctl-upgrade.timer

# Or set environment variable
# In systemd override or .env file:
SNDCTL_UPGRADE_ENABLED=false
```

### Re-enable Auto-Upgrades

```bash
sudo systemctl enable sndctl-upgrade.timer
sudo systemctl start sndctl-upgrade.timer
```

## API Endpoints

### GET /upgrades/status

Returns the current upgrade system status:

```json
{
  "status": "idle",
  "currentVersion": "1.0.0",
  "ring": 3,
  "upgradeEnabled": true,
  "lastCheck": "2026-01-18T04:15:00Z",
  "lastUpgrade": "2026-01-10T04:20:00Z",
  "pendingVersion": null,
  "errorMessage": null
}
```

### POST /upgrades/check

Manually trigger an upgrade check:

```json
{
  "updateAvailable": true,
  "currentVersion": "1.0.0",
  "latestVersion": {
    "version": "1.1.0",
    "releaseDate": "2026-01-15T00:00:00Z",
    "downloadUrl": "https://releases.example.com/sndctl_1.1.0_arm64.deb",
    "checksum": "sha256:abc123...",
    "releaseNotes": "Bug fixes and improvements",
    "minRing": 2
  }
}
```

### POST /upgrades/apply

Trigger an upgrade if one is available. Returns immediately; the service will restart after installation.

## Rollback

If an upgrade fails or causes issues:

1. The previous package remains on the system (dpkg keeps old versions)
2. You can manually downgrade using:
   ```bash
   # List available versions
   apt list -a sndctl
   
   # Install specific version
   sudo apt install sndctl=1.0.0
   ```

## Troubleshooting

### Upgrade Check Fails

1. Check network connectivity
2. Verify `SNDCTL_SERVER_URL` is configured correctly
3. Check device credentials (`SNDCTL_DEVICE_ID`, `SNDCTL_DEVICE_SECRET`)
4. View logs: `journalctl -u sndctl-upgrade`

### Package Installation Fails

1. Check disk space: `df -h`
2. Check for dpkg lock: `sudo fuser -v /var/lib/dpkg/lock-frontend`
3. Fix broken packages: `sudo dpkg --configure -a`

### Service Won't Start After Upgrade

1. Check service logs: `journalctl -u sndctl -n 50`
2. Rollback to previous version (see above)
3. Report the issue in the lower ring before wider deployment
