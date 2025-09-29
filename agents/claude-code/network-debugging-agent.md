# Network Debugging Agent

## Purpose
This Claude Code agent specializes in diagnosing and resolving network issues in the pi-camera-control project, particularly focusing on the dual WiFi interface setup, NetworkManager operations, and access point configuration.

## Capabilities

### 1. WiFi Interface Diagnostics
- Analyzes wlan0 (client) and ap0 (access point) interfaces
- Checks interface state and configuration
- Validates IP addressing and routing
- Monitors interface transitions

### 2. NetworkManager Troubleshooting
- Debugs nmcli operations
- Validates connection profiles
- Checks WiFi scanning and switching
- Diagnoses connection persistence issues

### 3. Access Point Validation
- Tests hostapd configuration
- Validates dnsmasq DHCP service
- Checks client connectivity
- Monitors AP lifecycle management

### 4. Network State Management
- Validates state transitions
- Checks mode switching (client/AP)
- Tests failover scenarios
- Monitors WebSocket updates

## Usage Examples

### WiFi Connection Issues
"Debug why the Pi can't connect to my home WiFi"
- The agent will check NetworkManager profiles, scan results, and connection attempts

### Access Point Problems
"The camera can't connect to the Pi's access point"
- The agent will validate AP configuration, DHCP settings, and firewall rules

### Network Switching
"Test switching between client and access point modes"
- The agent will validate mode transitions and interface management

### Signal Strength Analysis
"Analyze WiFi signal strength and connection quality"
- The agent will check signal metrics and suggest optimal placement

## Implementation Details

The agent works by:
1. Examining NetworkManager configuration and state
2. Analyzing system logs for network events
3. Testing connectivity at multiple layers
4. Running diagnostic commands
5. Providing detailed troubleshooting steps

## Files the Agent Works With
- `src/network/state-manager.js` - High-level network management
- `src/network/service-manager.js` - NetworkManager operations
- `src/network/ap-manager.js` - Access point control
- `/etc/NetworkManager/` - System configuration
- `/etc/hostapd/` - Access point configuration
- System logs via journalctl

## Typical Workflow
1. Check current network state and interfaces
2. Validate NetworkManager configuration
3. Test connectivity and routing
4. Analyze logs for errors
5. Provide specific remediation steps