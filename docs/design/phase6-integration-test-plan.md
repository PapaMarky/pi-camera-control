# Phase 6: Integration Testing Plan

**Date:** 2025-10-09
**Status:** IN PROGRESS
**System:** picontrol-002.local with Phase 5 code deployed

---

## Test Environment

**Hardware:**

- Pi: picontrol-002.local (Raspberry Pi Zero 2 W)
- Camera: Canon EOS R50 at 192.168.4.3 (connected to Pi AP)
- Test clients: Laptop/phone for ap0 and wlan0 testing

**Software:**

- Branch: usability-improvements (commit 9ab14c5)
- Service: pi-camera-control.service (running)
- Phase 5: Client tracking refactored to array structure

---

## How to Monitor Tests

### Real-time Logs

```bash
ssh pi@picontrol-002.local "sudo journalctl -u pi-camera-control -f"
```

### Filter for TimeSync Activity

```bash
ssh pi@picontrol-002.local "sudo journalctl -u pi-camera-control -f" | grep -E "(TimeSync|piProxyState|ap0|wlan0|Camera connected)"
```

### Check Current State

```bash
# Via API
curl http://192.168.4.1:3000/api/time-sync/status

# Via logs (last 100 lines)
ssh pi@picontrol-002.local "sudo journalctl -u pi-camera-control -n 100 --no-pager" | grep TimeSync
```

---

## Test 1: ap0 State Lifecycle

**Objective:** Verify ap0 client connection, resync intervals, and state expiry

**Test Steps:**

1. **Initial state** (no clients):

   ```bash
   # Check logs - should show no client activity
   ```

2. **Connect ap0 client** (T+0):
   - Connect laptop/phone to Pi AP (picontrol-002)
   - Open web UI: http://192.168.4.1:3000
   - **Expected logs:**
     ```
     TimeSync: Handling client connection <IP> on ap0
     TimeSync: Starting auto-sync for <IP> on ap0
     Starting ap0 resync timer (5-minute interval)
     ```

3. **Wait 5 minutes** (T+5m):
   - **Expected logs:**
     ```
     Resync timer fired for ap0
     ap0 resync: original client <IP> still connected
     ```

4. **Wait 5 more minutes** (T+10m):
   - **Expected:** Another resync log

5. **Disconnect ap0 client** (T+15m):
   - Close browser, disconnect from AP
   - **Expected logs:**
     ```
     Client <IP> disconnected
     ap0 client lost - no fallback clients available, state will expire naturally
     ```

6. **Wait for state expiry** (wait until T+25m total):
   - State should expire 10 minutes after last sync (at T+20m)
   - piProxyState should transition to 'none'

**Success Criteria:**

- ✅ ap0 connects and triggers sync
- ✅ Resync timer fires every 5 minutes
- ✅ State persists after disconnect
- ✅ State expires 10 minutes after last sync

**Result:** ****\_\_\_****

---

## Test 2: wlan0 Defers to Valid ap0 State

**Objective:** Verify wlan0 connections are ignored when valid ap0 state exists

**Test Steps:**

1. **Connect ap0 client** (T+0):
   - Connect device to Pi AP
   - Open web UI
   - **Expected:** ap0-device state established

2. **Wait 8 minutes** (T+8m):
   - ap0 should resync at T+5m
   - State is still valid

3. **Disconnect ap0 client** (T+8m):
   - State remains ap0-device (still valid for 2 more minutes)

4. **Connect wlan0 client** (T+9m):
   - Connect device to same WiFi network as Pi (if Pi is on WiFi)
   - OR: Have Pi connect to WiFi and connect device to that network
   - Open web UI
   - **Expected logs:**
     ```
     TimeSync: Ignoring wlan0 connection from <IP> - ap0 state is valid
     Device <IP> connected (wlan0) - deferring to ap0 proxy
     ```

5. **Wait for state expiry** (T+11m):
   - ap0 state expires (>10 min since last sync at T+5m = T+15m)
   - **Expected:** State transitions to 'none'

6. **Reconnect wlan0 client** (T+11m):
   - Refresh web UI or reconnect
   - **Expected logs:**
     ```
     TimeSync: Handling client connection <IP> on wlan0
     TimeSync: Starting auto-sync for <IP> on wlan0
     Starting wlan0 resync timer (5-minute interval)
     ```

**Success Criteria:**

- ✅ wlan0 connection ignored while ap0 state valid
- ✅ wlan0 accepted after ap0 state expires
- ✅ Proper logging of deferrals

**Result:** ****\_\_\_****

---

## Test 3: wlan0 Yields to ap0

**Objective:** Verify ap0 preempts wlan0 when both interfaces available

**Test Steps:**

1. **Connect wlan0 client** (T+0):
   - Connect device via shared WiFi (not AP)
   - Open web UI
   - **Expected:**
     ```
     TimeSync: Handling client connection <IP> on wlan0
     Starting wlan0 resync timer (5-minute interval)
     ```

2. **Wait 2 minutes** (T+2m):
   - wlan0 state established and syncing

3. **Connect ap0 client** (T+2m):
   - Connect different device to Pi AP
   - Open web UI
   - **Expected logs:**
     ```
     TimeSync: Handling client connection <IP> on ap0
     TimeSync: Starting auto-sync for <IP> on ap0
     Starting ap0 resync timer (5-minute interval)
     ```
   - State should transition wlan0-device → ap0-device

4. **Wait for wlan0 resync** (T+7m):
   - wlan0 timer would fire at T+5m from initial connection
   - **Expected logs:**
     ```
     wlan0 resync: ap0 client available, switching to ap0
     ```
   - wlan0 resync should be ignored (ap0 active)

**Success Criteria:**

- ✅ wlan0 establishes initially
- ✅ ap0 takes over immediately on connection
- ✅ wlan0 resync defers to ap0

**Result:** ****\_\_\_****

---

## Test 4: Camera Sync Uses State

**Objective:** Verify camera sync respects piProxyState validity

**Test Steps:**

1. **Ensure camera connected** (already at 192.168.4.3):
   - Camera should be visible in logs

2. **Connect ap0 client** (T+0):
   - Establish ap0-device state
   - **Expected:** Camera sync should occur

3. **Wait 4 minutes** (T+4m):
   - ap0 state still valid

4. **Disconnect ap0 client** (T+4m):
   - State remains ap0-device (valid for 6 more minutes)

5. **Trigger camera reconnection** (T+6m):
   - Power cycle camera or wait for mDNS rediscovery
   - **Expected logs:**
     ```
     Camera connection: No client but Pi proxy state valid (ap0-device), syncing camera from Pi
     Camera connected - syncing from Pi (Pi has valid ap0-device proxy)
     ```

6. **Wait for state expiry** (T+11m):
   - State expires at T+10m (10 min after T+0 sync)

7. **Trigger camera reconnection** (T+12m):
   - Power cycle camera
   - **Expected logs:**
     ```
     Camera connection: No client and Pi proxy state invalid, syncing Pi from camera
     Camera connected - syncing Pi from camera (no valid proxy state)
     Pi drift from camera: <X>ms
     ```

**Success Criteria:**

- ✅ Camera syncs from Pi when state valid
- ✅ Pi syncs from camera when state invalid
- ✅ Correct hierarchy: client > Pi proxy > camera

**Result:** ****\_\_\_****

---

## Test 5: Multiple ap0 Clients

**Objective:** Verify seamless failover between multiple ap0 clients

**Test Steps:**

1. **Connect ap0 client A** (T+0):
   - Connect device A to Pi AP
   - Open web UI
   - Note client IP in logs

2. **Wait 2 minutes** (T+2m):
   - ap0-device state established with client A

3. **Connect ap0 client B** (T+2m):
   - Connect device B to Pi AP
   - Open web UI on device B
   - **Expected logs:**
     ```
     TimeSync: Ignoring ap0 connection from <IP-B> - already have ap0 proxy
     Device <IP-B> connected (ap0) - already synchronized with another ap0 device
     ```

4. **Wait for resync** (T+5m):
   - **Expected:** Still syncing with client A

5. **Disconnect client A** (T+6m):
   - Close browser on device A, disconnect from AP
   - **Expected logs:**
     ```
     Client <IP-A> disconnected
     ```

6. **Wait for next resync attempt** (T+10m):
   - ap0 timer fires, original client (A) is gone
   - **Expected logs:**
     ```
     ap0 resync: original client lost, triggering failover
     ap0 client lost - failing over to different ap0 client
     ```
   - Should failover to client B seamlessly

**Success Criteria:**

- ✅ Second ap0 client ignored while first connected
- ✅ Automatic failover to second client when first disconnects
- ✅ No service interruption
- ✅ State remains ap0-device throughout

**Result:** ****\_\_\_****

---

## Test 6: State Expiry Prevents Stale Proxy

**Objective:** Verify 10-minute validity window prevents stale proxy usage

**Test Steps:**

1. **Connect ap0 client** (T+0):
   - Establish ap0-device state

2. **Wait 10 minutes** (T+10m):
   - ap0 should resync at T+5m

3. **Disconnect client** (T+10m):
   - State persists as ap0-device

4. **Wait exactly 5 more minutes** (T+15m):
   - State should expire at exactly 10 min after last sync (T+5m + 10m = T+15m)
   - **Expected:** piProxyState.isValid() returns false

5. **Trigger camera connection** (T+16m):
   - Power cycle camera
   - **Expected logs:**
     ```
     Camera connection: No client and Pi proxy state invalid, syncing Pi from camera
     ```
   - Should NOT use stale ap0 state

6. **Check proxy state validity:**
   ```bash
   curl http://192.168.4.1:3000/api/time-sync/status
   ```

   - Should show state as invalid or expired

**Success Criteria:**

- ✅ State persists after client disconnect
- ✅ State expires exactly 10 minutes after last sync
- ✅ Camera sync uses camera as source (not stale proxy)
- ✅ No use of proxy state older than 10 minutes

**Result:** ****\_\_\_****

---

## Common Debugging Commands

### Check piProxyState Info

```bash
# Monitor logs for state transitions
ssh pi@picontrol-002.local "sudo journalctl -u pi-camera-control -f" | grep piProxyState

# Check current time sync status
curl http://192.168.4.1:3000/api/time-sync/status 2>/dev/null | jq .
```

### Check Connected Clients

```bash
# Monitor client connections
ssh pi@picontrol-002.local "sudo journalctl -u pi-camera-control -f" | grep "client connection"

# Monitor disconnections
ssh pi@picontrol-002.local "sudo journalctl -u pi-camera-control -f" | grep "disconnected"
```

### Check Camera Status

```bash
# Camera connection logs
ssh pi@picontrol-002.local "sudo journalctl -u pi-camera-control -f" | grep "Camera"

# Camera sync logs
ssh pi@picontrol-002.local "sudo journalctl -u pi-camera-control -f" | grep "sync.*camera"
```

### Check Resync Timers

```bash
# Monitor resync events
ssh pi@picontrol-002.local "sudo journalctl -u pi-camera-control -f" | grep "resync"
```

---

## Test Execution Checklist

**Pre-test:**

- [ ] Phase 5 code deployed to Pi (commit 9ab14c5)
- [ ] Service restarted and running
- [ ] Camera connected at 192.168.4.3
- [ ] Monitoring terminal ready with log streaming

**During tests:**

- [ ] Test 1: ap0 State Lifecycle
- [ ] Test 2: wlan0 Defers to Valid ap0 State
- [ ] Test 3: wlan0 Yields to ap0
- [ ] Test 4: Camera Sync Uses State
- [ ] Test 5: Multiple ap0 Clients
- [ ] Test 6: State Expiry Prevents Stale Proxy

**Post-test:**

- [ ] Document all results in this file
- [ ] Capture any unexpected behavior
- [ ] Update time-sync-algorithm-analysis.md with findings
- [ ] Note any bugs or improvements needed

---

## Notes and Observations

_(Use this section to record any interesting observations, bugs found, or improvements identified during testing)_

**Test execution date:** ****\_\_\_****

**Issues found:** ****\_\_\_****

**Improvements needed:** ****\_\_\_****

**Additional testing needed:** ****\_\_\_****

---

## Expected Outcome

If all tests pass:

- Mark Phase 6 COMPLETE in time-sync-algorithm-analysis.md
- All 6 validation test cases working on hardware
- Time sync hierarchy correctly implemented (ap0 > wlan0 > camera)
- State-based sync logic validated in production
- Ready for field deployment

---

**END OF TEST PLAN**
