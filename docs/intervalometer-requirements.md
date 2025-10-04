# Intervalometer Requirements

## Overview

Enhance the intervalometer system following object-oriented design principles, with centralized state management similar to CameraStateManager and NetworkStateManager patterns.

## Core Objects

### 1. Intervalometer Object

- **Purpose**: Tool that creates timelapses using the camera
- **Responsibilities**:
  - Session management and execution
  - Integration with camera operations
  - State tracking and event emission

### 2. Timelapse Object

- **Purpose**: Represents a single timelapse run/session
- **Responsibilities**:
  - Capture session metadata and statistics
  - Store run details and results
  - Generate reports for UI display

### 3. TimelapseReportManager Object

- **Purpose**: Manages persistent storage and retrieval of timelapse reports
- **Responsibilities**:
  - Save/load reports to/from Pi disk storage
  - Provide CRUD operations for reports
  - Handle report persistence across reboots

## New UI Features

### Title Management

- **Default Title Format**: `YYYYMMDD-HHMMSS` (based on start time)
- **User Editable**: Allow custom titles for better organization
- **Validation**: Ensure unique titles and valid characters

### Report Management Menu

- **New Menu Entry**: "Timelapse Reports" or similar
- **List View**: Show all saved timelapse reports with:
  - Title
  - Date/Time
  - Duration
  - Image count
  - Status (completed/stopped/error)
- **Actions Per Report**:
  - View detailed report
  - Edit title
  - Delete report
  - Export/download (future enhancement)

### Session Completion Flow

When intervalometer finishes or is stopped:

1. **Report Screen**: Display comprehensive session report including:
   - Session title (editable)
   - Start/end times
   - Duration
   - Images captured
   - Success/failure statistics
   - Any errors encountered
2. **Action Options**:
   - **Save**: Persist report for future reference
   - **Discard**: Delete session data without saving

### Persistence Requirements

- **Cross-Reboot**: Reports must survive Pi reboots
- **Recovery**: If system shuts down during session, show completion screen on restart
- **Storage Location**: `/home/pi/pi-camera-control/data/timelapse-reports/` or similar
- **Format**: JSON files for easy parsing and human readability

## Technical Architecture

### State Management Pattern

Follow established patterns:

- **IntervalometerStateManager**: Centralized state management with event emission
- **TimelapseSession**: Individual session tracking and management
- **TimelapseReportManager**: Persistent storage and retrieval

### Integration Points

- **Camera Integration**: Use existing CameraStateManager for all camera operations
- **WebSocket Events**: Real-time updates to UI for session progress and completion
- **API Endpoints**: RESTful endpoints for report CRUD operations

### Data Structure

#### Timelapse Report Schema

```json
{
  "id": "uuid-v4",
  "title": "Custom Title or YYYYMMDD-HHMMSS",
  "startTime": "ISO timestamp",
  "endTime": "ISO timestamp",
  "duration": "seconds",
  "status": "completed|stopped|error",
  "settings": {
    "interval": "seconds",
    "totalShots": "number",
    "shutterSpeed": "string",
    "iso": "number",
    "aperture": "string"
  },
  "results": {
    "imagesCaptured": "number",
    "imagesSuccessful": "number",
    "imagesFailed": "number",
    "errors": ["array of error messages"]
  },
  "metadata": {
    "cameraModel": "string",
    "savedAt": "ISO timestamp",
    "version": "app version"
  }
}
```

## Implementation Phases

### Phase 1: Code Organization

1. Analyze existing intervalometer code (`src/intervalometer/session.js`)
2. Create centralized state manager following established patterns
3. Refactor existing code to use new architecture
4. Ensure backward compatibility
5. Test existing functionality

### Phase 2: Timelapse Object & Reporting

1. Implement TimelapseSession class
2. Create TimelapseReportManager for persistence
3. Add session completion tracking
4. Implement report generation

### Phase 3: UI Integration

1. Add timelapse reports menu
2. Implement session completion screen
3. Create report management interface
4. Add WebSocket events for real-time updates

### Phase 4: Persistence & Recovery

1. Implement cross-reboot persistence
2. Add session recovery on startup
3. Handle interrupted sessions
4. Test all persistence scenarios

## Success Criteria

- ✅ Existing intervalometer functionality unchanged
- ✅ Centralized state management implemented
- ✅ New timelapse reporting system functional
- ✅ UI provides intuitive report management
- ✅ Reports persist across reboots
- ✅ System recovers gracefully from interruptions
- ✅ All operations tested on target Pi hardware
