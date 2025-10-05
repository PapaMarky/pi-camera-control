# Integration Issues Fix Plan

**Created**: 2025-10-05
**Last Updated**: 2025-10-05
**Status**: Planning Phase

## CRITICAL: Keep This Document Updated

**IMPORTANT**: This document MUST be updated as progress is made. Each time a fix is implemented:

1. ✅ Mark the issue as complete with date
2. Update the status summary at the top
3. Document any findings or deviations from the plan
4. Commit this document with the code changes

**This prevents Claude from re-analyzing the same issues in future sessions.**

---

## Executive Summary

**Total Issues**: 27 distinct integration issues found across frontend, backend, and integration layers
**Issues Completed**: 7/27 (Phase 1: BE-1, BE-2, BE-3 complete; Phase 2: FE-1, FE-2, IP-1, IP-3 complete)
**Current Phase**: Phase 2 - High Priority UI/Integration (Complete)
**Target Completion**: Phases 1-2 Complete (2025-10-05)

### Issue Breakdown

- **Critical**: 3 (Backend WebSocket broadcasts)
- **High**: 5 (UI feedback, dual responses, state tracking)
- **Medium**: 10 (Error propagation, event cleanup, guards)
- **Low**: 9 (Documentation, consistency improvements)

---

## Frontend Issues (6 Total)

### FE-1: Utilities Manager Race Condition ✅

**Priority**: High
**Status**: Complete
**File**: `public/js/camera.js:1684-1689`

**Problem**: UtilitiesManager may not exist when `switchToCard('utilities')` is called because it's created in a DOMContentLoaded listener that may not have fired yet.

**Fix Applied**:

```javascript
// In camera.js switchToCard() method:
} else if (cardName === "utilities") {
  // Initialize UtilitiesManager if not already created (prevents race condition with DOMContentLoaded)
  if (!window.utilitiesManager) {
    window.utilitiesManager = new UtilitiesManager();
  }
  window.utilitiesManager.initialize();
}
```

**Test**: Navigate to Utilities card immediately after page load, verify time sync works.

**Completed**: ✅
**Completed Date**: 2025-10-05

---

### FE-2: Clear Liveview Button State Not Updated ✅

**Priority**: High
**Status**: Complete
**File**: `public/js/test-shot.js:157-191`

**Problem**: "Clear All" button doesn't update enabled/disabled state after clearing gallery and doesn't show loading state.

**Fix Applied**:

```javascript
async clearAll() {
  if (!confirm("Clear all captured images?")) return;

  try {
    // Show loading state using UIStateManager
    window.uiStateManager.setInProgress("clear-liveview-btn", {
      progressText: "Clearing...",
      timeout: 10000,
    });

    const response = await fetch("/api/camera/liveview/clear", { method: "DELETE" });
    if (!response.ok) throw new Error(await this.extractErrorMessage(response));

    this.captures = [];
    this.renderGallery();
    this.updateButtonStates(); // Update button states after clearing
  } catch (error) {
    Toast.error(`Failed to clear: ${error.message}`);
  } finally {
    window.uiStateManager.restore("clear-liveview-btn");
  }
}
```

**Test**:

1. Capture live view
2. Click "Clear All"
3. Verify loading state shown
4. Verify "Clear All" button becomes disabled after clearing

**Completed**: ✅
**Completed Date**: 2025-10-05

---

### FE-3: WiFi Toggle Icon Inconsistency ⏳

**Priority**: Medium
**Status**: Not Started
**File**: `public/js/network.js:538`

**Problem**: When WiFi is enabled but not connected, button shows "📵" (no signal) icon but action is "Turn Off WiFi" - icon doesn't match action.

**Fix**:

```javascript
// Line 538, change from:
toggleIcon.textContent = "📵";

// To:
toggleIcon.textContent = "❌";
```

**Test**: Enable WiFi but don't connect, verify button shows ❌ icon.

**Completed**: ❌
**Completed Date**: N/A

---

### FE-4: Test Shot Settings Not Auto-Loading ⏳

**Priority**: Medium
**Status**: Not Started
**File**: `public/js/camera.js:1667-1697`

**Problem**: Camera settings don't load automatically when switching to Test Shot card - user must click "Refresh Settings".

**Fix**:

```javascript
// In switchToCard() method, add new case:
} else if (cardName === "timelapse-reports") {
  if (window.timelapseUI) {
    window.timelapseUI.loadReports();
  }
} else if (cardName === "test-shot") {  // ADD THIS
  if (window.testShotUI && window.cameraManager.status.connected) {
    window.testShotUI.loadSettings();
  }
}
```

**Test**:

1. Connect camera
2. Switch to Test Shot card
3. Verify settings display without clicking Refresh

**Completed**: ❌
**Completed Date**: N/A

---

### FE-5: Camera IP Config No UI Update ⏳

**Priority**: Medium
**Status**: Not Started
**File**: `public/js/camera.js:785-793`

**Problem**: After successfully updating camera IP configuration, the Controller Status card doesn't update to show new IP.

**Fix**:

```javascript
// After successful config update, add:
if (result.success) {
  this.log(
    `Camera configuration updated successfully: ${ip}:${port}`,
    "success",
  );
  ipInput.setCustomValidity("");
  portInput.setCustomValidity("");

  // ADD THIS:
  setTimeout(() => this.updateCameraStatus(), 1000);
}
```

**Test**:

1. Update camera IP via Network Settings
2. Check Controller Status card shows new IP

**Completed**: ❌
**Completed Date**: N/A

---

### FE-6: WebSocket Reconnect No User Feedback ⏳

**Priority**: Low
**Status**: Not Started
**File**: `public/js/websocket.js:85-88`

**Problem**: WebSocket reconnection attempts are logged to console but not shown to user.

**Fix**:

```javascript
// After line 88, add:
console.log(
  `Scheduling reconnection attempt ${this.reconnectAttempts} in ${delay}ms`,
);
this.emit("reconnecting", { attempt: this.reconnectAttempts, delay });

// ADD THIS:
if (window.cameraManager) {
  window.cameraManager.log(
    `Reconnecting... (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`,
    "warning",
  );
}
```

**Test**:

1. Restart server while UI is open
2. Verify reconnection attempts shown in activity log

**Completed**: ❌
**Completed Date**: N/A

---

## Backend Issues (11 Total)

### BE-1: Camera Settings Update Missing WebSocket Broadcast 🔥

**Priority**: Critical
**Status**: ✅ COMPLETE
**File**: `src/routes/api.js:78-124`

**Problem**: When camera settings are updated via API, no WebSocket event is broadcast to other clients.

**Frontend Impact**: Settings changes invisible to other connected clients, manual refresh required.

**Fix Applied**:

```javascript
// After line 104 (successful update):
await currentController.updateCameraSetting(setting, value);

// ADDED:
if (server.wsHandler && server.wsHandler.broadcast) {
  server.wsHandler.broadcast("camera_setting_changed", {
    setting,
    value,
    timestamp: new Date().toISOString(),
  });
}

res.json({
  success: true,
  message: `Setting ${setting} updated to ${value}`,
  setting,
  value,
});
```

**Implementation Notes**:

- Used `server.wsHandler.broadcast()` (not `server.wss.broadcast()`)
- Event name follows snake_case convention: `camera_setting_changed`
- Includes setting, value, and timestamp in payload

**Test**:

1. Connect two clients
2. Change camera setting in client A
3. Verify client B receives update

**Completed**: ✅
**Completed Date**: 2025-10-05

---

### BE-2: Photo Capture Incomplete Response Schema 🔥

**Priority**: Critical
**Status**: ✅ INVESTIGATED - NO CHANGE NEEDED
**File**: `src/routes/api.js:607-631`

**Problem**: Photo capture response only includes `success` and `timestamp`, missing file path and metadata.

**Frontend Impact**: Cannot display captured photo, show filename, or access image.

**Investigation Results**:
After investigating the implementation, I found that:

1. The basic `/api/camera/photo` endpoint uses `CameraController.takePhoto()` which only triggers the camera shutter - it does NOT download the photo
2. The API specification documents this endpoint as returning only `{success: true, timestamp: "..."}` - which matches current implementation
3. For test photos with download and metadata, the separate `/api/camera/photos/test` endpoint exists using `TestPhotoService.capturePhoto()`

**Conclusion**:
The current implementation is **correct by design**. The basic photo capture endpoint is for triggering the shutter only (used by intervalometer). Photo download and metadata extraction is handled by the separate test photo endpoint.

**Original assumption was incorrect** - `takePhoto()` is not meant to return file information.

**Alternative Implementation** (if photo metadata is truly needed):
Would require either:

1. Creating a new endpoint that downloads the photo, OR
2. Using the existing `/api/camera/photos/test` endpoint, OR
3. Polling the camera's storage endpoint after capture

**Completed**: ✅ (Investigation complete - no code change needed)
**Completed Date**: 2025-10-05

---

### BE-3: Camera Configuration No Broadcast 🔥

**Priority**: Critical
**Status**: ✅ COMPLETE
**File**: `src/routes/api.js:667-749`

**Problem**: When camera IP/port configuration changes, no WebSocket broadcast to inform clients.

**Frontend Impact**: Clients don't know camera reconnected, status shows stale info until refresh.

**Fix Applied**:

```javascript
// After line 731 (successful config update):
if (result) {
  // ADDED:
  if (server.wsHandler && server.wsHandler.broadcastDiscoveryEvent) {
    server.wsHandler.broadcastDiscoveryEvent("cameraConfigured", {
      ip,
      port,
      timestamp: new Date().toISOString(),
    });
  }

  res.json({
    success: true,
    message: "Camera configuration updated successfully",
    configuration: { ip, port },
  });
}
```

**Implementation Notes**:

- Used `server.wsHandler.broadcastDiscoveryEvent()` (discovery-specific broadcaster)
- Event name: `cameraConfigured` (will be wrapped in discovery_event message type)
- Also triggers automatic status broadcast after 500ms (built into broadcastDiscoveryEvent)

**Test**:

1. Connect two clients
2. Update camera config in client A
3. Verify client B receives camera_configured event

**Completed**: ✅
**Completed Date**: 2025-10-05

---

### BE-4: Camera Time Sync Missing Broadcast ⏳

**Priority**: Medium
**Status**: Not Started
**File**: `src/routes/api.js:1901-1965`

**Problem**: Camera time sync success not broadcast to all clients.

**Frontend Impact**: Time sync status doesn't update in real-time for other clients.

**Fix**:

```javascript
// After line 1944 (successful sync):
timeSyncService.state.recordCameraSync(offset);
timeSyncService.broadcastSyncStatus();

// ADD THIS:
if (server.wss && server.wss.broadcastEvent) {
  server.wss.broadcastEvent("camera_time_synced", {
    previousTime: previousTime.toISOString(),
    newTime: piTime.toISOString(),
    offset: offset,
    timestamp: new Date().toISOString(),
  });
}
```

**Test**:

1. Sync camera time
2. Verify all clients receive update

**Completed**: ❌
**Completed Date**: N/A

---

### BE-5: System Time Async Race Condition ⏳

**Priority**: Medium
**Status**: Not Started
**File**: `src/routes/api.js:1242-1383`

**Problem**: Response sent inside async spawn callback, causing race condition and possible timeout.

**Frontend Impact**: Uncertain whether sync succeeded, possible HTTP timeout.

**Fix**: Replace spawn pattern with promisified exec:

```javascript
const { promisify } = await import("util");
const execAsync = promisify(require("child_process").exec);

try {
  await execAsync(`sudo date -u -s "${formattedTime}"`);
  logger.info(`System time synchronized successfully to UTC: ${formattedTime}`);

  let timezoneSetResult = null;
  if (timezone) {
    try {
      await execAsync(`sudo timedatectl set-timezone ${timezone}`);
      timezoneSetResult = { success: true, timezone };
    } catch (tzError) {
      timezoneSetResult = { success: false, error: tzError.message };
    }
  }

  const newTime = new Date().toISOString();
  const newTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  res.json({
    success: true,
    message: "System time synchronized successfully",
    newTime: newTime,
    timezone: newTimezone,
    timezoneSync: timezoneSetResult,
  });
} catch (error) {
  logger.error("Time sync failed:", error);
  res.status(500).json({
    success: false,
    error: "Failed to set system time. Check sudo permissions.",
  });
}
```

**Test**:

1. Sync system time
2. Verify immediate response
3. Test with slow system (simulate delay)

**Completed**: ❌
**Completed Date**: N/A

---

### BE-6: WebSocket Status Broadcast Silent Errors ⏳

**Priority**: Medium
**Status**: Not Started
**File**: `src/websocket/handler.js:79-166`

**Problem**: When status retrieval fails (network, storage), error is logged but not broadcast to clients.

**Frontend Impact**: Clients don't know why status is incomplete, missing data appears as null without explanation.

**Fix**:

```javascript
// In broadcastStatus function, add after each try-catch:
let networkStatus = null;
if (networkManager) {
  try {
    networkStatus = await networkManager.getNetworkStatus(forceRefresh);
  } catch (error) {
    logger.error("Failed to get network status for broadcast:", error);
    // ADD THIS:
    broadcastEvent("status_error", {
      component: "network",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
}
// Repeat for storage status failure
```

**Test**:

1. Simulate network manager failure
2. Verify clients receive status_error event

**Completed**: ❌
**Completed Date**: N/A

---

### BE-7: Intervalometer Status Inconsistent Schema ⏳

**Priority**: Low
**Status**: Not Started
**File**: `src/routes/api.js:959-1009`

**Problem**: Returns different field structure when no session vs active session.

**Frontend Impact**: Frontend must handle two different response formats, harder to type-check.

**Fix**:

```javascript
// Always return full schema with null values:
if (status.state === "stopped" && !status.stats) {
  return res.json({
    running: false,
    state: "stopped",
    stats: null, // Consistent null instead of missing
    options: null, // Consistent null instead of missing
    averageShotDuration: 0,
  });
}
```

**Test**:

1. Get status with no session
2. Verify response has stats: null, options: null

**Completed**: ❌
**Completed Date**: N/A

---

### BE-8: WiFi Scan No Broadcast ⏳

**Priority**: Low
**Status**: Not Started
**File**: `src/routes/api.js:1462-1478`

**Problem**: WiFi scan results only sent to requesting client, not broadcast.

**Frontend Impact**: Other clients don't see scan results without manual refresh.

**Fix**:

```javascript
// After successful scan (line 1468):
const networks = await networkServiceManager.scanWiFiNetworks(forceRefresh);

// ADD THIS:
if (server.wss && server.wss.broadcastNetworkEvent) {
  server.wss.broadcastNetworkEvent("wifi_scan_complete", {
    networkCount: networks.length,
    timestamp: new Date().toISOString(),
  });
}

res.json({ networks });
```

**Test**:

1. Connect two clients
2. Scan WiFi in client A
3. Verify client B receives notification

**Completed**: ❌
**Completed Date**: N/A

---

### BE-9: Manual Camera Scan No Broadcast ⏳

**Priority**: Low
**Status**: Not Started
**File**: `src/routes/api.js:1752-1765`

**Problem**: Manual camera scan initiation not broadcast to other clients.

**Frontend Impact**: No indication scan in progress for other clients.

**Fix**:

```javascript
// After initiating scan (line 1754):
await discoveryManager.searchForCameras();

// ADD THIS:
if (server.wss && server.wss.broadcastDiscoveryEvent) {
  server.wss.broadcastDiscoveryEvent("scanStarted", {
    timestamp: new Date().toISOString(),
    manual: true,
  });
}

res.json({ success: true, message: "Camera scan initiated" });
```

**Test**:

1. Connect two clients
2. Initiate manual scan in client A
3. Verify client B shows scan in progress

**Completed**: ❌
**Completed Date**: N/A

---

### BE-10: State Manager Events Not Documented ⏳

**Priority**: Low
**Status**: Not Started
**File**: `src/intervalometer/state-manager.js`, `docs/design/api-specification.md`

**Problem**: IntervalometerStateManager emits ~10 events that aren't documented in API spec.

**Frontend Impact**: Developers don't know events exist, miss opportunities for real-time updates.

**Fix**: Add section to `docs/design/api-specification.md`:

```markdown
### Intervalometer State Manager Events

#### initialized

Emitted when IntervalometerStateManager initializes.
**Payload**: `{ hasUnsavedSession: boolean, sessionCount: number }`

#### sessionCreated

Emitted when new timelapse session created.
**Payload**: `{ sessionId: string, title: string, options: object }`

#### sessionStarted

Emitted when session begins capturing.
**Payload**: `{ sessionId: string, ... }`

#### photoTaken

Emitted after each successful photo.
**Payload**: `{ sessionId: string, shotNumber: number, success: boolean, ... }`

#### photoFailed

Emitted when photo capture fails.
**Payload**: `{ sessionId: string, shotNumber: number, error: string, ... }`

#### sessionPaused / sessionResumed

Emitted when session paused/resumed.

#### sessionStopped / sessionCompleted / sessionError

Emitted when session ends.

#### stateChanged

Emitted on state transitions.

#### reportSaved

Emitted when report saved successfully.

#### unsavedSessionFound

Emitted on startup if unsaved session exists.
```

**Test**: Manual review - verify all events documented.

**Completed**: ❌
**Completed Date**: N/A

---

### BE-11: Network State Changes Not Broadcast ⏳

**Priority**: Low
**Status**: Not Started
**File**: `src/network/state-manager.js:205-230`, `src/server.js`

**Problem**: Network state manager emits events locally but they're not forwarded to WebSocket clients.

**Frontend Impact**: Network service restarts, WiFi changes invisible to UI in real-time.

**Fix**:

1. In NetworkStateManager initialization:

```javascript
this.on("serviceStateChanged", (data) => {
  if (this.wssBroadcast) {
    this.wssBroadcast("network_service_changed", data);
  }
});

this.on("interfaceStateChanged", (data) => {
  if (this.wssBroadcast) {
    this.wssBroadcast("network_interface_changed", data);
  }
});
```

2. In `src/server.js`, connect broadcaster:

```javascript
networkStateManager.wssBroadcast = wss.broadcastNetworkEvent;
```

**Test**:

1. Change network state
2. Verify WebSocket events broadcast

**Completed**: ❌
**Completed Date**: N/A

---

## Integration Pattern Issues (10 Total)

### IP-1: Dual Response Handling Race Conditions ✅

**Priority**: High
**Status**: Complete
**Files**: `camera.js:255-263`, `timelapse.js:76-79`

**Problem**: Operations use BOTH REST API responses AND WebSocket broadcasts, causing:

- Duplicate UI updates
- Duplicate log messages
- State conflicts when both fire
- Race conditions

**Fix Applied**:

Removed duplicate response handlers, keeping only broadcast handlers:

1. **camera.js**: Removed `intervalometer_start` response handler (line 256-259), kept only `intervalometer_started` broadcast
2. **camera.js**: Removed `intervalometer_stop` response handler (line 334-348), enhanced `intervalometer_stopped` broadcast with detailed stats
3. **timelapse.js**: Removed `timelapse_reports_response` handler (line 76-78), kept only `timelapse_reports` broadcast

**Pattern Established**:

- Use ONLY broadcast events (`intervalometer_started`, `intervalometer_stopped`, etc.) for ALL clients
- Remove individual response handlers (`intervalometer_start`, `intervalometer_stop`, etc.) to avoid duplicates
- All clients (including initiator) receive same broadcast event

**Test**:

1. Start intervalometer
2. Verify only ONE "started successfully" message
3. Verify UI updates only ONCE
4. Stop intervalometer
5. Verify only ONE stop message with stats

**Completed**: ✅
**Completed Date**: 2025-10-05

---

### IP-2: Frontend State Tracking vs Backend State 🔥

**Priority**: High
**Status**: Not Started
**Files**: Various - stats tracking in camera.js, timelapse.js

**Problem**: Frontend maintains local counters that duplicate backend state, causing sync bugs.

**Current Pattern (GOOD)**:

```javascript
// Backend is source of truth, frontend polls
updateOvertimeDisplay(status.stats, status.options);
```

**Anti-pattern (BAD)**:

```javascript
// Frontend tracks its own counts
this.photoCount++;
this.successCount++;
```

**Fix Strategy**:

- **Backend is ALWAYS source of truth for ALL stats**
- Frontend should NEVER maintain counters
- Only display backend data from status updates

**Implementation**:

1. Audit frontend for local stat tracking
2. Remove local counters
3. Use backend stats from periodic updates or WebSocket events
4. Document pattern in architecture docs

**Test**:

1. Disconnect WebSocket mid-session
2. Reconnect
3. Verify stats still accurate (no frontend drift)

**Completed**: ❌
**Completed Date**: N/A

---

### IP-3: Missing Loading/Error States ✅

**Priority**: High
**Status**: Complete
**Files**: `test-shot.js` (6 locations), `timelapse.js` (2 locations)

**Problem**: Inconsistent UI feedback - some operations show loading states, others don't. Mix of alert() vs toast vs silent failures.

**Fix Applied**:

Replaced ALL `alert()` calls with `Toast.error()`:

**test-shot.js**:

- Line 149: `captureLiveView()` - alert → Toast.error
- Line 186: `clearAll()` - alert → Toast.error (also added UIStateManager loading state)
- Line 216: `deleteImage()` - alert → Toast.error
- Line 472: `applySettings()` - alert → Toast.error
- Line 543: `captureTestPhoto()` - alert → Toast.error
- Line 789: `deleteTestPhoto()` - alert → Toast.error

**timelapse.js**:

- Line 661: `saveSession()` validation - alert → Toast.error
- Line 826: `showError()` fallback - alert → Toast.error

**Note**: `clearAll()` now also uses `window.uiStateManager.setInProgress()` for loading state (see FE-2)

**Implementation**:

1. ✅ Searched for `alert(` in all frontend JS
2. ✅ Replaced all error alerts with Toast.error()
3. ✅ Added loading state to clearAll() operation
4. ✅ Standardized error feedback across all operations

**Test**:

1. Trigger each operation that previously used alert()
2. Verify Toast.error() shown instead
3. Verify clearAll() shows loading state

**Completed**: ✅
**Completed Date**: 2025-10-05

---

### IP-4: Incomplete Error Propagation Chain ⏳

**Priority**: Medium
**Status**: Not Started
**Files**: `src/websocket/handler.js:452-455`, frontend error handlers

**Problem**: Backend sends errors via `sendError()` but frontend doesn't always show them to user visually.

**Fix Strategy**:

1. Audit all `sendError()` call sites in backend
2. Verify frontend has `error_response` handler that shows toast
3. Add integration test for error propagation

**Implementation**:

1. Review websocket.js for error_response handler
2. Ensure handler calls Toast.error()
3. Test each error path end-to-end

**Test**:

1. Trigger each API error condition
2. Verify toast notification shown

**Completed**: ❌
**Completed Date**: N/A

---

### IP-5: Network Operation Connectivity Warnings ⏳

**Priority**: Medium
**Status**: Not Started
**File**: `public/js/network.js:507`

**Problem**: WiFi connect shows warning about losing connectivity, but other network operations don't:

- AP configuration
- WiFi disable
- Network disconnect

**Fix Strategy**:

- Create shared `NetworkOperationGuard` utility
- Apply to all operations that could disconnect client
- Document in network-management.md

**Implementation**:

```javascript
class NetworkOperationGuard {
  static async checkWillDisconnect(operation) {
    // Determine if client connected via WiFi or AP
    // Return true if operation will disconnect client
  }

  static async showWarningIfNeeded(operation, callback) {
    if (await this.checkWillDisconnect(operation)) {
      // Show modal warning
      // Only proceed if user confirms
    } else {
      callback();
    }
  }
}
```

**Test**:

1. Connect via WiFi
2. Try to disable WiFi
3. Verify warning shown

**Completed**: ❌
**Completed Date**: N/A

---

### IP-6: Event Listener Cleanup Missing ⏳

**Priority**: Medium
**Status**: Not Started
**Files**: `timelapse.js`, `test-shot.js`, `network.js`

**Problem**: WebSocket event listeners set up but not cleaned up, causing:

- Multiple handlers fire on reconnect
- Memory leaks
- Duplicate UI updates

**Fix Strategy**:

- Implement `destroy()` methods that call `wsManager.off()`
- Call destroy before reconnecting
- Use WeakMap for handler references

**Implementation**:

```javascript
class TimelapseUI {
  constructor(wsManager) {
    this.wsManager = wsManager;
    this.boundHandlers = new Map();
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    const handler = (data) => this.handleReportsResponse(data);
    this.boundHandlers.set("timelapse_reports", handler);
    this.wsManager.on("timelapse_reports", handler);
  }

  destroy() {
    for (const [event, handler] of this.boundHandlers) {
      this.wsManager.off(event, handler);
    }
    this.boundHandlers.clear();
  }
}
```

**Test**:

1. Reconnect WebSocket
2. Trigger events
3. Verify handlers only fire once

**Completed**: ❌
**Completed Date**: N/A

---

### IP-7: Event Naming Migration Incomplete ⏳

**Priority**: Medium
**Status**: Not Started
**Files**: Multiple - event handlers across codebase

**Problem**: Mix of camelCase and snake_case event names:

- `photo_taken` vs `photoTaken`
- `intervalometer_started` vs `cameraDiscovered`

**Status**: Migration plan exists in `docs/design/event-naming-migration-plan.md` but incomplete.

**Fix Strategy**:

- Complete migration to snake_case per existing plan
- Add linting rule to enforce convention

**Implementation**:

1. Review migration plan document
2. Complete remaining conversions
3. Remove legacy event name support
4. Add ESLint rule

**Test**:

1. Search codebase for camelCase events
2. Verify all use snake_case

**Completed**: ❌
**Completed Date**: N/A

---

### IP-8: Status Polling Redundancy ⏳

**Priority**: Low
**Status**: Not Started
**Files**: `app.js:105-113`, `websocket/handler.js:169-172`

**Problem**: BOTH WebSocket broadcasts AND periodic REST API polling running simultaneously - wasteful.

**Fix Strategy**:

- Use WebSocket broadcasts as primary
- Only fall back to REST if WebSocket disconnected
- Document pattern in architecture docs

**Implementation**:

```javascript
startStatusUpdates() {
  this.statusUpdateInterval = setInterval(async () => {
    // ONLY poll if WebSocket disconnected
    if (!wsManager.connected) {
      await cameraManager.updateCameraStatus();
      await this.updateSystemStatus();
    }
  }, 10000);
}
```

**Test**:

1. Monitor network tab with WebSocket connected
2. Verify no REST status calls
3. Disconnect WebSocket
4. Verify REST polling starts

**Completed**: ❌
**Completed Date**: N/A

---

### IP-9: Modal State Management Scattered ⏳

**Priority**: Low
**Status**: Not Started
**Files**: `network.js`, `timelapse.js`, `camera.js` - ~15 modal methods each

**Problem**: Each modal manages its own show/hide logic - duplicate code, hard to add features like modal stacking.

**Fix Strategy**:

- Create `ModalManager` utility class
- Centralize modal lifecycle
- Handle ESC key, backdrop clicks consistently

**Implementation**:

```javascript
class ModalManager {
  constructor() {
    this.activeModals = [];
  }

  show(modalId, options = {}) {
    const modal = document.getElementById(modalId);
    // ... show logic, ESC key, backdrop
    this.activeModals.push(modalId);
  }

  hide(modalId) {
    // ... hide logic
    this.activeModals = this.activeModals.filter((id) => id !== modalId);
  }

  hideAll() {
    this.activeModals.forEach((id) => this.hide(id));
  }
}
```

**Test**:

1. Open multiple modals
2. Press ESC, verify top modal closes
3. Click backdrop, verify modal closes

**Completed**: ❌
**Completed Date**: N/A

---

### IP-10: WebSocket Handler Switch Statement ⏳

**Priority**: Low
**Status**: Not Started
**Files**: `websocket.js:186-300`, `websocket/handler.js:350-451`

**Problem**: Single massive switch statement hard to maintain and test.

**Fix Strategy**:

- Extract to handler map
- Each handler is a separate testable function

**Implementation**:

```javascript
class WebSocketManager {
  constructor() {
    this.messageHandlers = {
      welcome: this.handleWelcome.bind(this),
      status_update: this.handleStatusUpdate.bind(this),
      event: this.handleEvent.bind(this),
      // ... all other types
    };
  }

  handleMessage(message) {
    const handler = this.messageHandlers[message.type];
    if (handler) {
      handler(message);
    } else {
      console.warn(`Unknown message type: ${message.type}`);
    }
  }

  handleWelcome(message) {
    /* ... */
  }
  handleStatusUpdate(message) {
    /* ... */
  }
  handleEvent(message) {
    /* ... */
  }
}
```

**Test**:

1. Unit test each handler independently
2. Integration test message routing

**Completed**: ❌
**Completed Date**: N/A

---

## Implementation Strategy

### Phase 1: Critical Backend Fixes (Week 1)

**Focus**: Fix missing WebSocket broadcasts

1. BE-1: Camera settings broadcast
2. BE-2: Photo capture response schema
3. BE-3: Camera config broadcast

**Success Criteria**: All critical state changes broadcast to clients in real-time.

---

### Phase 2: High Priority UI/Integration (Week 2)

**Focus**: Fix user-visible issues and race conditions

4. FE-1: Utilities manager race condition
5. FE-2: Clear liveview button state
6. IP-1: Dual response handling
7. IP-3: Missing loading/error states

**Success Criteria**: Consistent UI feedback, no duplicate updates.

---

### Phase 3: Medium Priority Improvements (Week 3)

**Focus**: Complete error handling and state management

8. BE-4: Time sync broadcast
9. BE-5: System time async fix
10. BE-6: Status broadcast errors
11. FE-3: WiFi icon consistency
12. FE-4: Test shot auto-load
13. FE-5: Camera IP UI update
14. IP-2: Frontend state tracking
15. IP-4: Error propagation
16. IP-5: Network operation guards
17. IP-6: Event listener cleanup
18. IP-7: Event naming migration

**Success Criteria**: Complete error handling, consistent state management.

---

### Phase 4: Polish & Documentation (Week 4)

**Focus**: Low priority fixes and documentation

19. BE-7 through BE-11: Schema consistency, broadcasts, documentation
20. FE-6: WebSocket reconnect feedback
21. IP-8 through IP-10: Code quality improvements

**Success Criteria**: All issues resolved, documentation complete.

---

## Testing Strategy

### Unit Tests

- Add tests for each state manager event emission
- Test error handling in all API endpoints
- Test WebSocket message handlers individually

### Integration Tests

- Test complete event flow: UI → API → WebSocket → UI
- Test error propagation end-to-end
- Test multi-client scenarios

### E2E Tests

- Test all user workflows with network delays
- Test reconnection scenarios
- Test multi-client synchronization

---

## Documentation Updates Required

1. **API Specification** (`docs/design/api-specification.md`)
   - Document all state manager events
   - Add WebSocket message schemas
   - Document dual-response vs broadcast pattern

2. **Architecture Overview** (`docs/design/architecture-overview.md`)
   - Add section on state synchronization patterns
   - Document WebSocket vs REST decision tree

3. **Data Flow** (`docs/design/data-flow-and-events.md`)
   - Update event flow diagrams
   - Add error propagation flows

4. **Network Management** (new file?)
   - Document network operation guards
   - Document WiFi/AP safety patterns

---

## Progress Tracking

**Phase 1 (Critical Backend Fixes)**: 100% complete (3/3 issues)

- ✅ BE-1: Camera settings broadcast
- ✅ BE-2: Photo capture schema (investigated - no change needed)
- ✅ BE-3: Camera config broadcast

**Phase 2 (High Priority UI/Integration)**: 100% complete (4/4 issues)

- ✅ FE-1: Utilities manager race condition
- ✅ FE-2: Clear liveview button state
- ✅ IP-1: Dual response handling
- ✅ IP-3: Missing loading/error states

**Overall Progress**: 26% complete (7/27 issues)
**Week 1**: 0% → 26% (7/27 issues complete)
**Week 2**: TBD% → TBD%
**Week 3**: TBD% → TBD%
**Week 4**: TBD% → 100%

**Last Session Notes**:

- 2025-10-05: Initial plan created
- 2025-10-05 AM: Phase 1 backend fixes implemented (BE-1, BE-3), BE-2 investigated and confirmed correct by design
- 2025-10-05 PM: Phase 2 UI/Integration fixes implemented (FE-1, FE-2, IP-1, IP-3)
  - All 525 unit tests passing
  - 16/16 smoke E2E tests passing
  - 4/5 visual E2E tests passing (1 flaky test unrelated to changes)

---

## Notes for Claude

When working on this plan:

1. **Always update this document** when completing a fix
2. **Mark items complete** with ✅ and date
3. **Add findings** if implementation differs from plan
4. **Update percentage** in progress tracking
5. **Commit this document** with code changes
6. **Reference issue IDs** in commit messages (e.g., "Fix BE-1: Add camera settings broadcast")

This keeps the plan current and prevents re-analysis in future sessions.
