# Camera Discovery System

## Overview

The pi-camera-control system implements a sophisticated multi-layered camera discovery system that automatically finds and connects to Canon cameras on the network. Discovery is always enabled and uses multiple complementary methods to ensure reliable camera detection across different network configurations.

## How Camera Discovery Works

### Access Point Network (192.168.4.x)
- ✅ **UPnP Discovery**: Scans all network interfaces including ap0
- ✅ **Fallback IP Scanning**: Scans 192.168.4.2-192.168.4.20 range automatically
- ✅ **Automatic Connection**: Found cameras are registered and connected automatically

### Discovery Process
1. **UPnP multicast discovery** on all interfaces (wlan0, ap0, etc.)
2. **Fallback IP scanning** on known camera ranges including 192.168.4.x
3. **Automatic registration** when cameras are found
4. **Periodic rescanning** every 60 seconds

## Architecture

### Core Components

**DiscoveryManager** (`src/discovery/manager.js`)
- Main orchestrator for all discovery operations
- Manages camera state through integrated CameraStateManager
- Coordinates between UPnP discovery and fallback IP scanning
- Provides unified API for camera discovery operations

**UPnPDiscovery** (`src/discovery/upnp.js`)
- Implements SSDP (Simple Service Discovery Protocol)
- Listens for UPnP advertisements from Canon cameras
- Performs active M-SEARCH queries on all network interfaces
- Handles Canon CCAPI service type detection

**CameraStateManager** (`src/camera/state-manager.js`)
- Manages discovered camera lifecycle and connections
- Tracks camera status, connection attempts, and errors
- Handles primary camera selection and failover
- Provides connection state persistence

### Discovery Methods

#### 1. UPnP Discovery (Primary Method)

**Protocol**: SSDP (Simple Service Discovery Protocol)
**Multicast Address**: 239.255.255.250:1900
**Canon Service Types**:
- `urn:schemas-canon-com:device:ICPO-CameraControlAPIService:1`
- `urn:schemas-canon-com:service:ICPO-CameraControlAPIService:1`
- `urn:schemas-upnp-org:device:ICPO-CameraControlAPIService:1`
- `upnp:rootdevice`
- `ssdp:all`

**Network Interfaces**:
- Automatically detects all available IPv4 interfaces (ap0, wlan0, eth0, etc.)
- Joins multicast group on each interface
- Sends M-SEARCH queries for Canon-specific service types

**Advantages**:
- Standards-based discovery protocol
- Works across network boundaries
- Automatic device announcement detection
- Low network overhead

#### 2. Fallback IP Scanning (Secondary Method)

**Network Ranges Scanned**:
- `192.168.4.x` (Access Point network) - Full DHCP range (2-20)
- `192.168.12.x` (Development network) - Common camera range (90-99)
- `192.168.1.x` (Common home network) - Common camera range (90-99)
- `192.168.0.x` (Alternative home network) - Common camera range (90-99)

**Scanning Process**:
- Attempts HTTPS connection to `https://IP:443/ccapi`
- 2-second timeout per IP address
- Verifies Canon CCAPI endpoint response
- Creates device info for discovered cameras

**Advantages**:
- Works when UPnP is blocked or disabled
- Covers common camera IP ranges
- Direct CCAPI endpoint verification
- Handles cameras with UPnP disabled

### Network Interface Detection

The system automatically discovers and uses all available network interfaces:

```javascript
// From src/discovery/upnp.js
getAvailableInterfaces() {
  const interfaces = networkInterfaces();
  // Filters for IPv4, non-loopback interfaces
  // Returns: ap0, wlan0, eth0, etc.
}
```

**Supported Interfaces**:
- **ap0**: Access point interface (192.168.4.x)
- **wlan0**: WiFi client interface (various ranges)
- **eth0**: Ethernet interface (various ranges)
- **Additional interfaces**: Automatically detected

## Camera Registration and Management

### Discovery Event Flow

1. **Camera Discovered**: UPnP or IP scan finds camera
2. **Device Info Created**: IP, CCAPI URL, model name extracted
3. **Registration**: Camera registered with CameraStateManager
4. **Connection Attempt**: Automatic connection to CCAPI endpoint
5. **Status Tracking**: Connection status, errors, last seen time
6. **Primary Selection**: First connected camera becomes primary

### Camera State Management

**Camera States**:
- `discovered`: Found but not yet connected
- `connecting`: Connection attempt in progress
- `connected`: Successfully connected and ready
- `error`: Connection failed or camera offline
- `offline`: Camera no longer responding

**Automatic Failover**:
- If primary camera disconnects, system attempts reconnection
- Multiple cameras supported with automatic primary selection
- Connection retry with exponential backoff

## API Endpoints

### Discovery Status
```bash
GET /api/discovery/status
```
Returns current discovery state, connected cameras, and primary camera info.

### Manual Camera Search
```bash
POST /api/discovery/search
```
Triggers immediate M-SEARCH for cameras (UPnP only).

### Connect to Specific IP
```bash
POST /api/discovery/connect
Content-Type: application/json
{
  "ip": "192.168.4.5",
  "port": "443"
}
```
Manually connect to camera at specific IP address.

## Configuration

### Environment Variables

**Camera Fallback Configuration**:
- `CAMERA_IP`: Default camera IP for fallback connection (default: 192.168.12.98)
- `CAMERA_PORT`: Default camera port (default: 443)

**Note**: The confusing `USE_DISCOVERY` environment variable has been removed. Discovery is always enabled.

### Network Requirements

**Firewall Ports**:
- **UDP 1900**: SSDP multicast discovery (inbound/outbound)
- **TCP 443**: CCAPI HTTPS communication (outbound)

**Network Configuration**:
- Multicast must be enabled for UPnP discovery
- Access point subnet: 192.168.4.0/24
- DHCP range: 192.168.4.2 - 192.168.4.20

## Troubleshooting

### Discovery Not Finding Cameras

**Check Network Connectivity**:
```bash
# Verify camera reachable
ping 192.168.4.5

# Test CCAPI endpoint
curl -k https://192.168.4.5:443/ccapi
```

**Check Discovery Status**:
```bash
# API status check
curl http://localhost:3000/api/discovery/status

# Force manual search
curl -X POST http://localhost:3000/api/discovery/search
```

**Check Service Logs**:
```bash
# View discovery logs
sudo journalctl -u pi-camera-control | grep -i discovery

# Real-time monitoring
sudo journalctl -u pi-camera-control -f
```

### Common Issues

**Multicast Blocked**:
- UPnP discovery may fail on networks that block multicast
- Fallback IP scanning will still work
- Check router/firewall multicast settings

**Camera IP Changed**:
- DHCP may assign different IP to camera
- Discovery will find camera at new IP automatically
- Consider setting static IP on camera for consistency

**Multiple Cameras**:
- System supports multiple cameras simultaneously
- First connected camera becomes primary
- Use API to check all discovered cameras

### Discovery Timing

**Initial Discovery**:
- UPnP M-SEARCH: Immediate on startup
- Fallback scanning: Starts if UPnP fails
- Total discovery time: 30-60 seconds maximum

**Periodic Rescanning**:
- UPnP M-SEARCH: Every 60 seconds
- Fallback scanning: As needed
- Device timeout: 5 minutes offline before removal

## Integration with Pi Camera Control

### Automatic Operation

The discovery system integrates seamlessly with the pi-camera-control application:

1. **Startup**: Discovery starts automatically when server starts
2. **Connection**: First discovered camera becomes primary automatically
3. **Failover**: If primary camera disconnects, system attempts reconnection
4. **Web Interface**: Discovery status displayed in UI
5. **API Integration**: All camera operations use discovered cameras

### Manual Override

Users can still manually connect to specific cameras:
- Via web interface "Connect to IP" option
- Via API endpoint for direct IP connection
- Manual connections are tracked alongside discovered cameras

## Performance Considerations

**Network Overhead**:
- UPnP M-SEARCH: Minimal multicast traffic every 60 seconds
- IP scanning: Only when UPnP discovery fails
- Connection verification: Lightweight HTTPS requests

**CPU Usage**:
- Discovery operations run asynchronously
- Minimal impact on camera control operations
- Automatic throttling of connection attempts

**Memory Usage**:
- Discovered camera information cached in memory
- Automatic cleanup of offline cameras
- Bounded camera discovery cache

## Development and Testing

### Testing Discovery

**Local Testing**:
```bash
# Start with debug logging
LOG_LEVEL=debug npm run dev

# Monitor discovery events
# Check browser developer tools WebSocket messages
```

**Network Testing**:
```bash
# Test different network ranges
CAMERA_IP=192.168.4.5 npm start

# Simulate network changes
# Connect/disconnect camera from different networks
```

### Discovery Debugging

**Enable Debug Logs**:
```bash
# Temporary debug logging
LOG_LEVEL=debug

# Or set in environment
export LOG_LEVEL=debug
```

**Discovery Timing Logs**:
- Camera discovery events logged at INFO level
- Network interface detection logged at DEBUG level
- Connection attempts and failures logged at WARN/ERROR level

---

*This documentation covers the camera discovery system as of the networking-tweaks branch implementation.*