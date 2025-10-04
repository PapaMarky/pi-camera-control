# Overtime Feature Review - Action Plan

**Date Created:** 2025-10-03
**Status:** All High & Medium Priority Items Complete ✅ (2025-10-03)
**Reviews By:** backend-guardian, frontend-guardian

## Summary

Event polling integration and overtime detection have been implemented for the timelapse/intervalometer feature. Both backend and frontend guardian agents reviewed the changes and found the implementation to be high quality, but identified missing tests and documentation.

## Implementation Completed

### Backend Changes

- ✅ Integrated `waitForPhotoComplete` event polling utility into `TimelapseSession`
- ✅ Added overtime detection and stats tracking (overtimeShots, maxOvertimeSeconds, etc.)
- ✅ Added average shot duration calculation
- ✅ Emit `photo_overtime` events when shots exceed interval
- ✅ Updated WebSocket handler to broadcast overtime events
- ✅ Updated REST API to include overtime stats and averageShotDuration

### Frontend Changes

- ✅ Refactored to use backend stats as single source of truth
- ✅ Added overtime display with orange indicators
- ✅ Added average shot duration display
- ✅ Fixed WebSocket status_update to include intervalometer field
- ✅ Removed frontend stat tracking (prevents sync issues)

## Review Findings

### Backend Guardian: ✅ APPROVED (with minor doc update)

- **Pattern Compliance:** 100% ✅
- **Test Coverage:** 100% ✅ (all integration tests passing)
- **No Duplication:** ✅
- **Error Handling:** Excellent ✅

### Frontend Guardian: ✅ APPROVE WITH CHANGES

- **Architecture:** Correct (backend as source of truth) ✅
- **Code Quality:** Good ✅
- **Pattern Compliance:** Good ✅
- **Test Coverage:** Major gaps ❌
- **Documentation:** Incomplete ⚠️

## Required Actions (Priority Order)

### 🔴 HIGH PRIORITY - Must Fix Before Merge

#### ✅ 1. Update API Specification Documentation (Completed 2025-10-03)

**File:** `/docs/design/api-specification.md`

**Location:** GET /api/intervalometer/status response schema

**Completed:** Added `totalShotDurationSeconds` to stats object and `averageShotDuration` to response fields with detailed descriptions.

#### ✅ 2. Add Detailed Schema Validation for intervalometer Object (Completed 2025-10-03)

**File:** `/test/schemas/websocket-message-schemas.js`

**Completed:** Replaced vague `intervalometer: "object?"` with detailed schema including all stats fields, options, and averageShotDuration. All fields marked optional to support both active and inactive states.

#### ✅ 3. Add WebSocket Integration Test (Completed 2025-10-03)

**File:** `/test/integration/websocket-status-update.test.js` (created)

**Completed:** Created comprehensive integration test suite with 5 test cases:

- Complete intervalometer data validation
- status_update without intervalometer (optional validation)
- All overtime stats presence verification
- stop-after condition with totalShots
- stop-at condition with stopTime

**Test Results:** All 383 tests passing (18 test suites)

### 🟡 MEDIUM PRIORITY - Should Fix

#### ✅ 4. Add Frontend Unit Tests (Completed 2025-10-03)

**File:** `/test/frontend/camera-overtime.test.js` (created)

**Tests created (9 tests):**

- ✅ `updateOvertimeDisplay()` hides stats when overtimeCount === 0
- ✅ `updateOvertimeDisplay()` hides stats when stats object is empty
- ✅ `updateOvertimeDisplay()` shows stats when overtimeCount > 0
- ✅ Orange highlight applied when lastShotDuration > interval
- ✅ Orange highlight removed when lastShotDuration <= interval
- ✅ Edge case: lastShotDuration exactly equals interval
- ✅ Handles missing interval in options
- ✅ `photo_overtime` event handler logs to activity correctly
- ✅ Formats overtime message with decimal precision

**File:** `/test/frontend/camera-progress.test.js` (created)

**Tests created (15 tests):**

- ✅ Average shot duration displays correctly when session is running
- ✅ Shows "-" when no shots taken (avgDuration = 0)
- ✅ Shows calculated value when shots exist
- ✅ Formats average with one decimal place
- ✅ Hides element when session not running and avgDuration = 0
- ✅ Shows element when session stopped but avgDuration > 0
- ✅ Shows element when session completed and avgDuration > 0
- ✅ Handles missing averageShotDuration field
- ✅ Handles null elements gracefully
- ✅ Shows element when state is "running" regardless of avgDuration
- ✅ Handles various session states correctly
- ✅ Display logic integration tests (4 tests)

**Test Results:** All 407 tests passing (20 test suites, +24 new tests)

#### ✅ 5. Update Data Flow Documentation (Completed 2025-10-03)

**File:** `/docs/design/data-flow-and-events.md`

**Completed:** Added comprehensive "Overtime Detection Flow" section to Data Flow Patterns, including:

- 8-step flow diagram from shot measurement to UI update
- Key design decision documentation (backend as single source of truth)
- Code examples showing backend detection and frontend display logic
- Integration with existing event-driven architecture patterns

### 🟢 LOW PRIORITY - Nice to Have

#### ✅ 6. Improve Frontend Code Quality (Completed 2025-10-03)

**File:** `/public/js/camera.js`, `/public/index.html`, `/test/frontend/camera-overtime.test.js`

**Completed:**

- ✅ Added comprehensive input validation to `updateOvertimeDisplay()` with defensive null/undefined checks
- ✅ Added 8 new input validation tests covering edge cases (null, undefined, missing DOM, invalid values)
- ✅ Extracted magic number: `STATUS_POLL_INTERVAL_MS = 1000` as class constant
- ✅ Added WCAG 2.1 compliant accessibility attributes:
  - `role="status"` for all dynamic overtime/progress stats
  - `aria-live="polite"` for screen reader announcements
  - `aria-label` attributes with descriptive text for all stat elements
- ✅ Enhanced comment clarity on average shot duration display logic (lines 1851-1857)
  - Documented three display states: running, historical data, hidden
  - Explained rationale for showing "-" vs hiding element

**Test Results:** All 415 tests passing (8 new input validation tests added)

## Testing Checklist

Before marking complete:

- [x] All 362 existing tests still passing (415 tests now passing with code quality improvements)
- [x] New schema validation test passes (included in websocket-messages.test.js)
- [x] New WebSocket integration test passes (5 new tests in websocket-status-update.test.js)
- [x] Frontend unit tests pass (32 new tests in test/frontend/ - 24 original + 8 input validation)
- [ ] Manual testing on Pi shows stable overtime display
- [ ] No flickering of orange indicators
- [ ] Average shot duration updates correctly

## Files Modified in This Feature

### Backend

- `src/intervalometer/timelapse-session.js` - Event polling integration, overtime detection
- `src/websocket/handler.js` - Broadcast overtime events
- `src/routes/api.js` - Include overtime stats in REST response

### Frontend

- `public/js/camera.js` - Overtime display logic, use backend stats as source of truth
- `public/js/websocket.js` - Include intervalometer in status_update emission
- `public/index.html` - Add overtime stat display elements

### Tests (Existing)

- `test/integration/timelapse-event-polling.test.js` - Comprehensive overtime tests (PASSING ✅)
- `test/schemas/websocket-message-schemas.js` - Detailed intervalometer schema (PASSING ✅)

### Tests (Created)

- ✅ `test/integration/websocket-status-update.test.js` - WebSocket intervalometer field test (5 tests)
- ✅ `test/frontend/camera-overtime.test.js` - Frontend overtime display logic (9 tests)
- ✅ `test/frontend/camera-progress.test.js` - Frontend progress display logic (15 tests)

## Known Issues (Fixed in This Session)

1. ✅ Average shot duration showed "-" during timelapse
   - **Fix:** Added `averageShotDuration` to REST API response

2. ✅ Overtime stats fluctuating (going up and down)
   - **Fix:** Removed frontend stat tracking, use backend stats only

3. ✅ Orange indicator flickering on/off
   - **Fix:** Pass stats as parameters to `updateOvertimeDisplay()` instead of reading from stale state

## Next Session TODO

1. Start with HIGH PRIORITY items (documentation + schema validation)
2. Run all tests after each change
3. Update this plan as items are completed
4. Mark sections with ✅ when done
5. Create PR when all HIGH PRIORITY items complete
