# Runtime Scripts

This directory contains scripts and configuration files that are deployed to the Pi and run during normal operation.

## Scripts

### `camera-network-mode`
Network mode switching script deployed to `/usr/local/bin/camera-network-mode`.

**Usage:**
```bash
sudo /usr/local/bin/camera-network-mode {field|development|wifi-only}
```

**Modes:**
- **field**: Access Point only (battery optimized for field use)
- **development**: Access Point + WiFi client (for development with internet)
- **wifi-only**: WiFi client only (AP disabled)

**What it manages:**
- hostapd service (access point daemon)
- dnsmasq service (DHCP/DNS for AP clients)  
- wpa_supplicant@wlan0 (WiFi client)
- ap0 interface creation and configuration
- Service startup order and dependencies

### `pi-camera-control.service`
Systemd service definition deployed to `/etc/systemd/system/pi-camera-control.service`.

**Features:**
- Automatic startup on boot
- Automatic restart on crashes
- Runs as root for network configuration access
- Proper service dependencies
- Logging to system journal

## Deployment

These files are automatically deployed during setup:

1. **Setup script** (`setup/configure-system.sh`) copies files to system locations
2. **Service installation** enables automatic startup
3. **Path configuration** makes scripts available system-wide

## System Integration

### Network Mode Script
- Installed to: `/usr/local/bin/camera-network-mode`
- Permissions: 755 (executable by root)
- Called by: NetworkManager class in Node.js application

### Systemd Service
- Installed to: `/etc/systemd/system/pi-camera-control.service`
- Status: Enabled for automatic startup
- Management: `systemctl {start|stop|restart|status} pi-camera-control`

## Logging

Both runtime components log to system journal:
```bash
# View network mode script logs
journalctl -t camera-network-mode -f

# View application service logs  
journalctl -u pi-camera-control -f
```