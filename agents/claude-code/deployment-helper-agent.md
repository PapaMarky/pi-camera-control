# Deployment Helper Agent

## Purpose
This Claude Code agent automates and validates the deployment of the pi-camera-control project to Raspberry Pi devices, handling system configuration, service setup, and production readiness checks.

## Capabilities

### 1. System Setup Automation
- Configures Raspberry Pi system settings
- Installs required system packages
- Sets up Node.js environment
- Configures network interfaces

### 2. Service Deployment
- Installs systemd service
- Configures automatic startup
- Sets up log rotation
- Validates service operation

### 3. Network Configuration
- Sets up dual WiFi interfaces
- Configures NetworkManager
- Prepares access point settings
- Tests network connectivity

### 4. Production Validation
- Checks all dependencies
- Validates file permissions
- Tests service restart
- Monitors resource usage

## Usage Examples

### Fresh Pi Setup
"Set up a new Raspberry Pi Zero 2W for the camera control project"
- The agent will run through complete system setup and deployment

### Service Installation
"Install and configure the systemd service"
- The agent will set up the service with proper permissions and auto-start

### Network Preparation
"Configure the Pi to work as an access point"
- The agent will set up hostapd, dnsmasq, and network interfaces

### Deployment Validation
"Validate that the deployment is production-ready"
- The agent will run comprehensive checks and report any issues

## Implementation Details

The agent works by:
1. Checking current system state
2. Identifying missing components
3. Running setup scripts
4. Configuring services
5. Validating the deployment

## Files the Agent Works With
- `setup/configure-system.sh` - Main setup script
- `runtime/pi-camera-control.service` - Systemd service
- `package.json` - Node dependencies
- `.env.example` - Environment configuration
- System configuration files

## Typical Workflow
1. Check Pi model and OS version
2. Install system dependencies
3. Configure network interfaces
4. Deploy application code
5. Set up systemd service
6. Validate complete setup