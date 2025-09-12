#!/bin/bash
# Install pi-camera-control systemd service

set -e

# SAFETY CHECK: Ensure we're running on a Raspberry Pi
if ! grep -q "Raspberry Pi\|BCM" /proc/cpuinfo 2>/dev/null && ! uname -m | grep -q "arm" && [ ! -f "/boot/config.txt" ]; then
    echo "ERROR: This script is designed for Raspberry Pi only!"
    echo "Detected system: $(uname -a)"
    echo "This script installs system services and should not be run on desktop/laptop systems."
    echo ""
    read -p "Are you ABSOLUTELY SURE you want to continue? [type 'YES' to proceed]: " confirm
    if [ "$confirm" != "YES" ]; then
        echo "Setup cancelled for safety."
        exit 1
    fi
fi

SERVICE_NAME="pi-camera-control"
SERVICE_FILE="${SERVICE_NAME}.service"
SYSTEMD_DIR="/etc/systemd/system"

echo "Installing Pi Camera Control systemd service..."

# Check if running as root
if [[ $EUID -ne 0 ]]; then
    echo "Error: This script must be run as root (use sudo)"
    exit 1
fi

# Check if service file exists
if [[ ! -f "$SERVICE_FILE" ]]; then
    echo "Error: Service file '$SERVICE_FILE' not found"
    echo "Make sure you're running this from the project root directory"
    exit 1
fi

# Copy service file to systemd directory
echo "Copying service file to $SYSTEMD_DIR..."
cp "$SERVICE_FILE" "$SYSTEMD_DIR/"

# Set correct permissions
chmod 644 "$SYSTEMD_DIR/$SERVICE_FILE"

# Install network mode control script
echo "Installing network mode control script..."
if [[ -f "scripts/camera-network-mode" ]]; then
    sudo cp "scripts/camera-network-mode" "/usr/local/bin/"
    sudo chmod 755 "/usr/local/bin/camera-network-mode"
    echo "Network mode script installed to /usr/local/bin/camera-network-mode"
else
    echo "Warning: scripts/camera-network-mode not found - network mode switching may not work"
fi

# Reload systemd daemon
echo "Reloading systemd daemon..."
systemctl daemon-reload

# Disable IPv6 system-wide for simplified networking
echo "Disabling IPv6 system-wide..."
./scripts/disable-ipv6.sh

# Enable service to start on boot
echo "Enabling service to start on boot..."
systemctl enable "$SERVICE_NAME"

# Start the service
echo "Starting $SERVICE_NAME service..."
systemctl start "$SERVICE_NAME"

# Check service status
echo ""
echo "Service installation complete!"
echo "Service status:"
systemctl status "$SERVICE_NAME" --no-pager --lines=5
echo ""
echo "=== IPv6 Disabled ==="
echo "IPv6 has been disabled system-wide for simplified networking."
echo "A reboot is required for all IPv6 changes to take effect:"
echo "  sudo reboot"
echo ""
echo "Useful commands:"
echo "  Check status:    sudo systemctl status $SERVICE_NAME"
echo "  View logs:       sudo journalctl -u $SERVICE_NAME -f"
echo "  Stop service:    sudo systemctl stop $SERVICE_NAME"
echo "  Start service:   sudo systemctl start $SERVICE_NAME"
echo "  Restart service: sudo systemctl restart $SERVICE_NAME"
echo "  Disable service: sudo systemctl disable $SERVICE_NAME"