# Power Management and System Monitoring

## Overview

The power management system provides comprehensive monitoring and optimization for off-grid 
operation on Raspberry Pi devices. It includes battery monitoring, thermal management, power 
optimization recommendations, and system health tracking specifically designed for field deployment scenarios.

## System Architecture

### PowerManager (`src/system/power.js`)
**Role**: Centralized power and thermal monitoring
- Raspberry Pi hardware detection
- Battery/UPS monitoring via system interfaces
- CPU thermal monitoring via vcgencmd
- Power optimization recommendations
- System health status reporting

### Monitoring Capabilities
- **Hardware Detection**: Automatic Raspberry Pi vs generic system detection
  - **NOTE**: pi-camera-controller is designed to use Raspberry pi. There is no need for hardware detection other than determining which version of raspberry pi hardware is in use. 
- **Battery Status**: Capacity, voltage, charging status via system files
- **Thermal Monitoring**: CPU temperature via VideoCore GPU commands
- **Power State**: Throttling detection and voltage monitoring
- **System Metrics**: Uptime, memory usage, platform information

The goal of monitoring the health of the hardware is to inform the user of potential problems. In the field the user
does not have access to log files on the pi. All issues must be visible in the web app UI.

## Hardware Detection and Initialization

### Raspberry Pi Detection
```javascript
// From src/system/power.js:33-40
async detectRaspberryPi() {
    try {
        const { stdout } = await execAsync('cat /proc/cpuinfo 2>/dev/null | grep -i "raspberry" || echo ""');
        return stdout.trim().length > 0;
    } catch (error) {
        return false;
    }
}
```

### Initialization Strategy
```javascript
// Conditional initialization based on hardware
if (this.isRaspberryPi) {
    logger.info('Raspberry Pi detected, enabling Pi-specific power monitoring');
    this.startPowerMonitoring();
} else {
    logger.info('Non-Pi environment detected, using basic power monitoring');
}
```

## Battery and Power Monitoring

### UPS/Battery Detection
The system attempts to detect various UPS HATs and battery monitoring systems:

```javascript
// From src/system/power.js:70-84
const commands = [
    // Common UPS HAT commands
    'cat /sys/class/power_supply/BAT*/capacity 2>/dev/null || echo ""',
    'cat /sys/class/power_supply/BAT*/status 2>/dev/null || echo ""',
    // Pi power status
    'vcgencmd get_throttled 2>/dev/null || echo ""',
    'vcgencmd measure_volts core 2>/dev/null || echo ""',
    // System uptime
    'cat /proc/uptime 2>/dev/null || echo ""'
];
```

### Power State Analysis
```javascript
// Battery information structure
this.batteryInfo = {
    capacity: this.parseCapacity(results[0]),      // Battery percentage
    status: this.parseStatus(results[1]),          // charging/discharging
    throttled: this.parseThrottled(results[2]),    // Power throttling status
    voltage: this.parseVoltage(results[3]),        // Core voltage
    systemUptime: this.parseSystemUptime(results[4]), // System uptime
    isPowerConnected: true // Default assumption
};
```

### Throttling Detection
```javascript
// From src/system/power.js:153-161
parseThrottled(result) {
    if (result.status === 'fulfilled' && result.value.stdout.trim()) {
        const output = result.value.stdout.trim();
        // Extract hex value from "throttled=0x0"
        const match = output.match(/throttled=(0x[0-9a-fA-F]+)/);
        return match ? match[1] : output;
    }
    return null;
}
```

#### Throttling Status Interpretation
- **0x0**: No throttling detected
- **0x50000**: Under-voltage detected
- **0x50005**: Under-voltage and currently throttling
- **Other values**: Various combinations of thermal/power issues

## Thermal Management

### CPU Temperature Monitoring
```javascript
// From src/system/power.js:107-127
async updateThermalInfo() {
    try {
        const { stdout } = await execAsync('vcgencmd measure_temp 2>/dev/null || echo ""');
        const tempMatch = stdout.match(/temp=([0-9.]+)/);

        this.thermalInfo = {
            temperature: tempMatch ? parseFloat(tempMatch[1]) : null,
            unit: 'C',
            timestamp: new Date().toISOString()
        };

        // Thermal warnings for field operation
        if (this.thermalInfo.temperature > 70) {
            logger.warn(`High CPU temperature detected: ${this.thermalInfo.temperature}°C`);
        }
    } catch (error) {
        this.thermalInfo = { error: 'Thermal info not available' };
    }
}
```

### Temperature Thresholds
- **Normal Operation**: < 60°C
- **Warning Level**: 60-70°C
- **High Temperature**: > 70°C (logged warning)
- **Critical**: > 80°C (automatic throttling by Pi)

### Thermal Management Strategies
1. **Monitoring**: Continuous temperature tracking
2. **Warnings**: Log warnings at elevated temperatures
3. **Recommendations**: Suggest cooling or load reduction
4. **Throttling Detection**: Monitor for automatic throttling

## Power Optimization

### Monitoring Intervals
```javascript
// From src/system/power.js:42-47
startPowerMonitoring() {
    // Update power status every 30 seconds for battery optimization
    this.updateInterval = setInterval(async () => {
        await this.updatePowerStatus();
    }, 30000);
}
```

### Optimization Strategies
- **Longer Intervals**: 30-second monitoring to reduce CPU wake-ups
- **Conditional Monitoring**: More frequent during active operations
- **Efficient Commands**: Minimize expensive system calls
- **Lazy Loading**: Only monitor what's necessary

### Power Recommendations Engine
```javascript
// From src/system/power.js:191-207
getPowerRecommendations() {
    const recommendations = [];

    if (this.thermalInfo?.temperature > 70) {
        recommendations.push('High temperature detected - consider cooling or reducing workload');
    }

    if (this.batteryInfo?.capacity && this.batteryInfo.capacity < 20) {
        recommendations.push('Low battery - consider connecting power or reducing activity');
    }

    if (this.batteryInfo?.throttled && this.batteryInfo.throttled !== '0x0') {
        recommendations.push('Power throttling active - check power supply and connections');
    }

    return recommendations;
}
```

## System Health Monitoring

### Health Status Composition
```javascript
// Complete power status response
getStatus() {
    return {
        isRaspberryPi: this.isRaspberryPi,
        battery: this.batteryInfo,
        thermal: this.thermalInfo,
        lastUpdate: this.lastUpdate,
        powerOptimized: true,
        recommendations: this.getPowerRecommendations()
    };
}
```

### Generic System Monitoring
For non-Raspberry Pi systems:
```javascript
// From src/system/power.js:129-137
async updateGenericPowerInfo() {
    // For non-Pi systems, provide basic system info
    this.batteryInfo = {
        type: 'system',
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        platform: process.platform
    };
}
```

## Monitoring Data Structures

### Battery Information
```javascript
// Typical battery status structure
batteryInfo: {
    capacity: 85,              // Percentage (0-100)
    status: 'discharging',     // charging/discharging/full
    throttled: '0x0',          // Throttling status hex
    voltage: 3.7,              // Core voltage (volts)
    systemUptime: 86400,       // System uptime (seconds)
    isPowerConnected: true,    // Power adapter connected
    type: 'battery'            // Battery type indicator
}
```

### Thermal Information
```javascript
// CPU thermal status
thermalInfo: {
    temperature: 45.2,         // Temperature in Celsius
    unit: 'C',                 // Temperature unit
    timestamp: '2024-01-01T12:00:00.000Z', // Last reading time
    warning: false,            // Warning threshold exceeded
    critical: false            // Critical threshold exceeded
}
```

### System Metrics
```javascript
// Generic system information
systemInfo: {
    uptime: 86400,             // Process uptime (seconds)
    memoryUsage: {             // Node.js memory usage
        rss: 123456789,
        heapTotal: 67890123,
        heapUsed: 45678901,
        external: 12345678
    },
    platform: 'linux',        // Operating system platform
    nodeVersion: 'v18.17.0'    // Node.js version
}
```

## API Integration

### REST Endpoints

#### Power Status
```http
GET /api/system/power
```

**Response:**
```json
{
    "isRaspberryPi": true,
    "battery": {
        "capacity": 85,
        "status": "discharging",
        "voltage": 3.7,
        "systemUptime": 86400,
        "throttled": "0x0"
    },
    "thermal": {
        "temperature": 45.2,
        "unit": "C",
        "timestamp": "2024-01-01T12:00:00.000Z"
    },
    "lastUpdate": "2024-01-01T12:00:00.000Z",
    "powerOptimized": true,
    "recommendations": []
}
```

#### System Status
```http
GET /api/system/status
```

**Response:**
```json
{
    "uptime": 86400,
    "memory": {
        "rss": 123456789,
        "heapTotal": 67890123,
        "heapUsed": 45678901
    },
    "platform": "linux",
    "nodeVersion": "v18.17.0",
    "timestamp": "2024-01-01T12:00:00.000Z",
    "power": {
        "battery": { "capacity": 85 },
        "thermal": { "temperature": 45.2 }
    }
}
```

### WebSocket Integration
Power status is included in periodic status broadcasts:
```json
{
    "type": "status_update",
    "power": {
        "battery": { "capacity": 85 },
        "thermal": { "temperature": 45.2 },
        "uptime": 86400,
        "recommendations": []
    }
}
```

## Field Operation Optimization

### Off-Grid Considerations
- **Battery Conservation**: Optimized monitoring intervals
- **Thermal Management**: Heat dissipation in enclosures
- **Power Monitoring**: Early warning for battery depletion
- **System Stability**: Throttling detection and response

### Deployment Strategies
1. **Enclosure Design**: Proper ventilation for thermal management
2. **Power Planning**: Battery capacity calculations
3. **Monitoring Setup**: Appropriate UPS HAT selection
4. **Backup Procedures**: Graceful shutdown on low battery

### Environmental Monitoring
- **Temperature Extremes**: Cold weather battery performance
- **Humidity Considerations**: Condensation prevention
- **Dust Protection**: Sealed enclosures
- **Vibration Resistance**: Secure mounting systems

## Error Handling and Recovery

### Power System Errors
1. **Monitoring Failure**: Graceful degradation to basic monitoring
2. **Command Errors**: Fallback to alternative measurement methods
3. **Thermal Sensor Failure**: Continue operation with warnings
4. **Battery Communication Loss**: Use system-level indicators

### Recovery Mechanisms
```javascript
// Graceful error handling in monitoring
try {
    await this.updateRaspberryPiBattery();
    await this.updateThermalInfo();
} catch (error) {
    logger.error('Failed to update power status:', error);
    // Continue operation with cached/default values
}
```

### Emergency Procedures
- **Low Battery**: Automated shutdown procedures
- **High Temperature**: Automatic load reduction
- **Power Loss**: State preservation
- **Recovery**: Automatic service restart

## Performance Monitoring

### Resource Usage
- **CPU Impact**: Minimal overhead from monitoring commands
- **Memory Usage**: Efficient data structure management
- **Network Traffic**: No network overhead for local monitoring
- **Storage**: Minimal log storage requirements

### Optimization Metrics
- **Monitoring Frequency**: Balanced between accuracy and power consumption
- **Command Efficiency**: Optimized system command usage
- **Data Retention**: Appropriate history for trend analysis
- **Alert Thresholds**: Tuned for field operation scenarios

## Integration with Camera Operations

### Power-Aware Operation
- **Battery Monitoring**: Adjust intervalometer timing based on battery level
- **Thermal Throttling**: Pause operations during high temperature
- **Power Warnings**: User notifications for low battery conditions
- **Graceful Shutdown**: Preserve session state on power loss

### Operation Optimization
```javascript
// Example: Adjust intervals based on battery level
if (batteryCapacity < 20) {
    // Reduce intervalometer frequency to conserve power
    recommendedInterval = Math.max(originalInterval * 1.5, 60);
    logger.warn('Low battery detected, adjusting interval to conserve power');
}
```

## Configuration and Customization

### Monitoring Configuration
```javascript
// Configurable monitoring parameters
const monitoringConfig = {
    updateInterval: 30000,           // Monitoring frequency (ms)
    thermalWarningThreshold: 70,     // Temperature warning (°C)
    batteryLowThreshold: 20,         // Low battery warning (%)
    voltageWarningThreshold: 3.0,    // Low voltage warning (V)
    enableRecommendations: true,     // Power optimization suggestions
    logThermalWarnings: true,        // Log thermal events
    logBatteryWarnings: true         // Log battery events
};
```

### Hardware-Specific Tuning
- **UPS HAT Detection**: Support for various UPS hardware
- **Thermal Sensor Configuration**: Different sensor types
- **Power Supply Monitoring**: Various power input types
- **Custom Command Integration**: Additional monitoring commands

This power management system provides comprehensive monitoring and optimization capabilities essential for reliable off-grid camera operation, with particular focus on Raspberry Pi deployments in field environments.