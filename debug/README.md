# Debug Scripts

This directory contains scripts for debugging, testing, and emergency recovery.

## Scripts

### `debug-network.js`
Network diagnostic tool to test the commands used by NetworkManager.

**Usage:**
```bash
node debug-network.js
```

**What it tests:**
- Network interface status (wlan0, ap0)
- Service status (hostapd, dnsmasq, wpa_supplicant)
- NetworkManager connectivity
- Network mode script availability

### `fix-network.sh` 🚨 **Emergency Recovery**
Emergency network recovery script for when the access point isn't working.

**Usage:**
```bash
sudo ./fix-network.sh
```

**What it does:**
- Stops all network services
- Recreates hostapd and dnsmasq configurations
- Recreates ap0 interface
- Restarts services in correct order
- Provides status check

### `ccapi_explore.py`
Canon CCAPI endpoint exploration tool for development and testing.

**Usage:**
```bash
python3 ccapi_explore.py <endpoint>
# Example: python3 ccapi_explore.py ver
```

### `uninstall-service.sh`
Removes the pi-camera-control systemd service and related files.

**Usage:**
```bash
sudo ./uninstall-service.sh
```

**What it removes:**
- systemd service and files
- Network mode control script
- Restores IPv6 settings

### `validate-debian-package.sh`
Validates the Debian package structure and configuration files.

**Usage:**
```bash
./validate-debian-package.sh
```

**What it validates:**
- Required Debian package files exist
- File permissions are correct
- Control file format and dependencies
- Install file configuration
- Source files availability

## When to Use

### During Development
- `debug-network.js` - Check network command functionality
- `ccapi_explore.py` - Test camera API endpoints

### Emergency Recovery  
- `fix-network.sh` - When access point stops working
- `uninstall-service.sh` - Clean removal for reinstallation

### Testing
All scripts are safe to run on development systems and provide detailed output for troubleshooting.

## Safety Notes

- **Raspberry Pi Detection**: Network modification scripts include hardware detection to prevent accidental execution on laptops/desktops
- Emergency recovery scripts are designed to be safe to run multiple times
- All scripts provide detailed logging of what they're doing  
- Backup files are created where appropriate (.backup extensions)
- Scripts that modify system configuration require explicit "YES" confirmation on non-Pi systems