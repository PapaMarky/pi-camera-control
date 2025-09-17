# Systemd Service Setup

This guide explains how to set up the Pi Camera Control application as a systemd service that automatically starts on boot and restarts on crashes.

## Prerequisites

- Node.js ≥16.0.0 installed on the Raspberry Pi
- Project deployed to `/home/pi/pi-camera-control/`
- Root access (sudo privileges)

### Required System Packages
The following system packages must be installed for full functionality:
```bash
sudo apt install -y hostapd dnsmasq network-manager wireless-tools iw rfkill
```

These packages enable:
- **hostapd**: Access Point functionality
- **dnsmasq**: DHCP and DNS services
- **network-manager**: Advanced WiFi management
- **wireless-tools**: Legacy wireless configuration (iwconfig, iwlist)
- **iw**: Modern wireless configuration and regulatory domain management
- **rfkill**: Radio kill/enable control (troubleshooting and future power management)

## Quick Setup

1. **Deploy the project** to `/home/pi/pi-camera-control/`:
   ```bash
   # Clone or copy project files to the Pi
   git clone https://github.com/PapaMarky/pi-camera-control.git /home/pi/pi-camera-control
   cd /home/pi/pi-camera-control
   ```

2. **Install Node.js dependencies**:
   ```bash
   npm install --production
   ```

3. **Configure environment** (optional):
   ```bash
   cp .env.example .env
   # Edit .env with your camera settings if needed
   ```

4. **Install the service**:
   ```bash
   sudo ./scripts/install-service.sh
   ```

The service will now start automatically on boot and restart if it crashes.

## Manual Service Management

### Check Service Status
```bash
sudo systemctl status pi-camera-control
```

### Start/Stop/Restart Service
```bash
sudo systemctl start pi-camera-control
sudo systemctl stop pi-camera-control
sudo systemctl restart pi-camera-control
```

### View Service Logs
```bash
# Follow live logs
sudo journalctl -u pi-camera-control -f

# View recent logs
sudo journalctl -u pi-camera-control -n 50

# View logs from specific time
sudo journalctl -u pi-camera-control --since "1 hour ago"
```

### Enable/Disable Auto-start
```bash
# Enable auto-start on boot (default after installation)
sudo systemctl enable pi-camera-control

# Disable auto-start on boot
sudo systemctl disable pi-camera-control
```

## Uninstalling the Service

To completely remove the service:

```bash
sudo ./scripts/uninstall-service.sh
```

This will stop the service, disable auto-start, and remove the service file.

## Service Configuration

The service runs with the following configuration:

- **User**: `root` (required for network configuration changes)
- **Working Directory**: `/home/pi/pi-camera-control`
- **Auto-restart**: Yes, with 10-second delay
- **Environment**: Production mode, reads from `.env` file
- **Logging**: All output goes to systemd journal

### Custom Configuration

To modify the service configuration:

1. Edit `pi-camera-control.service`
2. Reinstall the service:
   ```bash
   sudo ./scripts/uninstall-service.sh
   sudo ./scripts/install-service.sh
   ```

## Troubleshooting

### Service Won't Start

1. **Check service logs**:
   ```bash
   sudo journalctl -u pi-camera-control -n 20
   ```

2. **Test manual startup**:
   ```bash
   cd /home/pi/pi-camera-control
   node src/server.js
   ```

3. **Verify dependencies**:
   ```bash
   cd /home/pi/pi-camera-control
   npm install --production
   ```

### Service Crashes Immediately

- Check that Node.js is installed: `node --version`
- Verify project files are in `/home/pi/pi-camera-control/`
- Check file permissions: `ls -la /home/pi/pi-camera-control/`
- Review environment configuration in `.env`

### Network Access Issues

The service runs as root to allow network configuration changes. If you encounter permission issues:

1. Verify the service is running as root:
   ```bash
   sudo systemctl show pi-camera-control | grep "^User="
   ```

2. Check that required network tools are available:
   ```bash
   which hostapd
   which dhcpcd
   ```

## Security Considerations

The service runs as root due to requirements for:
- Network interface configuration
- Access point management
- System power management

In production, consider:
- Restricting network access to the service
- Regular security updates
- Monitoring service logs for unusual activity

## Integration with Development

- **Development mode**: Use `npm run dev` for local development
- **Production service**: Automatically uses production settings
- **Environment switching**: Controlled via `.env` file and `NODE_ENV`

The service is designed to coexist with development workflows while providing robust production operation.