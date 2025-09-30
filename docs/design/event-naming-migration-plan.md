# Event Naming Migration Plan - snake_case Standardization

**Status:** Implementation Ready
**Approved:** Option A (snake_case for all WebSocket events)
**Date:** 2025-09-29

## Migration Overview

**Goal:** Standardize all WebSocket event names to snake_case for consistency with message type naming.

**Events to Change:** 8 total
- Discovery events: 5 events (camelCase → snake_case)
- Time sync events: 3 events (kebab-case → snake_case)

**Strategy:** Dual emission during transition to prevent breaking changes

---

## Event Name Mappings

### Discovery Events (5 changes)

| Old Name | New Name | Component | File |
|----------|----------|-----------|------|
| `cameraDiscovered` | `camera_discovered` | Discovery Manager | src/discovery/manager.js |
| `cameraConnected` | `camera_connected` | Discovery Manager | src/discovery/manager.js |
| `cameraOffline` | `camera_offline` | Discovery Manager | src/discovery/manager.js |
| `primaryCameraChanged` | `primary_camera_changed` | Camera State | src/camera/state-manager.js |
| `primaryCameraDisconnected` | `primary_camera_disconnected` | Camera State | src/camera/state-manager.js |

### Time Sync Events (3 changes)

| Old Name | New Name | Component | File |
|----------|----------|-----------|------|
| `camera-sync` | `camera_sync` | Time Sync Service | src/timesync/service.js |
| `pi-sync` | `pi_sync` | Time Sync Service | src/timesync/service.js |
| `reliability-lost` | `reliability_lost` | Time Sync Service | src/timesync/service.js |

### No Changes (Already Correct)

These events already use snake_case:
- Network events: `wifi_connection_started`, `network_service_changed`, etc.
- Timelapse events: `report_saved`, `session_started`, etc.
- Intervalometer events: `intervalometer_started`, `photo_taken`, etc.

---

## Implementation Steps

### Step 1: Update Schemas (Test-First Approach)

**Files to Update:**
- `test/schemas/websocket-message-schemas.js`

**Actions:**
1. Add new snake_case event names to EventSchemas
2. Mark old names as deprecated in comments
3. Add validation tests for new names

### Step 2: Implement Dual Emission Utility

**Create:** `src/utils/event-migration.js`

```javascript
/**
 * Temporary dual emission utility for event name migration
 * Emits both old and new event names during transition period
 */
export function dualEmitDiscoveryEvent(broadcastFn, oldName, newName, data) {
  // Emit new name (primary)
  broadcastFn(newName, data);

  // Emit old name (deprecated) with warning
  console.warn(`[DEPRECATED] Event "${oldName}" is deprecated. Use "${newName}" instead.`);
  broadcastFn(oldName, data);
}
```

### Step 3: Update Discovery Event Emissions

**File:** `src/websocket/handler.js`

**Locations to Update:**

1. Discovery event handling (search for `broadcastDiscoveryEvent`)
2. Import dual emission utility
3. Replace single emissions with dual emissions

### Step 4: Update Time Sync Event Emissions

**File:** `src/timesync/service.js`

**Events to Update:**
- `camera-sync` → `camera_sync`
- `pi-sync` → `pi_sync`
- `reliability-lost` → `reliability_lost`

### Step 5: Update Server Integration

**File:** `src/server.js`

Ensure server correctly passes through the dual emissions.

### Step 6: Test Backend

**Actions:**
1. Run unit tests to verify dual emission
2. Start server and monitor logs for deprecation warnings
3. Verify WebSocket clients receive both old and new events
4. Check that event data is identical for both emissions

---

## Testing Strategy

### Backend Testing

**Schema Tests:**
```javascript
test('discovery events use snake_case', () => {
  expect(EventSchemas).toHaveProperty('camera_discovered');
  expect(EventSchemas).toHaveProperty('camera_connected');
  expect(EventSchemas).toHaveProperty('camera_offline');
});

test('time sync events use snake_case', () => {
  expect(EventSchemas).toHaveProperty('camera_sync');
  expect(EventSchemas).toHaveProperty('pi_sync');
  expect(EventSchemas).toHaveProperty('reliability_lost');
});
```

**Dual Emission Tests:**
```javascript
test('dual emission sends both old and new event names', () => {
  const broadcasts = [];
  const mockBroadcast = (name, data) => broadcasts.push({name, data});

  dualEmitDiscoveryEvent(mockBroadcast, 'cameraDiscovered', 'camera_discovered', {test: true});

  expect(broadcasts).toHaveLength(2);
  expect(broadcasts[0].name).toBe('camera_discovered');
  expect(broadcasts[1].name).toBe('cameraDiscovered');
});
```

### Manual Testing

**Test Scenarios:**
1. Connect camera → verify both `camera_discovered` and `cameraDiscovered` emitted
2. Disconnect camera → verify both `camera_offline` and `cameraOffline` emitted
3. Time sync → verify both `camera_sync` and `camera-sync` emitted
4. Check logs for deprecation warnings

---

## Frontend Update (Future Phase)

**Not in this phase** - Backend supports both names, frontend update comes later:

1. Update event listeners to use new names
2. Test all event handlers
3. Remove old event handlers
4. Verify no old names remain

---

## Rollback Plan

If issues arise:
1. Backend dual emission continues to work with old frontend
2. Can roll back frontend without backend changes
3. Can keep dual emission indefinitely if needed

---

## Cleanup Phase (Future)

After frontend updated and tested:
1. Remove dual emission utility
2. Remove old event name support
3. Remove deprecation warnings
4. Update all documentation

**Estimated:** 1 sprint after frontend deployment

---

## Implementation Checklist

### Phase 1: Backend Changes (COMPLETED 2025-09-29)
- [x] Create `src/utils/event-migration.js` with dual emission utility
- [x] Update `test/schemas/websocket-message-schemas.js` with new event names
- [x] Add schema validation tests for new names
- [x] Update discovery events in `src/server.js` (actual location)
- [x] Update time sync events in `src/timesync/state.js` (actual location)
- [x] Update server integration if needed
- [x] Run all tests and verify they pass (69/69 passing)
- [x] Deploy to Pi and test manually
- [x] Document changes in CLAUDE.md

### Phase 2: Frontend Changes (Future)
- [ ] Update event listeners in frontend code
- [ ] Test all event handlers
- [ ] Remove old event handlers
- [ ] Deploy frontend changes

### Phase 3: Cleanup (Future)
- [ ] Remove dual emission utility
- [ ] Remove old event name support
- [ ] Remove deprecation warnings
- [ ] Update documentation

---

## Timeline

**Phase 1 (Backend):** 2-3 hours
- Schema updates: 30 min
- Dual emission utility: 30 min
- Discovery event updates: 30 min
- Time sync updates: 30 min
- Testing: 1 hour

**Phase 2 (Frontend):** 1-2 hours (future)
**Phase 3 (Cleanup):** 30 min (future)

**Total:** ~4-6 hours across all phases

---

## Risk Assessment

**Low Risk:**
- Dual emission ensures backward compatibility
- No breaking changes in this phase
- Can roll back frontend independently
- Deprecation warnings help identify usage

**Medium Risk:**
- Increased log output from deprecation warnings
- Slightly more network traffic (dual emissions)
- Confusion if developers see two events

**Mitigation:**
- Clear deprecation messages
- Document migration in NOTES.md
- Remove dual emission as soon as possible

---

## Success Criteria

**Phase 1 Complete When:**
- ✅ All tests pass
- ✅ Both old and new event names are emitted
- ✅ Deprecation warnings appear in logs
- ✅ No breaking changes to existing functionality
- ✅ Documentation updated

---

## Implementation Status

**Phase 1: COMPLETED** - 2025-09-29

### Changes Implemented

**1. Migration Utility Created** (`src/utils/event-migration.js`)
- Dual emission function: `dualEmit()` - emits both old and new event names
- Helper function: `emitDiscoveryEvent()` - wraps discovery events with migration logic
- Event name mapping: `EVENT_NAME_MIGRATIONS` - defines all event name conversions
- Statistics tracking: `getMigrationStats()` - for monitoring deprecated event usage

**2. Event Schemas Updated** (`test/schemas/websocket-message-schemas.js`)
- Added new snake_case event schemas (camera_discovered, camera_connected, etc.)
- Kept deprecated schemas temporarily for backward compatibility
- Added comments marking deprecated schemas for future removal

**3. Discovery Events Updated** (`src/server.js:138-152`)
- Wrapped `broadcastDiscoveryEvent()` with `emitDiscoveryEvent()` utility
- Now emits both old (camelCase) and new (snake_case) names:
  - `cameraDiscovered` + `camera_discovered`
  - `cameraConnected` + `camera_connected`
  - `cameraOffline` + `camera_offline`
  - `primaryCameraChanged` + `primary_camera_changed`
  - `primaryCameraDisconnected` + `primary_camera_disconnected`

**4. Time Sync Events Updated** (`src/timesync/state.js:70, 97, 122`)
- Changed internal EventEmitter events to snake_case:
  - `pi-sync` → `pi_sync`
  - `camera-sync` → `camera_sync`
  - `reliability-lost` → `reliability_lost`
- Note: These are internal events only (not WebSocket broadcasts)

**5. Documentation Updated**
- Added reference to CLAUDE.md pointing to this plan
- Updated implementation checklist with actual files modified

### Test Results
- ✅ All 69 unit/schema/error tests passing
- ✅ Dual emission verified in production logs
- ✅ Deprecation warnings appearing as expected
- ✅ Camera connection working normally
- ✅ No breaking changes to existing functionality

### Example Log Output
```
17:54:26 [info] Broadcasting discovery event camera_discovered to 1 clients
17:54:26 [warn] [EVENT MIGRATION] Emitting deprecated event "cameraDiscovered".
                 Use "camera_discovered" instead. This will be removed in a future release.
17:54:26 [info] Broadcasting discovery event cameraDiscovered to 1 clients
```

### Files Modified
- `src/server.js` - Added dual emission wrapper
- `src/timesync/state.js` - Updated internal event names
- `src/utils/event-migration.js` - Created (new file)
- `test/schemas/websocket-message-schemas.js` - Added snake_case schemas
- `CLAUDE.md` - Added reference to this document

### Next Steps
**Phase 2: Frontend Updates** (Future)
- Update frontend event listeners to use new snake_case names
- Test all event handlers with new names
- Remove old camelCase event handlers
- Deploy and verify

**Phase 3: Cleanup** (After Phase 2)
- Remove `src/utils/event-migration.js`
- Remove dual emission from `src/server.js`
- Remove deprecated schemas from `test/schemas/websocket-message-schemas.js`
- Remove deprecation warnings

---

**Phase 1 implementation completed successfully on 2025-09-29**