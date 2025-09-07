#!/bin/bash

# Setup script for Pi Camera Control network mode functionality
# This creates the network mode script and basic AP configuration

echo "Setting up Pi Camera Control network functionality..."

# Create the network mode control script
sudo tee /usr/local/bin/camera-network-mode > /dev/null << 'EOF'
#!/bin/bash

MODE="$1"

case "$MODE" in
    field)
        echo "Switching to field mode (AP only)..."
        # Stop client WiFi to save battery
        sudo systemctl stop wpa_supplicant@wlan0 2>/dev/null || true
        # Start access point services if configured
        sudo systemctl start hostapd 2>/dev/null || echo "hostapd not configured"
        sudo systemctl start dnsmasq 2>/dev/null || echo "dnsmasq not configured"
        echo "Field mode requested - AP services attempted"
        ;;
    development)
        echo "Switching to development mode (AP + Client)..."
        # Start client WiFi for internet access
        sudo systemctl start wpa_supplicant@wlan0 2>/dev/null || true
        # Start access point services if configured
        sudo systemctl start hostapd 2>/dev/null || echo "hostapd not configured"
        sudo systemctl start dnsmasq 2>/dev/null || echo "dnsmasq not configured"
        echo "Development mode requested - both AP and client attempted"
        ;;
    status)
        echo "Network Status:"
        echo "AP Interface (ap0):"
        ip addr show ap0 2>/dev/null || echo "  Not configured"
        echo "Client Interface (wlan0):"
        ip addr show wlan0 2>/dev/null || echo "  Not active"
        echo "Services:"
        echo "  hostapd: $(systemctl is-active hostapd 2>/dev/null || echo 'not configured')"
        echo "  dnsmasq: $(systemctl is-active dnsmasq 2>/dev/null || echo 'not configured')"
        echo "  wpa_supplicant@wlan0: $(systemctl is-active wpa_supplicant@wlan0 2>/dev/null || echo 'not configured')"
        ;;
    *)
        echo "Usage: $0 {field|development|status}"
        echo ""
        echo "Modes:"
        echo "  field       - Access point only (battery optimized)"
        echo "  development - Access point + WiFi client (internet access)"
        echo "  status      - Show current network configuration"
        exit 1
        ;;
esac
EOF

# Make the script executable
sudo chmod +x /usr/local/bin/camera-network-mode

echo "Created /usr/local/bin/camera-network-mode"

# Test the script
echo "Testing network mode script..."
/usr/local/bin/camera-network-mode status

echo ""
echo "Setup complete! The network mode script is now available."
echo ""
echo "Note: To enable full access point functionality, you'll need to:"
echo "1. Install required packages: sudo apt install hostapd dnsmasq"
echo "2. Configure hostapd and dnsmasq (see docs/network-configuration.md)"
echo "3. Set up the ap0 virtual interface"
echo ""
echo "For now, the script will work with basic WiFi client functionality."