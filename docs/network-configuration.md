# Network Configuration - NetworkManager-Based WiFi Management

This document describes the current NetworkManager-based approach for WiFi management in the Pi Camera Control system. The Raspberry Pi operates as both a WiFi access point and WiFi client simultaneously (AP+STA mode).

## Overview

The Canon Camera Controller provides flexible network operation:

- **Development Mode**: Connect to home WiFi (internet access) while serving camera AP
- **Field Mode**: Access point only (battery optimized for off-grid operation)
- **Dynamic WiFi Switching**: Real-time network switching via web interface

## Current Architecture

The system uses **NetworkManager** for WiFi operations, not manual wpa_supplicant configuration:

- **WiFi Scanning**: `nmcli dev wifi list` with real-time signal strength
- **WiFi Connection**: `nmcli dev wifi connect` with automatic profile management
- **Status Detection**: NetworkManager active connection monitoring
- **Persistence**: NetworkManager connection profiles survive reboots

## Required Packages

```bash
sudo apt update
sudo apt install hostapd dnsmasq network-manager
```

## System Configuration

### 1. NetworkManager Configuration

NetworkManager manages WiFi connections automatically. The system requires:

**NetworkManager Service**:

```bash
sudo systemctl enable NetworkManager
sudo systemctl start NetworkManager
```

**Access Point Interface**: Created automatically when hostapd starts

- Interface: `ap0` (virtual interface)
- IP Address: `192.168.4.1/24`
- SSID: `PiCameraController`

**WiFi Client Interface**:

- Interface: `wlan0` (managed by NetworkManager)
- Connections: Managed via `nmcli` commands and web interface
- Profiles: Stored in NetworkManager configuration

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

### 4. Access Point Interface Creation

The `ap0` interface (virtual WiFi interface for access point) must be created before hostapd starts. This is handled by a dedicated systemd service:

**create-ap-interface.service** (`/etc/systemd/system/create-ap-interface.service`):

```ini
[Unit]
Description=Create ap0 interface for hostapd
Before=hostapd.service
Wants=network.target
After=network.target

[Service]
Type=oneshot
ExecStart=/bin/bash -c 'if ! ip link show ap0 > /dev/null 2>&1; then iw dev wlan0 interface add ap0 type __ap; fi'
ExecStart=/sbin/ip addr add 192.168.4.1/24 dev ap0
ExecStart=/sbin/ip link set ap0 up
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
```

This service:

- Creates the `ap0` virtual interface using `iw dev wlan0 interface add ap0 type __ap`
- Assigns IP address `192.168.4.1/24` to the interface
- Brings the interface up
- Runs before hostapd service starts (critical dependency)
- Only creates interface if it doesn't already exist

Enable the service:

```bash
sudo systemctl enable create-ap-interface.service
```

### 5. DHCP Server Configuration

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

## Network Management APIs

### Web Interface WiFi Management

The system provides a web-based interface for WiFi management:

**WiFi Network Scanning**:

- Accessible via "Switch Network" button in web interface
- Shows available networks with signal strength percentages
- Real-time scanning with NetworkManager integration

**Network Connection**:

- Select network from scan results
- Enter password if required (secured networks)
- Automatic connection profile creation and management
- Real-time connection status updates via WebSocket

### REST API Endpoints

**Scan for WiFi Networks**:

```bash
curl http://pi-ip:3000/api/network/wifi/scan
```

**Connect to WiFi Network**:

```bash
curl -X POST http://pi-ip:3000/api/network/wifi/connect \
  -H "Content-Type: application/json" \
  -d '{"ssid": "NetworkName", "password": "password123"}'
```

**Get Current Network Status**:

```bash
curl http://pi-ip:3000/api/network/status
```

**Get Saved WiFi Networks**:

```bash
curl http://pi-ip:3000/api/network/wifi/saved
```

### Mode Switching via API

**Switch Network Mode**:

```bash
# Switch to development mode (AP + WiFi client)
curl -X POST http://pi-ip:3000/api/network/mode \
  -H "Content-Type: application/json" \
  -d '{"mode": "development"}'

# Switch to field mode (AP only)
curl -X POST http://pi-ip:3000/api/network/mode \
  -H "Content-Type: application/json" \
  -d '{"mode": "field"}'
```

## Service Configuration

Enable required services:

```bash
# Enable interface creation service (must run before hostapd)
sudo systemctl enable create-ap-interface

# Enable hostapd and dnsmasq to start at boot
sudo systemctl enable hostapd
sudo systemctl enable dnsmasq

# Configure wpa_supplicant for on-demand use
sudo systemctl disable wpa_supplicant@wlan0
```

**Critical**: The `create-ap-interface` service must be enabled before hostapd, as hostapd requires the `ap0` interface to exist.

## Current Implementation Architecture

### NetworkManager Integration

The system uses NetworkManager for all WiFi operations:

```javascript
// WiFi scanning using NetworkManager
async scanWiFiNetworks() {
    const { stdout } = await execAsync('nmcli -t -f IN-USE,SSID,MODE,CHAN,RATE,SIGNAL,BARS,SECURITY dev wifi list');
    return this.parseNMWiFiScan(stdout);
}

// WiFi connection using NetworkManager
async connectToWiFi(ssid, password) {
    const connectCmd = password
        ? `nmcli dev wifi connect "${ssid}" password "${password}"`
        : `nmcli dev wifi connect "${ssid}"`;
    await execAsync(connectCmd);
}

// Network status detection
async getWiFiStatus() {
    const { stdout } = await execAsync('nmcli -t -f NAME,TYPE,DEVICE con show --active');
    // Parse active connections and extract actual SSID
}
```

### System Components

**NetworkStateManager**: High-level network mode management

- Mode detection and switching (field/development)
- Interface state monitoring
- Service coordination

**NetworkServiceManager**: Low-level NetworkManager operations

- WiFi scanning and connection
- Signal strength monitoring
- Connection verification

### Real-time Updates

**WebSocket Integration**:

- Live network status updates
- Connection state changes
- Signal strength monitoring
- User interface synchronization

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

**WiFi Switching Fails**:

- Check if NetworkManager is running: `systemctl status NetworkManager`
- Verify nmcli accessibility: `nmcli general status`
- Force WiFi rescan: `sudo nmcli dev wifi rescan`

**Access Point Interface Missing (ap0)**:

- Check if create-ap-interface service is enabled: `systemctl is-enabled create-ap-interface`
- Check service status: `systemctl status create-ap-interface`
- Manually create interface: `sudo iw dev wlan0 interface add ap0 type __ap`
- Check interface exists: `ip link show ap0`

**Network Not Found**:

- Ensure network is in range: `nmcli dev wifi list`
- Check signal strength and security type
- Verify SSID spelling and case sensitivity

**Connection Fails**:

- Verify password correctness
- Check for existing connection profiles: `nmcli con show`
- Remove conflicting profiles: `nmcli con delete "SSID"`

**Status Not Updating**:

- Check pi-camera-control service logs
- Verify WebSocket connection in browser console
- Restart service: `sudo systemctl restart pi-camera-control`

### NetworkManager Diagnostic Commands

```bash
# Check NetworkManager status
systemctl status NetworkManager

# List available WiFi networks
nmcli dev wifi list

# Show active connections
nmcli -t -f NAME,TYPE,DEVICE con show --active

# Check saved connection profiles
nmcli con show

# Monitor NetworkManager logs
sudo journalctl -u NetworkManager -f

# Check interface status
ip addr show ap0
ip addr show wlan0

# Check service status
systemctl status hostapd
systemctl status dnsmasq
systemctl status pi-camera-control
```

### Web Interface Debugging

```bash
# Check camera control service logs
sudo journalctl -u pi-camera-control -f

# Test API endpoints
curl http://localhost:3000/api/network/status
curl http://localhost:3000/api/network/wifi/scan

# Check WebSocket connection
# Open browser console on camera interface page
# Look for WebSocket connection messages
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

## Key Differences from Legacy Configuration

### NetworkManager vs wpa_supplicant

**Previous Approach** (Manual Configuration):

- Required manual wpa_supplicant configuration files
- Manual service management and mode switching scripts
- Static configuration files for network profiles
- Command-line only network management

**Current Approach** (NetworkManager Integration):

- Automatic WiFi management via NetworkManager
- Dynamic network switching through web interface
- Real-time network scanning and connection
- Persistent connection profiles managed automatically
- WebSocket-based status updates

### Why NetworkManager?

**Benefits**:

- **Simplified Management**: No manual configuration file editing
- **Dynamic Connection**: Real-time WiFi switching without service restarts
- **Better Persistence**: Connection profiles survive reboots automatically
- **User-Friendly**: Web interface for network management
- **Robust Error Handling**: Built-in connection retry and fallback mechanisms

**System Requirements**:

- NetworkManager service must be active
- Pi Camera Control service runs as root (for network management permissions)
- Access Point (hostapd/dnsmasq) runs independently alongside NetworkManager

### Migration Notes

If upgrading from manual wpa_supplicant configuration:

1. **NetworkManager Installation**: Ensure NetworkManager is installed and running
2. **Service Conflicts**: Disable manual wpa_supplicant services
3. **Profile Migration**: Existing network profiles will be detected automatically
4. **Configuration Cleanup**: Manual configuration files are no longer used

```bash
# Enable NetworkManager
sudo systemctl enable NetworkManager
sudo systemctl start NetworkManager

# Disable conflicting services
sudo systemctl disable wpa_supplicant@wlan0
sudo systemctl stop wpa_supplicant@wlan0
```
