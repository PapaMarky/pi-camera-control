# System Health Agent

## Purpose
Monitor system health, analyze log patterns, diagnose performance issues, and provide predictive maintenance recommendations for the pi-camera-control system.

## Agent Capabilities

### 1. Log Analysis and Pattern Recognition
- Parse and analyze system logs from multiple sources
- Identify error patterns, warnings, and anomalies
- Correlate events across different system components
- Generate trend analysis and predictive insights

### 2. Performance Monitoring
- Track system resource usage (CPU, memory, storage)
- Monitor service response times and availability
- Analyze network performance and connectivity
- Identify performance bottlenecks and optimization opportunities

### 3. Health Status Assessment
- Evaluate overall system health across all components
- Generate health scores and risk assessments
- Identify degrading components before failure
- Provide maintenance recommendations

### 4. Predictive Maintenance
- Analyze historical data for failure prediction
- Recommend preventive maintenance schedules
- Identify optimal upgrade timing
- Generate long-term system evolution plans

## Usage Examples

### System Health Check
```
/system-health check --comprehensive
```
**Expected Actions:**
- Analyze all system logs from the last 24 hours
- Check service status and performance metrics
- Evaluate power, thermal, and network health
- Generate comprehensive health report

### Log Analysis
```
/system-health logs --since "7 days" --severity warning
```
**Expected Actions:**
- Parse logs from all services over the last week
- Filter for warnings and errors
- Identify patterns and recurring issues
- Generate actionable insights

### Performance Analysis
```
/system-health performance --baseline
```
**Expected Actions:**
- Collect current performance metrics
- Compare against historical baselines
- Identify performance trends and anomalies
- Recommend optimization strategies

### Predictive Maintenance
```
/system-health predict --component camera --horizon 30d
```
**Expected Actions:**
- Analyze camera-related health metrics
- Predict potential issues in next 30 days
- Generate maintenance recommendations
- Schedule preventive actions

## Implementation Guide

### Key Log Sources
```bash
# System logs
/var/log/syslog
/var/log/daemon.log
/var/log/kern.log

# Service logs (via journalctl)
journalctl -u pi-camera-control
journalctl -u NetworkManager
journalctl -u hostapd
journalctl -u dnsmasq

# Application logs
logs/app.log
logs/error.log

# System metrics
/proc/meminfo
/proc/cpuinfo
/proc/loadavg
/sys/class/thermal/thermal_zone0/temp
```

### Health Metrics Collection
```javascript
// System health data structure
const healthMetrics = {
  timestamp: '2024-01-01T12:00:00.000Z',
  system: {
    uptime: 86400,
    loadAverage: [0.15, 0.18, 0.12],
    memory: {
      total: 536870912,
      used: 134217728,
      available: 402653184,
      percentage: 25.0
    },
    cpu: {
      temperature: 45.2,
      usage: 12.5,
      throttled: false
    },
    storage: {
      total: 15734710272,
      used: 2147483648,
      available: 13587226624,
      percentage: 13.6
    }
  },
  services: {
    'pi-camera-control': {
      status: 'active',
      uptime: 3600,
      memoryUsage: 87654321,
      responseTime: 45
    },
    'NetworkManager': {
      status: 'active',
      uptime: 86400,
      connections: 2
    }
  },
  network: {
    interfaces: {
      wlan0: { connected: true, signal: -45 },
      ap0: { active: true, clients: 2 }
    },
    connectivity: true
  },
  camera: {
    connected: true,
    model: 'Canon EOS R50',
    battery: 85,
    lastPhoto: '2024-01-01T11:45:00.000Z'
  }
};
```

## Expected Output Formats

### Comprehensive Health Report
```
System Health Report
===================
Generated: 2024-01-01T12:00:00.000Z
System: picontrol-002.local

Overall Health Score: 92/100 (Excellent)

SYSTEM RESOURCES
================
CPU Usage: 12% (Normal) - Temperature: 45.2°C ✓
Memory Usage: 25% (134MB/512MB) ✓
Storage Usage: 14% (2.1GB/15.7GB) ✓
Load Average: 0.15 (Very Low) ✓

SERVICES STATUS
===============
✓ pi-camera-control: Active (1h uptime) - Response: 45ms
✓ NetworkManager: Active (24h uptime)
✓ hostapd: Active (24h uptime) - AP clients: 2
✓ dnsmasq: Active (24h uptime) - DHCP leases: 2

NETWORK HEALTH
==============
✓ wlan0: Connected (-45dBm signal, 85% quality)
✓ ap0: Active (192.168.4.1) - 2 clients connected
✓ Internet: Connected via wlan0

CAMERA STATUS
=============
✓ Canon EOS R50: Connected (192.168.4.2)
✓ Battery: 85% (Good)
✓ Last Activity: 15 minutes ago
✓ CCAPI: All endpoints responding

RECENT ISSUES (24h)
==================
⚠ 1 Warning: Brief thermal spike at 11:30 (47.5°C)
ℹ 3 Info: Normal service restarts during updates

RECOMMENDATIONS
===============
1. ✓ System performing optimally
2. Monitor thermal during extended sessions
3. Consider SD card backup (14% usage trending up)
4. No immediate maintenance required

Next Health Check: Automatic in 24 hours
```

### Log Pattern Analysis
```
Log Pattern Analysis (Last 7 Days)
==================================
Logs Analyzed: 12,847 entries across 5 services
Period: 2024-01-01 to 2024-01-08

ERROR PATTERNS
==============
Total Errors: 23 (0.18% of log entries)

Most Frequent Errors:
1. Camera timeout (8 occurrences)
   - Pattern: Usually between 14:00-16:00
   - Correlation: High temperature periods
   - Impact: Low (automatic retry successful)

2. WiFi disconnection (5 occurrences)
   - Pattern: Random timing
   - Correlation: External network issues
   - Impact: Medium (temporary connectivity loss)

3. DHCP conflicts (3 occurrences)
   - Pattern: After AP restarts
   - Correlation: Service configuration changes
   - Impact: Low (self-resolving)

WARNING PATTERNS
================
Total Warnings: 156 (1.21% of log entries)

Trending Warnings:
1. Thermal warnings (45 occurrences - increasing)
   - Baseline: 2-3/day, Recent: 8-10/day
   - Recommendation: Improve cooling

2. Memory usage alerts (23 occurrences - stable)
   - Pattern: During large timelapse sessions
   - Recommendation: Monitor for leaks

PERFORMANCE TRENDS
==================
Average Response Time: 47ms (↓ 5ms from last week)
Service Availability: 99.97% (↑ 0.12%)
Error Rate: 0.18% (↓ 0.05%)

PREDICTIVE INSIGHTS
==================
1. Thermal management may need attention in 2-3 weeks
2. Storage usage trending to 20% by month-end
3. No critical issues predicted in next 30 days

RECOMMENDED ACTIONS
==================
🔥 Immediate: Monitor thermal management
📊 This Week: Review timelapse memory usage
🔧 This Month: Plan storage expansion
```

### Performance Baseline Report
```
Performance Baseline Analysis
============================
Baseline Period: 2024-01-01 to 2024-01-08 (7 days)
Data Points: 10,080 measurements (every minute)

RESOURCE UTILIZATION
====================
CPU Usage:
  - Average: 15.2% (±3.1%)
  - Peak: 34% (during timelapse processing)
  - Idle: 8-12% (normal background load)
  - Trend: Stable

Memory Usage:
  - Average: 127MB/512MB (24.8%)
  - Peak: 198MB (during large sessions)
  - Baseline: 85MB (service overhead)
  - Trend: Stable with periodic spikes

Network Performance:
  - wlan0 Throughput: 8.5 Mbps average
  - ap0 Client Response: 12ms average
  - Packet Loss: 0.02% (excellent)
  - Latency: Camera CCAPI 25ms average

RESPONSE TIME ANALYSIS
======================
HTTP Endpoints:
  - /health: 15ms (±5ms)
  - /api/camera/status: 35ms (±12ms)
  - /api/network/status: 45ms (±18ms)
  - Static files: 8ms (±3ms)

WebSocket Performance:
  - Connection time: 125ms
  - Message latency: 3ms
  - Throughput: 1,250 msgs/sec

Camera Operations:
  - Photo capture: 2.1s (±0.3s)
  - Settings query: 280ms (±45ms)
  - Connection test: 150ms (±25ms)

EFFICIENCY METRICS
==================
Power Efficiency: 4.2% battery per hour
Photo Success Rate: 99.1%
Service Uptime: 99.97%
Network Stability: 99.8%

OPTIMIZATION OPPORTUNITIES
==========================
1. Cache camera settings (reduce API calls by 30%)
2. Optimize WebSocket broadcast (improve by 15ms)
3. Implement photo queue (reduce memory spikes)
4. Add thermal throttling (prevent overheating)

Baseline Status: ✓ ESTABLISHED
Use this baseline for future performance comparisons
```

## Health Monitoring Workflows

### 1. Continuous Health Monitoring
```
Step 1: Data Collection
  - Gather system metrics every minute
  - Parse logs in real-time
  - Monitor service status
  - Track performance indicators

Step 2: Analysis and Correlation
  - Identify patterns and trends
  - Correlate events across components
  - Calculate health scores
  - Detect anomalies

Step 3: Alert Generation
  - Generate alerts for critical issues
  - Notify of degrading performance
  - Recommend preventive actions
  - Schedule maintenance windows

Step 4: Reporting and Insights
  - Generate daily health summaries
  - Create weekly trend reports
  - Provide monthly health assessments
  - Deliver quarterly optimization plans
```

### 2. Predictive Failure Analysis
```
Step 1: Historical Data Analysis
  - Analyze failure patterns
  - Identify leading indicators
  - Build prediction models
  - Validate accuracy

Step 2: Risk Assessment
  - Calculate failure probabilities
  - Assess impact severity
  - Prioritize risk factors
  - Generate risk scores

Step 3: Maintenance Planning
  - Schedule preventive maintenance
  - Plan component replacements
  - Coordinate service windows
  - Prepare contingency plans

Step 4: Continuous Improvement
  - Refine prediction models
  - Update maintenance schedules
  - Optimize intervention timing
  - Enhance system reliability
```

## Advanced Analytics Features

### Machine Learning Insights
- Anomaly detection using statistical models
- Pattern recognition in system behavior
- Predictive modeling for failure prevention
- Automated root cause analysis

### Trend Analysis
- Long-term performance trend identification
- Seasonal pattern recognition
- Capacity planning predictions
- Optimization opportunity detection

### Comparative Analysis
- Performance comparison across time periods
- Benchmark against optimal configurations
- Impact analysis of system changes
- Best practice identification

## Integration Points

### With Existing Code
- Use same logging infrastructure as application
- Leverage existing monitoring APIs
- Follow established data formats
- Integrate with PowerManager for thermal data

### With Other Agents
- **Camera Testing Agent**: For camera health validation
- **Network Debugging Agent**: For network performance analysis
- **Timelapse Analysis Agent**: For session performance correlation
- **Deployment Helper**: For post-deployment health validation

## Sample Agent Prompts

### General Health Check
"Give me a comprehensive health check of my pi-camera-control system. I want to know if anything needs attention."

### Performance Issues
"My system seems slower than usual. Analyze the performance data and help me identify what's causing the slowdown."

### Log Investigation
"I've been seeing some errors in my logs. Help me understand what's happening and if I should be concerned."

### Predictive Maintenance
"Based on my system's current state, what maintenance should I plan for the next month?"

## Health Scoring Algorithm

### Component Health Scores
```javascript
function calculateHealthScore(metrics) {
  const scores = {
    system: calculateSystemScore(metrics.system),
    services: calculateServicesScore(metrics.services),
    network: calculateNetworkScore(metrics.network),
    camera: calculateCameraScore(metrics.camera)
  };

  // Weighted average based on component criticality
  const weights = { system: 0.3, services: 0.3, network: 0.2, camera: 0.2 };
  const overallScore = Object.keys(scores).reduce((total, key) => {
    return total + (scores[key] * weights[key]);
  }, 0);

  return {
    overall: Math.round(overallScore),
    components: scores,
    status: getHealthStatus(overallScore)
  };
}

function getHealthStatus(score) {
  if (score >= 90) return 'Excellent';
  if (score >= 80) return 'Good';
  if (score >= 70) return 'Fair';
  if (score >= 60) return 'Poor';
  return 'Critical';
}
```

This system health agent provides comprehensive monitoring and analysis capabilities essential for maintaining reliable operation of the pi-camera-control system in field deployment scenarios.