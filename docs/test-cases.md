# Rsync command:
`rsync -avz --exclude node_modules --exclude .git --exclude logs . pi@picontrol-002.local:~/pi-camera-control/`

# Test Cases - Phase 2 Camera Control Backend

This document provides step-by-step testing procedures to verify the Phase 2 Node.js backend is working correctly.

## Prerequisites

1. **Camera Setup:**
   - Canon camera with CCAPI enabled
   - Camera connected to same WiFi network as Pi
   - Camera IP address noted from camera network settings

2. **Pi Setup:**
   - Node.js backend deployed and dependencies installed (`npm install`)
   - `.env` file configured with correct `CAMERA_IP`
   - Server running (`npm run dev`)

3. **Network Access:**
   - Testing device on same network as Pi and camera
   - Pi IP address known (check with `hostname -I` on Pi)

## Test Case 1: Server Health Check

**Purpose:** Verify server is running and basic status endpoints work.

**Steps:**
```bash
# Replace PI_IP_ADDRESS with actual Pi IP
curl http://picontrol-002.local:3000/health
```

**Expected Result:**
```json
{
  "status": "ok",
  "timestamp": "2024-08-31T13:12:43.123Z",
  "camera": {
    "connected": true,
    "ip": "192.168.12.98",
    "port": "443",
    "shutterEndpoint": "/ccapi/ver100/shooting/control/shutterbutton/manual"
  },
  "power": {
    "isRaspberryPi": true,
    "battery": {...},
    "thermal": {...}
  },
  "uptime": 123.456
}
```

## Test Case 2: Camera Connection Status

**Purpose:** Verify camera is properly connected and CCAPI endpoints discovered.

**Steps:**
```bash
curl http://picontrol-002.local:3000/api/camera/status
```

**Expected Result:**
```json
{
  "connected": true,
  "ip": "192.168.12.98",
  "port": "443",
  "lastError": null,
  "reconnectAttempts": 0,
  "shutterEndpoint": "/ccapi/ver100/shooting/control/shutterbutton/manual",
  "hasCapabilities": true
}
```

**Failure Indicators:**
- `connected: false` - Check camera WiFi connection and IP address
- `lastError` contains error message - Check camera CCAPI settings
- `shutterEndpoint: null` - Camera may be in playback mode

## Test Case 3: Camera Settings Retrieval

**Purpose:** Test camera settings API (may fail depending on camera state).

**Steps:**
```bash
curl http://picontrol-002.local:3000/api/camera/settings
```

**Expected Results:**
- **Success:** JSON object with camera settings (ISO, aperture, shutter speed, etc.)
- **Acceptable Failure:** Error message if camera is in incompatible mode

## Test Case 4: Single Photo Capture

**Purpose:** Verify camera can take photos via API.

**Steps:**
1. Ensure camera is in shooting mode (not playback)
2. Point camera at subject with adequate lighting
3. Execute photo command:
   ```bash
   curl -X POST http://picontrol-002.local:3000/api/camera/photo
   ```

**Expected Result:**
```json
{
  "success": true,
  "timestamp": "2024-08-31T13:15:30.456Z"
}
```

**Verification:** Check camera for new photo in storage.

**Troubleshooting:**
- Ensure camera is in shooting mode, not playback
- Check camera has storage space and battery
- Verify manual focus is set if using manual mode

## Test Case 5: Interval Validation

**Purpose:** Test intervalometer interval validation against camera shutter speed.

**Steps:**
```bash
# Test valid interval (longer than shutter speed)
curl -X POST http://picontrol-002.local:3000/api/camera/validate-interval \
  -H "Content-Type: application/json" \
  -d '{"interval": 10}'

# Test invalid interval (shorter than shutter speed)
curl -X POST http://picontrol-002.local:3000/api/camera/validate-interval \
  -H "Content-Type: application/json" \
  -d '{"interval": 0.5}'
```

**Expected Results:**
- Valid interval: `{"valid": true}`
- Invalid interval: `{"valid": false, "error": "Interval (0.5s) must be longer than shutter speed (2s)"}`

## Test Case 6: System Status

**Purpose:** Verify power monitoring and system information.

**Steps:**
```bash
# Power status
curl http://picontrol-002.local:3000/api/system/power

# General system status
curl http://picontrol-002.local:3000/api/system/status
```

**Expected Result - Power Status:**
```json
{
  "isRaspberryPi": true,
  "battery": {
    "capacity": null,
    "status": null,
    "throttled": "0x0",
    "voltage": 1.2
  },
  "thermal": {
    "temperature": 45.2,
    "unit": "C"
  },
  "recommendations": []
}
```

## Test Case 7: WebSocket Real-time Updates

**Purpose:** Test real-time communication via WebSocket.

**Steps:**
1. Open browser developer console
2. Connect to WebSocket:
   ```javascript
   const ws = new WebSocket('ws://picontrol-002.local:3000');
   ws.onmessage = (event) => {
     const data = JSON.parse(event.data);
     console.log('Received:', data);
   };
   ws.onopen = () => console.log('WebSocket connected');
   ```

3. Send test message:
   ```javascript
   ws.send(JSON.stringify({ type: 'ping' }));
   ```

4. Take a photo via WebSocket:
   ```javascript
   ws.send(JSON.stringify({ type: 'take_photo' }));
   ```

**Expected Results:**
- Welcome message on connection
- Pong response to ping
- Photo taken confirmation
- Periodic status updates every 10 seconds

## Test Case 8: Error Handling

**Purpose:** Verify graceful error handling when camera is disconnected.

**Steps:**
1. Disconnect camera from WiFi
2. Wait 30-60 seconds for connection monitoring to detect failure
3. Try taking a photo:
   ```bash
   curl -X POST http://picontrol-002.local:3000/api/camera/photo
   ```

**Expected Results:**
- Server logs show connection lost and reconnection attempts
- API returns error message instead of crashing
- Server continues running and will reconnect when camera returns

## Test Case 9: Intervalometer Placeholder

**Purpose:** Verify intervalometer endpoints are responsive (full implementation in Phase 2 expansion).

**Steps:**
```bash
# Start intervalometer (placeholder)
curl -X POST http://picontrol-002.local:3000/api/intervalometer/start \
  -H "Content-Type: application/json" \
  -d '{"interval": 10, "shots": 5}'

# Check status
curl http://picontrol-002.local:3000/api/intervalometer/status
```

**Expected Results:**
- Acknowledgment messages indicating feature is coming
- No actual intervalometer functionality (placeholder implementation)

## Success Criteria

✅ **Phase 2 backend is working correctly if:**
- Server starts without errors
- Camera connects and discovers CCAPI endpoints
- Health check returns valid status
- Single photos can be taken via API
- WebSocket connections work
- System monitoring reports Pi status
- Graceful error handling when camera disconnects

## Common Issues and Solutions

| Issue | Symptom | Solution |
|-------|---------|----------|
| Camera not connecting | `connected: false` in status | Check camera WiFi, IP address, CCAPI enabled |
| Shutter endpoint not found | `shutterEndpoint: null` | Ensure camera in shooting mode, not playbook |
| Photos fail | Error when taking photo | Check camera mode, storage, battery, focus settings |
| WebSocket fails | Connection refused | Check firewall, network connectivity |
| Power throttling warnings | Repeated throttling logs | Normal for Pi under load, consider better power supply |

## Next Steps

After all test cases pass, the Phase 2 backend is ready for Phase 3 web interface development.