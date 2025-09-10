#!/bin/bash
# Emergency network fix script for Pi Camera Control
# Run this directly on the Pi if network issues occur

echo "=== Pi Camera Control Network Recovery ==="

# Stop all network services first
echo "Stopping services..."
sudo systemctl stop hostapd dnsmasq pi-camera-control

# Remove any existing ap0 interface
echo "Cleaning up interfaces..."
sudo ip link set ap0 down 2>/dev/null || true
sudo iw dev ap0 del 2>/dev/null || true

# Create proper hostapd configuration
echo "Creating hostapd configuration..."
sudo tee /etc/hostapd/hostapd.conf > /dev/null <<EOF
interface=ap0
driver=nl80211
ssid=PiCameraController
hw_mode=g
channel=7
wmm_enabled=0
macaddr_acl=0
auth_algs=1
ignore_broadcast_ssid=0
wpa=2
wpa_passphrase=camera123
wpa_key_mgmt=WPA-PSK
wpa_pairwise=TKIP
rsn_pairwise=CCMP
EOF

# Create proper dnsmasq configuration
echo "Creating dnsmasq configuration..."
sudo tee /etc/dnsmasq.conf > /dev/null <<EOF
# Basic configuration
interface=ap0
bind-interfaces

# DHCP configuration for AP clients
dhcp-range=192.168.4.2,192.168.4.20,255.255.255.0,24h

# DNS configuration
address=/#/192.168.4.1
address=/picontrol.local/192.168.4.1
address=/camera.local/192.168.4.1
EOF

# Ensure hostapd service knows about config file
echo "Configuring hostapd service..."
sudo sed -i 's/#DAEMON_CONF=""/DAEMON_CONF="\/etc\/hostapd\/hostapd.conf"/' /etc/default/hostapd

# Create ap0 interface
echo "Creating ap0 interface..."
if ! ip link show ap0 >/dev/null 2>&1; then
    sudo iw phy phy0 interface add ap0 type __ap || echo "Warning: Could not create ap0"
fi

# Configure ap0 interface
if ip link show ap0 >/dev/null 2>&1; then
    echo "Configuring ap0 interface..."
    sudo ip addr flush dev ap0 2>/dev/null || true
    sudo ip addr add 192.168.4.1/24 dev ap0
    sudo ip link set ap0 up
else
    echo "Warning: ap0 interface not available"
fi

# Start services in correct order
echo "Starting services..."
sudo systemctl start hostapd
sleep 2
sudo systemctl start dnsmasq
sleep 2
sudo systemctl start pi-camera-control

echo "=== Recovery complete ==="
echo ""
echo "Checking service status..."
echo "hostapd: $(systemctl is-active hostapd)"
echo "dnsmasq: $(systemctl is-active dnsmasq)"
echo "pi-camera-control: $(systemctl is-active pi-camera-control)"

echo ""
echo "Interface status:"
ip addr show ap0 2>/dev/null || echo "ap0: not available"

echo ""
echo "The access point should now be available as 'PiCameraController' with password 'camera123'"
echo "Web interface should be accessible at: http://192.168.4.1:3000"