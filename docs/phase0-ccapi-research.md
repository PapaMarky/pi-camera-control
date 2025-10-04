# Phase 0 CCAPI Research Report

**Feature**: Test Shot Implementation
**Research Date**: 2025-10-02
**Status**: Ready for Testing
**Camera**: Canon EOS R50
**Test Platform**: Raspberry Pi (picontrol-002.local)

---

## Executive Summary

This document reports findings from Phase 0 research of CCAPI functionality critical for the Test Shot feature MVP. The research answers four key questions needed to proceed with backend development.

**Quick Status**: ⏳ PENDING EXECUTION

---

## Test 1: Live View Capture Performance

### Purpose

Verify that live view image capture meets UX requirements (< 3 seconds response time) and produces acceptable image quality for UI preview.

### CCAPI Endpoints Tested

- `POST /ccapi/ver100/shooting/liveview` - Enable/disable live view
- `GET /ccapi/ver100/shooting/liveview/flip` - Capture single JPEG image

### Expected Workflow

```
1. POST /liveview {"liveviewsize": "small", "cameradisplay": "on"}
2. GET /liveview/flip -> Download JPEG
3. POST /liveview {"liveviewsize": "off"}
```

### Results

**Response Time**: ⏳ PENDING

**Image Quality**: ⏳ PENDING

**Image Size**: ⏳ PENDING

**UX Assessment**: ⏳ PENDING (Target: < 3 seconds acceptable)

### Sample Image

- Location: `./data/phase0-research/liveview-test.jpg`
- Status: ⏳ PENDING

### Findings

⏳ PENDING EXECUTION

### Recommendation

⏳ PENDING

---

## Test 2: Event Polling + Simultaneous Control (CRITICAL)

### Purpose

**CRITICAL QUESTION**: Can the camera handle event polling and control commands simultaneously, or does polling block camera operations?

This is the most important question for Phase 0 because it determines our implementation strategy:

- **If polling WORKS during control**: We can start polling before taking photo
- **If polling BLOCKS control**: We must take photo first, then poll for results

### CCAPI Endpoints Tested

- `GET /ccapi/ver100/event/polling?continue=on` - Long-poll for camera events
- `POST /ccapi/ver100/shooting/control/shutterbutton` - Take photo while polling active

### Expected Workflow

```
1. Start event polling (long-poll, blocks until event or timeout)
2. While polling active, issue shutter command
3. Observe: Does shutter command succeed or fail?
4. Wait for addedcontents event
5. Measure latency from shutter to event
```

### Results

**Simultaneous Operation Test**: ⏳ PENDING

**Blocking Behavior**: ⏳ PENDING

- Can camera accept control commands during active polling?

**Event Latency**: ⏳ PENDING (Shutter → addedcontents time)

**Event Data**: ⏳ PENDING

- `addedcontents` field populated correctly?
- File path information available?

### Sample Data

- Location: `./data/phase0-research/event-polling-response.json`
- Status: ⏳ PENDING

### Findings

⏳ PENDING EXECUTION

### Recommendation

⏳ PENDING

**Implementation Impact**:

- If non-blocking: Use concurrent polling pattern
- If blocking: Use sequential pattern (photo → poll → wait)

---

## Test 3: Camera Settings Query

### Purpose

Retrieve all available camera settings to:

1. Identify the smallest quality setting value (for test photos)
2. Understand available settings for future Settings UI
3. Count total settings for UI planning

### CCAPI Endpoints Tested

- `GET /ccapi/ver100/shooting/settings` - Get all shooting parameters

### Results

**Total Settings Count**: ⏳ PENDING

**Quality Setting**: ⏳ PENDING

- Current value: ⏳ PENDING
- Available options: ⏳ PENDING
- Smallest (recommended for test shots): ⏳ PENDING

### Sample Data

- Location: `./data/phase0-research/camera-settings.json`
- Status: ⏳ PENDING

### Key Settings Identified

⏳ PENDING EXECUTION

Categories expected:

- Exposure: `av`, `tv`, `iso`, `exposure`, `metering`
- Focus: `afoperation`, `afmethod`
- Quality: `stillimagequality`, `stillimageaspectratio`
- Color: `wb`, `colortemperature`, `colorspace`, `picturestyle`
- Advanced: `drive`, `flash`, `aeb`, etc.

### Findings

⏳ PENDING EXECUTION

### Recommendation

⏳ PENDING

---

## Test 4: EXIF Extraction

### Purpose

Verify that EXIF metadata can be extracted from camera photos and identify which fields are available for display in UI.

### Tools Tested

- `exifr` npm library (v7.1.3)

### Expected Metadata Fields

From CCAPI documentation and Canon EOS cameras:

- ISO speed
- Shutter speed (exposure time)
- Aperture (F-number)
- White balance
- Timestamp (DateTimeOriginal)
- Camera model
- Lens information

### Results

**EXIF Extraction**: ⏳ PENDING

**Available Fields**: ⏳ PENDING

**Timestamp Format**: ⏳ PENDING (For file naming: YYYYMMDD_HHMMSS)

### Sample Data

- Photo: `./data/phase0-research/sample-photo.jpg`
- EXIF Data: `./data/phase0-research/sample-exif.json`
- Status: ⏳ PENDING

### Findings

⏳ PENDING EXECUTION

### Recommendation

⏳ PENDING

---

## Overall Findings Summary

### MVP-Critical Questions Answered

#### 1. Is live view fast enough for good UX?

⏳ PENDING (Target: < 3 seconds)

#### 2. Does polling block camera operations? (CRITICAL)

⏳ PENDING

**Implementation Decision**: ⏳ PENDING

- Concurrent pattern: Start poll → Take photo (if supported)
- Sequential pattern: Take photo → Start poll → Wait (if blocking)

#### 3. What is the smallest quality setting?

⏳ PENDING

#### 4. What EXIF fields are available?

⏳ PENDING

---

## Performance Summary

| Test                  | Response Time | Status | Acceptable? |
| --------------------- | ------------- | ------ | ----------- |
| Live view capture     | ⏳ PENDING    | ⏳     | Target: <3s |
| Event polling latency | ⏳ PENDING    | ⏳     | Target: <5s |
| Settings query        | ⏳ PENDING    | ⏳     | N/A         |
| EXIF extraction       | ⏳ PENDING    | ⏳     | N/A         |

---

## Issues and Concerns

⏳ PENDING EXECUTION

---

## Recommendations for Phase 1

⏳ PENDING EXECUTION

Based on test results, will recommend:

1. Event polling strategy (concurrent vs sequential)
2. Live view implementation approach
3. Quality settings to use for test photos
4. EXIF fields to extract and display

---

## Next Steps

1. ✅ Research script created: `scripts/phase0-research.js`
2. ⏳ Execute research on Pi with camera connected
3. ⏳ Analyze results and update this document
4. ⏳ Make go/no-go decision for Phase 1 backend development

---

## How to Run Research

### Prerequisites

- Canon EOS R50 connected to same network as Pi
- Pi at picontrol-002.local accessible
- Camera in shooting mode (not playback)

### Execution Steps

**On your Mac** (to deploy script):

```bash
# Sync latest code to Pi
rsync -av --exclude=node_modules /Users/mark/git/pi-camera-control/ pi@picontrol-002.local:~/pi-camera-control/

# SSH to Pi
ssh pi@picontrol-002.local
```

**On the Pi**:

```bash
cd ~/pi-camera-control

# Install exifr if not already installed
npm install

# Make sure camera is connected and discoverable
# Check camera IP (usually 192.168.4.2 on Pi AP)

# Run research script
node scripts/phase0-research.js

# Or specify camera IP manually:
CAMERA_IP=192.168.4.2 node scripts/phase0-research.js

# Results will be saved to ./data/phase0-research/
ls -lh data/phase0-research/
```

### Expected Output

```
data/phase0-research/
├── liveview-test.jpg                # Live view sample image
├── event-polling-response.json      # Event polling data
├── camera-settings.json             # All camera settings
├── sample-photo.jpg                 # Sample photo from camera
├── sample-exif.json                 # Extracted EXIF data
└── phase0-results.json              # Complete test results
```

### After Execution

1. Review console output for test results
2. Check `phase0-results.json` for structured data
3. Update this document with findings
4. Make Phase 1 go/no-go decision

---

## Research Completion

**Date**: ⏳ PENDING
**Executed By**: ⏳ PENDING
**Camera IP**: ⏳ PENDING
**Duration**: ⏳ PENDING

**Phase 0 Status**: ⏳ NOT STARTED
**Ready for Phase 1?**: ⏳ PENDING RESULTS

---

## Appendix: CCAPI References

### Live View Endpoints

- **4.7.1**: Enable/disable live view
  - `POST /ccapi/ver100/shooting/liveview`
  - Request: `{"liveviewsize": "small|medium|large|off", "cameradisplay": "on|off|keep"}`

- **4.7.2**: Get live view image (flip method)
  - `GET /ccapi/ver100/shooting/liveview/flip`
  - Response: JPEG image data

### Event Polling

- **4.10.1**: Event polling
  - `GET /ccapi/ver100/event/polling?continue=on|off`
  - Long-poll that blocks until event or timeout
  - Response: `{"addedcontents": [...], "recordingtime": {...}, ...}`

### Settings

- **4.9.1**: Get all shooting parameters
  - `GET /ccapi/ver100/shooting/settings`
  - Response: Object with all settings and their current values/abilities

### Photo Capture

- **4.8.1**: Still image shooting
  - `POST /ccapi/ver100/shooting/control/shutterbutton`
  - Request: `{"af": boolean}`

---

**Document Version**: 1.0
**Last Updated**: 2025-10-02 (Created)
