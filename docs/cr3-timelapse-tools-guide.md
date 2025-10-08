# CR3 RAW Timelapse Processing Tools Guide

**Version:** 1.0
**Date:** 2025-10-08
**For:** Night Sky Timelapse Photography with Canon EOS R50

---

## Table of Contents

1. [Overview](#overview)
2. [CR3 vs JPEG Benefits](#cr3-vs-jpeg-benefits)
3. [Tool Comparisons](#tool-comparisons)
4. [Detailed Tool Reviews](#detailed-tool-reviews)
5. [Recommendations](#recommendations)
6. [Resources](#resources)

---

## Overview

This guide covers tools for processing CR3 (Canon RAW) timelapse sequences with exposure and white balance adjustments. The primary use case is night sky photography where:

- Moon appears and washes out the scene
- Sunset/sunrise transitions require exposure ramping
- White balance needs adjustment for color consistency

**Workflow Architecture:**

- **Raspberry Pi (Field):** Camera control and image capture
- **MacBook (Home):** RAW processing and video creation
- **No Pi post-processing** (limited power for RAW conversion)

---

## CR3 vs JPEG Benefits

### Why CR3 for Timelapses?

**Bit Depth:**

- CR3: 14-bit per channel (16,384 brightness levels)
- JPEG: 8-bit per channel (256 brightness levels)
- Result: Smoother gradients, less banding in night skies

**Exposure Recovery:**

- CR3: Recover ~4-5 stops of highlight/shadow detail
- JPEG: ~1 stop maximum
- Example: Overexposed moon can be rescued from CR3, lost in JPEG

**White Balance:**

- CR3: Sensor data before WB applied - adjust losslessly later
- JPEG: WB baked in - changing degrades quality
- Critical for: Sunset/sunrise where color temperature changes

**Color Space:**

- CR3: Full sensor gamut (wider than sRGB)
- JPEG: sRGB only
- Result: More color information for grading

**File Sizes (Canon R50):**

- CR3: ~25-30MB per image
- JPEG (large/fine): ~5MB per image
- 500-photo timelapse: 15GB (CR3) vs 2.5GB (JPEG)

### When CR3 Helps:

- ✅ Moon appears and overexposes the scene
- ✅ Sunrise/sunset exposure transitions
- ✅ Pulling detail from shadows (Milky Way)
- ✅ Color grading the final video
- ✅ Correcting exposure mistakes made in the field

### When JPEG is Fine:

- ✅ Exposure correct in-camera
- ✅ White balance correct
- ✅ Quick timelapse needed
- ✅ Limited storage/processing

---

## Tool Comparisons

### Quick Comparison Matrix

| Tool                        | CR3 Support  | Auto Ramping       | Video Export  | Cost          | Best For              |
| --------------------------- | ------------ | ------------------ | ------------- | ------------- | --------------------- |
| **LRTimelapse + Lightroom** | ✅ Excellent | ✅ Automatic       | ✅ Built-in   | $10/mo + €299 | Timelapse specialists |
| **DaVinci Resolve Studio**  | ✅ Native    | ⚠️ Manual          | ✅ Pro codecs | $295 once     | Video editors         |
| **Adobe Premiere Pro**      | ✅ Native    | ⚠️ Manual          | ✅ Pro codecs | $23/mo        | Adobe ecosystem       |
| **Final Cut Pro**           | ✅ Native    | ⚠️ Manual          | ✅ Pro codecs | $299 once     | Mac-only users        |
| **darktable + FFmpeg**      | ✅ Native    | ❌ Script required | ⚠️ Via FFmpeg | Free          | Budget/DIY            |

---

## Detailed Tool Reviews

### 1. LRTimelapse + Adobe Lightroom Classic ⭐⭐⭐

**Official Website:** https://lrtimelapse.com/

**What it does:**

- Keyframe-based exposure and white balance ramping
- Automatic flicker removal
- Built-in video rendering (no external tools needed)
- Designed specifically for "holy grail" timelapses (day-to-night transitions)

**Complete Workflow:**

```
1. Copy CR3 files from SD card to MacBook
2. Import to Adobe Lightroom Classic
3. Open sequence in LRTimelapse
4. Set keyframes at critical moments:
   - Frame 50: Sunset start (warm WB, -1 EV)
   - Frame 200: Sunset peak (warmer WB, 0 EV)
   - Frame 400: Moon appears (cool WB, +2 EV)
5. LRTimelapse auto-calculates smooth transitions
6. Click "Render Video" in LRTimelapse
   → Exports directly to MP4/MOV
7. Done!
```

**Video Export Features:**

- H.264 MP4
- Apple ProRes MOV
- Custom resolution/framerate
- Music overlay support

**Cost:**

- Adobe Lightroom Classic: $10/month (Photography Plan)
- LRTimelapse Free: €0 (limited to 400 frames, no video export)
- LRTimelapse Pro: €299 (one-time purchase, includes video rendering)

**Pros:**

- ✅ THE industry standard for timelapse
- ✅ Automatic exposure ramping (saves hours of manual work)
- ✅ Built-in flicker removal
- ✅ Large community with tutorials
- ✅ Complete solution (RAW → Video in one tool)
- ✅ Handles holy grail timelapses perfectly

**Cons:**

- ❌ Most expensive option
- ❌ Requires Lightroom subscription
- ❌ Learning curve (but many tutorials available)

**When to use:**

- You're serious about timelapse photography
- You frequently shoot sunrise/sunset/moonrise transitions
- You want professional-quality results
- You value time saved vs manual keyframing

**Learning Resources:**

- Official tutorials: https://lrtimelapse.com/learn/
- YouTube channel: https://www.youtube.com/user/LRTimelapse
- Forum: https://lrtimelapse.com/forum/

---

### 2. DaVinci Resolve Studio ⭐⭐

**Official Website:** https://www.blackmagicdesign.com/products/davinciresolve

**What it does:**

- Professional video editor with RAW support (Studio version only)
- Import CR3 sequences directly to timeline
- Color grading with keyframes
- Industry-standard video export

**Workflow:**

```
1. Copy CR3s from SD card
2. Open DaVinci Resolve Studio
3. Media Pool → Import → Image Sequence (select CR3s)
4. Drag to timeline (auto-detects sequence)
5. Color Tab:
   - Add keyframes for exposure/WB changes
   - Grade with curves, color wheels, HDR tools
   - Smooth transitions between keyframes
6. Deliver Tab → Export to MP4/ProRes/DNxHD
7. Done!
```

**Important Notes:**

- **Studio version ($295)** required for CR3/RAW support
- **Free version** does NOT support CR3 files
- GPU-accelerated processing (fast on modern Macs)

**Cost:**

- DaVinci Resolve Studio: $295 (one-time purchase)
- DaVinci Resolve Free: $0 (no CR3 support)

**Pros:**

- ✅ One-time purchase (no subscription)
- ✅ Professional color grading tools
- ✅ Native CR3 support in Studio version
- ✅ Industry-standard for video post-production
- ✅ Powerful for any video work (not just timelapses)
- ✅ GPU acceleration (fast rendering)

**Cons:**

- ❌ Not specialized for timelapse ramping
- ❌ Manual keyframing (more work than LRTimelapse)
- ❌ Steeper learning curve
- ❌ Overkill if you ONLY do timelapses
- ❌ Free version doesn't support RAW

**When to use:**

- You also do video editing work (not just timelapses)
- You prefer one-time purchase over subscriptions
- You want professional color grading control
- You're comfortable with manual keyframing

**Learning Resources:**

- Official training: https://www.blackmagicdesign.com/products/davinciresolve/training
- YouTube: Tons of free tutorials
- Book: "The Definitive Guide to DaVinci Resolve" (free PDF from Blackmagic)

---

### 3. Adobe Premiere Pro ⭐

**Official Website:** https://www.adobe.com/products/premiere.html

**What it does:**

- Professional video editor
- Import CR3 sequences via Adobe Camera Raw
- Lumetri Color for grading
- Integration with Adobe ecosystem

**Workflow:**

```
1. Copy CR3s from SD card
2. Premiere Pro → Import → browse to first CR3
   → Check "Image Sequence"
3. Right-click clip → Edit in Adobe Camera Raw
   - Adjust exposure/WB for keyframes
   - Use gradient adjustments over time
4. Timeline editing with keyframes
5. Export → Media Encoder → MP4/ProRes
```

**Cost:**

- Premiere Pro: $23/month (single app)
- Creative Cloud All Apps: $55/month (includes Premiere, Lightroom, After Effects, etc.)

**Pros:**

- ✅ Handles CR3 natively via Camera Raw
- ✅ Professional video tools
- ✅ Integrates with Lightroom edits
- ✅ Industry standard

**Cons:**

- ❌ Expensive subscription
- ❌ Not specialized for timelapse ramping
- ❌ More manual keyframe work than LRTimelapse
- ❌ Overkill for timelapse-only work

**When to use:**

- You already have Adobe Creative Cloud
- You need professional video editing features
- You're in the Adobe ecosystem

**Learning Resources:**

- Adobe tutorials: https://helpx.adobe.com/premiere-pro/tutorials.html
- LinkedIn Learning: Premiere Pro courses

---

### 4. Final Cut Pro (Mac Only) ⭐

**Official Website:** https://www.apple.com/final-cut-pro/

**What it does:**

- Apple's professional video editor
- Native Mac optimization
- Import CR3 sequences
- Color grading with Color Board/Color Wheels

**Workflow:**

```
1. Copy CR3s from SD card
2. Final Cut Pro → Import as image sequence
3. Color Board for exposure/WB adjustments
4. Add keyframes for ramping
5. Export → MP4/ProRes
```

**Cost:**

- $299 (one-time purchase)

**Pros:**

- ✅ Native Mac app (optimized for Apple Silicon)
- ✅ One-time purchase
- ✅ Fast performance on Mac
- ✅ Good color tools

**Cons:**

- ❌ Mac-only
- ❌ Not specialized for timelapse
- ❌ Manual keyframing for ramping

**When to use:**

- You're a Mac user who wants native performance
- You prefer Apple ecosystem
- You want one-time purchase

**Learning Resources:**

- Apple tutorials: https://support.apple.com/final-cut-pro
- Ripple Training: https://www.rippletraining.com/

---

### 5. darktable (Free & Open Source)

**Official Website:** https://www.darktable.org/

**What it does:**

- Open source RAW processor
- Full exposure/WB/color control
- Batch processing
- CLI mode for scripting

**Workflow (Simple - Same Settings for All):**

```
1. Copy CR3s from SD card to MacBook
2. Import to darktable
3. Edit first image (exposure, WB corrections)
4. Copy history stack to all images
5. Export all as JPEG
6. Use FFmpeg or make-video.py to create video
```

**Workflow (Advanced - Ramping):**

```
1. Import CR3 sequence
2. Edit keyframes manually:
   - IMG_0050.CR3: Sunset settings
   - IMG_0200.CR3: Peak settings
   - IMG_0400.CR3: Moon settings
3. Write Python script to interpolate .xmp sidecar files
4. Export JPEGs
5. Create video with FFmpeg
```

**Cost:** Free

**Pros:**

- ✅ Free and open source
- ✅ Powerful RAW processing engine
- ✅ Works on macOS, Linux, Windows
- ✅ Scriptable via CLI
- ✅ No vendor lock-in

**Cons:**

- ❌ No built-in timelapse ramping
- ❌ Steep learning curve
- ❌ Requires scripting for smooth transitions
- ❌ Slower than commercial tools

**When to use:**

- Budget is tight
- You're willing to learn and script
- You prefer open source
- You want full control

**Learning Resources:**

- Official documentation: https://docs.darktable.org/
- YouTube tutorials: https://www.youtube.com/c/Darktable
- Forum: https://discuss.pixls.us/c/software/darktable

**Example FFmpeg video creation:**

```bash
# After exporting JPEGs from darktable
cd ~/timelapse/exported-jpegs/
ffmpeg -framerate 24 -pattern_type glob -i '*.jpg' \
  -c:v libx264 -preset slow -crf 18 \
  -pix_fmt yuv420p output.mp4
```

---

## Recommendations

### For Night Sky Timelapse Photography (Your Use Case):

**Best Choice: LRTimelapse + Lightroom Classic**

**Why:**

- Only tool that **automates** exposure ramping
- Built-in video export (complete solution)
- Designed for sunrise/sunset/moonrise scenarios
- Flicker removal included
- Worth the investment if you're serious

**Total Investment:**

- Lightroom: $10/month ongoing
- LRTimelapse Pro: €299 one-time
- **Try first:** LRTimelapse free trial (400 frames)

**ROI Calculation:**

- If you shoot 3+ timelapses per year needing ramping
- Time saved: 2-4 hours per timelapse vs manual work
- Quality improvement: Professional results

---

### Alternative: DaVinci Resolve Studio

**If you also do video editing:**

- One-time purchase ($295)
- Professional video tools
- Native CR3 support
- More work than LRTimelapse but more versatile

---

### Budget Option: darktable + FFmpeg

**If budget is critical:**

- Free and open source
- Good RAW processing
- Requires manual keyframing or scripting
- More work, but complete control

---

## Decision Framework

### Ask yourself:

**1. How often will I need exposure ramping?**

- **Often** (moonrise/sunset frequently) → LRTimelapse
- **Rarely** (static night sky shots) → darktable

**2. Do I also edit other videos?**

- **Yes** → DaVinci Resolve Studio
- **No** → LRTimelapse

**3. What's my budget?**

- **Can invest** → LRTimelapse or DaVinci
- **Tight budget** → darktable

**4. How much time do I want to spend?**

- **Minimize time** → LRTimelapse (automatic ramping)
- **Don't mind manual work** → DaVinci or darktable

---

## Suggested Testing Path

### Phase 1: Evaluate Need (Free)

1. **Capture a test timelapse** with moonrise or sunset
2. **Use darktable** to process with consistent settings
3. **Assess results:** Does it need ramping?

### Phase 2: Try LRTimelapse (Free Trial)

1. **Download LRTimelapse Free** (400 frame limit)
2. **Process same timelapse** with ramping
3. **Compare results:** Is auto-ramping worth it?

### Phase 3: Decide

- **If trial convinces you:** Buy LRTimelapse Pro
- **If not convinced:** Stick with darktable or try DaVinci

---

## Resources

### Official Tool Websites

- **LRTimelapse:** https://lrtimelapse.com/
- **Adobe Lightroom:** https://www.adobe.com/products/photoshop-lightroom.html
- **DaVinci Resolve:** https://www.blackmagicdesign.com/products/davinciresolve
- **Adobe Premiere:** https://www.adobe.com/products/premiere.html
- **Final Cut Pro:** https://www.apple.com/final-cut-pro/
- **darktable:** https://www.darktable.org/

### Learning Resources

**LRTimelapse:**

- Tutorials: https://lrtimelapse.com/learn/
- YouTube: https://www.youtube.com/user/LRTimelapse
- Forum: https://lrtimelapse.com/forum/

**DaVinci Resolve:**

- Official Training: https://www.blackmagicdesign.com/products/davinciresolve/training
- Free Book: "The Definitive Guide to DaVinci Resolve" (download from website)

**darktable:**

- Documentation: https://docs.darktable.org/
- YouTube Channel: https://www.youtube.com/c/Darktable
- Community Forum: https://discuss.pixls.us/c/software/darktable

**Timelapse Photography (General):**

- Lonely Speck (Night Sky): https://www.lonelyspeck.com/
- PetaPixel Timelapse Guides: https://petapixel.com/tag/time-lapse/

### Community & Forums

- **LRTimelapse Forum:** https://lrtimelapse.com/forum/
- **Lonely Speck Community:** https://www.lonelyspeck.com/community/
- **Reddit r/timelapse:** https://www.reddit.com/r/timelapse/
- **Reddit r/astrophotography:** https://www.reddit.com/r/astrophotography/

### YouTube Channels

- **LRTimelapse Official:** https://www.youtube.com/user/LRTimelapse
- **Lonely Speck:** https://www.youtube.com/c/LonelySpeck
- **Alyn Wallace Photography:** https://www.youtube.com/c/AlynWallacePhotography (astrophotography)

---

## Appendix: Understanding "Holy Grail" Timelapses

A "holy grail" timelapse is one that smoothly transitions from day to night (or vice versa) without flicker or exposure jumps. This requires:

1. **Ramping exposure** as light changes (sunset/sunrise)
2. **Ramping white balance** as color temperature shifts
3. **Deflickering** to remove frame-to-frame variations
4. **Smooth interpolation** between keyframes

**Why it's called "holy grail":**

- Historically very difficult to achieve
- Required bulb ramping hardware
- Manual post-processing took hours

**Modern solution:**

- LRTimelapse automates the entire process
- Set keyframes, it calculates smooth transitions
- What took 8 hours now takes 30 minutes

**Your use cases that need holy grail techniques:**

- Sunset to night (Milky Way emergence)
- Moonrise over landscape (moon brightness changes scene)
- Sunrise timelapses (dawn to daylight)

---

**Document Version:** 1.0
**Last Updated:** 2025-10-08
**Author:** Generated for pi-camera-control project
**Project:** https://github.com/PapaMarky/pi-camera-control
