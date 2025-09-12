# Setup Scripts

This directory contains scripts for initial Raspberry Pi setup and configuration.

## Scripts

### `configure-system.sh` 🎯 **RECOMMENDED**
**Consolidated setup script that handles complete Pi Camera Control installation.**

- Installs all required system packages (hostapd, dnsmasq, Node.js, etc.)
- Configures access point and WiFi networking  
- Sets up systemd services
- Installs Node.js dependencies
- Deploys network mode control script

**Usage:**
```bash
cd setup/
sudo ./configure-system.sh
```

### Legacy Scripts (consolidated into configure-system.sh)

#### `configure-ap.sh`
- Creates hostapd and dnsmasq configurations
- Sets up access point interface (ap0)
- **Status:** Functionality moved to `configure-system.sh`

#### `install-service.sh` 
- Installs systemd service and network mode script
- Disables IPv6 system-wide
- **Status:** Functionality moved to `configure-system.sh`

#### `setup-network-mode.sh`
- Creates basic network mode control script
- **Status:** Superseded by improved script in `runtime/camera-network-mode`

#### `disable-ipv6.sh`
- Disables IPv6 system-wide for simplified networking
- **Status:** Functionality moved to `configure-system.sh`

## Usage

For new Pi Camera Control installations, simply run:

```bash
sudo ./configure-system.sh
```

This will handle all setup steps automatically and provide clear status messages.

## Requirements

- Raspberry Pi with WiFi capability  
- Raspbian/Raspberry Pi OS
- Root access (sudo)

## Safety Features

All setup scripts include **Raspberry Pi detection** to prevent accidental execution on desktop/laptop systems. 

Scripts will:
- ✅ Detect Pi hardware (BCM processors, ARM architecture, Pi-specific files)
- ✅ Block execution on non-Pi systems with clear error messages
- ✅ Require explicit "YES" confirmation if run on non-Pi hardware

This prevents accidentally disrupting your development machine's network configuration.

## Post-Setup

After running `configure-system.sh`:

1. **Reboot required:** `sudo reboot`
2. **Access Point:** Connect to "PiCameraController" (password: camera123)
3. **Web Interface:** http://192.168.4.1:3000
4. **Network Modes:** Use `/usr/local/bin/camera-network-mode {field|development|wifi-only}`