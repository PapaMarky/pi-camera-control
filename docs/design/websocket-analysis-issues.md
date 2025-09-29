# WebSocket Analysis Issues Found

During the creation of sequence diagrams for the WebSocket API, several potential issues and inconsistencies were identified. This document summarizes these findings for future investigation and resolution.

## Message Schema Inconsistencies

### 1. **Multiple Error Response Patterns** (Known Issue)
**Status**: Already documented in API specification
**Impact**: High - Client code must handle multiple error formats

The system uses at least 4 different error response patterns:
- `{type: "error", data: {message: "..."}}`
- `{type: "operation_result", success: false, error: "..."}`
- `{type: "event", eventType: "operation_failed", data: {error: "..."}}`
- Standard error response with structured format

**Recommendation**: Implement the standardized error format defined in `websocket-message-schemas.js`.

### 2. **Missing Message Type Handlers**
**Status**: Potential gap identified
**Impact**: Medium - Some client message types may not be handled

From the schema definitions, these message types are defined but handlers may be missing:
- `get_camera_settings`
- `validate_interval`
- `wifi_enable` / `wifi_disable`
- `get_timelapse_reports`
- `update_report_title`

**Investigation needed**: Verify all schema-defined message types have corresponding handlers in `src/websocket/handler.js`.

### 3. **Event Type Naming Inconsistencies**
**Status**: Documentation vs Implementation mismatch
**Impact**: Medium - Events may not match documented names

Potential inconsistencies found:
- Schema uses `sessionStarted` vs documentation shows `session_started`
- Schema uses `cameraDiscovered` vs some events use `camera_discovered`
- Time sync events: `pi-sync` vs `pi_sync` naming pattern

**Recommendation**: Audit all event names for consistency between schemas, documentation, and implementation.

## Sequence Flow Issues

### 4. **Race Conditions in Network Transitions**
**Status**: Potential issue identified
**Impact**: High - Camera may be lost during network switches

The sequence diagrams reveal a potential race condition:
1. Client requests WiFi network change
2. Pi connects to new network (IP changes)
3. Camera may also change networks
4. Discovery manager tries to track camera IP changes
5. **Risk**: Brief period where camera is unreachable during transition

**Recommendation**: Implement connection state buffering during network transitions.

### 5. **Missing Error Recovery Sequences**
**Status**: Documentation gap
**Impact**: Medium - Complex error scenarios undocumented

Several error recovery flows are not fully documented:
- What happens if camera disconnects during intervalometer session?
- How are stuck shutter states handled?
- Network failure during critical operations
- WebSocket connection drops during long operations

**Recommendation**: Add comprehensive error recovery sequence diagrams.

### 6. **Intervalometer Session Persistence**
**Status**: Potential data loss risk
**Impact**: Medium - Unsaved sessions may be lost

The sequence shows unsaved session detection, but unclear scenarios:
- What if system crashes during session?
- How are in-progress sessions recovered?
- When exactly are sessions marked as "saved" vs "unsaved"?

**Investigation needed**: Verify session persistence guarantees and recovery mechanisms.

## WebSocket Message Flow Issues

### 7. **Client Connection Lifecycle**
**Status**: Incomplete documentation
**Impact**: Low - Connection management unclear

Missing documentation for:
- WebSocket reconnection strategies
- How clients detect and handle server restarts
- Maximum connection limits and behavior
- Heartbeat/ping-pong patterns (if any)

### 8. **Broadcast Efficiency Concerns**
**Status**: Potential performance issue
**Impact**: Medium - Unnecessary message traffic

From the code analysis:
- Status updates broadcast every 10 seconds to ALL clients
- Events broadcast to ALL clients regardless of interest
- No client-specific filtering or subscription model

**Recommendation**: Consider implementing client subscription patterns for high-frequency events.

### 9. **Message Ordering Guarantees**
**Status**: Unclear behavior
**Impact**: Medium - Client state synchronization

The sequences show multiple events that could arrive out-of-order:
- `sessionStarted` followed by rapid `photo_taken` events
- Network events during IP transitions
- Discovery events during camera reconnection

**Investigation needed**: Verify if message ordering is guaranteed and if clients depend on it.

## Time Synchronization Issues

### 10. **Time Sync Reliability Edge Cases**
**Status**: Potential edge cases
**Impact**: Medium - Time sync may fail silently

Identified scenarios not covered in sequences:
- What if client time is wildly incorrect (years off)?
- How are timezone changes handled?
- What happens if camera rejects time changes repeatedly?
- GPS time accuracy validation thresholds

### 11. **Camera Time Sync Camera Compatibility**
**Status**: Hardware dependency risk
**Impact**: Medium - May not work with all camera models

The sequence assumes:
- Camera accepts `POST /ccapi/ver100/functions/datetime`
- Camera responds with current time format as expected
- Camera time zone handling matches system expectations

**Investigation needed**: Test with multiple camera models to verify compatibility.

## Implementation vs Documentation Gaps

### 12. **Schema Field Mismatches**
**Status**: Documentation maintenance issue
**Impact**: Low - Client development confusion

Found in `websocket-message-schemas.js`:
- `power.uptime` field present in schema but missing from API documentation
- Some optional fields marked with `?` may not be consistently optional
- Event payload schemas may not match actual emitted data

**Recommendation**: Implement schema validation tests to catch these automatically.

### 13. **WebSocket Handler Function Names**
**Status**: Code organization issue
**Impact**: Low - Developer confusion

Some handler function names don't match message types:
- `handleStartIntervalometer` vs `start_intervalometer_with_title`
- Event type routing may be inconsistent

## Priority Recommendations

### High Priority
1. **Standardize error response format** - Use single error pattern
2. **Audit network transition race conditions** - Ensure camera tracking works
3. **Verify message type handler coverage** - All schema types should have handlers

### Medium Priority
4. **Add comprehensive error recovery documentation**
5. **Implement event naming consistency**
6. **Investigate session persistence guarantees**
7. **Consider client subscription patterns for broadcasts**

### Low Priority
8. **Document WebSocket connection lifecycle**
9. **Verify camera time sync compatibility**
10. **Update schema documentation consistency**

## Next Steps

1. **Immediate**: Run the existing test suite to verify current behavior
2. **Short-term**: Implement schema validation tests for all message types
3. **Medium-term**: Standardize error response patterns
4. **Long-term**: Add comprehensive integration tests for network transitions

This analysis is based on code review and documentation generation. Some issues may already be addressed in the implementation or may be false positives that require actual testing to verify.