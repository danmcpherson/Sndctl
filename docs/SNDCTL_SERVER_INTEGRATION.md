# sndctl-server Integration Guide

This document describes what needs to be added to the [sndctl-server](https://github.com/danmcpherson/Sndctrl) repository to integrate with Sonos Sound Hub.

## Overview

The sndctl-server handles:
- Device provisioning and certificate issuance
- Device flashing scripts
- First-boot configuration

The Sonos Sound Hub provides:
- The application itself (Python/FastAPI + frontend)
- Caddy reverse proxy configuration
- `.deb` package for installation

## Files to Add to sndctl-server

### 1. Device Scripts (`device/`)

The `firstrun.sh` script should install both the certificates AND the Sonos Sound Hub application.

#### Update `device/boot/firstrun.sh`

Add the following to the firstrun.sh script after certificate registration:

```bash
# ============================================
# Install Sonos Sound Hub Application
# ============================================

install_sonos_sound_hub() {
    log_info "Installing Sonos Sound Hub..."
    
    # Add the GitHub Packages repository (or your release server)
    SONOSHUB_VERSION="${SONOSHUB_VERSION:-latest}"
    SONOSHUB_REPO="https://github.com/danmcpherson/SonosSoundHub/releases"
    
    if [ "$SONOSHUB_VERSION" = "latest" ]; then
        DOWNLOAD_URL="${SONOSHUB_REPO}/latest/download/sonos-sound-hub_arm64.deb"
    else
        DOWNLOAD_URL="${SONOSHUB_REPO}/download/${SONOSHUB_VERSION}/sonos-sound-hub_arm64.deb"
    fi
    
    # Download and install
    curl -fsSL "$DOWNLOAD_URL" -o /tmp/sonos-sound-hub.deb
    dpkg -i /tmp/sonos-sound-hub.deb || apt-get install -f -y
    rm /tmp/sonos-sound-hub.deb
    
    log_info "Sonos Sound Hub installed successfully"
}

install_caddy() {
    log_info "Installing Caddy..."
    
    apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
    apt-get update
    apt-get install -y caddy
    
    log_info "Caddy installed successfully"
}

configure_caddy() {
    log_info "Configuring Caddy reverse proxy..."
    
    # Create Caddyfile
    cat > /etc/caddy/Caddyfile << 'CADDYFILE'
# Sonos Sound Hub - Caddy Reverse Proxy Configuration
{$SONOSHUB_HOSTNAME} {
    tls /etc/sonoshub/certs/cert.pem /etc/sonoshub/certs/key.pem
    reverse_proxy localhost:5000
    encode gzip
    log {
        output file /var/log/caddy/sonoshub.log {
            roll_size 10mb
            roll_keep 5
        }
    }
}

http://{$SONOSHUB_HOSTNAME} {
    redir https://{$SONOSHUB_HOSTNAME}{uri} permanent
}

:8080 {
    reverse_proxy localhost:5000
}
CADDYFILE

    # Create environment file for Caddy
    cat > /etc/sonoshub/device.env << EOF
SONOSHUB_HOSTNAME=${HOSTNAME}
EOF

    # Create Caddy systemd override
    mkdir -p /etc/systemd/system/caddy.service.d
    cat > /etc/systemd/system/caddy.service.d/sonoshub.conf << 'OVERRIDE'
[Unit]
After=network-online.target sonos-sound-hub.service
Requires=sonos-sound-hub.service

[Service]
EnvironmentFile=/etc/sonoshub/device.env
OVERRIDE

    systemctl daemon-reload
    systemctl enable caddy
    
    log_info "Caddy configured successfully"
}

# Call these after certificate registration
install_caddy
install_sonos_sound_hub
configure_caddy

# Start services
systemctl start sonos-sound-hub
systemctl start caddy
```

### 2. Certificate Renewal Scripts (`device/scripts/`)

Create these scripts that will be installed on the device:

#### `device/scripts/sonoshub-register`

```bash
#!/bin/bash
# Device registration script - calls sndctl-server API

set -e

CONFIG_DIR="/etc/sonoshub"
CERT_DIR="${CONFIG_DIR}/certs"
ENV_FILE="${CONFIG_DIR}/device.env"
CONFIG_FILE="${CONFIG_DIR}/config.json"

log_info() { echo "[INFO] $1"; }
log_error() { echo "[ERROR] $1" >&2; }

# Load config
if [ ! -f "$CONFIG_FILE" ]; then
    log_error "Config file not found: $CONFIG_FILE"
    exit 1
fi

DEVICE_ID=$(jq -r '.deviceId' "$CONFIG_FILE")
DEVICE_SECRET=$(jq -r '.deviceSecret' "$CONFIG_FILE")
SERVER_URL=$(jq -r '.serverUrl' "$CONFIG_FILE")

log_info "Registering device: $DEVICE_ID"

RESPONSE=$(curl -sf -X POST "${SERVER_URL}/api/register" \
    -H "Content-Type: application/json" \
    -H "X-Device-Secret: ${DEVICE_SECRET}" \
    -d "{\"deviceId\": \"${DEVICE_ID}\", \"timestamp\": \"$(date -Iseconds)\"}")

if [ $? -ne 0 ]; then
    log_error "Registration failed"
    exit 1
fi

# Save certificate
mkdir -p "$CERT_DIR"
chmod 700 "$CERT_DIR"

echo "$RESPONSE" | jq -r '.certificate' > "${CERT_DIR}/cert.pem"
echo "$RESPONSE" | jq -r '.privateKey' > "${CERT_DIR}/key.pem"
chmod 600 "${CERT_DIR}/key.pem"

HOSTNAME=$(echo "$RESPONSE" | jq -r '.hostname')
EXPIRES_AT=$(echo "$RESPONSE" | jq -r '.expiresAt')

# Save metadata
cat > "${CONFIG_DIR}/metadata.json" << EOF
{
    "deviceId": "${DEVICE_ID}",
    "hostname": "${HOSTNAME}",
    "expiresAt": "${EXPIRES_AT}",
    "serverUrl": "${SERVER_URL}"
}
EOF

# Update environment file
echo "SONOSHUB_HOSTNAME=${HOSTNAME}" > "$ENV_FILE"

# Delete config file (contains secret)
rm -f "$CONFIG_FILE"

log_info "Registration complete: $HOSTNAME"
log_info "Certificate expires: $EXPIRES_AT"

# Reload Caddy if running
systemctl reload caddy 2>/dev/null || true
```

#### `device/scripts/sonoshub-renew-cert`

```bash
#!/bin/bash
# Certificate renewal script

set -e

CONFIG_DIR="/etc/sonoshub"
CERT_DIR="${CONFIG_DIR}/certs"
METADATA_FILE="${CONFIG_DIR}/metadata.json"
LOG_FILE="/var/log/sonoshub/cert-renewal.log"

log_info() { echo "[$(date -Iseconds)] [INFO] $1" | tee -a "$LOG_FILE"; }
log_error() { echo "[$(date -Iseconds)] [ERROR] $1" | tee -a "$LOG_FILE" >&2; }

mkdir -p "$(dirname "$LOG_FILE")"

if [ ! -f "$METADATA_FILE" ]; then
    log_error "Metadata file not found - device not registered"
    exit 1
fi

DEVICE_ID=$(jq -r '.deviceId' "$METADATA_FILE")
HOSTNAME=$(jq -r '.hostname' "$METADATA_FILE")
EXPIRES_AT=$(jq -r '.expiresAt' "$METADATA_FILE")
SERVER_URL=$(jq -r '.serverUrl' "$METADATA_FILE")

# Check if renewal is needed (within 30 days of expiry)
EXPIRES_EPOCH=$(date -d "$EXPIRES_AT" +%s 2>/dev/null || echo 0)
NOW_EPOCH=$(date +%s)
DAYS_LEFT=$(( (EXPIRES_EPOCH - NOW_EPOCH) / 86400 ))

if [ "$DAYS_LEFT" -gt 30 ]; then
    log_info "Certificate valid for $DAYS_LEFT days - no renewal needed"
    exit 0
fi

log_info "Certificate expires in $DAYS_LEFT days - renewing"

# Get device secret from secure storage or re-derive
DEVICE_SECRET=$(cat "${CONFIG_DIR}/device-secret" 2>/dev/null)
if [ -z "$DEVICE_SECRET" ]; then
    log_error "Device secret not found"
    exit 1
fi

RESPONSE=$(curl -sf -X POST "${SERVER_URL}/api/renew" \
    -H "Content-Type: application/json" \
    -H "X-Device-Secret: ${DEVICE_SECRET}" \
    -d "{\"deviceId\": \"${DEVICE_ID}\", \"timestamp\": \"$(date -Iseconds)\"}")

if [ $? -ne 0 ]; then
    log_error "Renewal failed"
    exit 1
fi

# Update certificate
echo "$RESPONSE" | jq -r '.certificate' > "${CERT_DIR}/cert.pem"
echo "$RESPONSE" | jq -r '.privateKey' > "${CERT_DIR}/key.pem"
chmod 600 "${CERT_DIR}/key.pem"

NEW_EXPIRES=$(echo "$RESPONSE" | jq -r '.expiresAt')

# Update metadata
jq --arg exp "$NEW_EXPIRES" '.expiresAt = $exp' "$METADATA_FILE" > "${METADATA_FILE}.tmp"
mv "${METADATA_FILE}.tmp" "$METADATA_FILE"

log_info "Renewal complete - new expiry: $NEW_EXPIRES"

# Reload Caddy
systemctl reload caddy
```

### 3. Systemd Services (`device/systemd/`)

#### `device/systemd/sonoshub-cert-renewal.service`

```ini
[Unit]
Description=Sonos Sound Hub Certificate Renewal
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/sonoshub-renew-cert
```

#### `device/systemd/sonoshub-cert-renewal.timer`

```ini
[Unit]
Description=Daily certificate renewal check for Sonos Sound Hub

[Timer]
OnCalendar=*-*-* 03:00:00
RandomizedDelaySec=3600
Persistent=true

[Install]
WantedBy=timers.target
```

### 4. Update Flash Script

Update `device/flash-device.sh` to include the app version:

```bash
# Add to the config JSON written to the device
cat > "$CONFIG_FILE" << EOF
{
    "deviceId": "${DEVICE_ID}",
    "deviceSecret": "${DEVICE_SECRET}",
    "serverUrl": "${SERVER_URL}",
    "sonoshubVersion": "${SONOSHUB_VERSION:-latest}"
}
EOF
```

## Directory Structure for sndctl-server

After adding these files:

```
sndctl-server/
├── device/
│   ├── flash-device.sh
│   ├── setup-sd-card.sh
│   ├── boot/
│   │   └── firstrun.sh          # Updated with app installation
│   ├── scripts/
│   │   ├── sonoshub-register    # NEW
│   │   └── sonoshub-renew-cert  # NEW
│   ├── systemd/
│   │   ├── sonoshub-cert-renewal.service  # NEW
│   │   └── sonoshub-cert-renewal.timer    # NEW
│   └── configs/
│       └── (generated device configs)
├── api/
│   └── (Azure Functions - already implemented)
└── ...
```

## Integration Points

| Component | sndctl-server | SonosSoundHub |
|-----------|---------------|---------------|
| Certificate API | ✓ Implements | Uses via scripts |
| Device secrets | ✓ Generates & stores | N/A |
| Registration scripts | ✓ Provides | N/A |
| Caddy config | ✓ Installs | ✓ Provides template |
| Application | Installs from release | ✓ Builds & publishes |
| `.deb` package | Installs on device | ✓ Creates in CI |

## Release Workflow

1. **SonosSoundHub** publishes `.deb` releases to GitHub Releases
2. **sndctl-server** `firstrun.sh` downloads and installs the latest release
3. Caddy configuration references certificate paths from sndctl-server
4. Both systems use `/etc/sonoshub/` as the shared configuration directory

## Testing

To test the integration:

1. Provision a device using sndctl-server
2. Flash SD card with `flash-device.sh`
3. Boot device - it should:
   - Connect to WiFi via comitup
   - Register with sndctl-server API
   - Receive certificate
   - Install Sonos Sound Hub from GitHub releases
   - Start Caddy with HTTPS
4. Access device at `https://{device-id}.sndctl.app`
