# Error Recovery Sequences

**Version:** 1.0
**Date:** 2025-09-29
**Status:** Complete

## Overview

This document describes the error recovery mechanisms implemented in the pi-camera-control system. Recovery strategies handle camera disconnections, network failures, and session errors gracefully.

---

## 1. Camera Connection Loss Recovery

### Detection

The system detects camera connection loss through network error codes:

**Error Codes Monitored:**
- `EHOSTUNREACH` - Camera network unreachable
- `ECONNREFUSED` - Camera refused connection
- `ETIMEDOUT` - Request to camera timed out

**Detection Points:**
- `getCameraSettings()` - src/camera/controller.js:202-207
- `getDeviceInformation()` - src/camera/controller.js:247-252
- `getCameraBattery()` - src/camera/controller.js:318-327

### Recovery Flow

```mermaid
sequenceDiagram
    participant Client as Web Client
    participant WS as WebSocket Handler
    participant Controller as Camera Controller
    participant StateManager as Camera State Manager
    participant Camera as Canon Camera

    Controller->>Camera: GET /ccapi/ver100/shooting/settings
    Camera-->>Controller: ETIMEDOUT / EHOSTUNREACH

    Controller->>Controller: Detect network error
    Controller->>Controller: handleDisconnection()
    Controller->>Controller: Set connected = false

    Controller->>StateManager: onDisconnect callback
    StateManager->>StateManager: Update camera state

    StateManager->>WS: Emit camera_disconnected event
    WS->>Client: Broadcast camera_disconnected
    Client->>Client: Show "Camera Offline" UI

    Note over Client,Camera: Manual reconnection required

    Client->>WS: user_connect_to_camera
    WS->>StateManager: connectToCamera()
    StateManager->>Controller: connect()
    Controller->>Camera: GET /ccapi/
    Camera-->>Controller: 200 OK
    Controller-->>StateManager: Connected
    StateManager->>WS: Emit camera_connected event
    WS->>Client: Broadcast camera_connected
```

**Key Implementation Details:**

```javascript
// src/camera/controller.js:596-608
handleDisconnection(error) {
  const wasConnected = this.connected;
  this.connected = false;
  this.lastError = error.message;

  // Notify immediately if we were previously connected
  if (wasConnected && this.onDisconnect) {
    logger.info("Notifying clients of camera disconnection");
    this.onDisconnect(this.getConnectionStatus());
  }

  logger.warn("Camera disconnected, manual reconnection required");
}
```

**No Automatic Reconnection:**
- System does NOT attempt automatic reconnection
- User must manually reconnect via UI
- This prevents repeated failed connection attempts
- Provides user control over camera connection state

---

## 2. WebSocket Client Disconnection

### Cleanup Process

When a WebSocket client disconnects (browser close, network drop, etc.):

```mermaid
sequenceDiagram
    participant Client as Web Client
    participant WS as WebSocket Handler
    participant TimeSync as Time Sync Service

    Note over Client: Browser closed or network lost

    Client--xWS: Connection dropped
    WS->>WS: ws.on('close', handler)
    WS->>WS: clients.delete(ws)

    WS->>TimeSync: handleClientDisconnection(ip)
    TimeSync->>TimeSync: Remove client from sync tracking

    WS->>WS: clientInfo.delete(ws)

    Note over WS: Client fully cleaned up
```

**Implementation:**

```javascript
// src/websocket/handler.js:290-302
ws.on("close", (code, reason) => {
  logger.info(`WebSocket client disconnected: ${clientId} (${code}: ${reason})`);
  clients.delete(ws);

  // Clean up time sync tracking
  const info = clientInfo.get(ws);
  if (info) {
    timeSyncService.handleClientDisconnection(info.ip);
    clientInfo.delete(ws);
  }
});
```

**Cleanup Steps:**
1. Remove from active clients Set
2. Clean up time sync tracking
3. Remove from clientInfo Map
4. Connection resources released

**No Session Impact:**
- Intervalometer sessions continue running
- Camera remains connected
- Status broadcasts continue (no clients to receive them)
- Client can reconnect anytime and resume monitoring

---

## 3. Intervalometer Session Error Recovery

### Session Error States

Sessions can encounter errors during:
- Photo capture failures
- Camera communication timeouts
- Long exposure interruptions

### Error Flow

```mermaid
sequenceDiagram
    participant WS as WebSocket Handler
    participant Session as Intervalometer Session
    participant StateManager as State Manager
    participant ReportManager as Report Manager
    participant Disk as File System

    Session->>Session: takePhoto() fails
    Session->>Session: Mark error in stats
    Session->>StateManager: emit('error', errorData)

    StateManager->>StateManager: Mark as unsaved session
    StateManager->>ReportManager: saveUnsavedSession()
    ReportManager->>Disk: Write unsaved-session.json

    StateManager->>WS: Broadcast intervalometer_error
    WS->>WS: Broadcast to all clients

    Note over Session: Session continues if not fatal

    alt Session completes with errors
        Session->>StateManager: emit('completed', data)
        StateManager->>StateManager: Keep as unsaved (has errors)
        StateManager->>Disk: Save unsaved session
    end

    alt Session stopped by user
        WS->>Session: stop()
        Session->>StateManager: emit('stopped', data)
        StateManager->>StateManager: Mark as unsaved
        StateManager->>Disk: Save unsaved session
    end
```

**Unsaved Session Data Structure:**

```javascript
// src/intervalometer/state-manager.js:240-249
this.unsavedSession = {
  sessionId: session.id,
  title: session.title,
  completionData: {
    state: session.state,
    stats: session.stats,
    options: session.options,
    timestamp: new Date().toISOString(),
  },
};
```

**Error Recovery Strategy:**
1. **Non-Fatal Errors:** Session continues, errors logged in stats
2. **Fatal Errors:** Session stops, marked as unsaved
3. **Cross-Reboot Recovery:** Unsaved session detected on startup
4. **User Decision:** User must explicitly save with title or discard

---

## 4. Session Interruption Recovery (System Crash/Reboot)

### Persistence Mechanism

The system provides cross-reboot recovery for interrupted sessions:

```mermaid
sequenceDiagram
    participant System as System
    participant StateManager as State Manager
    participant ReportManager as Report Manager
    participant Disk as unsaved-session.json
    participant WS as WebSocket Handler
    participant Client as Web Client

    Note over System: System crash or power loss during session

    System->>System: Restart systemd service
    System->>StateManager: initialize()
    StateManager->>StateManager: checkForUnsavedSession()

    StateManager->>ReportManager: loadUnsavedSession()
    ReportManager->>Disk: Read unsaved-session.json
    Disk-->>ReportManager: Session data
    ReportManager-->>StateManager: Unsaved session found

    StateManager->>StateManager: Store unsavedSession
    StateManager->>WS: emit('unsavedSessionFound')
    WS->>Client: Broadcast unsaved_session_found

    Client->>Client: Show "Save or Discard?" dialog

    alt User saves session
        Client->>WS: save_session_report { title }
        WS->>StateManager: saveSessionReport()
        StateManager->>Disk: Save to reports/YYYYMMDD-HHMMSS.json
        StateManager->>Disk: Delete unsaved-session.json
        StateManager->>Client: Broadcast report_saved
    else User discards session
        Client->>WS: discard_session
        WS->>StateManager: discardSession()
        StateManager->>Disk: Delete unsaved-session.json
        StateManager->>Client: Broadcast session_discarded
    end
```

**File Location:**
```
data/timelapse-reports/unsaved-session.json
```

**When Sessions Are Marked Unsaved:**
1. Session stops (user-initiated stop)
2. Session completes (normal completion)
3. Session encounters error

**Persistence Guarantees:**
- ✅ Session metadata persisted (ID, title, timestamps)
- ✅ Statistics persisted (shots taken, successful, failed)
- ✅ Options persisted (interval, duration, etc.)
- ❌ Individual photo data NOT persisted (photos on camera SD card)
- ❌ In-progress shot NOT persisted (if crash during long exposure)

**Recovery Limitations:**
- If system crashes during photo capture, that photo may be incomplete
- Photo count reflects completed photos only
- Camera SD card has actual photos (may be more than logged count)

---

## 5. Network Failure During Operations

### Photo Capture Network Failure

During intervalometer sessions, network failures to the camera are handled:

```mermaid
sequenceDiagram
    participant Session as Intervalometer Session
    participant Controller as Camera Controller
    participant Camera as Canon Camera
    participant StateManager as State Manager
    participant WS as WebSocket Handler

    Session->>Controller: takePhoto()
    Controller->>Camera: POST /ccapi/ver100/shooting/control/shutterbutton
    Camera--xController: ETIMEDOUT

    Controller->>Controller: Catch network error
    Controller-->>Session: throw Error("Network timeout")

    Session->>Session: Increment shotsFailed counter
    Session->>StateManager: emit('photo_failed', { error })
    StateManager->>WS: Broadcast intervalometer_error

    Session->>Session: Wait for next interval
    Session->>Controller: takePhoto() (retry)

    alt Network recovered
        Controller->>Camera: POST shutterbutton
        Camera-->>Controller: 200 OK
        Session->>Session: Photo successful
    else Network still down
        Controller--xSession: Error again
        Session->>Session: Multiple failures accumulate
        Note over Session: Session continues until stopped
    end
```

**Retry Strategy:**
- No immediate retry within same shot
- Next interval attempt is natural retry
- Failed shots counted in statistics
- Session continues (does not auto-stop on failures)

**Connection Monitoring Pause:**
```javascript
// src/camera/controller.js:584-594
pauseConnectionMonitoring() {
  logger.debug("Pausing camera connection monitoring during photo operation");
  this.monitoringPaused = true;
  // Reset failure counter since we're actively using the camera
  this.consecutiveFailures = 0;
}

resumeConnectionMonitoring() {
  logger.debug("Resuming camera connection monitoring");
  this.monitoringPaused = false;
}
```

**Why Pause Monitoring:**
- Long exposures (30+ seconds) would trigger false disconnection
- Photo operations have their own timeouts (30s for press, 15s for release)
- Prevents duplicate error handling

---

## 6. CCAPI Error Response Handling

### Canon API Error Responses

The system handles documented Canon CCAPI error responses:

**400 Bad Request:**
```json
{
  "message": "Invalid parameter"
}
```
- Indicates malformed request
- Logged with full error details
- Operation fails, error returned to client

**503 Service Unavailable:**
```json
{
  "message": "Device busy"
}
```

**Common 503 Messages:**
- "Device busy" - Camera temporarily unavailable
- "During shooting or recording" - Photo in progress
- "Mode not supported" - Wrong camera mode
- "Out of focus" - AF failed (we use af:false to avoid this)
- "Can not write to card" - SD card error

**Error Logging:**
```javascript
// src/camera/controller.js:361-373
const statusCode = error.response?.status || "unknown";
const apiMessage = error.response?.data?.message || error.message;
const endpoint = this.shutterEndpoint;

logger.error(
  `Shutter press failed - Status: ${statusCode}, API Message: "${apiMessage}", Endpoint: ${endpoint}`
);

// Log full response data for debugging if available
if (error.response?.data) {
  logger.debug("Full Canon API error response:", error.response.data);
}
```

---

## 7. What Does NOT Exist

**No Stuck Shutter Recovery:**
- There is NO automatic stuck shutter detection
- There is NO stuck shutter release mechanism
- The code comment "Release any stuck shutter first" is misleading
- It simply calls `releaseShutter()` which:
  - For regular endpoint: does nothing (skips)
  - For manual endpoint: sends release action
- This ensures clean state, but is not "recovery"

**No Automatic Camera Reconnection:**
- System does not retry failed connections
- User must manually reconnect via UI
- This is intentional design decision

**No Session Auto-Resume:**
- Unsaved sessions require user decision
- System does not automatically resume interrupted sessions
- User must explicitly choose to save or discard

---

## Summary

### Recovery Mechanisms That Exist

| Error Type | Detection | Recovery Strategy | User Action Required |
|------------|-----------|-------------------|---------------------|
| Camera connection loss | Network errors (ETIMEDOUT, etc.) | Mark disconnected, notify clients | Yes - Manual reconnect |
| WebSocket client disconnect | Socket close/error events | Clean up resources, continue operation | No - Client can reconnect anytime |
| Photo capture failure | Camera API errors | Log failure, continue session | No - Automatic retry next interval |
| Session interruption | Crash/reboot | Persist to disk, detect on startup | Yes - Save or discard decision |
| Network during operation | Timeout during photo | Count as failed shot, retry next interval | No - Automatic handling |
| Canon API errors | 400/503 responses | Log with details, fail operation gracefully | Depends on error type |

### Recovery Mechanisms That Don't Exist

- ❌ Automatic camera reconnection
- ❌ Stuck shutter detection/recovery
- ❌ Automatic session resume after crash
- ❌ Immediate retry on photo failure
- ❌ Connection pooling or failover

### Design Philosophy

The system follows a **"fail gracefully, recover manually"** philosophy:
- Errors are logged comprehensively
- State is preserved when possible
- Users are notified clearly
- Critical operations (sessions) persist across crashes
- User retains control over recovery actions

This approach prioritizes:
1. **Data integrity** - Don't lose session data
2. **User awareness** - Clear error messaging
3. **System stability** - No retry loops or automatic reconnection storms
4. **Operational continuity** - Sessions continue despite transient failures

---

**Last Updated:** 2025-09-29
**Implementation Files:**
- `src/camera/controller.js` - Camera connection error handling
- `src/websocket/handler.js` - WebSocket lifecycle and cleanup
- `src/intervalometer/state-manager.js` - Session persistence and recovery
- `src/intervalometer/report-manager.js` - Unsaved session file management
- `src/camera/state-manager.js` - Camera state and disconnection handling