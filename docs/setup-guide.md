# Pi Camera Controller - Complete Setup Guide

This guide will transform a fresh Raspberry Pi OS installation into a turnkey camera controller system.

## Prerequisites

### Hardware Requirements

- **Raspberry Pi Zero W, Zero 2W, or Pi 4** (tested on Zero W and Zero 2W)
- **MicroSD card** (16GB+ recommended)
- **Canon camera** with CCAPI support (tested with EOS R50)
- **Power supply** appropriate for your Pi model

### Software Requirements

- **Fresh Raspberry Pi OS Lite** (recommended) or Desktop
- **SSH enabled** for remote setup
- **Internet connection** during setup

## Quick Setup (Automated)

### Method 1: Direct Download and Run

```bash
# Run as pi user on fresh Pi OS installation
curl -sSL https://raw.githubusercontent.com/PapaMarky/pi-camera-control/main/setup/pi-setup.sh | bash
```

### Method 2: Clone and Run

```bash
# Clone repository and run setup
git clone https://github.com/PapaMarky/pi-camera-control.git
cd pi-camera-control/setup
chmod +x pi-setup.sh
./pi-setup.sh
```

## Manual Setup (Step by Step)

If you prefer to understand each step or need to customize the installation:

### 1. Prepare the System

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install essential packages
sudo apt install -y git curl wget nodejs npm hostapd dnsmasq network-manager wireless-tools iw rfkill
```

### 2. Clone Project

```bash
# Clone repository
git clone https://github.com/PapaMarky/pi-camera-control.git
cd pi-camera-control

# Install Node.js dependencies
npm install
```

### 3. Configure Network Services

```bash
# Copy hostapd configuration
sudo cp runtime/hostapd-pi-zero-w.conf /etc/hostapd/hostapd.conf

# Configure hostapd daemon
echo 'DAEMON_CONF="/etc/hostapd/hostapd.conf"' | sudo tee -a /etc/default/hostapd

# Configure dnsmasq for Access Point
sudo tee /etc/dnsmasq.d/ap.conf << EOF
interface=ap0
dhcp-range=192.168.4.2,192.168.4.20,255.255.255.0,1d
dhcp-option=3,192.168.4.1
dhcp-option=6,8.8.8.8,8.8.4.4
bind-interfaces
EOF
```

### 4. Install System Services

```bash
# Install create-ap-interface service
sudo cp runtime/create-ap-interface.service /etc/systemd/system/
sudo systemctl enable create-ap-interface

# Install pi-camera-control service
sudo cp runtime/pi-camera-control.service /etc/systemd/system/
sudo systemctl enable pi-camera-control

# Configure service dependencies
sudo mkdir -p /etc/systemd/system/dnsmasq.service.d
sudo tee /etc/systemd/system/dnsmasq.service.d/override.conf << EOF
[Unit]
After=hostapd.service
Wants=hostapd.service

[Install]
WantedBy=multi-user.target
EOF

# Enable network services
sudo systemctl enable hostapd dnsmasq NetworkManager

# Reload systemd
sudo systemctl daemon-reload
```

### 5. Create Environment Configuration

```bash
# Create .env file
tee .env << EOF
NODE_ENV=production
PORT=3000
CAMERA_IP=192.168.12.98
CAMERA_PORT=443
LOG_LEVEL=info
EOF

chmod 600 .env
```

### 6. Complete Installation

```bash
# Reboot to start all services
sudo reboot
```

## Post-Installation

### Access the Camera Controller

1. **Connect to Access Point**:
   - SSID: `PiCameraController002`
   - Password: `welcome-to-markys-network`

2. **Open Web Interface**:
   - URL: `http://192.168.4.1:3000`

### Utility Scripts

The setup creates several utility scripts in `/home/pi/`:

```bash
# Test Access Point status
~/test-ap.sh

# Setup ethernet backup connectivity
~/setup-ethernet-linklocal.sh

# View service logs
sudo journalctl -u pi-camera-control -f

# Check service status
sudo systemctl status pi-camera-control
```

## Configuration

### Camera Settings

Edit `/home/pi/pi-camera-control/.env`:

```bash
# Camera IP address (default for Canon cameras)
CAMERA_IP=192.168.12.98
CAMERA_PORT=443

# Server settings
PORT=3000
LOG_LEVEL=info
```

### Access Point Settings

Edit `/etc/hostapd/hostapd.conf`:

```bash
# Change network name
ssid=YourNetworkName

# Change password (8+ characters)
wpa_passphrase=your-secure-password

# Change WiFi channel (1-11)
channel=6
```

### Network Settings

The system uses NetworkManager for WiFi client connections. Access via web interface:

- Navigate to Network Settings
- Use WiFi toggle to enable/disable WiFi client
- Use Switch Network to connect to different WiFi networks

## Architecture

### Service Dependencies

```
create-ap-interface.service
    ↓
hostapd.service
    ↓
dnsmasq.service

pi-camera-control.service (independent)
```

### Network Interfaces

- **ap0**: Access Point interface (192.168.4.1/24)
- **wlan0**: WiFi client interface (for internet connectivity)
- **eth0**: Ethernet interface (optional backup)

### Key Components

1. **Access Point**: Always active for camera controller access
2. **WiFi Client**: Optional for internet connectivity and updates
3. **Web Server**: Node.js application on port 3000
4. **Camera Discovery**: Automatic Canon camera detection via UPnP

## Troubleshooting

### Access Point Not Working

```bash
# Check service status
sudo systemctl status create-ap-interface hostapd dnsmasq

# Test AP functionality
~/test-ap.sh

# Manual service restart
sudo systemctl restart create-ap-interface hostapd dnsmasq
```

### Camera Connection Issues

```bash
# Check camera discovery
curl http://192.168.4.1:3000/api/camera/discover

# Check camera status
curl http://192.168.4.1:3000/api/camera/status

# View application logs
sudo journalctl -u pi-camera-control -f
```

### WiFi Client Problems

```bash
# Check NetworkManager status
nmcli device status

# Enable WiFi via API
curl -X POST http://192.168.4.1:3000/api/network/wifi/enable

# Check available networks
nmcli device wifi list
```

### Network Connectivity

```bash
# Test ethernet backup
~/setup-ethernet-linklocal.sh
# Then access via http://169.254.162.2:3000

# Check all network interfaces
ip addr show

# Verify service listening
sudo netstat -tlnp | grep :3000
```

### Log Files

- **Setup log**: `/var/log/pi-camera-setup.log`
- **Application logs**: `sudo journalctl -u pi-camera-control`
- **Network logs**: `sudo journalctl -u hostapd -u dnsmasq`
- **System logs**: `sudo journalctl -b`

## Customization

### Change Access Point Credentials

1. Edit `/etc/hostapd/hostapd.conf`
2. Restart services: `sudo systemctl restart hostapd`

### Change Web Interface Port

1. Edit `.env` file: `PORT=8080`
2. Restart service: `sudo systemctl restart pi-camera-control`

### Add Custom Scripts

Place custom scripts in `/home/pi/scripts/` and make them executable.

## Updates

### Update Application

```bash
cd /home/pi/pi-camera-control
git pull origin main
npm install
sudo systemctl restart pi-camera-control
```

### Update System

```bash
sudo apt update && sudo apt upgrade -y
sudo reboot
```

## Security Notes

- **Default Password**: Change the Access Point password in production
- **SSH Keys**: Use SSH keys instead of password authentication
- **Firewall**: Consider enabling ufw for additional security
- **Updates**: Keep system packages updated regularly

## Support

- **Documentation**: `/home/pi/pi-camera-control/docs/`
- **Repository**: https://github.com/PapaMarky/pi-camera-control
- **Issues**: https://github.com/PapaMarky/pi-camera-control/issues

## License

This project is licensed under the MIT License - see the LICENSE file for details.
