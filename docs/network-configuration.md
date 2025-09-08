# Network Configuration - Dual Mode WiFi

This document describes the manual configuration approach for setting up the Raspberry Pi Zero W to operate as both a WiFi access point and WiFi client simultaneously (AP+STA mode).

## Overview

The Canon Camera Controller requires flexible network operation:
- **Development Mode**: Connect to home WiFi (internet access) while serving camera AP
- **Field Mode**: Access point only (battery optimized for off-grid operation)

## Security-First Approach

This configuration uses only standard Debian packages installed via `apt` - no curl|bash scripts or third-party repositories required.

## Required Packages

```bash
sudo apt update
sudo apt install hostapd dnsmasq iptables-persistent
```

## Configuration Files

### 1. Virtual Interface Creation

Create `/etc/udev/rules.d/70-persistent-net.rules`:
```bash
SUBSYSTEM=="ieee80211", ACTION=="add|change", ATTR{macaddress}=="b8:27:eb:*", KERNEL=="phy0", \
  RUN+="/sbin/iw phy phy0 interface add ap0 type __ap", \
  RUN+="/bin/ip link set ap0 address b8:27:eb:ff:ff:ff"
```

### 2. Network Interface Configuration

Add to `/etc/dhcpcd.conf`:
```bash
# Static IP for access point interface
interface ap0
static ip_address=192.168.4.1/24
nohook wpa_supplicant

# Client mode interface for development
interface wlan0
# Configuration handled by wpa_supplicant when in development mode
```

### 3. Access Point Configuration

Create `/etc/hostapd/hostapd.conf`:
```bash
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
wpa_passphrase=your_secure_password
wpa_key_mgmt=WPA-PSK
wpa_pairwise=TKIP
rsn_pairwise=CCMP
```

### 4. DHCP Server Configuration

Add to `/etc/dnsmasq.conf`:
```bash
# Listen only on access point interface
interface=ap0
# Provide DHCP service for camera and user devices
dhcp-range=192.168.4.2,192.168.4.20,255.255.255.0,24h
# Don't interfere with client mode
no-dhcp-interface=wlan0
```

### 5. WiFi Client Configuration

Create `/etc/wpa_supplicant/wpa_supplicant.conf` for development mode:
```bash
country=US
ctrl_interface=DIR=/var/run/wpa_supplicant GROUP=netdev
update_config=1

# Development WiFi networks
network={
    ssid="YourHomeWiFi"
    psk="your_home_wifi_password"
    id_str="home"
}

network={
    ssid="YourDevelopmentWiFi" 
    psk="your_dev_wifi_password"
    id_str="development"
}
```

## Mode Switching

### Network Mode Control Script

Create `/usr/local/bin/camera-network-mode`:
```bash
#!/bin/bash

MODE="$1"

case "$MODE" in
    field)
        echo "Switching to field mode (AP only)..."
        # Stop client WiFi to save battery
        systemctl stop wpa_supplicant@wlan0
        # Ensure access point is running
        systemctl start hostapd
        systemctl start dnsmasq
        echo "Field mode active - AP only"
        ;;
    development)
        echo "Switching to development mode (AP + Client)..."
        # Start client WiFi for internet access
        systemctl start wpa_supplicant@wlan0
        # Ensure access point is running
        systemctl start hostapd
        systemctl start dnsmasq
        echo "Development mode active - AP + Client"
        ;;
    status)
        echo "Network Status:"
        echo "AP Interface (ap0):"
        ip addr show ap0 2>/dev/null || echo "  Not configured"
        echo "Client Interface (wlan0):"
        ip addr show wlan0 2>/dev/null || echo "  Not active"
        echo "Services:"
        systemctl is-active hostapd
        systemctl is-active dnsmasq
        systemctl is-active wpa_supplicant@wlan0
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
```

Make executable:
```bash
sudo chmod +x /usr/local/bin/camera-network-mode
```

## Service Configuration

Enable required services:
```bash
# Enable hostapd and dnsmasq to start at boot
sudo systemctl enable hostapd
sudo systemctl enable dnsmasq

# Configure wpa_supplicant for on-demand use
sudo systemctl disable wpa_supplicant@wlan0
```

## Camera Controller Integration

Your camera controller can detect network mode programmatically:

```javascript
const fs = require('fs');

function detectNetworkMode() {
    // Check if wlan0 client connection is active
    const clientActive = fs.existsSync('/var/run/wpa_supplicant/wlan0');
    return clientActive ? 'development' : 'field';
}

function configureForMode(mode) {
    if (mode === 'development') {
        // Enable internet-dependent features
        enableUpdateChecks();
        enableCloudLogging();
        enableRemoteMonitoring();
    } else {
        // Field mode - local operation only
        disableInternetFeatures();
        enableBatteryOptimizations();
    }
}
```

## Network Topology

### Field Mode
```
Camera ──WiFi──> Pi Zero W (192.168.4.1)
                     │
iPhone/MacBook ──WiFi──┘
```

### Development Mode  
```
Internet ──WiFi──> Pi Zero W ──WiFi──> Camera
                     │    (192.168.4.1)
iPhone/MacBook ──WiFi──┘
```

## Troubleshooting

### Common Issues

**Both interfaces use same channel**: This is a hardware limitation of the Pi Zero W's single WiFi chip. The access point and client connection must use the same WiFi channel.

**Interface conflicts**: Ensure `ap0` comes up before `wlan0` attempts connection.

**Power issues**: Ensure adequate power supply (5V/3A minimum) especially when both interfaces are active.

### Diagnostic Commands

```bash
# Check interface status
ip addr show ap0
ip addr show wlan0

# Check service status
systemctl status hostapd
systemctl status dnsmasq
systemctl status wpa_supplicant@wlan0

# View logs
sudo journalctl -u hostapd -f
sudo journalctl -u dnsmasq -f

# Test access point
sudo hostapd -d /etc/hostapd/hostapd.conf
```

## Security Considerations

- Change default SSID and password from PiCameraController/camera123 in production
- Consider disabling WPS if not needed
- Use strong WPA2 passwords (minimum 12 characters)
- Regularly update system packages
- Monitor access point connections in logs

## Battery Optimization

For extended field operation:
- Use `field` mode to disable client WiFi
- Consider reducing AP broadcast interval
- Monitor power consumption with both modes
- Implement automatic mode switching based on power levels

## Integration with Debian Package

This configuration will be automated in the camera controller debian package:
- Configuration files installed during package installation
- Mode switching integrated with camera controller service
- Automatic detection of network environment
- Graceful fallback between modes