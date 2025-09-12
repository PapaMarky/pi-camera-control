#!/bin/bash
# Uninstall pi-camera-control systemd service

set -e

SERVICE_NAME="pi-camera-control"
SERVICE_FILE="${SERVICE_NAME}.service"
SYSTEMD_DIR="/etc/systemd/system"

echo "Uninstalling Pi Camera Control systemd service..."

# Check if running as root
if [[ $EUID -ne 0 ]]; then
    echo "Error: This script must be run as root (use sudo)"
    exit 1
fi

# Stop the service if it's running
if systemctl is-active --quiet "$SERVICE_NAME"; then
    echo "Stopping $SERVICE_NAME service..."
    systemctl stop "$SERVICE_NAME"
fi

# Disable the service
if systemctl is-enabled --quiet "$SERVICE_NAME"; then
    echo "Disabling $SERVICE_NAME service..."
    systemctl disable "$SERVICE_NAME"
fi

# Remove service file
if [[ -f "$SYSTEMD_DIR/$SERVICE_FILE" ]]; then
    echo "Removing service file from $SYSTEMD_DIR..."
    rm "$SYSTEMD_DIR/$SERVICE_FILE"
fi

# Remove network mode control script
if [[ -f "/usr/local/bin/camera-network-mode" ]]; then
    echo "Removing network mode control script..."
    sudo rm -f "/usr/local/bin/camera-network-mode"
fi

# Reload systemd daemon
echo "Reloading systemd daemon..."
systemctl daemon-reload

echo ""
echo "Service uninstallation complete!"
echo "$SERVICE_NAME has been stopped, disabled, and removed."