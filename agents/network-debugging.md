# Network Debugging Agent

## Purpose
Diagnose and resolve WiFi connectivity, access point configuration, and dual-interface networking issues in the pi-camera-control system.

## Agent Capabilities

### 1. WiFi Connection Diagnosis
- Analyze NetworkManager connection states
- Test WiFi scanning and connection processes
- Diagnose authentication and DHCP failures
- Validate signal strength and connectivity

### 2. Access Point Troubleshooting
- Check hostapd and dnsmasq service status
- Validate AP configuration files
- Test client connectivity to access point
- Analyze DHCP lease assignments

### 3. Dual Interface Analysis
- Monitor wlan0 (client) and ap0 (access point) states
- Check interface conflicts and routing
- Validate simultaneous operation
- Analyze network traffic patterns

### 4. NetworkManager Integration
- Diagnose nmcli command failures
- Check NetworkManager service status
- Validate connection profiles and priorities
- Analyze D-Bus communication issues

## Usage Examples

### WiFi Connection Issues
```
/network-debug wifi --ssid "MyNetwork"
```
**Expected Actions:**
- Scan for the specified network
- Test connection attempt with detailed logging
- Analyze authentication and DHCP processes
- Diagnose connection failure reasons

### Access Point Problems
```
/network-debug access-point
```
**Expected Actions:**
- Check hostapd service status and configuration
- Validate dnsmasq DHCP settings
- Test AP interface (ap0) connectivity
- Analyze client connection attempts

### Dual Interface Conflicts
```
/network-debug interfaces
```
**Expected Actions:**
- Check both wlan0 and ap0 interface states
- Analyze routing table conflicts
- Validate NetworkManager profile priorities
- Test simultaneous operation

### NetworkManager Issues
```
/network-debug networkmanager
```
**Expected Actions:**
- Check NetworkManager service status
- Analyze recent nmcli command logs
- Validate D-Bus communication
- Check for conflicting network managers

## Implementation Guide

### Key Files to Analyze
- `src/network/state-manager.js` - High-level network state
- `src/network/service-manager.js` - NetworkManager operations
- `src/network/config-manager.js` - Configuration management
- `/etc/NetworkManager/` - System configuration files
- `/etc/hostapd/` - Access point configuration
- `/etc/dnsmasq.conf` - DHCP configuration

### System Commands to Use
```bash
# NetworkManager status
nmcli general status
nmcli device status
nmcli connection show
nmcli device wifi list

# Service status
systemctl status NetworkManager
systemctl status hostapd
systemctl status dnsmasq

# Interface analysis
ip addr show
ip route show
iwconfig

# Log analysis
journalctl -u NetworkManager -n 50
journalctl -u hostapd -n 50
journalctl -u dnsmasq -n 50
```

### Common Issues to Diagnose
1. **WiFi Connection Failures**: Authentication, DHCP, signal strength
2. **AP Not Starting**: hostapd configuration, interface conflicts
3. **DHCP Issues**: dnsmasq configuration, IP conflicts
4. **Interface Conflicts**: Multiple network managers, driver issues
5. **Profile Conflicts**: Duplicate or conflicting NetworkManager profiles

## Expected Output Formats

### WiFi Diagnostic Report
```
WiFi Connection Diagnostic: "MyNetwork"
========================================
Network Scan: ✓ FOUND
  - SSID: MyNetwork
  - Signal: -45 dBm (85%)
  - Security: WPA2-PSK
  - Channel: 6

Connection Attempt Analysis:
  - Profile Creation: ✓ SUCCESS
  - Authentication: ✓ SUCCESS (WPA2-PSK)
  - DHCP Request: ✗ TIMEOUT
  - IP Assignment: ✗ FAILED

Issue Identified: DHCP server not responding
Recommendations:
  1. Check router DHCP settings
  2. Try static IP configuration
  3. Verify network connectivity from other devices

NetworkManager Logs:
  [12:34:56] Connection 'MyNetwork' activated
  [12:34:58] DHCP4 timeout on device wlan0
```

### Access Point Diagnostic
```
Access Point Diagnostic
======================
Service Status:
  - hostapd: ✓ ACTIVE (running)
  - dnsmasq: ✗ FAILED (exit code 2)
  - NetworkManager: ✓ ACTIVE

Interface Status:
  - ap0: ✓ UP (192.168.4.1/24)
  - wlan0: ✓ UP (192.168.1.100/24)

Configuration Analysis:
  - hostapd.conf: ✓ VALID
  - dnsmasq.conf: ✗ SYNTAX ERROR (line 45)

Client Connections: 0 active

Issue Identified: dnsmasq configuration error
Fix Required: Correct syntax error in dnsmasq.conf line 45

Recommended Actions:
  1. Fix dnsmasq configuration syntax
  2. Restart dnsmasq service
  3. Test client connection
```

### Dual Interface Analysis
```
Dual Interface Analysis
======================
Interface States:
  wlan0 (Client):
    - Status: ✓ CONNECTED
    - Network: ExternalWiFi
    - IP: 192.168.1.100/24
    - Gateway: 192.168.1.1

  ap0 (Access Point):
    - Status: ✓ ACTIVE
    - Network: Pi-Camera-Control
    - IP: 192.168.4.1/24
    - DHCP Range: 192.168.4.2-20

Routing Analysis:
  - Default Route: ✓ via wlan0 (192.168.1.1)
  - AP Network Route: ✓ via ap0 (192.168.4.0/24)
  - No conflicts detected

Performance:
  - wlan0 throughput: 25 Mbps
  - ap0 clients: 2 connected
  - CPU usage: 15% (normal)

Status: ✓ OPTIMAL - Both interfaces operating correctly
```

## Diagnostic Workflows

### 1. WiFi Connection Troubleshooting
```
Step 1: Network Discovery
  - Scan for available networks
  - Check signal strength and security
  - Verify network is broadcasting

Step 2: Connection Attempt Analysis
  - Test NetworkManager connection process
  - Monitor authentication stages
  - Check DHCP negotiation

Step 3: Connectivity Validation
  - Test IP assignment
  - Verify routing configuration
  - Test internet connectivity

Step 4: Issue Resolution
  - Identify specific failure point
  - Provide targeted recommendations
  - Suggest configuration changes
```

### 2. Access Point Setup Validation
```
Step 1: Service Dependencies
  - Check NetworkManager status
  - Verify hostapd installation
  - Validate dnsmasq configuration

Step 2: Configuration Validation
  - Parse hostapd.conf syntax
  - Check interface assignments
  - Validate security settings

Step 3: Service Operation
  - Test hostapd startup
  - Monitor dnsmasq DHCP
  - Check client association

Step 4: Connectivity Testing
  - Test client connection
  - Verify DHCP lease assignment
  - Check internet forwarding
```

## Integration Points

### With Existing Code
- Use `NetworkServiceManager` commands for consistency
- Leverage existing `nmcli` command patterns
- Follow same error handling approaches
- Utilize existing logging infrastructure

### With Other Agents
- **Camera Testing Agent**: For camera network connectivity
- **System Health Agent**: For overall network health monitoring
- **Deployment Helper**: For initial network setup validation

## Advanced Features

### Automated Network Testing
- Comprehensive connectivity test suites
- Performance benchmarking for both interfaces
- Stress testing with multiple clients
- Long-term stability monitoring

### Configuration Optimization
- Analyze optimal channel selection
- Suggest DHCP range adjustments
- Recommend security configuration improvements
- Optimize for low-power operation

### Predictive Diagnostics
- Monitor connection reliability trends
- Detect degrading signal conditions
- Predict potential failure scenarios
- Suggest preventive maintenance

### Real-time Monitoring
- Continuous interface state monitoring
- Live connection quality metrics
- Automated issue detection and alerting
- Performance trend analysis

## Sample Agent Prompts

### Connection Issues
"WiFi keeps disconnecting every few minutes. Help me diagnose what's causing the instability."

### Access Point Problems
"Clients can connect to my access point but can't get DHCP leases. What's wrong with the configuration?"

### Performance Issues
"Network performance seems slow when both WiFi and AP are active. Analyze for bottlenecks."

### Setup Validation
"I just set up the dual WiFi configuration. Validate that everything is working correctly."

## Troubleshooting Commands

### Network State Commands
```bash
# Current network state
nmcli device status
nmcli connection show --active

# Interface details
ip addr show wlan0
ip addr show ap0

# Service status
systemctl status hostapd dnsmasq NetworkManager

# Active connections
ss -tuln | grep :53  # DNS
ss -tuln | grep :67  # DHCP
```

### Log Analysis Commands
```bash
# Recent NetworkManager activity
journalctl -u NetworkManager --since "1 hour ago"

# Access point logs
journalctl -u hostapd --since "1 hour ago"
journalctl -u dnsmasq --since "1 hour ago"

# Kernel network messages
dmesg | grep -E "(wlan|wifi|hostapd)"
```

This network debugging agent addresses the most complex aspect of the pi-camera-control system - the sophisticated dual WiFi interface setup that enables both internet connectivity and direct camera control.