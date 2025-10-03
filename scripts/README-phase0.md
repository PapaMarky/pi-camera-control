# Phase 0 Research Script

## Quick Start

### On Mac (Deploy)
```bash
# Sync code to Pi
rsync -av --exclude=node_modules . pi@picontrol-002.local:~/pi-camera-control/

# SSH to Pi
ssh pi@picontrol-002.local
```

### On Pi (Execute)
```bash
cd ~/pi-camera-control

# Install dependencies (if needed)
npm install

# Ensure camera is connected to network
# Camera should be in shooting mode (not playback)

# Run research
node scripts/phase0-research.js

# Results saved to: ./data/phase0-research/
```

## What This Tests

1. **Live View Performance** - Is it fast enough? (<3s target)
2. **Event Polling Behavior** - CRITICAL: Does polling block camera control?
3. **Camera Settings** - What's available? What's the smallest quality?
4. **EXIF Extraction** - Can we get metadata from photos?

## Expected Output

```
data/phase0-research/
├── liveview-test.jpg              # Live view sample
├── event-polling-response.json    # Event data
├── camera-settings.json           # All settings
├── sample-photo.jpg               # Sample from camera
├── sample-exif.json               # Extracted metadata
└── phase0-results.json            # Complete results
```

## Troubleshooting

### Camera not found
- Check camera is on and in shooting mode (not playback)
- Verify camera IP: default is 192.168.4.2 on Pi AP
- Manually specify IP: `CAMERA_IP=192.168.x.x node scripts/phase0-research.js`

### Permission errors
- Make sure you're running as user with access to ./data/
- Create directory manually if needed: `mkdir -p data/phase0-research`

### Timeout errors
- Camera may be busy - wait and retry
- Check network connection to camera
- Increase timeout in script if doing long exposures

## After Running

1. Review console output for test summary
2. Check `phase0-results.json` for structured data
3. Update `docs/phase0-ccapi-research.md` with findings
4. Decide: Ready for Phase 1 backend development?

## Critical Question

**Does event polling block camera operations?**

The script will test if we can:
1. Start event polling (long-poll)
2. Take a photo WHILE polling is active
3. Receive addedcontents event

**If YES (non-blocking)**: We can use concurrent pattern
**If NO (blocking)**: We must use sequential pattern

This determines our entire implementation strategy for photo capture with event tracking.
