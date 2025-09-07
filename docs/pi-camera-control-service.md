# Pi Camera Control Service

This document covers the systemd service for automatically starting and managing the Pi Camera Control server on Raspberry Pi.

## How to Use

### Quick Setup

1. **Deploy the project** to your Raspberry Pi:
   ```bash
   git clone https://github.com/PapaMarky/pi-camera-control.git /home/pi/pi-camera-control
   cd /home/pi/pi-camera-control
   npm install --production
   ```

2. **Install the service**:
   ```bash
   sudo ./scripts/install-service.sh
   ```

The service will now automatically start on boot and restart if it crashes.

### Service Management

#### Check Service Status
```bash
sudo systemctl status pi-camera-control
```

#### Start, Stop, Restart
```bash
# Start the service
sudo systemctl start pi-camera-control

# Stop the service
sudo systemctl stop pi-camera-control

# Restart the service
sudo systemctl restart pi-camera-control
```

#### Enable/Disable Auto-start
```bash
# Enable auto-start on boot (default after installation)
sudo systemctl enable pi-camera-control

# Disable auto-start on boot
sudo systemctl disable pi-camera-control
```

### Viewing Logs

#### Live Log Monitoring
```bash
# Follow live logs
sudo journalctl -u pi-camera-control -f
```

#### Historical Logs
```bash
# View recent logs (last 50 entries)
sudo journalctl -u pi-camera-control -n 50

# View logs from specific time period
sudo journalctl -u pi-camera-control --since "1 hour ago"
sudo journalctl -u pi-camera-control --since "2023-09-01"
```

### Configuration

The service automatically reads configuration from:
- **Environment file**: `/home/pi/pi-camera-control/.env`
- **Built-in defaults**: Production settings with camera IP `192.168.12.98`

To customize settings:
```bash
cd /home/pi/pi-camera-control
cp .env.example .env
nano .env  # Edit your settings
sudo systemctl restart pi-camera-control
```

### Uninstalling the Service

To completely remove the service:
```bash
sudo ./scripts/uninstall-service.sh
```

This stops the service, disables auto-start, and removes the service file.

### Troubleshooting

#### Service Won't Start
1. Check service logs:
   ```bash
   sudo journalctl -u pi-camera-control -n 20
   ```

2. Test manual startup:
   ```bash
   cd /home/pi/pi-camera-control
   node src/server.js
   ```

3. Verify Node.js installation:
   ```bash
   node --version  # Should be ≥16.0.0
   ```

#### Service Crashes Immediately
- Check file permissions: `ls -la /home/pi/pi-camera-control/`
- Verify dependencies: `npm install --production`
- Review `.env` configuration for errors

#### Network Issues
The service runs as root to allow network configuration. If you see permission errors:
```bash
# Verify service user
sudo systemctl show pi-camera-control | grep "^User="

# Check required network tools
which hostapd
which dhcpcd
```

## Implementation Details

### Service Configuration

The systemd service is defined in `pi-camera-control.service` with the following key settings:

- **Service Type**: `simple` - runs as a foreground process
- **User/Group**: `root` - required for network interface management
- **Working Directory**: `/home/pi/pi-camera-control`
- **Executable**: `node src/server.js`
- **Restart Policy**: `always` with 10-second delay
- **Dependencies**: Starts after network is available

### Files Created

| File | Purpose |
|------|---------|
| `pi-camera-control.service` | Main systemd service definition |
| `scripts/install-service.sh` | Automated installation script |
| `scripts/uninstall-service.sh` | Service removal script |
| `docs/SERVICE_SETUP.md` | Detailed setup documentation |
| `docs/pi-camera-control-service.md` | This reference document |

### Service Features

- **Auto-start**: Enabled by default on installation
- **Crash Recovery**: Automatically restarts with exponential backoff
- **Environment Support**: Reads from `.env` file and environment variables
- **Logging**: All output captured by systemd journal
- **Security**: Runs with necessary privileges for network management
- **Resource Limits**: Configured file descriptor limits for WebSocket connections

### Architecture Integration

The service integrates with the Phase 2 Node.js architecture:

- **Express Server**: HTTP API endpoints on port 3000
- **WebSocket Server**: Real-time communication with clients
- **Camera Controller**: CCAPI communication with Canon cameras  
- **Power Manager**: Battery and thermal monitoring
- **Network Manager**: Access point and WiFi configuration

### Production Considerations

- **Monitoring**: Use `journalctl` for log monitoring and debugging
- **Updates**: Stop service before updating code, restart after
- **Security**: Service runs as root - ensure proper network security
- **Performance**: WebSocket connections limited by file descriptor limits
- **Storage**: Logs rotate automatically via systemd journal management

### Development vs Production

| Aspect | Development | Production (Service) |
|--------|-------------|---------------------|
| Start Command | `npm run dev` | Automatic via systemd |
| Process Management | Manual | Automatic restart |
| User | Current user | root |
| Logging | Console | systemd journal |
| Environment | Development | Production |
| Auto-start | No | Yes (on boot) |