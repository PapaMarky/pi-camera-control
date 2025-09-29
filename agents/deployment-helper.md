# Deployment Helper Agent

## Purpose
Automate and guide Raspberry Pi setup, system configuration, and deployment validation for the pi-camera-control system.

## Agent Capabilities

### 1. Hardware Validation
- Verify Raspberry Pi model compatibility
- Check available interfaces and peripherals
- Validate power supply and thermal requirements
- Test storage capacity and performance

### 2. System Setup Automation
- Guide through base system configuration
- Automate Node.js and dependency installation
- Configure systemd service with proper settings
- Set up directory structure and permissions

### 3. Network Configuration
- Configure access point with NetworkManager
- Set up dual WiFi interface capability
- Validate hostapd and dnsmasq configuration
- Test network connectivity and routing

### 4. Service Deployment
- Install and configure pi-camera-control service
- Validate systemd integration and auto-start
- Test service recovery and restart behavior
- Configure logging and monitoring

## Usage Examples

### Initial System Setup
```
/deploy setup --target picontrol-002.local
```
**Expected Actions:**
- Check hardware compatibility and requirements
- Install Node.js, npm, and system dependencies
- Create service user and directory structure
- Configure basic system settings

### Network Configuration
```
/deploy network --ap-ssid "Pi-Camera-Control" --ap-password "camera123"
```
**Expected Actions:**
- Configure NetworkManager for dual WiFi mode
- Set up hostapd and dnsmasq for access point
- Test access point functionality
- Validate client connectivity

### Service Installation
```
/deploy service --from-source /Users/mark/git/pi-camera-control
```
**Expected Actions:**
- Copy source code to target Pi
- Install dependencies and build
- Configure systemd service
- Start and validate service operation

### Deployment Validation
```
/deploy validate --full-test
```
**Expected Actions:**
- Run comprehensive system tests
- Validate all services and configurations
- Test camera discovery and connection
- Generate deployment report

## Implementation Guide

### Key Files to Deploy
- Service files from `runtime/pi-camera-control.service`
- Setup scripts from `setup/configure-system.sh`
- Source code from `src/` directory
- Configuration templates from `setup/config-templates/`

### System Requirements Validation
```bash
# Hardware checks
cat /proc/cpuinfo | grep -i raspberry
free -h | grep "Mem:"
df -h /

# Software requirements
node --version  # >= v16.0.0
npm --version
systemctl --version

# Network capabilities
ip link show | grep wlan
rfkill list wifi
```

### Deployment Workflow
1. **Pre-deployment Validation**: Check target system compatibility
2. **Dependency Installation**: Install required packages and services
3. **Code Deployment**: Copy and configure application files
4. **Service Configuration**: Set up systemd service and auto-start
5. **Network Setup**: Configure access point and WiFi capabilities
6. **Validation Testing**: Run comprehensive functionality tests

## Expected Output Formats

### Hardware Validation Report
```
Hardware Validation Report
=========================
Target: picontrol-002.local (192.168.1.100)

Hardware Compatibility:
  ✓ Raspberry Pi Zero 2W detected
  ✓ 512MB RAM available (minimum: 256MB)
  ✓ 16GB SD card (8GB+ available)
  ✓ WiFi interface present (wlan0)
  ✓ USB ports available for expansion

Performance Benchmarks:
  - CPU: ARMv7 4-core @ 1.0GHz
  - Memory: 512MB (75% available)
  - Storage: 14.2GB available (89% free)
  - Network: 802.11n capable

Power Supply:
  ✓ 5V/2.5A USB-C detected
  ✓ No under-voltage warnings
  ✓ Thermal: 42°C (normal range)

Compatibility: ✓ EXCELLENT
Ready for pi-camera-control deployment
```

### Setup Progress Report
```
System Setup Progress
====================
Target: picontrol-002.local

[1/6] System Updates
  ✓ Package index updated (apt update)
  ✓ System packages upgraded (125 packages)
  ✓ Reboot not required

[2/6] Node.js Installation
  ✓ Node.js v18.17.0 installed via NodeSource
  ✓ npm v9.6.7 available
  ✓ Global packages updated

[3/6] System Dependencies
  ✓ NetworkManager installed and enabled
  ✓ hostapd installed and configured
  ✓ dnsmasq installed and configured
  ✓ Build tools and git installed

[4/6] User and Permissions
  ✓ Service user 'pi-camera' created
  ✓ Directory structure created (/opt/pi-camera-control)
  ✓ Permissions configured (pi-camera:pi-camera)
  ✓ Sudo access configured for network operations

[5/6] Service Configuration
  ✓ systemd service file installed
  ✓ Service enabled for auto-start
  ✓ Log rotation configured
  ✓ Environment variables set

[6/6] Validation
  ✓ All services started successfully
  ✓ Network interfaces configured
  ✓ Service health check passed

Setup Status: ✓ COMPLETE
Ready for application deployment
```

### Deployment Validation
```
Deployment Validation Report
===========================
Target: picontrol-002.local
Timestamp: 2024-01-01T12:00:00.000Z

Service Status:
  ✓ pi-camera-control: active (running) - 2m 15s
  ✓ NetworkManager: active (running)
  ✓ hostapd: active (running)
  ✓ dnsmasq: active (running)

Network Configuration:
  ✓ wlan0: UP (managed by NetworkManager)
  ✓ ap0: UP (192.168.4.1/24)
  ✓ Access Point: "Pi-Camera-Control" broadcasting
  ✓ DHCP: serving 192.168.4.2-20

Application Health:
  ✓ HTTP server: listening on port 3000
  ✓ WebSocket server: active and responsive
  ✓ Camera discovery: UPnP service running
  ✓ Power monitoring: Raspberry Pi mode enabled

Connectivity Tests:
  ✓ Health endpoint: GET /health → 200 OK
  ✓ API endpoints: 47/47 responding correctly
  ✓ WebSocket: connection and ping successful
  ✓ Static files: serving from /public

Performance:
  - Memory usage: 87MB / 512MB (17%)
  - CPU usage: 8% (normal)
  - Load average: 0.15 (low)
  - Response time: <50ms (excellent)

Issues Found: 0
Warnings: 0

Deployment Status: ✓ FULLY OPERATIONAL
System ready for camera operations
```

## Automated Setup Scripts

### Quick Setup Command
```bash
#!/bin/bash
# Quick deployment script
curl -fsSL https://raw.githubusercontent.com/PapaMarky/pi-camera-control/main/setup/quick-install.sh | bash
```

### Configuration Templates
```bash
# Access Point Configuration
SETUP_AP_SSID="Pi-Camera-Control"
SETUP_AP_PASSWORD="camera123"
SETUP_AP_CHANNEL="7"
SETUP_AP_INTERFACE="ap0"

# Service Configuration
SERVICE_USER="pi-camera"
SERVICE_PORT="3000"
SERVICE_LOG_LEVEL="info"
SERVICE_AUTO_START="true"
```

### Rollback Procedures
```bash
# Service rollback
systemctl stop pi-camera-control
systemctl disable pi-camera-control
rm /etc/systemd/system/pi-camera-control.service

# Configuration rollback
cp /etc/NetworkManager/NetworkManager.conf.backup /etc/NetworkManager/NetworkManager.conf
systemctl restart NetworkManager
```

## Deployment Workflows

### 1. Fresh Installation
```
Step 1: Hardware Validation
  - Check Pi model and specifications
  - Verify power supply adequacy
  - Test storage and memory capacity

Step 2: Base System Setup
  - Update package repository
  - Install system dependencies
  - Configure basic system settings

Step 3: Application Installation
  - Install Node.js runtime
  - Copy application source code
  - Install npm dependencies

Step 4: Service Configuration
  - Create systemd service
  - Configure auto-start behavior
  - Set up logging and monitoring

Step 5: Network Configuration
  - Configure NetworkManager
  - Set up access point capability
  - Test dual WiFi functionality

Step 6: Validation and Testing
  - Run comprehensive tests
  - Validate all functionality
  - Generate deployment report
```

### 2. Update Deployment
```
Step 1: Pre-update Backup
  - Backup current configuration
  - Create service state snapshot
  - Document current version

Step 2: Application Update
  - Stop running service
  - Update source code
  - Install new dependencies

Step 3: Configuration Migration
  - Migrate configuration changes
  - Update service definitions
  - Preserve user settings

Step 4: Service Restart
  - Start updated service
  - Validate functionality
  - Monitor for issues

Step 5: Rollback Preparation
  - Test rollback procedures
  - Document recovery steps
  - Validate backup integrity
```

## Integration Points

### With Existing Setup Scripts
- Leverage `setup/configure-system.sh` for base configuration
- Use existing systemd service templates
- Follow established directory structure conventions
- Maintain compatibility with manual setup procedures

### With Other Agents
- **Camera Testing Agent**: For post-deployment camera validation
- **Network Debugging Agent**: For network configuration validation
- **System Health Agent**: For ongoing deployment monitoring

## Advanced Features

### Multi-Pi Deployment
- Deploy to multiple Pi devices simultaneously
- Coordinate configuration across fleet
- Manage updates and rollbacks centrally
- Monitor deployment status across devices

### Configuration Management
- Template-based configuration generation
- Environment-specific settings management
- Automated configuration validation
- Change tracking and version control

### Monitoring Integration
- Deployment status monitoring
- Performance baseline establishment
- Health check automation
- Alert configuration for deployment issues

### Disaster Recovery
- Automated backup procedures
- Configuration restore capabilities
- Service recovery automation
- Data preservation strategies

## Sample Agent Prompts

### Initial Setup
"I have a fresh Raspberry Pi Zero 2W. Guide me through the complete setup process for pi-camera-control."

### Update Deployment
"I want to update my existing installation to the latest version. Help me plan and execute the update safely."

### Troubleshooting
"My deployment isn't working correctly. Diagnose the issues and help me fix the configuration."

### Fleet Management
"I need to deploy pi-camera-control to 5 different Pi devices. Help me automate this process."

## Deployment Checklist

### Pre-Deployment
- [ ] Hardware compatibility verified
- [ ] Network connectivity confirmed
- [ ] SSH access established
- [ ] Backup procedures planned

### During Deployment
- [ ] Dependencies installed successfully
- [ ] Source code deployed and built
- [ ] Service configured and started
- [ ] Network interfaces configured
- [ ] Validation tests passed

### Post-Deployment
- [ ] Service health monitoring enabled
- [ ] Performance baselines established
- [ ] Documentation updated
- [ ] Rollback procedures tested
- [ ] User training completed

This deployment helper agent streamlines the complex process of setting up the pi-camera-control system on Raspberry Pi devices, ensuring consistent and reliable deployments.