#!/bin/bash

# Configure Raspberry Pi for Access Point + WiFi Client dual mode operation
echo "Configuring Pi Camera Control Access Point functionality..."

# Create hostapd configuration
echo "Creating hostapd configuration..."
sudo tee /etc/hostapd/hostapd.conf > /dev/null <<EOF
# Basic configuration
interface=ap0
driver=nl80211
ssid=PiCameraController002
hw_mode=g
channel=7
wmm_enabled=0
macaddr_acl=0
auth_algs=1
ignore_broadcast_ssid=0

# Security configuration
wpa=2
wpa_passphrase=camera123
wpa_key_mgmt=WPA-PSK
wpa_pairwise=TKIP
rsn_pairwise=CCMP
EOF

# Configure dnsmasq for the AP
echo "Creating dnsmasq configuration for AP..."
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

# Update network interface configuration for dual mode
echo "Updating network interfaces..."
sudo tee -a /etc/dhcpcd.conf > /dev/null <<EOF

# Pi Camera Control AP configuration
interface ap0
static ip_address=192.168.4.1/24
nohook wpa_supplicant
EOF

# Create script for starting AP mode
echo "Creating AP control script..."
sudo tee /usr/local/bin/start-ap-mode > /dev/null <<'EOF'
#!/bin/bash

echo "Starting Access Point mode..."

# Create AP interface if it doesn't exist
if ! ip link show ap0 > /dev/null 2>&1; then
    echo "Creating ap0 interface..."
    sudo iw phy phy0 interface add ap0 type __ap
fi

# Configure AP interface
echo "Configuring ap0 interface..."
sudo ip addr add 192.168.4.1/24 dev ap0
sudo ip link set ap0 up

# Start services
echo "Starting hostapd..."
sudo systemctl start hostapd

echo "Starting dnsmasq..."
sudo systemctl start dnsmasq

echo "Access Point mode started"
EOF

sudo chmod +x /usr/local/bin/start-ap-mode

# Create script for stopping AP mode
echo "Creating AP stop script..."
sudo tee /usr/local/bin/stop-ap-mode > /dev/null <<'EOF'
#!/bin/bash

echo "Stopping Access Point mode..."

# Stop services
echo "Stopping hostapd..."
sudo systemctl stop hostapd

echo "Stopping dnsmasq..."
sudo systemctl stop dnsmasq

# Remove AP interface
if ip link show ap0 > /dev/null 2>&1; then
    echo "Removing ap0 interface..."
    sudo ip link set ap0 down
    sudo iw dev ap0 del
fi

echo "Access Point mode stopped"
EOF

sudo chmod +x /usr/local/bin/stop-ap-mode

# Disable auto-start of services (we'll control them via our scripts)
sudo systemctl disable hostapd
sudo systemctl disable dnsmasq

echo "Configuration complete!"
echo ""
echo "To test AP functionality:"
echo "  sudo /usr/local/bin/start-ap-mode"
echo "  sudo /usr/local/bin/stop-ap-mode"
echo ""
echo "The AP will broadcast 'PiCameraController002' with password 'camera123'"
echo "Clients will get IPs in range 192.168.4.2-192.168.4.20"