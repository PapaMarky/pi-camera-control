# Development Guide - Phase 2 Camera Control Backend

This guide covers the development setup and usage for the Phase 2 Node.js backend implementation.

## Quick Start

1. **Install dependencies**:

   ```bash
   npm install
   ```

2. **Configure environment**:

   ```bash
   cp .env.example .env
   # Edit .env with your camera IP and settings
   ```

3. **Start development server**:

   ```bash
   npm run dev
   ```

4. **Test camera connection**:
   ```bash
   curl http://localhost:3000/health
   ```

## Architecture Overview

### Core Components

- **Server** (`src/server.js`): Express.js server with WebSocket support
- **Camera Controller** (`src/camera/controller.js`): CCAPI communication and camera management
- **Power Manager** (`src/system/power.js`): Battery monitoring and power optimization
- **WebSocket Handler** (`src/websocket/handler.js`): Real-time client communication
- **Intervalometer Session** (`src/intervalometer/session.js`): Advanced shooting session management

### Key Features Implemented

✅ **Camera Connection & Control**:

- Automatic CCAPI endpoint discovery
- Robust connection handling with auto-reconnect
- Photo capture with proper shutter sequence
- Camera settings validation

✅ **Power Optimization**:

- Raspberry Pi battery monitoring
- Thermal monitoring and warnings
- Power-aware operation modes

✅ **Real-time Communication**:

- WebSocket server for live updates
- Event broadcasting to connected clients
- Bi-directional camera control

✅ **Connection Resilience**:

- Automatic reconnection with exponential backoff
- Connection monitoring and recovery
- Graceful error handling

## API Endpoints

### Camera Control

- `GET /api/camera/status` - Get camera connection status
- `GET /api/camera/settings` - Get current camera settings
- `POST /api/camera/photo` - Take a single photo
- `POST /api/camera/validate-interval` - Validate intervalometer settings

### System Status

- `GET /health` - Server health check
- `GET /api/system/power` - Power and battery status
- `GET /api/system/status` - General system information

### Intervalometer (Partial Implementation)

- `POST /api/intervalometer/start` - Start intervalometer session
- `POST /api/intervalometer/stop` - Stop current session
- `GET /api/intervalometer/status` - Get session status

## WebSocket API

Connect to `ws://localhost:3000` for real-time updates.

### Client → Server Messages

```javascript
// Take a photo
{ type: 'take_photo' }

// Get camera settings
{ type: 'get_camera_settings' }

// Validate interval
{ type: 'validate_interval', data: { interval: 10 } }

// Start intervalometer
{ type: 'start_intervalometer', data: { interval: 10, shots: 50 } }
```

### Server → Client Messages

```javascript
// Status updates (every 10 seconds)
{ type: 'status_update', camera: {...}, power: {...} }

// Event notifications
{ type: 'event', eventType: 'photo_taken', data: {...} }

// Response to client actions
{ type: 'photo_taken', data: { success: true } }
```

## Configuration

### Environment Variables (.env)

```bash
# Server
PORT=3000
NODE_ENV=development
LOG_LEVEL=info

# Camera
CAMERA_IP=192.168.12.98
CAMERA_PORT=443

# Power Management
THERMAL_WARNING_THRESHOLD=70
BATTERY_LOW_THRESHOLD=20
```

## Development Scripts

```bash
# Start with auto-restart
npm run dev

# Start production
npm start

# Run tests (when implemented)
npm test

# Lint code
npm run lint

# Format code
npm run format
```

## Testing Camera Connection

1. **Basic connection test**:

   ```bash
   curl -k https://192.168.12.98:443/ccapi/
   ```

2. **Server health check**:

   ```bash
   curl http://localhost:3000/health
   ```

3. **Take a photo via API**:
   ```bash
   curl -X POST http://localhost:3000/api/camera/photo
   ```

## Debugging

### Logs

- Console output with timestamps and levels
- File logging to `logs/` directory
- Structured JSON logs for production

### Common Issues

- **Camera not connecting**: Check IP, port, and camera CCAPI settings
- **WebSocket errors**: Verify client connection handling
- **Power monitoring fails**: Normal on non-Pi systems

## Next Steps (Phase 3)

- [ ] Web interface implementation
- [ ] Mobile-optimized UI
- [ ] Advanced intervalometer features
- [ ] Image preview and management
- [ ] Field deployment tools

## Integration with Phase 1

The Python PoC (`poc/interval.py`) remains available for:

- Initial camera testing
- Standalone intervalometer operation
- Validation of CCAPI communication

Phase 2 builds upon these learnings with a more robust, scalable architecture suitable for web interface integration.
