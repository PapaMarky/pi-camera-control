# Time Synchronization Algorithm Analysis

**Date:** 2025-10-08
**Status:** Phase 2 In Progress
**Purpose:** Analyze proposed time sync improvements for logical consistency

---

## Implementation Status

### ✅ Phase 0: Document Completion (COMPLETE)

- Updated design document with user feedback
- Added camera sync checks to Rules 1 and 2
- Added handleClientFailover() function definition
- Updated handleResyncTimer() pseudocode with failover cascade
- Added resync failover rows to State Transition Matrix
- Added design question about wlan0 failover logic
- **Committed:** 2025-10-09

### ✅ Phase 1: PiProxyState Class & Tests (COMPLETE)

- Created `src/timesync/pi-proxy-state.js` with full implementation
- Created comprehensive test suite: `test/unit/pi-proxy-state.test.js`
- **42/42 tests passing** - 100% coverage of state management
- Three states: 'none', 'ap0-device', 'wlan0-device'
- 10-minute validity window implemented
- State transitions and automatic expiry working
- **Committed:** 2025-10-09

### 🔄 Phase 2: ap0 Sync with State Integration (IN PROGRESS)

**Completed:**

- ✅ Configuration updates in `src/timesync/state.js`:
  - Added RESYNC_INTERVAL: 5 minutes
  - Added STATE_VALIDITY_WINDOW: 10 minutes
- ✅ Integration tests written: `test/integration/timesync-ap0-state.test.js`
  - 16 test cases covering ap0 sync scenarios
  - Tests for state transitions, failover, validity window

**Remaining:**

- ⏳ Import PiProxyState into `src/timesync/service.js`
- ⏳ Update `handleClientConnection()` to use state checking
- ⏳ Implement resync timer with failover cascade
- ⏳ Fix timer issues in integration tests
- ⏳ Verify all tests pass (635+ total)

**Next Steps for Fresh Session:**

1. Import PiProxyState class into TimeSync service
2. Add piProxyState instance to TimeSyncService constructor
3. Update handleClientConnection() - check if state is already 'ap0-device'
4. Implement resync timer that updates acquiredAt every 5 minutes
5. Add handleClientFailover() function to service
6. Update resync to call failover when original client disconnects
7. Run integration tests and fix timer-related issues
8. Run full test suite to ensure no regressions

### ⏳ Phase 3: wlan0 with State Priority (NOT STARTED)

### ⏳ Phase 4: Camera Sync with State (NOT STARTED)

### ⏳ Phase 5: WebSocket Client Interface Tracking (NOT STARTED)

### ⏳ Phase 6: Integration Testing (NOT STARTED)

---

---

## Reliability Hierarchy

### Correct Understanding:

1. **ap0 client** (most reliable)
   - Physically close to Pi (must be within WiFi range)
   - Operator-controlled device
   - Most trustworthy time source

2. **wlan0 client** (reliable)
   - Connected over shared WiFi
   - Less physically secure than ap0
   - Still operator-controlled

3. **camera** (more reliable than standalone Pi)
   - Has battery-backed RTC
   - Maintains time when powered off
   - More reliable than Pi without recent sync

4. **Pi** (least reliable standalone)
   - NO battery-backed RTC
   - Loses time accuracy when powered off
   - Only reliable as **proxy** when synced to client recently

### Key Principle:

> "The Pi should never be considered reliable because its RTC does not have a battery."

The Pi can only be considered reliable when it acts as a **proxy** for a recent client sync.

---

## Pi Proxy State Concept

To simplify synchronization logic, we track the **Pi Proxy State** which represents what time source (if any) the Pi is currently acting as a proxy for.

### State Values:

```javascript
piProxyState: {
  state: 'none' | 'ap0-device' | 'wlan0-device',
  acquiredAt: Date,      // When this state was acquired
  clientIP: string       // IP of sync source (if applicable)
}
```

#### State Meanings:

**`none`** - Pi is not a proxy

- No client sync has occurred, OR
- Last client sync was >10 minutes ago (expired)
- Pi time is unreliable

**`ap0-device`** - Pi is proxy for ap0 client

- Pi synced from ap0 client within last 10 minutes
- Pi time is reliable (backed by ap0 device)
- Resync timer active (every 5 minutes)

**`wlan0-device`** - Pi is proxy for wlan0 client

- Pi synced from wlan0 client within last 10 minutes
- No ap0 sync occurred within last 10 minutes
- Pi time is reliable (backed by wlan0 device)
- Resync timer active (every 5 minutes)

### State Validity:

**State is considered valid if:**

- `(current time - acquiredAt) < 10 minutes`

**When state becomes invalid:**

- State automatically transitions to `none`
- Pi proxy status expires
- Pi time is no longer reliable

### State Transitions:

```
none → ap0-device     : ap0 client syncs Pi, checks to see if camera needs sync
none → wlan0-device   : wlan0 client syncs Pi (no recent ap0), checks to see if camera needs sync

ap0-device → ap0-device   : ap0 resync (every 5 min)
ap0-device → none         : State expires (>10 min) OR all ap0 clients disconnect
ap0-device → ap0-device   : wlan0 connects (ignored)

wlan0-device → ap0-device : ap0 client connects and syncs
wlan0-device → wlan0-device : wlan0 resync (every 5 min, if no ap0)
wlan0-device → none       : State expires (>10 min) OR all wlan0 clients disconnect
```

### Benefits of State-Based Approach:

✅ **Simpler logic**: Check one state variable instead of multiple conditions
✅ **Clear semantics**: State name clearly indicates what Pi represents
✅ **Automatic expiry**: Built-in 10-minute validity window
✅ **Easy transitions**: Explicit state machine with clear triggers
✅ **Better logging**: Can log state changes for debugging

---

## Proposed Algorithm (State-Based)

### Rule 1: ap0 Client Connection

```
When ap0 client connects:
0. If piProxyState.state == 'ap0-device':
   - Ignore this connection (already have ap0 proxy)
   - Return early
1. If |Pi time - client time| > 1 second:
   - Sync Pi from ap0 client
2. Update piProxyState:
   - state = 'ap0-device'
   - acquiredAt = now
   - clientIP = client's IP
3. Start resync timer (5 minutes)
4. Check if camera is connected:
   - If yes, apply Rule 3A to sync camera
```

**On resync (every 5 minutes while ap0 connected):**

```
If ap0 connection is still active:
  1. If |Pi time - client time| > 1 second:
     - Sync Pi from ap0 client
  2. Update piProxyState.acquiredAt = now
Otherwise:
  1. If previous ap0 connection is lost, any existing ap0 connection will be treated as a new connection.
  Otherwise:
  2. If no ap0 connections are available, any existing wlan0 connection will be treated as a new connection.
  Otherwise:
  3. State transitions to "none"
```

**Clarification:** "Sync" means reset Pi's system time if difference exceeds 1 second.

---

### Rule 2: wlan0 Client Connection

```
When wlan0 client connects:
1. Check piProxyState:

   a) If state == 'ap0-device' AND state is valid (<10 min old):
      → Ignore wlan0 completely (ap0 is better source)
      → Do NOT start wlan0 sync

   b) If state == 'wlan0-device' AND state is valid:
      → Already syncing from wlan0, continue

   c) If state == 'none' OR state == 'ap0-device' (but expired):
      → Proceed with wlan0 sync:
         - If |Pi time - client time| > 1 second: Sync Pi
         - Update piProxyState:
           * state = 'wlan0-device'
           * acquiredAt = now
           * clientIP = client's IP
         - Start resync timer (5 minutes)
         - Check if camera is connected:
           * If yes, apply Rule 3A to sync camera
```

**On resync (every 5 minutes while wlan0 connected):**

```
Before each wlan0 resync:
1. Check: Is any ap0 client connected?
   → YES: Cancel wlan0 timer, transition to ap0
   → NO: Continue

2. Check: Is piProxyState == 'ap0-device' AND valid?
   → YES: Skip this resync, wait for ap0
   → NO: Perform wlan0 resync:
      - If |Pi time - client time| > 1 second: Sync Pi
      - Update piProxyState.acquiredAt = now
```

---

### Rule 3A: Camera Connection with Client Available

```
When camera connects AND (ap0 OR wlan0) client is connected:

1. Select client (preference: ap0 > wlan0)
2. Sync Pi from client:
   - If |Pi time - client time| > 1 second: Sync Pi
   - Update piProxyState to reflect client type
3. Sync camera from Pi:
   - Camera gets client time via Pi proxy
```

---

### Rule 3B: Camera Connection without Client

```
When camera connects AND no client connected:

1. Check piProxyState:

   a) If state == 'ap0-device' OR 'wlan0-device' AND valid (<10 min old):
      → Pi is valid proxy
      → Sync camera from Pi
      → Camera gets recent client time

   b) If state == 'none' OR state is invalid (>10 min old):
      → Pi is stale
      → If |Pi time - camera time| > 1 second:
         * Sync Pi FROM camera (camera battery RTC > Pi no-battery)
         * Update piProxyState:
           - state = 'none'  (Pi not a proxy, just got time from camera)
           - acquiredAt = now
           - clientIP = null
```

**Important:** When syncing Pi from camera, state becomes `none` because Pi is not acting as a proxy for a client. Pi just has camera time.

---

### Rule 4: Client Disconnection

```
When ap0 client disconnects:
1. If this was the last ap0 client:
   - Cancel ap0 resync timer
   - Check for wlan0 clients:
     a) If wlan0 client(s) connected:
        → Transition to wlan0 (apply Rule 2)
     b) If no wlan0 clients:
        → State remains 'ap0-device' until it expires (10 min)
        → Pi continues as proxy until expiry

When wlan0 client disconnects:
1. If this was the last wlan0 client:
   - Cancel wlan0 resync timer
   - Check for ap0 clients:
     a) If ap0 client(s) connected:
        → Transition to ap0 (apply Rule 1)
     b) If no ap0 or wlan0 clients:
        → State remains 'wlan0-device' until it expires (10 min)
        → Pi continues as proxy until expiry
```

**Rationale:** State persists after client disconnects to maintain proxy validity window. Pi time is still accurate for up to 10 minutes after last sync.

---

## State Transition Matrix

| Current State  | Event                                  | New State        | Action                             |
| -------------- | -------------------------------------- | ---------------- | ---------------------------------- |
| `none`         | ap0 connects                           | `ap0-device`     | Sync from ap0, start timer         |
| `none`         | wlan0 connects                         | `wlan0-device`   | Sync from wlan0, start timer       |
| `none`         | State age >10 min                      | `none`           | (already none)                     |
| `ap0-device`   | ap0 resync (same client)               | `ap0-device`     | Sync from ap0, update acquiredAt   |
| `ap0-device`   | ap0 resync (client lost, has ap0)      | `ap0-device`     | Failover to different ap0 client   |
| `ap0-device`   | ap0 resync (client lost, has wlan0)    | `wlan0-device`   | Failover to wlan0 client           |
| `ap0-device`   | ap0 resync (client lost, no clients)   | `none`           | No fallback available              |
| `ap0-device`   | wlan0 connects                         | `ap0-device`     | Ignore wlan0                       |
| `ap0-device`   | ap0 disconnects (has wlan0)            | `wlan0-device`   | Switch to wlan0                    |
| `ap0-device`   | ap0 disconnects (no wlan0)             | `ap0-device`\*   | Continue until expires             |
| `ap0-device`   | State age >10 min                      | `none`           | State expires, proxy invalid       |
| `wlan0-device` | ap0 connects                           | `ap0-device`     | Sync from ap0, cancel wlan0 timer  |
| `wlan0-device` | wlan0 resync (same client, no ap0)     | `wlan0-device`   | Sync from wlan0, update acquiredAt |
| `wlan0-device` | wlan0 resync (client lost, has wlan0)  | `wlan0-device`   | Failover to different wlan0 client |
| `wlan0-device` | wlan0 resync (client lost, no clients) | `none`           | No fallback available              |
| `wlan0-device` | wlan0 resync (ap0 valid)               | `wlan0-device`\* | Skip resync, wait for ap0          |
| `wlan0-device` | wlan0 disconnects (no ap0)             | `wlan0-device`\* | Continue until expires             |
| `wlan0-device` | State age >10 min                      | `none`           | State expires, proxy invalid       |

\*State persists after disconnect to maintain proxy validity window

---

## Analysis Results

### ✅ Algorithm is Logically Sound

With the Pi Proxy State concept, all rules are **consistent and clear**:

1. **Hierarchy enforced**: ap0 > wlan0 via state priority
2. **No contradictions**: State transitions are explicit
3. **Automatic expiry**: 10-minute validity prevents stale proxy
4. **Clear proxy semantics**: State name indicates what Pi represents

---

## Implementation Requirements

### Pi Proxy State Structure:

```javascript
class PiProxyState {
  constructor() {
    this.state = "none"; // 'none' | 'ap0-device' | 'wlan0-device'
    this.acquiredAt = null; // Date when state was acquired
    this.clientIP = null; // IP of sync source
  }

  /**
   * Check if current state is valid (within 10-minute window)
   */
  isValid() {
    if (this.state === "none") return false;
    if (!this.acquiredAt) return false;

    const ageMs = Date.now() - this.acquiredAt.getTime();
    const VALIDITY_WINDOW = 10 * 60 * 1000; // 10 minutes

    return ageMs < VALIDITY_WINDOW;
  }

  /**
   * Update state after sync
   */
  updateState(newState, clientIP) {
    this.state = newState;
    this.acquiredAt = new Date();
    this.clientIP = clientIP;
  }

  /**
   * Expire state (automatic after 10 minutes)
   */
  expire() {
    if (this.state !== "none" && !this.isValid()) {
      this.state = "none";
      this.acquiredAt = null;
      this.clientIP = null;
    }
  }

  /**
   * Get current state info
   */
  getInfo() {
    return {
      state: this.state,
      valid: this.isValid(),
      acquiredAt: this.acquiredAt,
      ageSeconds: this.acquiredAt
        ? Math.floor((Date.now() - this.acquiredAt.getTime()) / 1000)
        : null,
      clientIP: this.clientIP,
    };
  }
}
```

### Full State Tracking:

```javascript
{
  // Pi proxy state (core)
  piProxyState: PiProxyState,

  // Connected clients
  connectedClients: {
    ap0: [{ ip: string, ws: WebSocket }],
    wlan0: [{ ip: string, ws: WebSocket }]
  },

  // Active resync timer
  resyncTimer: NodeJS.Timeout | null,

  // Camera sync info
  lastCameraSync: Date | null
}
```

### Simplified Camera Sync Logic:

```javascript
function decideCameraSync() {
  const hasAp0 = connectedClients.ap0.length > 0;
  const hasWlan0 = connectedClients.wlan0.length > 0;

  if (hasAp0 || hasWlan0) {
    // Rule 3A: Client available - use client as source
    const client = hasAp0 ? connectedClients.ap0[0] : connectedClients.wlan0[0];
    const clientState = hasAp0 ? "ap0-device" : "wlan0-device";

    syncPiFromClient(client);
    piProxyState.updateState(clientState, client.ip);
    syncCameraFromPi();
  } else if (piProxyState.isValid()) {
    // Rule 3B (part 1): No client, but Pi is valid proxy
    syncCameraFromPi();
  } else {
    // Rule 3B (part 2): No client, Pi stale - use camera
    const drift = Math.abs(getPiTime() - getCameraTime());

    if (drift > 1000) {
      // 1 second threshold
      syncPiFromCamera();
      piProxyState.updateState("none", null); // Pi not a proxy
    }
  }
}
```

### Client Failover Handler:

```javascript
/**
 * Handle client disconnect with fallback to other clients
 *
 * "Treat as new connection" means:
 * - Cancel current resync timer
 * - Run the connection handler (Rule 1 or Rule 2) for the fallback client
 * - This resets state and starts fresh sync cycle
 */
function handleClientFailover(lostInterface) {
  if (lostInterface === "ap0") {
    // ap0 client lost during resync
    const availableAp0 = connectedClients.ap0.filter(
      (client) => client.isConnected,
    );
    const availableWlan0 = connectedClients.wlan0.filter(
      (client) => client.isConnected,
    );

    if (availableAp0.length > 0) {
      // Treat different ap0 client as new connection
      logger.info("ap0 client lost - failing over to different ap0 client");
      handleClientConnect(availableAp0[0].ip, "ap0");
    } else if (availableWlan0.length > 0) {
      // Fallback to wlan0 as new connection
      logger.info("ap0 client lost - failing over to wlan0 client");
      handleClientConnect(availableWlan0[0].ip, "wlan0");
    } else {
      // No clients available
      logger.info("ap0 client lost - no fallback clients available");
      piProxyState.updateState("none", null);
      cancelResyncTimer();
    }
  } else if (lostInterface === "wlan0") {
    // wlan0 client lost during resync
    const availableWlan0 = connectedClients.wlan0.filter(
      (client) => client.isConnected,
    );

    if (availableWlan0.length > 0) {
      // Treat different wlan0 client as new connection
      logger.info("wlan0 client lost - failing over to different wlan0 client");
      handleClientConnect(availableWlan0[0].ip, "wlan0");
    } else {
      // No wlan0 clients available (ap0 would have already preempted)
      logger.info("wlan0 client lost - no fallback clients available");
      piProxyState.updateState("none", null);
      cancelResyncTimer();
    }
  }
}
```

### State-Based Decision Tree:

```javascript
function handleClientConnect(clientIP, interface) {
  if (interface === "ap0") {
    // ap0 always takes priority
    syncPiFromClient(clientIP);
    piProxyState.updateState("ap0-device", clientIP);
    startResyncTimer("ap0");
  } else if (interface === "wlan0") {
    // wlan0 defers to valid ap0 state
    if (piProxyState.state === "ap0-device" && piProxyState.isValid()) {
      logger.info("Ignoring wlan0 - ap0 proxy is valid");
      return; // Don't sync from wlan0
    }

    syncPiFromClient(clientIP);
    piProxyState.updateState("wlan0-device", clientIP);
    startResyncTimer("wlan0");
  }
}

function handleResyncTimer(timerType) {
  if (timerType === "ap0") {
    // Check if original ap0 client is still connected
    const originalClient = connectedClients.ap0.find(
      (c) => c.ip === piProxyState.clientIP,
    );

    if (originalClient && originalClient.isConnected) {
      // Original ap0 still active - normal resync
      const drift = Math.abs(getPiTime() - getClientTime(originalClient));
      if (drift > 1000) {
        // 1 second threshold
        syncPiFromClient(originalClient);
      }
      piProxyState.acquiredAt = new Date(); // Update timestamp only
    } else {
      // Original ap0 client lost - trigger failover cascade
      logger.info("ap0 resync: original client lost, triggering failover");
      handleClientFailover("ap0");
    }
  } else if (timerType === "wlan0") {
    // wlan0 must check for ap0 before each resync
    const hasAp0 = connectedClients.ap0.length > 0;
    if (hasAp0) {
      cancelResyncTimer();
      handleClientConnect(connectedClients.ap0[0].ip, "ap0");
      return;
    }

    if (piProxyState.state === "ap0-device" && piProxyState.isValid()) {
      logger.info("Skipping wlan0 resync - ap0 proxy still valid");
      return;
    }

    // Check if original wlan0 client is still connected
    const originalClient = connectedClients.wlan0.find(
      (c) => c.ip === piProxyState.clientIP,
    );

    if (originalClient && originalClient.isConnected) {
      // Original wlan0 still active - normal resync
      const drift = Math.abs(getPiTime() - getClientTime(originalClient));
      if (drift > 1000) {
        syncPiFromClient(originalClient);
      }
      piProxyState.acquiredAt = new Date(); // Update timestamp only
    } else {
      // Original wlan0 client lost - trigger failover cascade
      logger.info("wlan0 resync: original client lost, triggering failover");
      handleClientFailover("wlan0");
    }
  }
}
```

---

## Validation Test Cases

### Test 1: ap0 State Lifecycle ✅

```
T+0:   ap0 connects → State: none → ap0-device
T+5m:  ap0 resync → State: ap0-device (acquiredAt updated)
T+10m: ap0 resync → State: ap0-device (acquiredAt updated)
T+15m: ap0 disconnects → State: ap0-device (persists)
T+16m: State expires → State: none
Result: ✅ State lifecycle correct
```

### Test 2: wlan0 Defers to Valid ap0 State ✅

```
T+0:   ap0 connects → State: ap0-device
T+8m:  ap0 disconnects → State: ap0-device (still valid)
T+9m:  wlan0 connects → State: ap0-device (wlan0 ignored)
T+11m: State expires → State: none
T+11m: wlan0 reconnects → State: wlan0-device
Result: ✅ wlan0 correctly defers to ap0 state
```

### Test 3: wlan0 Yields to ap0 ✅

```
T+0:   wlan0 connects → State: wlan0-device
T+2m:  ap0 connects → State: ap0-device (transition)
T+7m:  wlan0 resync fires → Ignored (ap0 active)
Result: ✅ State transition wlan0 → ap0 works
```

### Test 4: Camera Sync Uses State ✅

```
T+0:   ap0 connects → State: ap0-device
T+4m:  ap0 disconnects → State: ap0-device (valid)
T+6m:  Camera connects → Sync camera from Pi (state valid)
T+11m: State expires → State: none
T+12m: Camera connects → Sync Pi from camera (state invalid)
Result: ✅ Camera sync uses state validity correctly
```

### Test 5: Multiple ap0 Clients ✅

```
T+0:   ap0 client A connects → State: ap0-device (A)
T+2m:  ap0 client B connects → State: ap0-device (continue A)
T+5m:  Client A disconnects → State: ap0-device (switch to B)
Result: ✅ Seamless failover within same state
```

### Test 6: State Expiry Prevents Stale Proxy ✅

```
T+0:   ap0 connects → State: ap0-device
T+10m: ap0 disconnects → State: ap0-device (persists)
T+15m: Camera connects → State expired, sync Pi from camera
Result: ✅ 10-minute expiry prevents stale proxy
```

---

## Hierarchy Enforcement Validation

### Allowed (with state tracking) ✅

| Operation   | When Allowed                  | State Change     |
| ----------- | ----------------------------- | ---------------- |
| ap0 → Pi    | Always                        | → `ap0-device`   |
| wlan0 → Pi  | State != `ap0-device` (valid) | → `wlan0-device` |
| Pi → Camera | State == any valid            | (no change)      |
| Camera → Pi | State == `none` or expired    | → `none`         |

### Never Allowed ❌

| Operation       | Why Prevented                      | State Check     |
| --------------- | ---------------------------------- | --------------- |
| wlan0 → Pi      | When state == `ap0-device` (valid) | ✅ Prevented    |
| Camera → Pi     | When state == valid proxy          | ✅ Prevented    |
| Camera → Client | Never in algorithm                 | ✅ Not possible |

**All hierarchy rules enforced via state checks!** ✅

---

## Configuration Changes

### Current (`src/timesync/state.js`):

```javascript
{
  DRIFT_THRESHOLD: 1000,              // 1 second
  RELIABILITY_WINDOW: 15 * 60 * 1000, // 15 minutes
  SYNC_CHECK_INTERVAL: 15 * 60 * 1000, // 15 minutes
  AP_ONLY_AUTO_SYNC: true              // Only ap0
}
```

### Required Changes:

```javascript
{
  DRIFT_THRESHOLD: 1000,              // 1 second (unchanged)
  RESYNC_INTERVAL: 5 * 60 * 1000,     // 5 minutes (was 15 min)
  STATE_VALIDITY_WINDOW: 10 * 60 * 1000, // 10 minutes (new)
  AP_ONLY_AUTO_SYNC: false             // Support wlan0 (was true)
}
```

**Note:** `STATE_VALIDITY_WINDOW` (10 min) is longer than `RESYNC_INTERVAL` (5 min) to provide 2x overlap for reliability.

---

## Implementation Phases

### Phase 1: Pi Proxy State (Foundation)

**Deliverable:** PiProxyState class with state tracking

- Create `PiProxyState` class
- Add `isValid()` check
- Add `updateState()` and `expire()` methods
- Add state logging

**Risk:** Low - New code, no changes to existing

---

### Phase 2: ap0 with State (Low Risk)

**Deliverable:** ap0 syncing using state

- Update ap0 sync to use `piProxyState`
- Change resync interval 15min → 5min
- Update state on each sync

**Risk:** Low - Only changes ap0 timing

---

### Phase 3: wlan0 with State Priority (Medium Risk)

**Deliverable:** wlan0 with ap0 deference

- Add wlan0 sync capability
- Implement state-based priority checks
- Add wlan0 resync with ap0 check

**Risk:** Medium - New feature with state logic

---

### Phase 4: Camera Sync with State (Medium Risk)

**Deliverable:** Camera sync using state validity

- Implement `decideCameraSync()` with state
- Add camera→Pi when state invalid
- Remove camera→Pi when state valid

**Risk:** Medium - Behavior change

---

### Phase 5: Testing (High Priority)

**Deliverable:** Complete test coverage

- Unit tests for PiProxyState
- State transition tests
- Integration tests for all scenarios
- Manual Pi testing

**Risk:** Low - Testing only

---

## Questions for Review

1. **10-minute state validity**: Is this the right window? Should it match the 15-minute RELIABILITY_WINDOW or be independent?

2. **State persistence after disconnect**: Should state persist for full 10 minutes after last client disconnects, or expire immediately?

3. **5-minute resync**: Is 5 minutes aggressive enough, or should we reduce to 3 minutes for tighter sync?

4. **Camera→Pi state**: When camera syncs Pi, should state be `none` or new state like `camera-device`?

5. **State expiry timing**: Should we actively check and expire state, or only check on-demand (lazy expiry)?

6. **wlan0 resync failover**: Should wlan0 resync also have failover logic when the syncing client disconnects? The current implementation includes this (handleClientFailover for both ap0 and wlan0), but is the simpler logic sufficient since ap0 would preempt anyway?

---

## Summary

### Key Innovation: Pi Proxy State

The **Pi Proxy State** concept simplifies the entire algorithm:

- ✅ Single state variable replaces multiple checks
- ✅ Explicit state machine with clear transitions
- ✅ Automatic 10-minute expiry
- ✅ Easy to log and debug
- ✅ Hierarchy enforcement via state priority

### Recommendation: **PROCEED WITH IMPLEMENTATION**

The state-based approach is cleaner, easier to implement, and easier to maintain than checking multiple conditions.

---

**End of Analysis**
