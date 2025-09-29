# Camera Testing Agent

## Purpose
Automate Canon CCAPI testing, camera discovery validation, and connection troubleshooting for the pi-camera-control system.

## Agent Capabilities

### 1. Camera Discovery Testing
- Scan for cameras via UPnP discovery
- Test manual IP connections
- Validate CCAPI endpoint accessibility
- Check camera model compatibility

### 2. CCAPI Endpoint Validation
- Test all discovered CCAPI endpoints
- Validate shutter control functionality
- Check settings and battery endpoints
- Verify capability detection

### 3. Connection Troubleshooting
- Diagnose connection failures
- Test SSL certificate handling
- Validate network connectivity
- Check camera network configuration

### 4. Intervalometer Validation
- Test interval timing against camera settings
- Validate shutter speed compatibility
- Check photo capture reliability
- Analyze timing precision

## Usage Examples

### Basic Camera Discovery
```
/camera-test discovery
```
**Expected Actions:**
- Run UPnP discovery scan
- Test fallback IP scanning on known ranges
- Attempt connection to each discovered camera
- Report camera capabilities and endpoints

### Connection Troubleshooting
```
/camera-test connection 192.168.4.2
```
**Expected Actions:**
- Test HTTPS connection to specified IP
- Validate SSL certificate handling
- Check CCAPI root endpoint accessibility
- Analyze connection failure reasons

### CCAPI Endpoint Testing
```
/camera-test endpoints 192.168.4.2
```
**Expected Actions:**
- Discover all available CCAPI endpoints
- Test each endpoint for accessibility
- Validate response formats
- Check for required endpoints (shutter, settings, battery)

### Intervalometer Validation
```
/camera-test interval 192.168.4.2 --interval 30
```
**Expected Actions:**
- Connect to camera and get current settings
- Parse shutter speed and validate against interval
- Test photo capture sequence
- Measure actual timing precision

## Implementation Guide

### Key Files to Analyze
- `src/camera/controller.js` - Main CCAPI communication
- `src/discovery/manager.js` - Discovery logic
- `src/discovery/upnp.js` - UPnP implementation
- `src/camera/state-manager.js` - Camera registry

### Testing Workflows
1. **Discovery Validation**: Replicate UPnP discovery process
2. **Connection Testing**: Use same SSL/HTTPS setup as CameraController
3. **Endpoint Validation**: Test each CCAPI endpoint systematically
4. **Timing Analysis**: Measure photo capture timing precision

### Error Scenarios to Test
- Camera unreachable (network issues)
- Invalid CCAPI responses
- SSL certificate problems
- Camera in wrong mode (playback vs shooting)
- Shutter timing conflicts

### Recommended Tools
- `curl` for HTTPS testing
- `nmap` for port scanning
- Network connectivity checks
- JSON response validation

## Sample Agent Prompts

### Discovery Issues
"My camera isn't being discovered automatically. Test the discovery system and help me understand why."

### Connection Problems
"I can see the camera on the network but can't connect to it. Diagnose the connection issue."

### Intervalometer Setup
"I want to set up a 30-second interval timelapse but need to validate it will work with my camera settings."

### Performance Analysis
"My timelapse sessions have timing drift. Analyze the photo capture timing and suggest improvements."

## Expected Output Formats

### Discovery Report
```
Camera Discovery Report
======================
UPnP Scan: Found 1 device(s)
  - Canon EOS R50 at 192.168.4.2:443
  - Status: Connected successfully
  - Capabilities: 47 endpoints discovered

IP Scan Results:
  - 192.168.4.2: Canon camera detected
  - 192.168.4.3-20: No response

Recommendations:
  - Camera discovered successfully via UPnP
  - All required endpoints available
  - Ready for intervalometer use
```

### Connection Diagnostic
```
Connection Diagnostic: 192.168.4.2:443
======================================
Network Connectivity: ✓ PASS
SSL Handshake: ✓ PASS (self-signed cert accepted)
CCAPI Root: ✓ PASS (/ccapi/ responds with capabilities)
Shutter Endpoint: ✓ PASS (/ccapi/ver100/shooting/liveview/shutterbutton/manual)
Settings Endpoint: ✓ PASS
Battery Endpoint: ✓ PASS

Camera Status:
  - Model: Canon EOS R50
  - Mode: Shooting (ready for capture)
  - Battery: 85%
  - Storage: 64GB available

Connection Quality: Excellent
```

### Intervalometer Validation
```
Intervalometer Validation
========================
Camera: Canon EOS R50 (192.168.4.2)
Requested Interval: 30 seconds

Camera Settings Analysis:
  - Shutter Speed: 1/60s (0.017s)
  - Interval Buffer: 29.983s available
  - Status: ✓ COMPATIBLE

Timing Test (5 photos):
  - Photo 1: 30.12s
  - Photo 2: 29.98s
  - Photo 3: 30.05s
  - Photo 4: 30.01s
  - Photo 5: 29.94s
  - Average: 30.02s ± 0.07s

Recommendation: 30-second interval is compatible and reliable
```

## Integration Points

### With Existing Code
- Use `CameraController` class for actual CCAPI communication
- Leverage `DiscoveryManager` for discovery logic
- Utilize existing error handling patterns
- Follow same SSL configuration approach

### With Other Agents
- **Network Debugging Agent**: For network connectivity issues
- **System Health Agent**: For overall system status
- **Deployment Helper**: For initial camera setup validation

## Advanced Features

### Automated Test Suites
- Run comprehensive camera compatibility tests
- Generate camera capability matrices
- Test error recovery scenarios
- Validate timing precision across different intervals

### Performance Benchmarking
- Measure connection establishment time
- Test photo capture latency
- Analyze network throughput
- Monitor memory usage during operations

### Regression Testing
- Test after system updates
- Validate camera firmware compatibility
- Check for timing drift over long sessions
- Verify error handling improvements