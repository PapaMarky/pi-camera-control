# Clock Drift Experiments

This directory contains tools for measuring and analyzing clock drift on the Raspberry Pi and Canon camera to determine optimal synchronization intervals.

## Quick Start

### 1. Pi Clock Drift Test

Measure how much the Raspberry Pi's clock drifts without NTP:

```bash
# Run 48-hour test with 15-minute intervals
node pi-drift-test.js picontrol-002.local

# Shorter test with custom parameters
node pi-drift-test.js picontrol-002.local --duration 24 --interval 10
```

**Prerequisites:**
- SSH access to Pi without password (SSH keys configured)
- Pi user has sudo privileges
- Node.js installed on test machine (MacBook)

### 2. Camera Clock Drift Test

Measure Canon camera's internal clock drift:

```bash
# Run 48-hour test with 30-minute intervals
node camera-drift-test.js 192.168.4.100

# Custom parameters
node camera-drift-test.js 192.168.4.100 --duration 24 --interval 15
```

**Prerequisites:**
- Camera connected to same network
- CCAPI enabled on camera
- Camera in shooting mode (not playback)

### 3. Analyze Results

Analyze the collected drift data:

```bash
# Basic analysis
node analyze-drift.js pi-drift-2024-01-15.csv

# With ASCII plot
node analyze-drift.js camera-drift-2024-01-15.csv --plot

# Compare Pi vs Camera
node analyze-drift.js pi-drift.csv --compare camera-drift.csv

# Export to JSON
node analyze-drift.js pi-drift.csv --export analysis.json
```

## Test Programs

### `pi-drift-test.js`
- Connects to Pi via SSH
- Disables NTP services
- Sets initial time from laptop
- Measures drift every N minutes
- Re-enables NTP on completion
- Outputs CSV with drift measurements

### `camera-drift-test.js`
- Connects via Canon CCAPI
- Sets initial time (optional)
- Measures drift every N minutes
- Handles reconnection if camera disconnects
- Outputs CSV with drift measurements

### `analyze-drift.js`
- Reads CSV files from drift tests
- Calculates comprehensive statistics
- Generates ASCII plots
- Compares multiple datasets
- Provides synchronization recommendations

## Output Files

### CSV Format
All drift tests output CSV files with these columns:
- `timestamp` - When measurement was taken
- `laptop_time` - Reference time from laptop
- `pi_time` or `camera_time` - Device time
- `drift_ms` - Drift in milliseconds
- `drift_seconds` - Drift in seconds
- `cumulative_drift_seconds` - Total drift since start
- `drift_rate_seconds_per_hour` - Calculated drift rate
- `check_number` - Sequential measurement number

### Analysis Output
The analysis tool provides:
- Duration and sample count
- Drift statistics (mean, median, min, max, percentiles)
- Drift rate analysis
- Trend analysis with linear regression
- Stability metrics
- Synchronization recommendations

## Expected Results

### Raspberry Pi
- **Without RTC**: 1-5 seconds drift per day
- **Variability**: Higher due to temperature changes
- **Recommendation**: 30-minute to 1-hour sync intervals

### Canon Camera
- **With RTC**: < 1 second drift per day
- **Variability**: Very stable
- **Recommendation**: Daily synchronization sufficient

## Running the Full Experiment

1. **Start Pi test** (on MacBook):
   ```bash
   node pi-drift-test.js picontrol-002.local --duration 48 &
   ```

2. **Start camera test** (on MacBook):
   ```bash
   node camera-drift-test.js 192.168.4.100 --duration 48 &
   ```

3. **Wait 48 hours**

4. **Analyze results**:
   ```bash
   node analyze-drift.js pi-drift-*.csv --plot
   node analyze-drift.js camera-drift-*.csv --plot
   node analyze-drift.js pi-drift-*.csv --compare camera-drift-*.csv
   ```

## Troubleshooting

### Pi Test Issues
- **SSH connection failed**: Check SSH keys and network
- **Cannot disable NTP**: Ensure sudo privileges
- **Time set fails**: Check system permissions

### Camera Test Issues
- **Connection failed**: Verify camera IP and CCAPI enabled
- **Timeout errors**: Camera may be in sleep mode
- **Invalid datetime**: Check camera firmware version

### Analysis Issues
- **File not found**: Check CSV file path
- **No data points**: Verify CSV format
- **Plot looks wrong**: May need more data points

## Integration with Auto-Sync

The results from these experiments will determine:
1. How long Pi time remains "reliable" after sync
2. Optimal sync check intervals
3. Drift thresholds for triggering sync
4. Whether different intervals are needed for Pi vs camera

These parameters will be used in the TimeSync service configuration.