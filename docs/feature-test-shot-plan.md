# Test Shot Feature - Implementation Plan

**Feature Branch**: `feature/test-shot-implementation`
**Status**: Analysis & Planning Phase
**Last Updated**: 2025-10-02

## Executive Summary

This document provides a comprehensive analysis of the Test Shot feature specification and outlines the implementation plan. The feature is complex and requires significant research, new backend infrastructure, and extensive frontend development.

**Critical Finding**: The specification contains several unresolved questions and potential architecture decisions that MUST be answered before implementation can proceed.

---

## Document Analysis & Issues Found

### ✅ Clear Requirements
1. **Live View Gallery**: Capture, store, compare multiple live view images with settings
2. **Camera Settings Page**: Adjustable settings organized by function with instant preview
3. **Full Photo Capture**: Take actual photos with metadata extraction and special handling
4. **Image Management**: Download, delete, navigate between images
5. **Settings Persistence**: Save/restore camera settings (implied by wireframes)

### ⚠️ Critical Issues & Inconsistencies

#### Issue 1: Event Polling vs Existing WebSocket Architecture
**Location**: Line 11 - "use the 'event polling' feature of the camera to detect changes to the mode"

**Problem**: The document suggests using CCAPI event polling (`GET /ccapi/ver100/event/polling`) to detect camera mode changes, but our architecture already has a WebSocket-based real-time communication system.

**Questions**:
- Should we poll CCAPI events and broadcast them via WebSocket? (Recommended)
- Should we replace WebSocket with direct CCAPI polling? (Not recommended - breaks existing architecture)
- How frequently should we poll? (CCAPI polling is blocking with `continue=on`)
- What events do we care about besides mode changes?

**Recommendation**: Implement CCAPI event polling in the backend, broadcast camera state changes via existing WebSocket infrastructure. This maintains architectural consistency.

---

#### Issue 2: Settings Update Strategy - Immediate vs Manual Save
**Location**: Lines 13-14 - "If the ccapi is responsive enough..."

**Problem**: The document proposes a conditional UX based on CCAPI performance testing that hasn't been done yet.

**Questions**:
- How do we measure "responsive enough"? What's the acceptable latency?
- Should there be an "unsaved changes" indicator or not?
- What happens if settings change fails mid-update?
- How do we handle conflicts between user changes and camera mode changes?

**Recommendation**: Start with **manual save** approach (safer, clearer UX). Can optimize to immediate update after field testing shows it's reliable.

---

#### Issue 3: Live View Method - Flip vs Scroll
**Location**: Lines 95-99 - "I do not understand the difference between 'flip' and 'scroll'"

**Problem**: The document acknowledges not knowing which live view method to use.

**CCAPI Analysis**:
- **`/liveview/flip`**: Single-shot JPEG fetch - simple, but requires repeated requests
- **`/liveview/scroll`**: Chunked streaming - continuous feed, more complex
- **`/liveview/multipart`**: Multipart streaming - video-like continuous feed

**For Test Shot Feature**:
- **Use `/liveview/flip`** - captures single image on demand, simpler to implement
- Scroll/multipart are for continuous preview (more like video), not needed for still image comparison

**Recommendation**: Use flip method for manual test shots. May need scroll for "live image on settings page" (Line 15) if implemented.

---

#### Issue 4: Image File Naming Collision
**Location**: Lines 47-48 - "image file names from the camera should not be considered unique"

**Problem**: Good catch! Canon cameras reset numbering, files can have same name across dates.

**Solution Specified**: `YYYYMMDD_HHMMSS_<imagefile name>`

**Additional Questions**:
- What if two photos have same timestamp (burst mode, intervalometer)?
- Should we use the camera's timestamp or download timestamp?
- Where do we store these files? `/data/test-shots/`?
- Do we have a cleanup strategy? (Disk space management)

**Recommendation**:
```
Format: YYYYMMDD_HHMMSS_NNN_<original_name>
- YYYYMMDD_HHMMSS from EXIF timestamp
- NNN = sequence number for collisions
- Store in /data/test-shots/liveview/ and /data/test-shots/photos/
- Auto-cleanup: delete files older than 7 days OR when total > 100 images
```

---

#### Issue 5: Settings Organization - Needs Research
**Location**: Lines 51-71 - "Requires more research"

**Problem**: The document correctly identifies that camera settings vary by mode, but doesn't specify the organization.

**Research Needed**:
1. Query `/shooting/settings` in each camera mode (M, Av, Tv, P, etc.)
2. Compare responses to determine mode-dependent settings
3. Categorize settings into functional groups
4. Determine "common settings" list

**From CCAPI Docs**: Settings include:
- Exposure: av, tv, iso, exposure, metering
- Focus: afoperation, afmethod
- Quality: stillimagequality, stillimageaspectratio
- Color: wb, colortemperature, colorspace, picturestyle
- Advanced: drive, flash, aeb, wbshift, etc.

**Recommendation**: Create settings taxonomy after mode research is complete.

---

#### Issue 6: Photo Sequence - Good Idea But Complex
**Location**: Lines 39-44 - Using event polling sequence for photo capture

**Analysis**: The document correctly identifies that using CCAPI event polling for photo capture provides:
1. Actual photo completion time (for timing validation)
2. File path in `addedcontents` field
3. Better synchronization for intervalometer

**Complexity**:
- Requires continuous event polling loop in backend
- Need to correlate `addedcontents` events with photo requests
- More complex error handling (timeout if event never arrives)

**Recommendation**: Good idea - implement this. Provides valuable telemetry for intervalometer timing improvements.

---

#### Issue 7: Settings Extraction from Metadata
**Location**: Line 46 - "Settings information for the photo should be extracted from metadata"

**Questions**:
- Use EXIF parsing library (which one)?
- What settings are we extracting? (ISO, shutter, aperture, WB, etc.)
- How do we display them in UI?
- What if EXIF data is missing or corrupted?

**Recommendation**: Use `exifr` npm package - lightweight, well-maintained. Extract: ISO, Shutter Speed, Aperture, WB, Focus Mode, Timestamp, Camera Model.

---

### 📋 Missing Requirements

1. **Error Handling**: What happens when live view fails? Camera disconnects mid-session?
2. **Concurrent Usage**: Can multiple users access Test Shot simultaneously?
3. **Session Persistence**: Do test shot images survive server restart?
4. **Storage Limits**: Max number of images? Max storage per session?
5. **Image Size Override**: Document mentions "lowest size/quality" for test photos (line 34-36) - what are the actual CCAPI values?
6. **Navigation Flow**: How does user get back from fullscreen view? Back button? Swipe?
7. **Mobile Optimization**: Touch gestures? Pinch to zoom in fullscreen?

---

## CCAPI Research Results

### Live View Workflow (Recommended)
```
1. POST /shooting/liveview {"liveviewsize": "small", "cameradisplay": "on"}
2. GET /shooting/liveview/flip -> Returns JPEG image
3. Download image to Pi
4. Broadcast via WebSocket to clients
5. Store locally with timestamp
6. (Repeat step 2 when user clicks "Test Shot")
7. POST /shooting/liveview {"liveviewsize": "off"} when done
```

### Photo Workflow with Event Polling
```
1. Start event polling loop: GET /event/polling?continue=on
2. User clicks "Take Photo"
3. Temporarily override size/quality settings:
   - GET /shooting/settings/stillimagequality
   - PUT /shooting/settings/stillimagequality {value: "small_fine"}
4. POST /shooting/control/shutterbutton {af: true}
5. Wait for event polling to return addedcontents: [...]
6. Download photo from URL in addedcontents[0]
7. Restore previous quality settings
8. Extract EXIF metadata
9. Rename file with timestamp prefix
10. Broadcast to clients
```

### Settings Query Workflow
```
1. GET /shooting/settings -> Returns ALL settings with ability values
2. Parse response, organize by category
3. Filter based on shooting mode (some settings have empty ability[] in certain modes)
4. Display in collapsible sections
5. On change: PUT /shooting/settings/<setting_name> {value: "..."}
```

---

## Architecture Decisions Required

### Decision 1: Event Polling Implementation

**Option A: Dedicated Polling Service** (Recommended)
- Create `src/camera/event-polling.js` service
- Continuous polling with `continue=on` parameter
- Broadcasts events via existing WebSocket
- Handles `addedcontents`, `deletedcontents`, mode changes, etc.

**Option B: On-Demand Polling**
- Only poll when waiting for specific events (photo capture)
- Simpler but misses camera state changes
- Could lead to stale UI state

**Recommendation**: Option A - provides better camera state synchronization

---

### Decision 2: Live View Storage Strategy

**Option A: Temporary RAM Storage**
- Store base64-encoded images in memory
- Fast, no disk I/O
- Lost on server restart
- Limited by RAM (5-10 images max)

**Option B: Disk Storage with Auto-Cleanup**
- Store in `/data/test-shots/liveview/`
- Survives restarts
- Requires cleanup strategy
- Slower but more images

**Recommendation**: Option B with aggressive cleanup (delete on disconnect or max 20 images)

---

### Decision 3: Settings UI Auto-Update

**Start**: Manual save with "Apply" button
**Future**: Can add auto-apply toggle in user preferences

---

## Implementation Phases

### Phase 0: Research & Validation (2-3 days)
**Agent**: ccapi-camera-specialist

**Tasks**:
1. Test live view endpoints on actual camera
   - `/liveview` POST with different sizes
   - `/liveview/flip` GET
   - Measure response times
2. Test event polling
   - Start polling loop
   - Take photo, verify `addedcontents` event
   - Change camera mode, verify event
3. Query settings in different modes
   - Set camera to M, Av, Tv, P modes
   - GET `/shooting/settings` in each
   - Document which settings are available in which modes
4. Identify size/quality override values
   - GET `/shooting/settings/stillimagequality`
   - Find "small fine" or equivalent

**Deliverables**:
- CCAPI research report (update `ccapi-audit-report.md`)
- Settings-by-mode mapping JSON
- Performance benchmarks
- Updated feature spec with research findings

---

### Phase 1: Backend Infrastructure (3-5 days)
**Agents**: backend-guardian, ccapi-camera-specialist

**New Backend Components**:

#### 1.1 Event Polling Service
- **File**: `src/camera/event-polling.js`
- **Responsibilities**:
  - Continuous polling loop
  - Event parsing and routing
  - WebSocket broadcasting
  - Error recovery

#### 1.2 Live View Manager
- **File**: `src/camera/liveview-manager.js`
- **Responsibilities**:
  - Enable/disable live view
  - Capture flip images
  - Image storage and cleanup
  - URL generation for client access

#### 1.3 Camera Settings Manager
- **File**: `src/camera/settings-manager.js`
- **Responsibilities**:
  - Settings query and caching
  - Settings update with validation
  - Mode-based filtering
  - Settings snapshot save/restore

#### 1.4 Photo Capture Service
- **File**: `src/camera/photo-capture.js`
- **Responsibilities**:
  - Enhanced photo capture with event correlation
  - Quality override management
  - EXIF extraction
  - File naming and storage

**New API Endpoints**:
```javascript
// Live View
POST   /api/camera/liveview/start
POST   /api/camera/liveview/stop
POST   /api/camera/liveview/capture    // Returns image URL
GET    /api/camera/liveview/images     // List all live view images
DELETE /api/camera/liveview/images/:id
DELETE /api/camera/liveview/images     // Clear all

// Camera Settings
GET    /api/camera/settings/full       // All settings with organization
PUT    /api/camera/settings/:name      // Update single setting
POST   /api/camera/settings/snapshot   // Save current settings
GET    /api/camera/settings/snapshots  // List saved snapshots
POST   /api/camera/settings/restore/:id // Restore snapshot

// Enhanced Photo
POST   /api/camera/photo/test          // Test photo with metadata
GET    /api/camera/photos/test         // List test photos
DELETE /api/camera/photos/test/:id
GET    /api/camera/photos/test/:id/download
```

**New WebSocket Events**:
```javascript
// Server -> Client
{ type: "liveview_captured", data: { id, url, settings, timestamp } }
{ type: "liveview_deleted", data: { id } }
{ type: "camera_mode_changed", data: { mode, availableSettings } }
{ type: "camera_setting_changed", data: { setting, value } }
{ type: "test_photo_captured", data: { id, url, metadata, settings } }
{ type: "settings_applied", data: { settings } }

// Client -> Server
{ type: "capture_liveview", data: {} }
{ type: "delete_liveview", data: { id } }
{ type: "update_setting", data: { name, value } }
{ type: "apply_settings", data: { settings } }
{ type: "capture_test_photo", data: {} }
```

**Tests Required**:
- Event polling service tests
- Live view manager tests
- Settings manager tests
- API endpoint integration tests
- WebSocket message schema validation
- File storage and cleanup tests

---

### Phase 2: Frontend - Camera Settings Card (3-4 days)
**Agent**: frontend-guardian

**Components**:

#### 2.1 Camera Settings UI
- **File**: `public/js/camera-settings.js`
- **Features**:
  - Collapsible setting groups
  - Dynamic form generation from CCAPI settings
  - Real-time validation
  - Unsaved changes indicator
  - Apply/Reset buttons
  - Save/Load presets (future)

**Settings Organization** (from wireframe):
```
Common Settings (always visible):
- ISO
- Shutter Speed
- Aperture
- White Balance
- Color Temperature
- Focus Mode

Exposure Settings (collapsible):
- Shooting Mode
- Metering
- Exposure Compensation
- AEB

Focus Settings (collapsible):
- AF Operation
- AF Method
- Focus Distance

Quality Settings (collapsible):
- Image Format
- Quality
- Size
- Aspect Ratio

Advanced Settings (collapsible):
- Drive Mode
- Flash
- Picture Style
- Color Space
- Noise Reduction
```

**Tests Required**:
- E2E tests for settings form
- Settings validation tests
- Mode-change behavior tests
- Apply/Reset functionality

---

### Phase 3: Frontend - Test Shot / Live View Card (4-5 days)
**Agent**: frontend-guardian

#### 3.1 Live View Gallery
- **File**: `public/js/liveview-gallery.js`
- **Features**:
  - Image carousel/grid view
  - Fullscreen viewer
  - Settings overlay on each image
  - Navigation controls
  - Delete functionality
  - Image comparison (side-by-side?)

#### 3.2 Test Photo Gallery
- **File**: `public/js/test-photo-gallery.js`
- **Features**:
  - Photo list with thumbnails
  - EXIF data display
  - Download functionality
  - Delete functionality

**UI Elements**:
- Large preview area
- Settings quick view
- Test Shot button
- Take Photo button
- Image navigation (prev/next)
- Fullscreen toggle
- Download button
- Delete button
- Clear all button

**Tests Required**:
- E2E tests for test shot workflow
- Image gallery navigation
- Fullscreen mode
- Delete/clear functionality
- Download functionality

---

### Phase 4: Integration & Polish (2-3 days)
**Agents**: backend-guardian, frontend-guardian, test-validator

**Tasks**:
1. Integration testing with real camera
2. Error handling refinement
3. Loading states and progress indicators
4. Mobile responsiveness testing
5. Performance optimization
6. Storage cleanup verification
7. Memory leak testing

---

### Phase 5: Documentation (1-2 days)
**Agent**: tech-writer

**Documents to Update**:
- `api-specification.md` - Add new endpoints and WebSocket events
- `data-flow-and-events.md` - Document new event flows
- `architecture-overview.md` - Add new components
- `feature-test-shot.md` - Update with implementation details
- Update wireframes if UI changes

---

## Dependencies

### Technical Dependencies
- [ ] EXIF parsing library: `exifr` or `exif-parser`
- [ ] Image storage directory: `/data/test-shots/`
- [ ] CCAPI event polling support (verify camera supports it)

### Implementation Dependencies
- [ ] Phase 0 research must complete before backend work
- [ ] Backend API must be done before frontend can start
- [ ] Event polling service needed for enhanced photo capture
- [ ] Settings manager needed for both Settings card and Live View card

---

## Risks & Mitigation

### Risk 1: CCAPI Event Polling Blocking
**Risk**: Event polling with `continue=on` is blocking - might interfere with other operations
**Mitigation**: Run polling in separate async context, implement timeout/retry logic

### Risk 2: Live View Performance
**Risk**: Live view images might be large, slow to transfer
**Mitigation**: Start with "small" size, test performance, optimize if needed

### Risk 3: Settings Complexity
**Risk**: 70+ camera settings - UI could be overwhelming
**Mitigation**: Use collapsible groups, progressive disclosure, focus on "common" settings

### Risk 4: Storage Management
**Risk**: Test shot images could fill disk
**Mitigation**: Implement aggressive cleanup strategy, monitor disk usage

### Risk 5: Mode Change During Settings Edit
**Risk**: User editing settings when camera mode changes externally
**Mitigation**: Lock settings during edit, show warning on mode change, auto-refresh on apply

---

## Open Questions

### For User Decision:
1. **Live preview on settings page**: Do you want continuous live view while adjusting settings? (High complexity)
2. **Image comparison**: Side-by-side comparison view for multiple images?
3. **Storage limits**: How many test images should we keep? (Suggest: 20 live view, 50 photos)
4. **Settings presets**: Priority for save/load settings feature?

### For Technical Validation:
1. Does EOS R50 support event polling? (Verify in Phase 0)
2. What's the actual size difference between "small_fine" and "large_raw"?
3. Can we reliably correlate `addedcontents` events with our photo requests?
4. How fast is live view `/flip` response? (Need < 2 seconds for good UX)

---

## Estimated Timeline

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| Phase 0: Research | 2-3 days | Camera availability |
| Phase 1: Backend | 3-5 days | Phase 0 complete |
| Phase 2: Settings UI | 3-4 days | Phase 1 API done |
| Phase 3: Test Shot UI | 4-5 days | Phase 1 API done |
| Phase 4: Integration | 2-3 days | Phases 2&3 done |
| Phase 5: Documentation | 1-2 days | Phase 4 done |
| **Total** | **15-22 days** | Sequential phases |

**Note**: Some overlap possible (e.g., Settings UI and Test Shot UI can be parallel after backend done)

---

## Success Criteria

### Must Have (MVP)
- [ ] Capture and view live view images from camera
- [ ] Display and edit camera settings
- [ ] Apply settings to camera successfully
- [ ] Take test photos with metadata extraction
- [ ] View, download, and delete test images
- [ ] Navigate between multiple images
- [ ] Settings organized by functional groups
- [ ] Works on both desktop and mobile

### Should Have
- [ ] Settings validation before apply
- [ ] Event polling for camera state changes
- [ ] Enhanced photo capture with timing data
- [ ] Automatic file cleanup
- [ ] Fullscreen image viewer
- [ ] Image comparison between settings

### Nice to Have
- [ ] Save/load settings presets
- [ ] Continuous live preview on settings page
- [ ] Side-by-side image comparison
- [ ] Image zoom/pan in fullscreen
- [ ] Histogram display
- [ ] Focus peaking overlay

---

## Next Steps

1. **User Review**: Review this plan, answer open questions
2. **Phase 0 Kickoff**: Assign ccapi-camera-specialist agent to research
3. **Create Research Report Template**: Define what data we need from Phase 0
4. **Update Feature Spec**: Incorporate research findings
5. **Begin Phase 1**: Start backend implementation

---

## Appendix: CCAPI Endpoints Referenced

### Live View
- `POST /ccapi/ver100/shooting/liveview` - Enable/configure live view
- `GET /ccapi/ver100/shooting/liveview/flip` - Get single live view image
- `GET /ccapi/ver100/shooting/liveview/scroll` - Streaming live view

### Settings
- `GET /ccapi/ver100/shooting/settings` - Get ALL settings
- `GET /ccapi/ver100/shooting/settings/{name}` - Get specific setting
- `PUT /ccapi/ver100/shooting/settings/{name}` - Update specific setting

### Photo Capture
- `POST /ccapi/ver100/shooting/control/shutterbutton` - Take photo
- `GET /ccapi/ver100/contents/{path}` - Download image

### Event Polling
- `GET /ccapi/ver100/event/polling?continue=on` - Long-poll for events
- Returns: `addedcontents`, mode changes, setting changes, etc.

---

## Status Updates

### 2025-10-02 - Initial Analysis Complete
- Document analyzed
- Issues identified
- Implementation plan created
- Awaiting user review and Phase 0 kickoff
