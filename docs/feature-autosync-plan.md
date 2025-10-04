# Automatic Time Synchronization Implementation Plan

## Overview

This document outlines the implementation plan for automatic time synchronization between client devices, the Raspberry Pi, and the Canon camera. The goal is to ensure all components maintain accurate time without manual intervention.

## Time Reliability Hierarchy

1. **Client Device** (Most Reliable) - Assumed to have internet/cellular time sync
2. **Canon Camera** (Reliable) - Good RTC but needs timezone updates when traveling
3. **Raspberry Pi** (Least Reliable) - No battery-backed RTC, prone to drift

## 1. Clock Drift Experiments

### 1.1 Pi Clock Drift Experiment

**File**: `experiments/pi-drift-test.js`

**Purpose**: Measure the Raspberry Pi's clock drift rate when running without NTP

**Method**:

- Run from MacBook, connect to Pi via SSH
- Set Pi time initially using `sudo date -u -s` command
- Check Pi time every 15 minutes for 24-48 hours
- Calculate drift in seconds and drift rate (seconds/hour)
- Output CSV with: timestamp, pi_time, laptop_time, drift_seconds, drift_rate

**Actual Results from Testing**:
Based on four test runs totaling over 25 hours of monitoring:

| Test Duration | Mean Drift Rate | Max Drift | Variability | Key Finding          |
| ------------- | --------------- | --------- | ----------- | -------------------- |
| 0.7 hours     | 0.15 s/hour     | 0.19s     | 123%        | Initial instability  |
| 3.2 hours     | -0.03 s/hour    | 0.16s     | High        | Better stability     |
| 16.6 hours    | 0.12 s/hour     | 0.94s     | 146%        | Long-term variations |
| 4.7 hours     | 0.27 s/hour     | 0.58s     | 29%         | More consistent      |

**Key Observations**:

- **Drift Rate**: Average 0.1-0.3 seconds/hour (2.4-7.2 seconds/day)
- **Variability**: High short-term variability (up to 0.96s jumps between measurements)
- **Stability**: Clock behavior varies significantly between test runs
- **Pattern**: No consistent drift direction - sometimes gains, sometimes loses time

**Revised Recommendations**:

- Pi time should be considered reliable for only **15 minutes** after synchronization
- Hourly synchronization checks are necessary
- Must handle sudden time jumps (up to 1 second between checks)
- 1-second threshold for triggering sync is appropriate

### 1.2 Camera Clock Drift Experiment

**File**: `experiments/camera-drift-test.js`

**Purpose**: Measure Canon R50's internal clock drift rate

**Method**:

- Run from MacBook, connect via CCAPI
- Set camera time using `PUT /ccapi/ver100/settings/datetime`
- Check camera time every 30 minutes for 24-48 hours
- Calculate drift and rate
- Output CSV with: timestamp, camera_time, laptop_time, drift_seconds, drift_rate

**Expected Results**:

- Drift rate: <1 second per day
- Verify camera clock stability

## 2. Architecture Modifications

### 2.1 New Components

#### TimeSync Service (`src/timesync/service.js`)

**Responsibilities**:

- Manage all time synchronization operations
- Track reliability state and sync history
- Handle Client→Pi and Pi→Camera synchronization
- Emit WebSocket events for UI updates
- Schedule periodic sync checks

**Key Methods**:

```javascript
class TimeSyncService {
  syncFromClient(clientTime, clientTimezone, clientIP)
  syncCameraFromPi()
  checkTimeDrift(time1, time2)
  schedulePeriodicSync()
  isPiTimeReliable()
  getStatus()
}
```

#### TimeSync State Manager (`src/timesync/state.js`)

**Responsibilities**:

- Maintain synchronization state
- Track reliability windows
- Store sync history

**State Structure**:

```javascript
{
  piReliable: boolean,
  lastPiSync: Date,
  lastCameraSync: Date,
  syncSource: string,  // IP address of sync source
  reliabilityWindow: 1800000,  // 30 minutes in ms
  syncHistory: [],  // Last 10 sync events
  driftThreshold: 1000  // 1 second in ms
}
```

### 2.2 Integration Points

#### WebSocket Handler Enhancement

**File**: `src/websocket/handler.js`

**On Client Connection**:

1. Check if client is on `ap0` interface
2. Request client time via WebSocket message
3. Compare with current Pi time
4. Auto-sync if drift > 1 second
5. If camera connected and Pi reliable, sync camera
6. Broadcast sync status to all clients

**New WebSocket Messages**:

- `time-sync-request` - Server requests client time
- `time-sync-response` - Client provides time and timezone
- `time-sync-status` - Broadcast sync state changes
- `gps-request` - Request GPS location from client
- `gps-response` - Client provides GPS coordinates

#### Camera Controller Enhancement

**File**: `src/camera/controller.js`

**On Camera Connected**:

1. Retrieve camera datetime via CCAPI GET
2. Compare with Pi time
3. If Pi time is reliable and drift > 1 second:
   - Set camera time via CCAPI PUT
   - Log sync result
4. Add sync status to camera state

**New Methods**:

```javascript
async getCameraDateTime()
async setCameraDateTime(datetime)
async syncTimeFromPi()
```

#### Intervalometer Session Enhancement

**File**: `src/intervalometer/timelapse-session.js`

**On Session Start**:

1. Check for client on ap0
2. Trigger immediate time sync
3. Request GPS location from client
4. Store GPS in timelapse metadata
5. Log sync status in timelapse report

### 2.3 Client-Side Implementation

#### Time Sync Client Module

**File**: `public/js/timesync.js`

**Features**:

- Respond to server time sync requests
- Provide GPS location when available
- Display sync status in UI
- Show drift warnings

**Implementation**:

```javascript
class TimeSyncClient {
  constructor(websocket) {
    this.ws = websocket;
    this.registerHandlers();
  }

  handleTimeSyncRequest() {
    // Send current time and timezone
  }

  handleGPSRequest() {
    // Use Geolocation API if available
  }

  updateSyncStatus(status) {
    // Update UI indicators
  }
}
```

### 2.4 API Enhancements

#### Enhanced `/api/system/time` Endpoint

**Changes**:

- Add `source` field (manual/auto/scheduled)
- Return drift amount before sync
- Include sync statistics
- Support GPS coordinates in request

**Request Body**:

```json
{
  "timestamp": "2024-01-15T10:30:00Z",
  "timezone": "America/Los_Angeles",
  "source": "auto",
  "gps": {
    "latitude": 37.7749,
    "longitude": -122.4194,
    "accuracy": 10
  }
}
```

#### New `/api/timesync/status` Endpoint

**Response**:

```json
{
  "piReliable": true,
  "lastPiSync": "2024-01-15T10:30:00Z",
  "lastCameraSync": "2024-01-15T10:31:00Z",
  "syncSource": "192.168.4.2",
  "nextScheduledSync": "2024-01-15T11:30:00Z",
  "syncHistory": [...]
}
```

### 2.5 Scheduled Tasks

#### Sync Scheduler (`src/timesync/scheduler.js`)

**Behavior** (Updated based on test results):

- Check every **15 minutes** when client available on ap0 (reduced from hourly)
- If drift detected > 0.5s between scheduled checks, trigger immediate resync
- If no client available:
  - Check every minute for first 15 minutes
  - Log warning after 15 minutes
  - Continue minute checks until client available
- Return to 15-minute checks once synced
- Log any time jumps > 0.5 seconds as anomalies

**Activity Log Events**:

- "Time synchronized from client X.X.X.X (drift: Xs)"
- "Camera time synchronized (drift: Xs)"
- "Warning: No client available for time sync (15 minutes)"
- "Time sync resumed after X minutes offline"
- "Anomaly: Time jump detected (Xs) - triggering immediate sync"

## 3. Implementation Phases

### Phase 1: Drift Experiments (COMPLETED)

- [x] Create experiment scripts
- [x] Run Pi drift tests (25+ hours total)
- [ ] Run camera drift test (pending)
- [x] Analyze results and adjust parameters

**Results Summary**:

- Pi drift: 0.1-0.3 s/hour with high variability
- Reduced reliability window from 30 to 15 minutes
- Changed from hourly to 15-minute sync checks

### Phase 2: Core TimeSync Service (2 days)

- [ ] Implement TimeSyncService class
- [ ] Implement TimeSyncState class
- [ ] Add WebSocket message handlers
- [ ] Test Client→Pi synchronization

### Phase 3: Camera Synchronization (1 day)

- [ ] Add camera datetime CCAPI methods
- [ ] Implement Pi→Camera sync logic
- [ ] Add reliability checks
- [ ] Test with real camera

### Phase 4: Scheduled Synchronization (1 day)

- [ ] Implement sync scheduler
- [ ] Add hourly/minute check logic
- [ ] Add activity logging
- [ ] Test failover scenarios

### Phase 5: UI and GPS Integration (1 day)

- [ ] Create client-side TimeSync module
- [ ] Add sync status indicators
- [ ] Implement GPS location capture
- [ ] Update timelapse reports

### Phase 6: Testing and Refinement (1 day)

- [ ] End-to-end testing
- [ ] Adjust thresholds based on experiments
- [ ] Documentation updates
- [ ] Deploy to production Pi

## 4. Configuration Parameters

### Default Values (Based on Experimental Results)

```javascript
{
  DRIFT_THRESHOLD: 1000,           // 1 second in milliseconds - CONFIRMED by testing
  RELIABILITY_WINDOW: 900000,      // 15 minutes in milliseconds - REDUCED from 30 based on high variability
  HOURLY_CHECK_INTERVAL: 3600000,  // 1 hour - CONFIRMED as necessary
  MINUTE_CHECK_INTERVAL: 60000,    // 1 minute
  MAX_SYNC_HISTORY: 10,            // Number of sync events to retain
  AUTO_SYNC_ENABLED: true,         // Global enable/disable
  AP_ONLY_AUTO_SYNC: true,         // Only auto-sync ap0 clients
  VARIABILITY_THRESHOLD: 500       // 0.5 second max acceptable jump between checks
}
```

### Rationale for Parameters

- **15-minute reliability window**: Pi showed up to 0.96s jumps in testing, making longer windows risky
- **1-second drift threshold**: Appropriate given observed drift rates of 0.1-0.3 s/hour
- **Hourly checks**: Essential given the 2.4-7.2 seconds/day drift rate
- **Variability threshold**: New parameter to detect and handle sudden time jumps

## 5. Success Metrics

- Pi time stays within 2 seconds of client time
- Camera time stays within 2 seconds of Pi time (when reliable)
- Zero manual sync operations required during normal use
- Sync failures are logged but don't block operations
- GPS location captured for 90% of timelapses

## 6. Future Enhancements

- Support for external GPS modules
- Integration with NTP when internet available
- Sync statistics dashboard
- Configurable drift thresholds per device
- Support for multiple camera sync
