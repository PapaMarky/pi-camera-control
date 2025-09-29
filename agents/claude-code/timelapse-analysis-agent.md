# Timelapse Analysis Agent

## Purpose
This Claude Code agent specializes in optimizing timelapse sessions, analyzing captured sequences, and providing recommendations for improving night sky photography results with the pi-camera-control project.

## Capabilities

### 1. Session Configuration
- Calculates optimal interval/exposure ratios
- Validates timing constraints
- Suggests settings for specific scenarios
- Plans multi-hour sessions

### 2. Capture Analysis
- Reviews session statistics
- Identifies dropped frames
- Analyzes timing accuracy
- Detects camera issues

### 3. Performance Optimization
- Memory usage during long sessions
- Storage management
- Network stability analysis
- Battery life estimation

### 4. Results Enhancement
- Image sequence validation
- Metadata analysis
- Post-processing recommendations
- Video compilation guidance

## Usage Examples

### Session Planning
"Plan a 4-hour Milky Way timelapse with 20-second exposures"
- The agent will calculate intervals, estimate frames, and check feasibility

### Timing Optimization
"Optimize settings for smooth star trail video"
- The agent will suggest interval/exposure combinations for desired effects

### Session Debugging
"Analyze why my last timelapse has gaps"
- The agent will examine logs and identify timing or connection issues

### Storage Planning
"How much storage do I need for an all-night timelapse?"
- The agent will calculate storage requirements based on settings

## Implementation Details

The agent works by:
1. Analyzing session requirements
2. Calculating optimal parameters
3. Validating technical constraints
4. Monitoring session execution
5. Providing improvement suggestions

## Files the Agent Works With
- `src/intervalometer/session.js` - Session management
- `src/intervalometer/validator.js` - Timing validation
- `src/storage/manager.js` - Storage handling
- Session data files
- Camera metadata

## Typical Workflow
1. Gather session requirements
2. Calculate timing parameters
3. Validate technical feasibility
4. Monitor execution metrics
5. Analyze results and suggest improvements