# Pi Camera Controller Setup

This directory contains scripts and configurations to transform a fresh Raspberry Pi into a turnkey camera controller.

## Quick Start - Automated Setup

### One-Line Install (Recommended)

```bash
# On fresh Pi OS installation, run as pi user:
curl -sSL https://raw.githubusercontent.com/PapaMarky/pi-camera-control/main/setup/pi-setup.sh | bash
```

### Manual Install

```bash
# Clone repository
git clone https://github.com/PapaMarky/pi-camera-control.git
cd pi-camera-control/setup

# Run setup script
./pi-setup.sh

# Validate installation
./validate-setup.sh
```

### Post-Installation

1. **Reboot**: `sudo reboot`
2. **Connect**: WiFi network "PiCameraController002"
3. **Password**: `welcome-to-markys-network`
4. **Access**: http://192.168.4.1:3000

## Files

### New Setup Scripts (Recommended)
- **`pi-setup.sh`** - Complete automated setup script for fresh Pi OS
- **`validate-setup.sh`** - Validation script to verify installation

### Legacy Scripts
- **`configure-system.sh`** - Existing manual configuration script
- **Other scripts** - Various legacy setup utilities

## What Gets Installed

### System Components
- **Access Point**: Always-on WiFi network (PiCameraController002)
- **DHCP Server**: Automatic IP assignment (192.168.4.2-192.168.4.20)
- **Web Application**: Camera control interface on port 3000
- **WiFi Management**: NetworkManager-based client connectivity

### Services
- `create-ap-interface` - Creates ap0 interface
- `hostapd` - Access Point daemon
- `dnsmasq` - DHCP server
- `pi-camera-control` - Main application

### Utility Scripts
- `~/test-ap.sh` - Test Access Point status
- `~/setup-ethernet-linklocal.sh` - Setup ethernet backup

## Features

### Turnkey Operation
- ✅ Fresh Pi → Fully functional camera controller in one command
- ✅ Automatic service startup on boot
- ✅ Robust network dependency management
- ✅ Built-in validation and troubleshooting

### Network Management
- ✅ **Access Point**: Always available for controller access
- ✅ **WiFi Client**: Optional internet connectivity
- ✅ **Ethernet Backup**: Link-local fallback connectivity
- ✅ **Smart Toggle**: Enable/disable WiFi while keeping AP active

### Reliability
- ✅ **Service Dependencies**: Proper startup order (ap0 → hostapd → dnsmasq)
- ✅ **Error Recovery**: Automatic restarts and health checks
- ✅ **Validation**: Built-in testing of all components
- ✅ **Logging**: Comprehensive setup and runtime logs

## Requirements

- **Hardware**: Raspberry Pi Zero W, Zero 2W, or Pi 4
- **OS**: Fresh Raspberry Pi OS Lite or Desktop
- **Network**: Internet connection during setup
- **User**: Run as 'pi' user (not root)

## Troubleshooting

### Quick Diagnostics
```bash
# Check system status
./validate-setup.sh

# Test Access Point
~/test-ap.sh

# View service logs
sudo journalctl -u pi-camera-control -f
```

### Common Issues
- **AP not visible**: Check hostapd service
- **No DHCP**: Check dnsmasq service and dependencies
- **Web interface down**: Check pi-camera-control service
- **WiFi problems**: Use ethernet backup or reboot

### Manual Service Control
```bash
# Restart all network services
sudo systemctl restart create-ap-interface hostapd dnsmasq

# Restart application
sudo systemctl restart pi-camera-control
```

## Migration from Legacy Setup

If you have an existing installation using `configure-system.sh`:

1. **Backup current configuration**
2. **Run new setup**: `./pi-setup.sh`
3. **Validate**: `./validate-setup.sh`
4. **Test functionality**

The new setup is designed to coexist with and improve upon the legacy configuration.

## Customization

### Access Point Settings
Edit before setup:
- SSID: `runtime/hostapd-pi-zero-w.conf`
- Password: Same file, `wpa_passphrase` field

### Application Settings
Edit after setup:
- Port, camera IP: `/home/pi/pi-camera-control/.env`

## Support

- **Complete Documentation**: `../docs/setup-guide.md`
- **Architecture**: `../docs/network-configuration.md`
- **Repository**: https://github.com/PapaMarky/pi-camera-control
- **Issues**: https://github.com/PapaMarky/pi-camera-control/issues