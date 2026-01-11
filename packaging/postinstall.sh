#!/bin/bash
# Post-install script for Sonos Sound Hub

set -e

echo "Setting up Python virtual environment..."
cd /opt/sonos-sound-hub

# Create virtual environment if it doesn't exist
if [ ! -d ".venv" ]; then
    python3 -m venv .venv
fi

# Install the package
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -e .

echo "Reloading systemd..."
systemctl daemon-reload

echo ""
echo "=========================================="
echo "Sonos Sound Hub installed successfully!"
echo "=========================================="
echo ""
echo "To start the service:"
echo "  sudo systemctl enable sonos-sound-hub"
echo "  sudo systemctl start sonos-sound-hub"
echo ""
echo "Access the UI at: http://$(hostname -I | awk '{print $1}')/"
echo ""
