# Event Naming Audit - Findings and Recommendations

**Date:** 2025-09-29
**Status:** Analysis Complete - Ready for Decision

## Executive Summary

Found **73 unique event names** across the codebase with **3 different naming conventions** in use:

- **snake_case**: 10 events (14%)
- **camelCase**: 61 events (84%)
- **kebab-case**: 2 events (3%)

**Critical Finding:** WebSocket events (frontend-facing) use **inconsistent naming** across different broadcast types, making frontend code unnecessarily complex.

---

## Event Categories

### 1. WebSocket Events (Frontend-Facing) - MOST CRITICAL

These events are broadcast to the frontend and require consistent naming:

#### Discovery Events (broadcastDiscoveryEvent) - Currently **camelCase**

```
cameraDiscovered
cameraConnected
cameraOffline
primaryCameraChanged
primaryCameraDisconnected
```

#### Network Events (broadcastNetworkEvent) - Currently **snake_case**

```
network_service_changed
network_interface_changed
access_point_configured
wifi_connection_started
wifi_connection_failed
```

#### Timelapse Events (broadcastTimelapseEvent) - Currently **snake_case**

```
report_updated
report_deleted
report_saved
session_discarded
session_started
session_stopped
session_completed
session_error
unsaved_session_found
```

#### General Events (broadcastEvent) - Currently **snake_case**

```
photo_taken
intervalometer_started
intervalometer_photo
intervalometer_error
intervalometer_completed
intervalometer_stopped
timelapse_session_needs_decision
```

#### Time Sync Events - Currently **kebab-case** (Special)

```
camera-sync
pi-sync
reliability-lost
```

**INCONSISTENCY:** Discovery uses camelCase, everything else uses snake_case/kebab-case!

---

### 2. Internal EventEmitter Events (Backend-Only)

These events are used internally between components via Node.js EventEmitter:

#### Camera State Events - **camelCase**

```
cameraIPChanged
cameraRegistered
cameraRemoved
cameraStatusChanged
cameraConnectionFailed
cameraConnectionError
primaryCameraReconnected
```

#### Network State Events - **camelCase**

```
accessPointConfigured
accessPointEnsured
accessPointRestarted
accessPointStarted
accessPointStartFailed
accessPointStopped
wifiClientStarted
wifiClientStartFailed
wifiClientStopped
wifiConnectionStarted
wifiConnectionVerified
wifiConnectionUnverified
wifiConnectionFailed
wifiDisabled
wifiDisableFailed
wifiDisconnected
wifiEnabled
wifiEnableFailed
interfaceStateChanged
serviceStateChanged
```

#### Session/Intervalometer Events - **camelCase**

```
sessionCreated
sessionCreateFailed
sessionStarted
sessionPaused
sessionResumed
sessionStopped
sessionCompleted
sessionDiscarded
sessionError
reportSaved
reportSaveFailed
titleUpdated
unsavedSessionFound
```

#### System Events - **camelCase**

```
initialized
initializationFailed
modeDetected
modeChanging
modeChanged
modeChangeFailed
discoveryStarted
discoveryStopped
deviceOffline
```

#### Generic State Events - **camelCase**

```
started
stopped
paused
resumed
completed
error
stateChanged
statusUpdate
```

---

## Critical Issues Found

### Issue 1: Duplicate Event Names (HIGHEST PRIORITY)

**Duplicates with different casing:**

- `photo_taken` (WebSocket) vs `photoTaken` (internal)
- `photo_failed` (WebSocket) vs `photoFailed` (internal)

**Impact:** Confusing and error-prone. Need to verify both are intentional or consolidate.

### Issue 2: Inconsistent WebSocket Event Naming (HIGH PRIORITY)

**Problem:** Frontend must handle multiple naming conventions:

- Discovery events: `cameraDiscovered` (camelCase)
- Network events: `wifi_connection_started` (snake_case)
- Intervalometer events: `intervalometer_started` (snake_case)

**Impact:** Frontend code becomes messy:

```javascript
// Frontend must handle both conventions
case 'cameraDiscovered':  // camelCase
case 'wifi_connection_started':  // snake_case
```

### Issue 3: Three Naming Conventions in Use (MEDIUM PRIORITY)

**Conventions found:**

1. **snake_case**: `intervalometer_started`, `wifi_connection_failed`
2. **camelCase**: `cameraDiscovered`, `sessionStarted`
3. **kebab-case**: `camera-sync`, `pi-sync`

**Impact:** No clear pattern, makes naming new events ambiguous.

### Issue 4: Internal vs External Event Overlap (LOW PRIORITY)

Some event names are used both internally and externally with different casing, which could cause confusion during debugging.

---

## Analysis by Component

### Discovery Manager

- **Internal EventEmitter:** camelCase (cameraIPChanged, cameraRegistered)
- **WebSocket Broadcast:** camelCase (cameraDiscovered, primaryCameraChanged)
- **Consistency:** ✅ Good - both use camelCase

### Network Manager

- **Internal EventEmitter:** camelCase (wifiConnectionStarted, accessPointConfigured)
- **WebSocket Broadcast:** snake_case (wifi_connection_started, access_point_configured)
- **Consistency:** ❌ **INCONSISTENT** - internal uses camelCase, WebSocket uses snake_case

### Intervalometer/Session Manager

- **Internal EventEmitter:** camelCase (sessionStarted, sessionCompleted)
- **WebSocket Broadcast:** snake_case (intervalometer_started, report_saved)
- **Consistency:** ❌ **INCONSISTENT** - internal uses camelCase, WebSocket uses snake_case

### Time Sync Service

- **WebSocket Broadcast:** kebab-case (camera-sync, pi-sync)
- **Consistency:** ❌ **DIFFERENT** - unique kebab-case convention

---

## Statistics

**Total Events:** 73
**WebSocket Events:** ~25 (34% - frontend-facing)
**Internal Events:** ~48 (66% - backend-only)

**Naming Distribution:**

- camelCase: 61 events (84%)
- snake_case: 10 events (14%)
- kebab-case: 2 events (3%)

**Components Affected:**

- Discovery Manager: ✅ Consistent (camelCase)
- Network Manager: ❌ Inconsistent (mixed)
- Intervalometer: ❌ Inconsistent (mixed)
- Time Sync: ❌ Different (kebab-case)
- Camera State: ✅ Consistent (camelCase)

---

## Recommendation

### Option A: Full snake_case Standardization (RECOMMENDED)

**Rationale:**

1. Matches existing WebSocket message type convention (`take_photo`, `get_camera_settings`)
2. Already used by majority of WebSocket events (network, timelapse, intervalometer)
3. Clear visual distinction from JavaScript identifiers (which use camelCase)
4. Consistent with REST API URL patterns (`/api/camera/status`)

**Changes Required:**

- Discovery events: camelCase → snake_case (5 events)
- Time sync events: kebab-case → snake_case (3 events)
- Internal events: Keep camelCase (no frontend impact)

**Example:**

```javascript
// Before
cameraDiscovered;
camera - sync;
primaryCameraChanged;

// After
camera_discovered;
camera_sync;
primary_camera_changed;
```

**Pros:**

- ✅ Matches existing WebSocket message naming
- ✅ Already used by most WebSocket events
- ✅ Clear distinction: snake_case for network protocol, camelCase for code
- ✅ Easier to grep/search (`grep "camera_"` finds all camera events)

**Cons:**

- ⚠️ Frontend code must be updated
- ⚠️ Breaking change for any external clients

---

### Option B: Full camelCase Standardization (ALTERNATIVE)

**Rationale:**

1. Matches JavaScript conventions
2. Already used by internal EventEmitter events
3. Less disruptive to discovery events

**Changes Required:**

- Network events: snake_case → camelCase (5 events)
- Timelapse events: snake_case → camelCase (9 events)
- Intervalometer events: snake_case → camelCase (6 events)
- Time sync events: kebab-case → camelCase (3 events)

**Example:**

```javascript
// Before
wifi_connection_started;
intervalometer_started;
camera - sync;

// After
wifiConnectionStarted;
intervalometerStarted;
cameraSync;
```

**Pros:**

- ✅ Matches JavaScript code style
- ✅ Discovery events don't change
- ✅ Consistent with internal events

**Cons:**

- ❌ Inconsistent with WebSocket message types (which use snake_case)
- ❌ More events need to change (~23 events vs ~8 events)
- ❌ Harder to visually distinguish protocol from code

---

### Option C: Mixed Convention with Clear Rules (NOT RECOMMENDED)

**Rules:**

- WebSocket events: snake_case
- Internal events: camelCase

**Pros:**

- ✅ Clear separation of concerns

**Cons:**

- ❌ Still requires changing discovery events
- ❌ Time sync events need standardization
- ❌ Complex rules to remember

---

## Recommended Decision: **Option A (snake_case for all WebSocket events)**

### Reasoning:

1. **Consistency with existing patterns:** 80% of WebSocket events already use snake_case
2. **Minimal changes:** Only 8 events need to change vs 23 for Option B
3. **Protocol consistency:** Matches WebSocket message type naming convention
4. **Clear distinction:** snake_case for protocol (WebSocket, REST), camelCase for code (JavaScript)

### Migration Strategy:

1. Update event schemas to use snake_case
2. Support both old and new event names during transition (temporary)
3. Update frontend to handle new names
4. Add deprecation warnings for old names
5. Remove old names after 1 release cycle

---

## Implementation Impact Analysis

### High Impact (Frontend Changes Required)

- Discovery events: `cameraDiscovered` → `camera_discovered` (5 events)
- Time sync events: `camera-sync` → `camera_sync` (3 events)

### No Impact (Already Correct)

- Network events: Already snake_case ✅
- Timelapse events: Already snake_case ✅
- Intervalometer events: Already snake_case ✅

### No Impact (Internal Only)

- Internal EventEmitter events stay camelCase (backend-only, no protocol change)

---

## Migration Checklist

### Phase 1: Preparation

- [ ] Create event name mapping document
- [ ] Update schemas in `test/schemas/websocket-message-schemas.js`
- [ ] Add schema tests for new event names
- [ ] Document breaking changes

### Phase 2: Backend Changes

- [ ] Update discovery event emissions to use snake_case
- [ ] Add temporary dual emission (old + new names)
- [ ] Update time sync events to use snake_case
- [ ] Add deprecation logging for old event names

### Phase 3: Frontend Changes

- [ ] Update frontend event listeners to use new names
- [ ] Test all event handlers
- [ ] Remove old event name handlers

### Phase 4: Cleanup

- [ ] Remove dual emission code
- [ ] Remove deprecation warnings
- [ ] Update all documentation

---

## Event Name Mapping (for Option A)

### Discovery Events

| Old Name (camelCase)      | New Name (snake_case)       |
| ------------------------- | --------------------------- |
| cameraDiscovered          | camera_discovered           |
| cameraConnected           | camera_connected            |
| cameraOffline             | camera_offline              |
| primaryCameraChanged      | primary_camera_changed      |
| primaryCameraDisconnected | primary_camera_disconnected |

### Time Sync Events

| Old Name (kebab-case) | New Name (snake_case) |
| --------------------- | --------------------- |
| camera-sync           | camera_sync           |
| pi-sync               | pi_sync               |
| reliability-lost      | reliability_lost      |

### No Changes Needed

- Network events: ✅ Already snake_case
- Timelapse events: ✅ Already snake_case
- Intervalometer events: ✅ Already snake_case

---

## Testing Strategy

### Unit Tests

- [ ] Add tests for new event names in schemas
- [ ] Test dual emission (old + new) works correctly
- [ ] Verify deprecation warnings are logged

### Integration Tests

- [ ] Test frontend receives events with new names
- [ ] Verify backward compatibility during transition
- [ ] Test event handlers respond correctly

### Manual Testing

- [ ] Camera discovery with new event names
- [ ] Network operations with new event names
- [ ] Intervalometer operations (already correct)
- [ ] Time sync operations with new event names

---

## Timeline Estimate

**Total Duration:** 1-2 days

**Breakdown:**

- Schema updates: 2 hours
- Backend changes: 3 hours
- Frontend changes: 2 hours
- Testing: 2 hours
- Documentation: 1 hour

---

## Appendix: Complete Event Inventory

See above sections for categorized lists.

**Total Events:** 73

- **WebSocket (Frontend):** 25 events
- **Internal (Backend):** 48 events

---

**Next Steps:**

1. Get user approval on Option A (snake_case standardization)
2. Create detailed migration plan
3. Begin implementation starting with schemas
4. Update frontend event handlers
5. Remove deprecated event names after testing
