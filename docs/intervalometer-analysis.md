# Intervalometer Code Analysis

## Current Architecture

### Existing Structure

The current intervalometer implementation is relatively well-organized but follows a singleton pattern rather than the centralized state management pattern used by camera and network systems.

**Current Files:**

- `src/intervalometer/session.js` - Main IntervalometerSession class (361 lines)
- Used in: `src/server.js`, `src/routes/api.js`, `src/websocket/handler.js`

### Current State Management

- **Global Session**: `server.activeIntervalometerSession` - single global session
- **Event Emission**: Uses EventEmitter for real-time updates
- **Session Management**: Start/stop/pause/resume functionality
- **Statistics Tracking**: Built-in stats and progress tracking

### Integration Points

1. **Server Integration** (`src/server.js:line ~35`):

   ```javascript
   this.activeIntervalometerSession = null;
   ```

2. **API Routes** (`src/routes/api.js`):
   - `/intervalometer/start` - Creates new session
   - `/intervalometer/stop` - Stops active session
   - `/intervalometer/status` - Gets session status

3. **WebSocket Events** (`src/websocket/handler.js`):
   - `start_intervalometer` / `stop_intervalometer` messages
   - Real-time event broadcasting:
     - `intervalometer_started`
     - `intervalometer_photo`
     - `intervalometer_completed`
     - `intervalometer_stopped`
     - `intervalometer_error`

## Issues with Current Architecture

### 1. **Lack of Centralized State Management**

- Single global session limits concurrent session management
- No centralized state store for historical data
- State tied directly to server instance

### 2. **No Persistence Layer**

- Session data lost on server restart
- No historical record of completed sessions
- Cannot recover from unexpected shutdowns

### 3. **Limited Session Management**

- Cannot manage multiple sessions (past/current)
- No session metadata or reporting
- Missing title/description functionality

### 4. **Tight Coupling**

- Direct camera controller dependency in session
- Server directly manages session lifecycle
- No abstraction layer for different session types

## Proposed Reorganization

### Following Camera/Network Pattern

#### 1. **IntervalometerStateManager** (New)

```javascript
// src/intervalometer/state-manager.js
export class IntervalometerStateManager extends EventEmitter {
  constructor() {
    super();
    this.currentSession = null;
    this.sessionHistory = new Map();
    this.reportManager = new TimelapseReportManager();
    this.unsavedSession = null; // For cross-reboot recovery
  }
}
```

#### 2. **TimelapseSession** (Refactored from IntervalometerSession)

```javascript
// src/intervalometer/timelapse-session.js
export class TimelapseSession extends EventEmitter {
  constructor(getCameraController, options = {}) {
    super();
    this.id = generateUUID();
    this.title = options.title || this.generateDefaultTitle();
    // ... existing session logic
  }
}
```

#### 3. **TimelapseReportManager** (New)

```javascript
// src/intervalometer/report-manager.js
export class TimelapseReportManager {
  constructor() {
    this.storageDir = "/home/pi/pi-camera-control/data/timelapse-reports";
    this.unsavedSessionFile = "unsaved-session.json";
  }

  async saveReport(session) {
    /* ... */
  }
  async loadReports() {
    /* ... */
  }
  async deleteReport(id) {
    /* ... */
  }
}
```

#### 4. **Legacy Compatibility Layer** (Updated IntervalometerSession)

```javascript
// src/intervalometer/session.js - Maintains existing API
export class IntervalometerSession extends EventEmitter {
  constructor(getCameraController, options = {}) {
    super();
    this.stateManager = new IntervalometerStateManager();
    // Delegate to state manager while maintaining existing API
  }
}
```

### Directory Structure

```
src/intervalometer/
├── session.js           # Legacy compatibility layer
├── state-manager.js     # Centralized state management
├── timelapse-session.js # Individual session class
└── report-manager.js    # Persistent storage management
```

## Migration Strategy

### Phase 1: Create New Architecture (No Breaking Changes)

1. **Create IntervalometerStateManager** - Centralized management
2. **Create TimelapseSession** - Enhanced session class with title/metadata
3. **Create TimelapseReportManager** - Persistence layer
4. **Update IntervalometerSession** - Delegate to state manager internally
5. **Maintain existing API** - No changes to routes/websocket

### Phase 2: Enhance with New Features

1. **Add title functionality** - Default and custom titles
2. **Implement session completion screen** - Save/Discard flow
3. **Add report management API** - CRUD operations for reports
4. **Cross-reboot recovery** - Handle interrupted sessions

### Phase 3: UI Integration

1. **Update frontend** - Add title field to start form
2. **Add reports menu** - List/view/edit/delete reports
3. **Session completion dialog** - Save/Discard with title edit
4. **WebSocket events** - Real-time report updates

## Compatibility Preservation

### Existing API Endpoints (Maintained)

- `POST /intervalometer/start` - Start new session
- `POST /intervalometer/stop` - Stop current session
- `GET /intervalometer/status` - Get session status

### Existing WebSocket Messages (Maintained)

- `start_intervalometer` / `stop_intervalometer`
- All existing event broadcasts preserved

### Server Integration (No Changes Required)

- `server.activeIntervalometerSession` continues to work
- All existing functionality preserved during migration

## Benefits of New Architecture

### 1. **Consistency with Other Systems**

- Follows CameraStateManager and NetworkStateManager patterns
- Centralized state management with event emission
- Clean separation of concerns

### 2. **Enhanced Functionality**

- Multiple session support (current + historical)
- Persistent storage with cross-reboot recovery
- Rich metadata and reporting capabilities

### 3. **Better Organization**

- Dedicated classes for specific responsibilities
- Clear abstraction layers
- Improved testability and maintainability

### 4. **Future Extensibility**

- Easy to add new session types (burst, HDR, etc.)
- Plugin architecture for different camera types
- Advanced reporting and analytics capabilities

## Implementation Plan

### Step 1: Analysis Complete ✅

- Document current architecture
- Identify integration points
- Plan migration strategy

### Step 2: Create New Classes (Next)

- IntervalometerStateManager
- TimelapseSession
- TimelapseReportManager
- Updated IntervalometerSession compatibility layer

### Step 3: Testing

- Verify existing functionality works unchanged
- Test new persistence and recovery features
- Validate on target Pi hardware

### Step 4: New Feature Implementation

- Title management UI
- Session completion flow
- Report management interface
- Cross-reboot recovery

This reorganization will provide the same benefits achieved with camera and network centralization while maintaining full backward compatibility and enabling the new timelapse reporting requirements.
