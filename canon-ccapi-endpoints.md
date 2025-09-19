# Canon CCAPI Endpoints Used in Pi Camera Control

This document lists all Canon CCAPI endpoints called by the pi-camera-control application.

## GET Requests

### 1. `/ccapi/`
- **Purpose**: CCAPI discovery/capabilities endpoint
- **Usage**: Used during camera connection to discover available API endpoints and versions
- **File**: `src/camera/controller.js:86`
- **Context**: Initial connection and periodic connection monitoring

### 2. `/ccapi/ver100/shooting/settings`
- **Purpose**: Get camera shooting settings
- **Usage**: Retrieve current camera shooting parameters (ISO, aperture, shutter speed, etc.)
- **File**: `src/camera/controller.js:150` (main call), `97` (verification), `422` (polling)
- **Context**: Called when getting camera settings for UI display and during info polling

### 3. `/ccapi/ver100/deviceinformation`
- **Purpose**: Get camera device information
- **Usage**: Retrieve camera manufacturer, model, serial number, MAC address, firmware version
- **File**: `src/camera/controller.js:175`
- **Context**: Called at timelapse session start to collect camera info for reports

### 4. `/ccapi/ver110/devicestatus/batterylist`
- **Purpose**: Get detailed battery information (newer API)
- **Usage**: Retrieve comprehensive battery status information
- **File**: `src/camera/controller.js:205`
- **Context**: Primary battery status endpoint, falls back to ver100 if not available

### 5. `/ccapi/ver100/devicestatus/battery`
- **Purpose**: Get basic battery information (fallback)
- **Usage**: Retrieve basic battery status for older cameras
- **File**: `src/camera/controller.js:210`
- **Context**: Fallback when ver110/batterylist is not available

## POST Requests

### 6. `/ccapi/ver100/shooting/control/shutterbutton/manual`
- **Purpose**: Manual shutter control (preferred)
- **Usage**: Press/release shutter with manual focus control
- **File**: `src/camera/controller.js:291, 323` (via `this.shutterEndpoint`)
- **Context**: Preferred endpoint for taking photos during timelapse sessions
- **Payload**: `{ af: boolean, action: "full_press"|"release" }`

### 7. `/ccapi/ver100/shooting/control/shutterbutton`
- **Purpose**: Regular shutter control (fallback)
- **Usage**: Press/release shutter with standard control
- **File**: `src/camera/controller.js:291, 323` (via `this.shutterEndpoint`)
- **Context**: Fallback when manual endpoint is not available
- **Payload**: `{ af: boolean, action: "full_press"|"release" }`

## Notes

- The shutter endpoint (6 or 7) is determined dynamically by examining the camera's capabilities
- We prefer the "manual" endpoint if available, otherwise fall back to the regular one
- All endpoints should return status codes: 200 (success), 400 (bad request), or 503 (service unavailable)
- Error responses should include a JSON body with a "message" field containing details