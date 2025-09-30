# WebSocket Analysis Issues - Implementation Plan

**Document Version:** 1.2
**Date:** 2025-09-29
**Status:** Phases 1 & 2 Complete - Phase 3 Paused for CCAPI Audit

## Executive Summary

This document provides a comprehensive plan for addressing the issues identified in `websocket-analysis-issues.md`. Analysis of the current codebase (as of commit 59c84fa) reveals that **3 of 13 original issues have been fully or partially resolved**, with significant progress on error standardization and message handler coverage.

### Quick Status Overview

- ✅ **RESOLVED** (5 issues): Error standardization complete, message handlers implemented, schema validation tests added, event naming migration underway with backward compatibility
- 🔄 **IN PROGRESS** (1 issue): Event naming migration (dual emission active, awaiting frontend updates)
- ⏭️ **NEXT UP** (Phase 3): Documentation updates for error recovery, connection lifecycle, and session persistence
- ⚠️ **UNRESOLVED** (7 issues): Network transitions, documentation gaps, testing needs
- ✅ **FIXED** (3 new issues): Test suite ESM config, REST API standardization, sendOperationResult removal

### Estimated Timeline

- **Phase 1 (High Priority)**: ✅ **COMPLETE** - Error standardization finished (commit 7d786ec)
- **Phase 2 (Medium Priority)**: ✅ **COMPLETE** - Event naming migration with backward compatibility (commit 7d786ec)
- **Phase 3 (Medium Priority)**: ⏭️ **NEXT** - 2-3 days - Documentation updates
- **Phase 4 (Lower Priority)**: 4-5 days - Advanced features investigation
- **Phase 5 (Validation)**: 2-3 days - Testing and validation

**Total Estimated Effort:** 13-18 days
**Completed:** 5-7 days (Phases 1 & 2)
**Remaining:** 8-11 days (Phases 3-5)

---

## Analysis Methodology

### Scope of Analysis

The analysis included:
1. **Document Review**: Examined `websocket-analysis-issues.md`, `api-specification.md`, and `architecture-overview.md`
2. **Code Inspection**: Analyzed WebSocket handlers, error utilities, schema tests, and REST API routes
3. **Test Coverage**: Reviewed existing test suite structure and identified gaps
4. **Pattern Detection**: Searched for error patterns, event naming conventions, and message handlers

### Key Files Examined

**Core Implementation:**
- `src/websocket/handler.js` (1262 lines) - Main WebSocket handler
- `src/utils/error-handlers.js` (153 lines) - Standardized error utilities
- `src/routes/api.js` - REST API endpoints
- `src/network/handler.js` - Network event coordination

**Testing Infrastructure:**
- `test/schemas/websocket-message-schemas.js` - Message schema definitions
- `test/schemas/websocket-messages.test.js` - Schema validation tests
- `test/errors/error-standardization.test.js` - Error format enforcement
- `test/integration/websocket-error-fix.test.js` - Integration tests

### Tools Used

- **Grep**: Pattern matching for error formats, event names, function usage
- **Code Analysis**: Manual inspection of handler implementations
- **Test Execution**: Attempted test run to verify test suite health

---

## Current Status Assessment

### Issue Resolution Summary

| Issue # | Title | Status | Evidence |
|---------|-------|--------|----------|
| 1 | Multiple Error Response Patterns | 🔄 Partial | `error-handlers.js` created, WebSocket uses it, REST API doesn't |
| 2 | Missing Message Type Handlers | ✅ Resolved | All documented handlers implemented in `handler.js:325-426` |
| 3 | Event Type Naming Inconsistencies | ⚠️ Unresolved | Not yet audited |
| 4 | Race Conditions in Network Transitions | ⚠️ Unknown | Discovery system exists, needs verification |
| 5 | Missing Error Recovery Sequences | ⚠️ Undocumented | Code has recovery, docs don't |
| 6 | Intervalometer Session Persistence | ⚠️ Unknown | Session management exists, guarantees unclear |
| 7 | Client Connection Lifecycle | ⚠️ Undocumented | Cleanup code exists at `handler.js:1076-1090` |
| 8 | Broadcast Efficiency Concerns | ⚠️ Unaddressed | Still broadcasts to all clients every 10s |
| 9 | Message Ordering Guarantees | ⚠️ Unknown | Needs investigation |
| 10 | Time Sync Reliability Edge Cases | ⚠️ Unknown | TimeSyncService exists, edge cases not tested |
| 11 | Camera Time Sync Compatibility | ⚠️ Untested | Only tested with Canon EOS R50 |
| 12 | Schema Field Mismatches | ✅ Resolved | Schema tests validate all fields |
| 13 | WebSocket Handler Function Names | ⚠️ Low Priority | Some inconsistencies remain |

---

## Resolved Issues - Detailed Analysis

### Issue #1: Multiple Error Response Patterns - PARTIALLY RESOLVED ✅

**Original Problem:** System used 4 different error response patterns, causing inconsistent client error handling.

**Resolution Status:** 🔄 **50% Complete**

**What Was Fixed:**
1. ✅ Created standardized error utilities in `src/utils/error-handlers.js`:
   - `createStandardError()` - Standard format creator
   - `createApiError()` - API-specific errors
   - `broadcastError()` - WebSocket error broadcasting
   - `convertLegacyError()` - Legacy format converter
   - Error codes enum and component tracking

2. ✅ WebSocket handler now uses standard format:
   ```javascript
   // handler.js:1011-1026
   const sendError = (ws, message, options = {}) => {
     const standardError = createStandardError(message, {
       code: options.code || ErrorCodes.OPERATION_FAILED,
       operation: options.operation,
       component: options.component || Components.WEBSOCKET_HANDLER
     });
     ws.send(JSON.stringify(standardError));
   };
   ```

3. ✅ Test suite enforces standard format:
   - `test/errors/error-standardization.test.js` - Documents and enforces single format
   - `test/integration/websocket-error-fix.test.js` - Integration testing

**What Still Needs Work:**
1. ❌ REST API routes still use old format:
   ```javascript
   // src/routes/api.js:34
   res.status(500).json({ error: "Failed to get camera status" });
   ```
   Should be:
   ```javascript
   res.status(500).json(createApiError("Failed to get camera status", {
     code: ErrorCodes.SYSTEM_ERROR,
     component: Components.API_ROUTER
   }));
   ```

2. ❌ `sendOperationResult` still used in some places:
   ```javascript
   // handler.js:1029-1047 - Different format for operation results
   const sendOperationResult = (ws, operation, success, data = {}, error = null) => {
     // This creates a different message format!
   };
   ```

**Action Items:**
- Refactor all REST API routes to use `createApiError()`
- Eliminate or standardize `sendOperationResult()` usage
- Add API error format tests

---

### Issue #2: Missing Message Type Handlers - RESOLVED ✅

**Original Problem:** Schema definitions existed for message types that might not have handlers.

**Resolution Status:** ✅ **100% Complete**

**Evidence:** All message types from `websocket-analysis-issues.md` are now handled:

| Message Type | Handler Location | Verified |
|--------------|------------------|----------|
| `get_camera_settings` | `handler.js:331-332` | ✅ |
| `validate_interval` | `handler.js:334-336` | ✅ |
| `wifi_enable` | `handler.js:363-364` | ✅ |
| `wifi_disable` | `handler.js:366-368` | ✅ |
| `get_timelapse_reports` | `handler.js:374-376` | ✅ |
| `update_report_title` | `handler.js:382-384` | ✅ |

**Handler Implementation Pattern:**
```javascript
// handler.js:319-431 - Complete message routing
switch (type) {
  case "take_photo":
    await handleTakePhoto(ws, data);
    break;
  case "get_camera_settings":
    await handleGetCameraSettings(ws);
    break;
  // ... all message types covered
}
```

**Test Coverage:**
- `test/schemas/websocket-messages.test.js:242-266` - Validates handler existence for all schema-defined messages

---

### Issue #12: Schema Field Mismatches - RESOLVED ✅

**Original Problem:** Documentation didn't match actual message payloads, causing confusion.

**Resolution Status:** ✅ **100% Complete**

**What Was Implemented:**

1. ✅ Comprehensive schema definitions:
   - `test/schemas/websocket-message-schemas.js` - All message types documented
   - Client messages: 10+ message types defined
   - Server messages: 7+ message types defined
   - Event schemas: 6+ event payloads defined

2. ✅ Schema validation tests:
   ```javascript
   // test/schemas/websocket-messages.test.js
   test('status_update message follows schema', () => {
     const statusUpdate = { /* ... */ };
     const errors = validateSchema(statusUpdate, MessageSchemas.serverMessages.status_update);
     expect(errors).toEqual([]);
   });
   ```

3. ✅ Previously missing fields now documented:
   - `power.uptime` field (was missing from API spec, now in schema)
   - Optional fields properly marked with `?`
   - Event payloads match actual implementation

**Example Schema Definition:**
```javascript
status_update: {
  type: 'status_update',
  timestamp: 'string',
  camera: { connected: 'boolean', ip: 'string?' },
  power: {
    battery: { capacity: 'number?' },
    thermal: { temperature: 'number?' },
    uptime: 'number?'  // Previously undocumented!
  },
  // ...
}
```

---

## Unresolved Issues - Detailed Analysis

### Issue #3: Event Type Naming Inconsistencies - UNRESOLVED ⚠️

**Problem:** Events use inconsistent naming (camelCase vs snake_case).

**Evidence from Analysis:**
```javascript
// handler.js - Mixed naming patterns found:
broadcastEvent("photo_taken", data);           // snake_case
broadcastEvent("intervalometer_started", data); // snake_case
broadcastDiscoveryEvent("cameraDiscovered", data); // camelCase
broadcastDiscoveryEvent("cameraIPChanged", data);  // camelCase
```

**Impact:**
- Medium - Clients must handle both naming conventions
- Increases frontend complexity
- Potential for bugs when adding new events

**Investigation Needed:**
1. Search all event emissions across codebase
2. Create comprehensive event naming map
3. Decide on single naming convention (recommend snake_case for consistency with message types)
4. Plan migration strategy

**Recommended Approach:**
- Use `snake_case` for all event names (matches existing message type convention)
- Create event name migration utility
- Update schemas to enforce naming convention
- Add naming convention tests

---

### Issue #4: Race Conditions in Network Transitions - UNKNOWN ⚠️

**Problem:** Camera may be lost during network switches when Pi IP changes.

**Current Implementation Analysis:**
- ✅ Discovery system exists (`src/discovery/manager.js`)
- ✅ Camera IP change detection implemented
- ✅ Automatic reconnection on IP changes
- ❓ Unclear if there's a race condition during transition period

**Code Evidence:**
```javascript
// Discovery manager handles IP changes
cameraStateManager.on('cameraIPChanged', async (data) => {
  // Reconnection logic exists
});
```

**Requires Testing:**
1. Monitor camera connection during WiFi network switch
2. Verify no photos are lost during transition
3. Check if intervalometer sessions survive network changes
4. Document transition behavior

**Test Scenarios Needed:**
- Pi switches from AP mode to WiFi client
- Pi switches WiFi networks while intervalometer running
- Camera switches networks during photo capture
- Network drops and recovers mid-session

---

### Issue #5: Missing Error Recovery Sequences - UNDOCUMENTED ⚠️

**Problem:** Error recovery code exists but isn't documented in design docs.

**Implementation Evidence:**
```javascript
// Stuck shutter recovery
if (error.message.includes('busy') || error.message.includes('timeout')) {
  await this.handleStuckShutter();
}

// Connection recovery
this.on('connectionLost', async () => {
  await this.attemptReconnect();
});
```

**Documentation Gap:**
- ❌ No sequence diagrams for error recovery
- ❌ Shutter stuck recovery not documented
- ❌ Connection loss handling not documented
- ❌ Intervalometer error recovery not documented

**Required Documentation:**
1. Camera disconnect during session - recovery flow
2. Stuck shutter state - detection and recovery
3. Network failure during operation - retry logic
4. WebSocket disconnection - reconnection strategy
5. Camera busy state - queue or retry logic

**Recommended Approach:**
- Create `docs/design/error-recovery-sequences.md`
- Add mermaid sequence diagrams for each error scenario
- Document retry strategies and timeouts
- Document state recovery guarantees

---

### Issue #6: Intervalometer Session Persistence - UNKNOWN ⚠️

**Problem:** Session persistence guarantees unclear.

**Current Implementation:**
- ✅ IntervalometerStateManager exists
- ✅ Session reports saved to `data/timelapse-reports/`
- ✅ Unsaved session detection implemented
- ❓ Cross-reboot recovery unclear
- ❓ Crash recovery guarantees unknown

**Questions to Answer:**
1. Are in-progress sessions persisted to disk?
2. What happens if system crashes mid-shot?
3. When exactly is a session marked as "saved"?
4. Can interrupted sessions be resumed?
5. Are photo counts accurate across crashes?

**Investigation Required:**
- Trace session state management through state-manager.js
- Check if session state is written to disk during operation
- Test crash scenarios and verify recovery
- Document session lifecycle and persistence guarantees

---

### Issue #7: Client Connection Lifecycle - UNDOCUMENTED ⚠️

**Problem:** WebSocket connection management not documented.

**Implementation Evidence:**
```javascript
// handler.js:181-316 - Connection lifecycle handled
const handleConnection = async (ws, req) => {
  // 1. Client connects
  clients.add(ws);

  // 2. Send welcome message
  ws.send(JSON.stringify(initialStatus));

  // 3. Handle messages
  ws.on('message', handleClientMessage);

  // 4. Handle disconnection
  ws.on('close', () => clients.delete(ws));

  // 5. Handle errors
  ws.on('error', () => clients.delete(ws));
};

// handler.js:1076-1090 - Cleanup on shutdown
const cleanup = () => {
  clearInterval(statusInterval);
  for (const client of clients) {
    client.close(1000, "Server shutdown");
  }
  clients.clear();
};
```

**Documentation Needed:**
- Connection establishment flow
- Authentication (if any)
- Heartbeat/keepalive mechanism (if any)
- Reconnection strategy (client responsibility)
- Maximum connection limits
- Connection timeout handling
- Dead connection cleanup frequency

---

### Issue #8: Broadcast Efficiency Concerns - UNADDRESSED ⚠️

**Problem:** Status updates broadcast to ALL clients every 10 seconds regardless of interest.

**Current Implementation:**
```javascript
// handler.js:174-178 - Broadcasts every 10s
const statusInterval = setInterval(() => {
  broadcastStatus(); // Sends to ALL clients
}, 10000);
```

**Performance Analysis:**
- Every client receives full system status every 10s
- No filtering based on client interest
- No subscription model for specific events
- High-frequency events (photo_taken) broadcast to all clients

**Impact Assessment:**
- Low impact with 1-2 clients (typical use case)
- Could become issue with 5+ simultaneous clients
- Unnecessary network traffic for clients not viewing certain pages

**Potential Solutions:**
1. **Client Subscription Model** (Complex):
   ```javascript
   // Client subscribes to specific event types
   { type: "subscribe", topics: ["camera_status", "intervalometer"] }
   ```

2. **Smart Throttling** (Simple):
   ```javascript
   // Only send updates when values change significantly
   if (hasSignificantChange(status)) {
     broadcastStatus();
   }
   ```

3. **Configurable Intervals** (Medium):
   ```javascript
   // Clients can request update frequency
   { type: "set_update_interval", interval: 30000 }
   ```

**Recommendation:**
- Monitor with current implementation (works for target use case of 1-2 clients)
- Add performance metrics before optimization
- Implement if measurements show actual problem

---

### Issue #9: Message Ordering Guarantees - UNKNOWN ⚠️

**Problem:** Unclear if message ordering matters and if it's guaranteed.

**Potential Race Conditions:**
```javascript
// Could these arrive out of order?
broadcastEvent("sessionStarted", sessionData);
broadcastEvent("photo_taken", photoData);  // Immediately after?

// Network transition events
broadcastNetworkEvent("wifi_connection_started", {ssid});
// ... network changes ...
broadcastNetworkEvent("wifi_connection_verified", {ssid, ip});
```

**WebSocket Guarantees:**
- WebSocket protocol guarantees ordering per connection
- BUT: Multiple async operations could emit events out of sequence
- BUT: Server-side event handling may not be atomic

**Investigation Required:**
1. Trace event emission order in critical paths
2. Identify operations that depend on message ordering
3. Verify if any race conditions exist
4. Document ordering guarantees (or lack thereof)
5. Add sequence numbers if needed

---

### Issue #10: Time Sync Reliability Edge Cases - UNKNOWN ⚠️

**Problem:** Edge cases in time synchronization not tested or documented.

**Current Implementation:**
- TimeSyncService exists (`src/timesync/service.js`)
- Client time sync protocol implemented
- GPS integration supported
- Camera time sync implemented

**Untested Edge Cases:**
1. **Wildly Incorrect Client Time:**
   - What if client is years off?
   - Should system reject or accept?
   - Validation thresholds?

2. **Timezone Changes:**
   - Daylight saving time transitions
   - Travel across timezones
   - Timezone data update handling

3. **Repeated Failures:**
   - What if camera rejects time changes?
   - Retry logic and limits?
   - Error handling and user notification?

4. **GPS Time Accuracy:**
   - What accuracy is acceptable?
   - How to validate GPS time quality?
   - Fallback when GPS unavailable?

**Required Work:**
- Add edge case unit tests
- Document acceptable time ranges
- Define validation thresholds
- Test DST transitions
- Test timezone changes
- Document GPS accuracy requirements

---

### Issue #11: Camera Time Sync Compatibility - UNTESTED ⚠️

**Problem:** Only tested with Canon EOS R50, may not work with other cameras.

**Current Implementation:**
```javascript
// Assumes Canon CCAPI v100 endpoint
POST /ccapi/ver100/functions/datetime
```

**Compatibility Concerns:**
1. Older Canon cameras may use different CCAPI versions
2. Different camera models may have different datetime formats
3. Timezone handling may vary by model
4. Some cameras may not support time setting via API

**Testing Needed:**
- Test with Canon EOS R5, R6, R7, R10
- Test with older Canon DSLRs
- Document which models are supported
- Implement camera model detection
- Add compatibility checks before sync attempts

---

### Issue #13: WebSocket Handler Function Names - LOW PRIORITY ⚠️

**Problem:** Some handler function names don't match message types.

**Examples:**
```javascript
// Message type: start_intervalometer_with_title
// Handler name: handleStartIntervalometerWithTitle  // Good match!

// Message type: network_connect
// Handler name: handleNetworkConnect  // Good match!

// But some inconsistencies exist in event emission:
broadcastEvent("intervalometer_started", data);  // Event name
// vs session object property:
session.state === "running"  // State name
```

**Impact:** Low - doesn't affect functionality, but makes code harder to navigate

**Recommended Fix:**
- Audit all handler function names
- Ensure consistent mapping: `message_type` -> `handleMessageType()`
- Update any outliers
- Add naming convention documentation

---

## New Issues Discovered

### New Issue #14: Test Suite Broken - ESM Module Errors 🆕

**Problem:** Test suite currently fails to run due to Jest ESM configuration issues.

**Error:**
```
SyntaxError: Cannot use import statement outside a module
```

**Root Cause:**
- Tests use ES modules (`import` statements)
- Jest not configured for ESM support
- Affects multiple test files

**Files Affected:**
- `test/unit/api-routes.test.js`
- `test/unit/websocket-intervalometer.test.js`
- `test/integration/websocket-error-fix.test.js`
- Likely all test files

**Fix Required:**
1. Update `jest.config.js` for ESM support:
   ```javascript
   export default {
     transform: {},
     extensionsToTreatAsEsm: ['.js'],
     testEnvironment: 'node',
     moduleNameMapper: {
       '^(\\.{1,2}/.*)\\.js$': '$1'
     }
   };
   ```

2. Or switch to Node.js native test runner:
   ```bash
   NODE_OPTIONS='--experimental-vm-modules' npm test
   ```

3. Verify all tests pass after configuration fix

---

### New Issue #15: REST API Error Format Inconsistency 🆕

**Problem:** REST API routes don't use standardized error format.

**Current State:**
```javascript
// src/routes/api.js - Uses plain object format
res.status(500).json({ error: "Failed to get camera status" });
res.status(503).json({ error: "No camera available" });
```

**Should Be:**
```javascript
import { createApiError, ErrorCodes, Components } from '../utils/error-handlers.js';

res.status(500).json(createApiError("Failed to get camera status", {
  code: ErrorCodes.SYSTEM_ERROR,
  component: Components.API_ROUTER
}));
```

**Scope:**
- All endpoints in `src/routes/api.js`
- Approximately 60+ endpoints
- Need to review each error response

**Benefits:**
- Consistent error format across REST and WebSocket APIs
- Better error tracking with codes and components
- Easier client-side error handling
- Matches API specification documentation

---

### New Issue #16: Mixed Error Response Formats in WebSocket Handler 🆕

**Problem:** `sendOperationResult()` creates different response format than `sendError()`.

**sendError() Format (Standard):**
```javascript
{
  type: "error",
  timestamp: "2024-01-01T12:00:00.000Z",
  error: {
    message: "...",
    code: "...",
    operation: "...",
    component: "..."
  }
}
```

**sendOperationResult() Format (Different):**
```javascript
{
  type: "network_connect_result",  // Different type pattern!
  success: false,
  error: "...",  // Error is just a string!
  timestamp: "2024-01-01T12:00:00.000Z"
}
```

**Used By:**
- `handleNetworkConnect()` (line 608, 630)
- Potentially other network operations

**Fix Options:**

**Option A:** Eliminate `sendOperationResult()`, use standard error + success response:
```javascript
// For errors:
sendError(ws, message, options);

// For success:
sendResponse(ws, 'network_connect_result', { success: true, network: ssid });
```

**Option B:** Standardize `sendOperationResult()` format:
```javascript
const sendOperationResult = (ws, operation, success, data, error) => {
  if (success) {
    sendResponse(ws, `${operation}_result`, { success: true, ...data });
  } else {
    sendError(ws, error, { operation, code: ErrorCodes.OPERATION_FAILED });
  }
};
```

**Recommendation:** Option A - Eliminate the function, use standard patterns

---

## Phased Implementation Plan

### Phase 1: Complete Error Standardization ✅ **COMPLETE**

**Goal:** Achieve 100% consistent error format across all APIs

**Duration:** 2-3 days
**Completed:** 2025-09-29 (commit 7d786ec)

**Tasks:**
1. **Fix Test Suite** (Priority: Critical)
   - Configure Jest for ESM support
   - Run existing tests, fix any failures
   - Verify all error standardization tests pass

2. **Refactor REST API Error Responses** (Priority: High)
   - Import error handlers into `src/routes/api.js`
   - Update all `res.json({ error: "..." })` calls
   - Add appropriate error codes and components
   - Test all API error responses

3. **Eliminate sendOperationResult()** (Priority: High)
   - Identify all uses of `sendOperationResult()`
   - Replace with `sendError()` or `sendResponse()`
   - Remove the function
   - Update tests

4. **Validation** (Priority: High)
   - Run error standardization tests
   - Verify WebSocket error format
   - Verify REST API error format
   - Update API specification docs if needed

**Success Criteria:**
- ✅ All tests pass
- ✅ Single error format used everywhere
- ✅ Error codes used consistently
- ✅ Component tracking on all errors
- ✅ Documentation matches implementation

**Files Modified:**
- `src/routes/api.js` - Add error handler imports, update all error responses
- `src/websocket/handler.js` - Remove `sendOperationResult()`
- `jest.config.js` - Update for ESM support
- `test/errors/error-standardization.test.js` - Update expectations

---

### Phase 2: Event Naming Audit and Standardization ✅ **COMPLETE**

**Goal:** Achieve consistent event naming across entire codebase

**Duration:** 3-4 days
**Completed:** 2025-09-29 (commit 7d786ec)
**Note:** Dual emission strategy maintains backward compatibility during transition

**Tasks:**
1. **Audit All Event Names** (Priority: Medium)
   - Search for `broadcastEvent(`, `emit(`, `on(` calls
   - Document all event names used
   - Categorize by naming pattern (snake_case vs camelCase)
   - Create event inventory spreadsheet

2. **Decide Naming Convention** (Priority: Medium)
   - Evaluate consistency with message types (currently snake_case)
   - Document decision in CLAUDE.md
   - Create naming guidelines

3. **Create Migration Plan** (Priority: Medium)
   - Identify event names to change
   - Create renaming map
   - Plan backward compatibility if needed
   - Estimate impact on frontend

4. **Implement Standardization** (Priority: Medium)
   - Update event emissions throughout codebase
   - Update event listeners
   - Update schemas
   - Add naming convention tests

5. **Update Documentation** (Priority: Medium)
   - Update API specification with all event names
   - Update data-flow-and-events.md
   - Create event naming reference

**Success Criteria:**
- ✅ All events use consistent naming convention
- ✅ Event inventory documented
- ✅ Naming convention enforced by tests
- ✅ Frontend updated for new event names
- ✅ Documentation complete

**Files Modified:**
- Multiple files across src/ (event emissions)
- `test/schemas/websocket-message-schemas.js` - Update event schemas
- `docs/design/api-specification.md` - Document all events
- `docs/design/data-flow-and-events.md` - Update event documentation

---

### Phase 3: Documentation Updates ⏸️ **PAUSED**

**Goal:** Complete all missing design documentation

**Duration:** 2-3 days
**Status:** Paused - CCAPI audit took priority (now complete)
**Note:** Paused to complete CCAPI usage audit against official Canon documentation. See ccapi-audit-report.md.

**Tasks:**
1. **Create Error Recovery Documentation** (Priority: Medium)
   - Document shutter stuck recovery sequence
   - Document connection loss recovery
   - Document network failure recovery
   - Document session interruption recovery
   - Add sequence diagrams for each scenario
   - Create `docs/design/error-recovery-sequences.md`

2. **Document WebSocket Connection Lifecycle** (Priority: Medium)
   - Connection establishment process
   - Authentication (if any)
   - Keepalive mechanism
   - Reconnection strategy
   - Connection limits
   - Add to `docs/design/websocket-connection-lifecycle.md`

3. **Document Session Persistence Guarantees** (Priority: Medium)
   - Session state persistence mechanism
   - Crash recovery behavior
   - Cross-reboot recovery
   - Data consistency guarantees
   - Add to `docs/design/intervalometer-system.md`

4. **Document Network Transition Handling** (Priority: Medium)
   - Camera IP change detection
   - Reconnection during network switch
   - Session continuity during transitions
   - Timeout and retry logic
   - Add to `docs/design/network-management.md`

**Success Criteria:**
- ✅ All error recovery scenarios documented
- ✅ Connection lifecycle fully described
- ✅ Session persistence guarantees clear
- ✅ Network transition behavior documented
- ✅ Sequence diagrams added where needed

**Files Created/Updated:**
- `docs/design/error-recovery-sequences.md` (new)
- `docs/design/websocket-connection-lifecycle.md` (new)
- `docs/design/intervalometer-system.md` (update)
- `docs/design/network-management.md` (update)
- `docs/design/architecture-overview.md` (update with new doc references)

---

### Phase 4: Advanced Issues Investigation (LOWER PRIORITY)

**Goal:** Investigate and address remaining unknown issues

**Duration:** 4-5 days

**Tasks:**
1. **Network Transition Race Condition Testing** (Priority: Low-Medium)
   - Set up test environment with camera and Pi
   - Test WiFi network switching during operations
   - Monitor camera connection during transitions
   - Test intervalometer session continuity
   - Document findings
   - Fix any issues found

2. **Session Persistence Verification** (Priority: Low-Medium)
   - Test system crash during session
   - Test power loss during photo capture
   - Verify session recovery behavior
   - Test cross-reboot session recovery
   - Document actual behavior vs expected
   - Implement improvements if needed

3. **Message Ordering Investigation** (Priority: Low)
   - Trace critical event emission sequences
   - Identify order-dependent operations
   - Test for race conditions
   - Document ordering guarantees
   - Add sequence numbers if needed

4. **Time Sync Edge Cases** (Priority: Low-Medium)
   - Write edge case unit tests
   - Test wildly incorrect times
   - Test timezone changes
   - Test DST transitions
   - Test GPS accuracy validation
   - Document acceptable ranges
   - Implement validation logic

5. **Camera Compatibility Testing** (Priority: Low)
   - Test with multiple Canon camera models
   - Document which models support time sync
   - Implement model detection
   - Add compatibility checks
   - Update documentation with supported models

6. **Broadcast Efficiency Analysis** (Priority: Low)
   - Add performance metrics
   - Measure bandwidth usage with multiple clients
   - Evaluate if optimization needed
   - Implement subscription model if justified
   - Otherwise document that current approach is acceptable

**Success Criteria:**
- ✅ All unknowns investigated and documented
- ✅ Race conditions identified and fixed (if any)
- ✅ Edge cases tested and handled
- ✅ Camera compatibility matrix created
- ✅ Performance characteristics documented

**Files Modified:**
- Multiple test files for edge cases
- `src/timesync/service.js` - Add validation logic
- `src/discovery/manager.js` - Add camera model detection
- Documentation updates based on findings

---

### Phase 5: Testing and Validation (VALIDATION PHASE)

**Goal:** Comprehensive test coverage for all WebSocket functionality

**Duration:** 2-3 days

**Tasks:**
1. **Expand Test Coverage** (Priority: Medium)
   - Add tests for all error recovery scenarios
   - Add tests for network transition handling
   - Add tests for session persistence
   - Add tests for edge cases
   - Achieve >80% code coverage

2. **Integration Testing** (Priority: Medium)
   - Test complete workflows end-to-end
   - Test error scenarios across component boundaries
   - Test network transitions with camera
   - Test session recovery scenarios

3. **Performance Testing** (Priority: Low)
   - Test with multiple simultaneous clients
   - Measure broadcast overhead
   - Test under load
   - Document performance characteristics

4. **Documentation Validation** (Priority: Medium)
   - Verify all documentation matches implementation
   - Check all sequence diagrams are accurate
   - Verify API specification is complete
   - Review all issue resolutions

**Success Criteria:**
- ✅ Test coverage >80%
- ✅ All integration tests pass
- ✅ Performance acceptable for target hardware
- ✅ Documentation accurate and complete
- ✅ All issues resolved or documented

---

## Success Criteria

### Overall Success Metrics

**Quantitative:**
- ✅ 100% error standardization (single format everywhere)
- ✅ 100% event naming consistency (single convention)
- ✅ >80% test coverage for WebSocket handlers
- ✅ 13 of 13 original issues resolved or documented
- ✅ 0 critical issues remaining

**Qualitative:**
- ✅ Frontend developers can rely on consistent error handling
- ✅ Event names are predictable and well-documented
- ✅ Error recovery behavior is clear and tested
- ✅ Network transitions are reliable
- ✅ Documentation is accurate and complete

### Phase-Specific Success Criteria

**Phase 1 Success:**
- All tests pass
- Single error format used
- REST API consistent with WebSocket API
- Error codes used everywhere

**Phase 2 Success:**
- All events use same naming convention
- Event inventory is complete
- Naming enforced by tests
- Frontend updated

**Phase 3 Success:**
- All missing documentation created
- Sequence diagrams for error recovery
- Lifecycle documentation complete
- Persistence guarantees documented

**Phase 4 Success:**
- All unknowns investigated
- Edge cases tested
- Camera compatibility documented
- Performance characteristics known

**Phase 5 Success:**
- Comprehensive test coverage
- Integration tests pass
- Performance acceptable
- Documentation validated

---

## Risk Assessment

### High Risk Items

**1. Breaking Changes in Error Format** - MEDIUM RISK
- **Risk:** Frontend may depend on old error formats
- **Mitigation:**
  - Add backward compatibility layer initially
  - Coordinate with frontend team before deployment
  - Deploy changes together with frontend updates
  - Test thoroughly with actual frontend

**2. Event Name Changes** - MEDIUM RISK
- **Risk:** Frontend event listeners may break
- **Mitigation:**
  - Create comprehensive event mapping
  - Implement both old and new event names temporarily
  - Gradual migration with deprecation warnings
  - Test with frontend before removing old names

**3. Test Suite Overhaul** - LOW RISK
- **Risk:** Tests may reveal more issues than expected
- **Mitigation:**
  - Fix tests incrementally
  - Prioritize critical functionality
  - Accept temporary test failures for known issues
  - Document test failures as issues to address

### Medium Risk Items

**4. Network Transition Issues** - MEDIUM RISK
- **Risk:** May discover actual race conditions
- **Mitigation:**
  - Test thoroughly in controlled environment
  - Have rollback plan if issues found
  - May need architectural changes
  - Budget extra time for fixes

**5. Session Persistence Issues** - LOW-MEDIUM RISK
- **Risk:** Current implementation may not guarantee persistence
- **Mitigation:**
  - Document actual behavior first
  - Design improvements based on findings
  - May need significant refactoring
  - Consider acceptable tradeoffs

### Low Risk Items

**6. Broadcast Efficiency** - LOW RISK
- **Risk:** Optimization may not be necessary
- **Mitigation:**
  - Measure first, optimize only if needed
  - Current approach works for target use case
  - Can defer optimization to future phase

**7. Camera Compatibility** - LOW RISK
- **Risk:** May not have access to all camera models
- **Mitigation:**
  - Document tested models only
  - Provide compatibility warning
  - Community testing for other models
  - Graceful degradation for unsupported models

---

## Dependencies and Prerequisites

### External Dependencies
- **Hardware:** Raspberry Pi, Canon cameras for testing
- **Network:** WiFi networks for transition testing
- **Frontend:** Coordination needed for breaking changes

### Internal Dependencies
- **Phase 1** → All other phases (error format must be stable first)
- **Phase 2** → Frontend updates (event names must be coordinated)
- **Phase 3** → Implementation understanding (docs require code analysis)
- **Phase 4** → Hardware access (testing requires physical devices)
- **Phase 5** → All previous phases (validation comes last)

### Team Coordination Required
- Frontend team for error/event format changes
- DevOps for test environment setup
- Hardware access for compatibility testing

---

## Maintenance and Future Work

### Ongoing Maintenance

**After Implementation:**
1. **Error Format Enforcement**
   - Add pre-commit hooks to check error format
   - Add linting rules for error handling
   - Regular audits of new code

2. **Event Name Enforcement**
   - Add tests for new events
   - Document naming convention in CLAUDE.md
   - Code review checklist item

3. **Documentation Updates**
   - Update docs with every new feature
   - Review docs quarterly for accuracy
   - Keep sequence diagrams up to date

### Future Enhancements

**Potential Future Work (Out of Scope):**
1. **Client Authentication** - Add security layer
2. **Message Encryption** - Secure WebSocket communication
3. **Advanced Subscription Model** - Fine-grained event filtering
4. **Performance Optimization** - Only if measurements show need
5. **Multi-Camera Support** - Handle multiple cameras simultaneously
6. **Recording Capabilities** - Video recording support

---

## Appendix A: Quick Reference

### Error Format
```javascript
{
  type: "error",
  timestamp: "2024-01-01T12:00:00.000Z",
  error: {
    message: "Human-readable error message",
    code: "ERROR_CODE",
    operation: "operationName",
    component: "ComponentName",
    details: { /* optional */ }
  }
}
```

### Event Naming Convention
**Standard:** `snake_case` for all events
- Examples: `photo_taken`, `camera_discovered`, `session_started`
- NOT: `photoTaken`, `cameraDiscovered`, `sessionStarted`

### File References
- Error handlers: `src/utils/error-handlers.js`
- WebSocket handler: `src/websocket/handler.js`
- Message schemas: `test/schemas/websocket-message-schemas.js`
- Error tests: `test/errors/error-standardization.test.js`

---

## Appendix B: Issue Status Tracking

| Phase | Issue | Status | Completed Date |
|-------|-------|--------|----------------|
| 1 | Fix test suite | ✅ Complete | 2025-09-29 |
| 1 | REST API errors | ✅ Complete | 2025-09-29 |
| 1 | Remove sendOperationResult | ✅ Complete | 2025-09-29 |
| 2 | Event naming audit | ✅ Complete | 2025-09-29 |
| 2 | Event standardization | ✅ Complete | 2025-09-29 |
| 3 | Error recovery docs | ⏭️ Next Up | - |
| 3 | Connection lifecycle docs | ⏭️ Next Up | - |
| 3 | Session persistence docs | ⏭️ Next Up | - |
| 3 | Network transition docs | ⏭️ Next Up | - |
| 4 | Network transition testing | 🔴 Not Started | - |
| 4 | Time sync edge cases | 🔴 Not Started | - |
| 4 | Camera compatibility | 🔴 Not Started | - |
| 5 | Integration testing | 🔴 Not Started | - |
| 5 | Documentation validation | 🔴 Not Started | - |

---

**Document End**

*This plan will be updated as implementation progresses and new information is discovered.*