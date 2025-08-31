This file is a work in progress. It captures ideas that I have now, but will no doubt change as we 
iterate on the implementation and make new discoveries about the capabilities of ccapi, etc.

# Canon Camera Controller - Portable Off-Grid System
## Background
This project creates a portable, off-grid camera control system for remote photography in areas without internet or LAN access.

**Use Case**: Night sky photography in remote dark-sky locations where:
- No internet or cellular connectivity available
- Need comprehensive camera control for long-exposure timelapse photography
- Require portable, battery-powered solution
- Want professional camera control via mobile device

**Technical Foundation**: Canon's CCAPI (Camera Control API) enables full remote control via RESTful API:
- Complete camera settings control (ISO, aperture, shutter speed, etc.)
- Live view streaming and remote focusing
- Advanced shooting modes and intervalometer functionality
- Real-time camera status and battery monitoring

## Goal

**Portable Architecture**: 
- Raspberry Pi creates isolated WiFi network (no internet required)
- Canon camera connects to Pi's WiFi access point
- User devices (iPhone/MacBook) connect to same Pi WiFi network
- Pi serves comprehensive camera control web application
- Entire system operates on battery power for field deployment

**Target Deployment**: Remote locations for astrophotography and nature photography where traditional connectivity is unavailable.

## MVP Definition - Off-Grid Camera Control System

**Hardware Setup**:
* Raspberry Pi functions as WiFi access point (no external internet required)
* Canon EOS R50 connects to Pi's WiFi network
* Battery power for extended field operation

**Network Auto-Discovery**:
* Pi automatically detects camera connections via CCAPI detection sequence:
  1. Probe: `https://device-ip:443/ccapi` (detect camera capability)
  2. Connect: `https://device-ip:443/ccapi/connect` (establish CCAPI session)
* User devices (iPhone 11 primary target) join Pi's WiFi network
* Automatic redirection to camera control web app for non-camera devices

**Web Application**:
* Responsive design for mobile-first operation (iPhone 11 optimized)
* Complete camera control interface with real-time status
* Offline operation - all assets served locally from Pi
* Persistent settings and session recovery across power cycles

**Deployment**:
* Debian package for automated Pi setup and configuration
* Systemd services for access point, camera server, and web application
* Single-command installation and updates

# Components

## Camera Control Backend - Field-Optimized Architecture

**MCP Server Integration** (Power-Efficient):
* Leverage `linkacam/canon-client` MCP server for proven CCAPI communication
* 25+ camera control functions with robust error handling
* Optimized for low-power, battery operation
* Handles connection drops and automatic recovery

**Portable Web Server**:
* Node.js application optimized for Pi resource constraints
* RESTful API with WebSocket support for real-time updates
* Local asset serving (no CDN dependencies for offline operation)
* Persistent configuration storage across power cycles
* Battery monitoring and power management features

## Portable Web App - Mobile-Optimized Interface

**Dashboard** (Mobile-First Design):
* Real-time camera connection and battery status
* Current shooting parameters display
* Quick access to essential controls
* Network status and device information

**Camera Control Functions**:
* **Live View**: Touch-enabled preview with remote focusing
* **Manual Controls**: Optimized for night photography (ISO, long exposures)
* **Intervalometer**: Advanced scheduling for multi-hour timelapse sessions
* **Shooting Modes**: Full camera mode control (M, Av, Tv, Auto)
* **Settings Management**: Camera configuration and preferences

**Field-Specific Features**:
* **Battery Monitoring**: Camera and Pi power levels with alerts
* **Storage Management**: Local image preview and space monitoring  
* **Session Persistence**: Resume interrupted sessions after power events
* **Dark Mode UI**: Optimized for night photography workflows

### Portable Access Point Configuration
* Battery-optimized WiFi access point with power management
* Automatic camera detection and network assignment
* Configurable network settings for different field conditions
* Robust connection handling for varying RF environments

### Field-Ready Camera Interface
* MCP server handles all CCAPI communication with fault tolerance
* Automatic reconnection after camera power cycles
* Graceful handling of RF interference and connection drops
* Power-aware operations to extend battery life

## Dual-Mode Network Configuration

**Development Mode**: Pi connects to home WiFi while serving camera access point
- Internet access for updates and development
- Camera remains connected via dedicated AP interface
- Simplified testing and debugging

**Field Mode**: Access point only for battery-optimized operation
- No external network dependencies
- Maximum battery life for extended field sessions
- Isolated network for camera and user devices

**Technical Implementation**: Manual configuration using standard Debian packages (hostapd, dnsmasq) - no third-party installers required. See [Network Configuration Documentation](docs/network-configuration.md) for detailed setup instructions.

**Field Photography Features**

_Intervalometer (Optimized for Night Sky)_
* **Scheduling**: Start/end times with astronomical twilight integration
* **Exposure Planning**: Automatic validation of interval vs shutter speed
* **Power Management**: Battery-aware session planning
* **Progress Monitoring**: Real-time capture status and remaining shots

_Additional Controls_
* **Manual Mode Optimization**: Quick access to common night photography settings
* **Focus Assistance**: Live view with magnification for manual focus
* **Environmental Monitoring**: Track session duration and conditions
* **Emergency Controls**: Safe camera shutdown and session recovery
## Delivery: Debian Package

## Implementation Plan

# Phase 1 - PoC Validation ✓ 
* **Completed**: Python intervalometer proof-of-concept (`interval.py`)
  * Validated CCAPI communication with Canon EOS R50
  * Successfully ran multi-hour timelapse sessions
  * Confirmed feasibility of Pi-based camera control
  * Established development workflow and Pi deployment process
* **Key Learning**: Demonstrated reliable off-grid camera control foundation

# Phase 2 - Portable Camera Controller Backend
* **MCP Server Integration**: Adopt `linkacam/canon-client` for proven CCAPI handling
* **Node.js Web Server**: RESTful API with WebSocket real-time updates
* **Power Optimization**: Battery-aware operation and power management
* **Connection Resilience**: Automatic recovery from camera/network drops
* **Field Testing**: Extended battery operation validation with Pi and camera

# Phase 3 - Mobile Web Interface
* **Responsive UI**: Mobile-first design optimized for iPhone 11 field use
* **Offline Capability**: All assets served locally, no internet dependencies
* **Real-time Controls**: Live camera preview and instant setting adjustments
* **Night Photography UX**: Dark mode interface and workflow optimization
* **Field Testing**: Complete off-grid operation with Pi access point and mobile control

# Phase 4 - Complete Off-Grid System
* **Raspberry Pi Access Point**: Fully autonomous network creation
* **Automatic Device Management**: Camera detection and user device routing
* **Battery Optimization**: Extended field operation capabilities
* **Debian Package**: Single-command installation and configuration
* **Dual WiFi Modes**: Automatic switching between development and field operation modes
* **MVP Achievement**: Complete portable camera control system ready for remote deployment

# Development Environment
* **Local Development**: MacBook for code development and testing
* **Repository**: https://github.com/PapaMarky/Intervalometer
* **Build System**: GitHub Actions for automated Debian package creation
* **Development Pi**: Raspberry Pi 4 (pi@picontrol-001.local) for integration testing
* **Target Hardware**: Raspberry Pi Zero W (pi@picontrol-002.local) for field deployment
  * Chosen for ultra-low power consumption during extended field operations
  * Sufficient processing power for camera control and web serving

# References
## CCAPI
* https://developercommunity.usa.canon.com/s/article/CCAPI-Function-List : API endpoint list
* https://developercommunity.usa.canon.com/s/article/How-to-GET-Live-View-with-CCAPI

## Images
### HEIC
* https://pypi.org/project/pyheif/ : python library for reading HEIC encoded images and their metadata

## Network Configuration
* [Dual-Mode WiFi Setup](docs/network-configuration.md) - Complete guide for AP+STA configuration

## Canon Camera Control
* https://github.com/linkacam/canon-client/tree/main - MCP server with comprehensive CCAPI implementation
* https://github.com/camerahacks/canon-ccapi-node - Node.js CCAPI library with intervalometer support
* https://developercommunity.usa.canon.com/s/article/CCAPI-Function-List - Official Canon CCAPI documentation 