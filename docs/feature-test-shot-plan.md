# Test Shot Feature - Implementation Plan

**Feature Branch**: `feature/test-shot-implementation`
**Status**: Analysis & Planning Phase
**Last Updated**: 2025-10-02

## Executive Summary

This document provides analysis of the Test Shot feature specification and an MVP-first implementation plan.

**Strategy**: Build minimal working prototype in ~1 week, test with real camera, then iterate based on actual usage experience.

**MVP Scope** (Phases 0-3, ~6-9 days):

- Capture live view images from camera
- Display images in simple gallery
- View fullscreen
- Basic error handling
- **Goal**: Working feature to gather real usage feedback

**Post-MVP Iterations** (Phases 4-6, ~6-9 days):

- Add features based on MVP experience
- Settings display and editing
- Test photo capture with EXIF
- Polish and documentation

**Key Simplifications from User Feedback**:

- Event polling: Simple on-demand only (not continuous)
- File naming: User's original simple format (no sequence numbers)
- Photo correlation: Obvious (camera takes one at a time)
- Storage: No cleanup initially, observe usage first
- Settings UI: Manual save with Apply button

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

**User Input**

- I was only suggesting that we poll the camera settings while on the Camera Settings page because the settings might be
  changed on the camera and we might want to update the settings screen to reflect changes on the camera or at least
  warn the user of the changes on the camera.
- Because polling for setting changes is blocking wrt the camera (NOTE we should confirm this assumption. The camera
  might allow a polling connection and a control connection), we should
  only enable the polling when we are on the settings screen. (ie start when we enter the screen, stop when
  we leave.)
- We should poll CCAPI events and broadcast them via WebSocket? (Recommended)
  - We may want polling to happen in a separate thread so that the entire server is not blocked while we are polling.
  - This might already be how things work. I didn't check.

**Updated Recommendation Based on User Feedback**:

- **For Photo Capture**: Simple on-demand polling - start poll, take photo, wait for `addedcontents`, stop poll
- **For Settings Page** (Optional/Future): Start polling on page enter, stop on page exit to detect external camera changes
- **Threading**: Ensure polling runs in separate async context to avoid blocking server
- **Phase 0 Task**: Test if polling blocks camera operations (can camera handle simultaneous poll + control?)

---

#### Issue 2: Settings Update Strategy - Immediate vs Manual Save

**Location**: Lines 13-14 - "If the ccapi is responsive enough..."

**Problem**: The document proposes a conditional UX based on CCAPI performance testing that hasn't been done yet.

**Questions**:

- How do we measure "responsive enough"? What's the acceptable latency?
  - **User Input** This is for user interface not device control, so "Acceptable" would be fast enough that it is not
    annoying to the user. I think for the first version of the feature we should use the unsaved changes indicator to
    make it obvious to the user that the currently entered settings have not been sent to the camera yet.
- Should there be an "unsaved changes" indicator or not?
  - **User Input** See above.
- What happens if settings change fails mid-update?
  - **User Input** We show an error to the user and leave the page dirty.
- How do we handle conflicts between user changes and camera mode changes?
  - **User Input** The same way we handle any failure: we inform the user and let them decide what to do.

**Recommendation**: Start with **manual save** approach (safer, clearer UX). Can optimize to immediate update after field testing shows it's reliable.

- **User Input** I agree.

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

- **User Input** I agree.

---

#### Issue 4: Image File Naming Collision

**Location**: Lines 47-48 - "image file names from the camera should not be considered unique"

**Problem**: Good catch! Canon cameras reset numbering, files can have same name across dates.

**Solution Specified**: `YYYYMMDD_HHMMSS_<imagefile name>`

**Additional Questions**:

- What if two photos have same timestamp (burst mode, intervalometer)?
  - **User Input** The camera will not create two sequential images with the same name. The camera creates images
    with a 4 digit number that increases with each image created. When the 4 digits are used up (9999) the camera
    creates a new directory (with a 3 digit increasing number in the name). New images go into the new directory.
    The datetime plus the image name with 4 digits is more than sufficient for our needs.
- Should we use the camera's timestamp or download timestamp?
  - **User Input** As I said in my document: `YYYYMMDD_HHMMSS_<imagefile name> where the timestamp comes from the metadata in the image file indicating when the photo was taken. If the metadata does not include a timestamp, use the download time with a "dl" appended.`
- Where do we store these files? `/data/test-shots/`?
  - That would be fine. Anywhere as long as it is a well known location
- Do we have a cleanup strategy? (Disk space management)
  - **User Input**
    - I am using a 256 Gb SD card in the pi. We should consider this eventually, but it is not an urgent need.
    - I would recommend: Delete any image files older than N days old where N is configurable by the user (but that requires a new configuration feature which we have not planned yet.)

**Updated Recommendation Based on User Feedback**:

```
Format: YYYYMMDD_HHMMSS_<original_name>
- YYYYMMDD_HHMMSS from EXIF timestamp (photo capture time)
- If EXIF missing: YYYYMMDD_HHMMSS_dl_<original_name> (download time)
- Camera's 4-digit numbering + directory structure prevents collisions
- Store in /data/test-shots/liveview/ and /data/test-shots/photos/
- NO auto-cleanup initially - observe actual usage first
- Future: Configurable age-based cleanup (N days)
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

- **User Input** I agree
  - Note that my list (M, Av, Tv, P, etc.) refers to the setting of the physical shootingmodedial on the camera. There is an api for ignoring the shooting mode dial that we also need to research more.

---

#### Issue 6: Photo Sequence - Good Idea But Complex

**Location**: Lines 39-44 - Using event polling sequence for photo capture

**Analysis**: The document correctly identifies that using CCAPI event polling for photo capture provides:

1. Actual photo completion time (for timing validation)
2. File path in `addedcontents` field
3. Better synchronization for intervalometer

**Updated Complexity Based on User Feedback**:

- Simple on-demand polling: Start poll → Take photo → Wait for `addedcontents` → Stop poll
- No correlation complexity: Camera takes one photo at a time, so next `addedcontents` is our photo
- Simple error handling: Timeout after reasonable period (30s?), report to user
  - **User input** There is a minimum shutter speed. I think it is 30s but we should check the settings documentation. We should add 5s for a safety margin. Eventually we can test by setting shutter speed to the longest value, taking pictures and seeing how much pad we need.

**Recommendation**: Implement as described - much simpler than initially planned. Provides photo completion time and file path.

---

#### Issue 7: Settings Extraction from Metadata

**Location**: Line 46 - "Settings information for the photo should be extracted from metadata"

**Questions**:

- Use EXIF parsing library (which one)?
- What settings are we extracting? (ISO, shutter, aperture, WB, etc.)
  - **User input** We can get a list of what is available from sample images and decide what we want or don't want. Generally it will match the settings we set in Camera Settings. The same settings we show with the Live View.
- How do we display them in UI?
  - **User input** The same way we show them in Live View.
- What if EXIF data is missing or corrupted?
  - **User input** Like any other failure, we report the failure to the user.

**Recommendation**: Use `exifr` npm package - lightweight, well-maintained. Extract: ISO, Shutter Speed, Aperture, WB, Focus Mode, Timestamp, Camera Model.

---

### 📋 Missing Requirements

1. **Error Handling**: What happens when live view fails? Camera disconnects mid-session? 2. **User input** Report the error to the user just like we do with every other error.
2. **Concurrent Usage**: Can multiple users access Test Shot simultaneously? 3. **User input** This would be a nice to have, but in this hobbyist system it should never be a problem.
3. **Session Persistence**: Do test shot images survive server restart? 4. **User input** yes.
4. **Storage Limits**: Max number of images? Max storage per session? 5. **User input** Once we get the basics working and get a feel for actual storage usage we can revisit this.
5. **Image Size Override**: Document mentions "lowest size/quality" for test photos (line 34-36) - what are the actual CCAPI values? 6. **User input** RTFM
6. **Navigation Flow**: How does user get back from fullscreen view? Back button? Swipe? 7. **User input** Swipe would be best, but ESC on desktop or even just a tap / click near the center of the image.
7. **Mobile Optimization**: Touch gestures? Pinch to zoom in fullscreen? 8. **User input** those would be great features. Once we get the basics working, lets explore them.

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

### Photo Workflow with Event Polling (Updated)

```
1. User clicks "Take Photo"
2. Temporarily override size/quality settings:
   - GET /shooting/settings/stillimagequality
   - PUT /shooting/settings/stillimagequality {value: "<smallest_value_from_phase0>"}
3. Start event polling: GET /event/polling?continue=on
4. POST /shooting/control/shutterbutton {af: <value_from_camera_settings>}
5. Wait for event polling to return addedcontents: [...]
6. Stop event polling
7. Download photo from URL in addedcontents[0]
8. Restore previous quality settings
9. Extract EXIF metadata
10. Rename file: YYYYMMDD_HHMMSS_<original> (timestamp from EXIF)
11. Broadcast to WebSocket: {id, url, metadata} - clients request image via GET
```

**Clarifications**:

- AF setting from current camera settings (not hardcoded true)
- Broadcast metadata + URL, not full image data
- Clients download image via GET request when needed

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

### Decision 1: Event Polling Implementation (UPDATED)

**MVP Approach: On-Demand Polling Only**

- Create `src/camera/event-polling.js` utility
- Use only for photo capture: start → wait → stop
- Simple, no continuous background polling
- No blocking concerns

**Future Enhancement: Settings Page Polling**

- Optional: Poll only when Settings page is active
- Start on page enter, stop on page exit
- Detects external camera changes (mode, settings)
- **Requires Phase 0 testing**: Verify polling doesn't block camera operations

**Decision**: Start with Option B (on-demand), add page-specific polling after MVP if needed

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

**Decision**: Option B (disk storage) with NO cleanup initially

- Observe actual storage usage patterns
- Add configurable age-based cleanup later if needed
- 256GB SD card provides plenty of headroom for testing

---

### Decision 3: Settings UI Auto-Update

**Start**: Manual save with "Apply" button
**Future**: Can add auto-apply toggle in user preferences

- **User input** I agree

---

## Implementation Phases - MVP First Approach

### Phase 0: CCAPI Research & Validation (1-2 days) ✅ COMPLETE

**Agent**: ccapi-camera-specialist
**Goal**: Answer critical questions for MVP implementation
**Status**: ✅ Complete (2025-10-02)
**Actual Time**: ~30 minutes

**Key Findings**:

- ✅ Live view: 2.8s total (1.6s enable + 1.2s capture) - acceptable for MVP
- ✅ Image size: ~29KB (small) - good for preview
- ✅ **CRITICAL**: Camera CAN handle concurrent polling + control operations (347ms response time)
- ✅ 42 camera settings available
- ✅ Research results stored in `/tmp/phase0-results.json`

**MVP-Critical Research**:

1. **Live View Testing**:
   - POST `/liveview` with "small" size
   - GET `/liveview/flip` - measure response time
   - Verify JPEG size and quality acceptable for UI preview

2. **Event Polling for Photo Capture**:
   - Start poll: `GET /event/polling?continue=on`
   - Take photo: `POST /shooting/control/shutterbutton`
   - Verify `addedcontents` event received
   - **CRITICAL**: Test if second control request works while polling active
   - Measure time from shutter to event

3. **Settings Query**:
   - GET `/shooting/settings` - capture full response
   - Identify smallest quality setting value for test photos
   - Count total settings available

4. **EXIF Extraction**:
   - Download sample photo
   - Test EXIF extraction with `exifr` library
   - Document available metadata fields

**Non-MVP Research (Deferred to Post-Prototype)**:

- Settings by mode comparison (M, Av, Tv, P)
- Settings organization/grouping
- Continuous polling for settings page

**Deliverables**:

- Quick research report with answers to MVP questions
- Sample settings JSON response
- Sample EXIF metadata
- Performance measurements (live view time, event poll latency)

---

### Phase 1: MVP Backend (2-3 days) ✅ COMPLETE

**Agents**: backend-guardian, ccapi-camera-specialist
**Goal**: Minimal working backend for single live view capture and basic settings
**Status**: ✅ Complete (2025-10-02)
**Actual Time**: ~2 hours

**What Was Built**:

- ✅ LiveViewManager with CCAPI integration
- ✅ REST API endpoints for live view operations
- ✅ WebSocket events for real-time updates
- ✅ Unit tests (12 tests, all passing)
- ✅ Full test suite passing (315 tests)
- ✅ Pi deployment and field testing successful

**MVP Backend Components** (Minimal):

#### 1.1 Live View Manager (Minimal)

- **File**: `src/camera/liveview-manager.js`
- **MVP Scope**:
  - Enable live view (POST /liveview {liveviewsize: "small"})
  - Capture single image (GET /liveview/flip)
  - Save to disk: `/data/test-shots/liveview/<timestamp>.jpg`
  - Disable live view when done
  - Simple in-memory list of captured images

#### 1.2 Event Polling Utility (Minimal)

- **File**: `src/utils/event-polling.js`
- **MVP Scope**:
  - Single function: `waitForPhotoComplete()`
  - Start poll → wait for `addedcontents` → return file path → stop poll
  - 30 second timeout with error

#### 1.3 Test Photo Service (Minimal)

- **File**: `src/camera/test-photo.js`
- **MVP Scope**:
  - Override quality to smallest
  - Use event polling to capture
  - Download image
  - Extract EXIF (ISO, shutter, aperture, WB)
  - Rename with EXIF timestamp
  - Save to `/data/test-shots/photos/`
  - Restore quality setting

**MVP API Endpoints** (Minimal):

```javascript
// Live View - MVP only
POST   /api/camera/liveview/capture    // Capture ONE image, return URL
GET    /api/camera/liveview/images     // List captured images
GET    /api/camera/liveview/images/:id // Download specific image
DELETE /api/camera/liveview/clear      // Clear all (for testing)

// Camera Settings - MVP only (read-only display)
GET    /api/camera/settings             // Existing endpoint, add formatting

// Test Photo - MVP only
POST   /api/camera/photo/test           // Capture test photo, return metadata
GET    /api/camera/photos/test          // List test photos
GET    /api/camera/photos/test/:id      // Download specific photo
```

**MVP WebSocket Events**:

```javascript
// Server -> Client (Minimal)
{ type: "liveview_captured", data: { id, url, timestamp } }
{ type: "test_photo_ready", data: { id, url, exif: {...} } }
{ type: "error", data: { message, operation } }

// Client -> Server (Minimal)
{ type: "capture_liveview", data: {} }
{ type: "capture_test_photo", data: {} }
```

**MVP Tests** (Basic Coverage):

- Live view capture and retrieval
- Event polling for photo
- EXIF extraction
- File naming with timestamp
- API endpoint smoke tests

---

### Phase 2: MVP Frontend - Test Shot View (2-3 days) ✅ COMPLETE

**Agent**: frontend-guardian (manual implementation after auto-generation failed)
**Goal**: Simple working UI to capture and view live view images
**Status**: ✅ Complete (2025-10-02)
**Actual Time**: ~2 hours (including debugging and Pi testing)

**What Was Built**:

- ✅ TestShotUI module with safe initialization pattern
- ✅ Live view capture with visual feedback
- ✅ Simple gallery with click-to-open fullscreen
- ✅ Clear all functionality with confirmation
- ✅ Fixed defensive DOM element checks in camera.js
- ✅ Successful deployment and field testing on Pi

**MVP Test Shot Card** (Minimal):

- **File**: `public/js/test-shot.js`
- **Features**:
  - "Capture Live View" button
  - Display captured images in simple list/grid
  - Click image to view larger (opens in new tab)
  - "Clear All" button with confirmation
  - Show basic error messages
  - Buttons enable/disable with camera connection state

**MVP HTML Structure**:

```html
<div id="test-shot-card" class="function-card">
  <h2>Test Shot</h2>

  <div class="capture-controls">
    <button id="capture-liveview-btn">📷 Capture Live View</button>
    <button id="clear-liveview-btn">🗑️ Clear All</button>
  </div>

  <div id="liveview-gallery" class="image-grid">
    <!-- Images populated here -->
  </div>

  <div id="image-viewer" class="modal" style="display:none">
    <img id="viewer-image" />
    <button class="close-btn">✕</button>
  </div>
</div>
```

**MVP Interactions**:

1. Click "Capture Live View" → Show loading → Display new image
2. Click image thumbnail → Show fullscreen
3. Click/ESC in fullscreen → Close
4. Click "Clear All" → Confirm → Remove all images

**Deferred to Post-MVP**:

- Settings display on images
- Image comparison
- Download functionality
- Swipe gestures
- Zoom/pan in fullscreen
- Test photo capture (Phase 3)

**MVP Tests**:

- E2E: Capture live view
- E2E: View fullscreen
- E2E: Clear all

---

### Phase 3: MVP Integration & First Test (1 day)

**Agents**: backend-guardian, frontend-guardian, test-validator
**Goal**: Get MVP working end-to-end, test on real hardware

**Integration Tasks**:

1. Deploy to Pi: rsync code to picontrol-002
2. Restart service
3. Manual testing workflow:
   - Open Test Shot card
   - Capture live view image
   - Verify image displays
   - View fullscreen
   - Capture another image
   - Clear all images
4. Fix critical bugs
5. Document what works / what doesn't

**Success Criteria for MVP**:

- [ ] Can capture live view image
- [ ] Image displays in UI
- [ ] Fullscreen viewer works
- [ ] Clear all works
- [ ] No crashes/exceptions

**Post-MVP Review**:

- What's the live view response time?
- Is image quality acceptable?
- Are there UX issues?
- What features are most needed next?

---

### Phase 4: Iteration 1 - Add Core Features (2-3 days)

**Based on MVP feedback, add next priority features**

**Likely Additions**:

1. **Settings Display** (if MVP shows it's needed):
   - Show camera settings with each live view image
   - GET /shooting/settings when capturing
   - Display ISO, shutter, aperture, WB

2. **Test Photo Capture**:
   - Add "Take Photo" button
   - Implement event polling photo workflow
   - Display EXIF metadata
   - Download functionality

3. **Better Image Management**:
   - Delete individual images
   - Image timestamps
   - Persistent storage across restarts

**Defer Until Needed**:

- Camera Settings editing
- Settings presets
- Image comparison
- Advanced navigation

---

### Phase 5: Iteration 2 - Camera Settings (3-4 days)

**Only if Phase 4 shows settings editing is priority**

**Camera Settings Card**:

- Read-only display of all settings first
- Add editing for "common" settings
- "Apply" button with unsaved indicator
- Error handling for failed updates

**Settings Organization**:

- Use Phase 0 research (deferred earlier)
- Query settings by mode
- Create collapsible groups
- Progressive disclosure of advanced settings

---

### Phase 6: Polish & Documentation (1-2 days)

**Final touches before considering feature complete**

**Polish**:

- Loading states
- Error message improvements
- Mobile responsiveness check
- Performance review

**Documentation**:

- Update `api-specification.md`
- Update `feature-test-shot.md` with actual implementation
- Add to user documentation

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

## Estimated Timeline - MVP First

| Phase                    | Duration       | Dependencies        | Deliverable                 |
| ------------------------ | -------------- | ------------------- | --------------------------- |
| Phase 0: Research        | 1-2 days       | Camera availability | CCAPI validation, perf data |
| Phase 1: MVP Backend     | 2-3 days       | Phase 0 complete    | Live view capture API       |
| Phase 2: MVP Frontend    | 2-3 days       | Phase 1 API done    | Working Test Shot card      |
| Phase 3: MVP Integration | 1 day          | Phase 2 done        | **Working prototype**       |
| **MVP Total**            | **6-9 days**   | Sequential          | **Usable feature**          |
| Phase 4: Iteration 1     | 2-3 days       | MVP feedback        | Core features added         |
| Phase 5: Iteration 2     | 3-4 days       | If needed           | Settings editing            |
| Phase 6: Polish & Docs   | 1-2 days       | Features done       | Production ready            |
| **Full Feature**         | **12-18 days** | Iterative           | **Complete feature**        |

**Approach**: MVP in ~1 week, then iterate based on actual usage

---

## Success Criteria - Redefined for MVP

### Minimal Viable Product (Phases 0-3)

- [ ] **Phase 0**: CCAPI research answers all critical questions
- [ ] **Phase 1**: Backend can capture live view images
- [ ] **Phase 2**: UI displays captured images
- [ ] **Phase 3**: End-to-end workflow works on Pi
- [ ] Acceptable performance (< 3 seconds per capture)
- [ ] No crashes during basic usage
- [ ] Images persist across server restart

### Iteration 1 (Phase 4) - Likely Additions

- [ ] Settings displayed with each image
- [ ] Test photo capture with EXIF
- [ ] Individual image deletion
- [ ] Download functionality
- [ ] Basic error handling

### Iteration 2 (Phase 5) - If Needed

- [ ] Camera settings editing (read/write)
- [ ] Apply button with validation
- [ ] Settings organized by category
- [ ] Unsaved changes indicator

### Nice to Have - Future

- [ ] Settings presets (save/load)
- [ ] Side-by-side comparison
- [ ] Advanced navigation (swipe, keyboard)
- [ ] Image zoom/pan
- [ ] Continuous live preview on settings page
- [ ] Histogram/focus peaking overlays

---

## Next Steps to Start MVP

1. ✅ **User Review Complete**: Feedback incorporated into plan
2. **Phase 0 Kickoff**: Begin CCAPI research
   - Assign ccapi-camera-specialist agent
   - Test live view endpoints
   - Test event polling
   - Measure performance
   - Document findings
3. **Phase 1**: Build minimal backend
   - Live view manager
   - Event polling utility
   - Basic API endpoints
4. **Phase 2**: Build minimal frontend
   - Test Shot card
   - Image gallery
   - Fullscreen viewer
5. **Phase 3**: Integration test
   - Deploy to Pi
   - Test end-to-end
   - Gather feedback
   - **Decision point**: What to build next?

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

### 2025-10-02 - Phase 2 MVP Frontend Complete

- ✅ Phase 0: CCAPI research complete (~30 minutes)
- ✅ Phase 1: Backend MVP complete (~2 hours)
- ✅ Phase 2: Frontend MVP complete (~2 hours)
- **Next**: Phase 3 - MVP Integration & First Test

**Phase 2 Achievements**:

- ✅ TestShotUI module with safe initialization
- ✅ Live view capture working (~3 seconds)
- ✅ Gallery display with click-to-open functionality
- ✅ Fixed null pointer errors in camera.js with defensive checks
- ✅ Successfully tested on Pi hardware
- ✅ All functionality working without errors

**Key Lessons from Phase 2**:

- Auto-generated frontend code broke existing UI - manual incremental approach safer
- Defensive DOM element checks crucial for robustness
- Simple inline styles sufficient for MVP
- Direct API calls via fetch() simpler than WebSocket for MVP
- Field testing on Pi essential to catch integration issues

**Phase 3 Success Criteria**:

- [ ] Can capture live view image
- [ ] Image displays in UI
- [ ] Fullscreen viewer works (opens in new tab)
- [ ] Clear all works
- [ ] No crashes/exceptions
- **Status**: All criteria met during Phase 2 testing ✅

### 2025-10-02 - MVP Plan Complete

- ✅ Feature specification analyzed
- ✅ 7 critical issues identified and resolved with user feedback
- ✅ User feedback incorporated
- ✅ Plan restructured for MVP-first approach
- ✅ Simplified complexity based on user clarifications
- ✅ Phase 0 research infrastructure created

**Key Decisions Made**:

- Simple on-demand event polling (not continuous)
- Original file naming format (YYYYMMDD*HHMMSS*<original>)
- No cleanup initially - observe usage
- Manual settings save with Apply button
- MVP in ~1 week, iterate after testing
