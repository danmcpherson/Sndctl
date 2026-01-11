#!/bin/bash
# Post-install script for Sound Control

set -e

echo "Setting up Python virtual environment..."
cd /opt/sndctrl

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
echo "Sound Control installed successfully!"
echo "=========================================="
echo ""
echo "To start the service:"
echo "  sudo systemctl enable sndctrl"
echo "  sudo systemctl start sndctrl"
echo ""
echo "Access the UI at: http://$(hostname -I | awk '{print $1}')/"
echo ""
