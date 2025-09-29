# Timelapse Analysis Agent

## Purpose
Optimize timelapse sessions, analyze performance data, and provide intelligent recommendations for better photography results and system efficiency.

## Agent Capabilities

### 1. Session Performance Analysis
- Analyze completed timelapse session reports
- Calculate timing precision and drift patterns
- Identify optimal intervals for different conditions
- Generate performance improvement recommendations

### 2. Battery and Power Optimization
- Analyze power consumption patterns during sessions
- Calculate battery life estimates for different configurations
- Recommend power-saving interval adjustments
- Predict session completion based on battery status

### 3. Environmental Condition Analysis
- Correlate session performance with temperature data
- Analyze thermal throttling impact on timing
- Recommend thermal management strategies
- Optimize for different weather conditions

### 4. Camera Settings Optimization
- Analyze camera settings vs. session success rates
- Recommend optimal intervals based on shutter speeds
- Identify settings that cause timing issues
- Suggest camera configuration improvements

## Usage Examples

### Session Performance Review
```
/timelapse-analyze session --report-id "night-sky-2024-01-01"
```
**Expected Actions:**
- Load session report from `data/reports/`
- Analyze timing precision and photo success rates
- Check for pattern anomalies or drift
- Generate optimization recommendations

### Battery Optimization Analysis
```
/timelapse-analyze battery --sessions-last-month
```
**Expected Actions:**
- Analyze power consumption across recent sessions
- Calculate average power draw per photo
- Recommend optimal intervals for battery life
- Generate power management strategy

### Multi-Session Comparison
```
/timelapse-analyze compare --sessions "session1,session2,session3"
```
**Expected Actions:**
- Load multiple session reports
- Compare performance metrics
- Identify best-performing configurations
- Generate comparative analysis report

### Predictive Planning
```
/timelapse-analyze plan --duration 8h --interval 30s --battery 85%
```
**Expected Actions:**
- Calculate expected photo count and battery usage
- Predict session completion probability
- Recommend adjustments for success
- Generate session planning report

## Implementation Guide

### Key Data Sources
- `data/reports/*.json` - Completed session reports
- System logs - Power and thermal data during sessions
- `src/intervalometer/session.js` - Current session data structure
- Camera settings data from CCAPI responses

### Session Report Structure Analysis
```javascript
// Typical session report structure
{
  id: 'session-uuid',
  title: 'Night Sky Timelapse',
  createdAt: '2024-01-01T20:00:00.000Z',
  sessionData: {
    startTime: '2024-01-01T20:00:00.000Z',
    endTime: '2024-01-01T23:30:00.000Z',
    duration: 12600, // seconds
    stats: {
      shotsTaken: 420,
      shotsSuccessful: 418,
      shotsFailed: 2,
      successRate: 99.5,
      errors: [/* error details */]
    },
    options: {
      interval: 30,
      totalShots: 420
    },
    timingData: [
      { shot: 1, timestamp: '...', actualInterval: 30.12 },
      { shot: 2, timestamp: '...', actualInterval: 29.98 }
    ]
  }
}
```

### Analysis Algorithms
1. **Timing Precision**: Calculate standard deviation of actual intervals
2. **Drift Analysis**: Identify systematic timing drift over session duration
3. **Success Rate Correlation**: Link success rates to environmental factors
4. **Power Efficiency**: Calculate joules per photo for different configurations

## Expected Output Formats

### Session Performance Report
```
Timelapse Session Analysis: "Night Sky 2024-01-01"
================================================
Duration: 3h 30m (12,600 seconds)
Photos: 418 successful / 420 attempted (99.5% success rate)
Target Interval: 30.0s
Actual Interval: 30.02s ± 0.07s (excellent precision)

Timing Analysis:
  - Drift: +0.15s over session (minimal)
  - Precision: σ = 0.07s (excellent)
  - Max deviation: +0.18s / -0.12s
  - Timing quality: A+ (very stable)

Performance Issues:
  - 2 failed photos around 22:15 (thermal event correlation)
  - Brief 0.5s timing spike at 21:45 (system load)

Power Consumption:
  - Est. battery usage: 15% (3h 30m session)
  - Power efficiency: 0.036% per photo
  - Predicted battery life: 22 hours continuous

Recommendations:
  ✓ Current 30s interval is optimal for this setup
  ✓ Consider thermal management for summer sessions
  ✓ Excellent overall performance - no changes needed
```

### Battery Optimization Report
```
Battery Optimization Analysis (Last 30 Days)
===========================================
Sessions Analyzed: 15 sessions
Total Photos: 6,240 photos
Total Session Time: 47.5 hours

Power Consumption Patterns:
  - Average: 4.2% battery per hour
  - Range: 3.8% - 5.1% per hour
  - Efficiency: 0.034% per photo (average)

Interval vs. Battery Life:
  - 15s intervals: ~12 hours battery life
  - 30s intervals: ~24 hours battery life  ⭐ OPTIMAL
  - 60s intervals: ~45 hours battery life

Environmental Factors:
  - Cold weather (-5°C): +15% power consumption
  - Hot weather (35°C): +8% power consumption
  - Optimal range: 15-25°C

Recommendations:
  1. Use 30s intervals for best balance of quality/efficiency
  2. Plan for 20% shorter battery life in winter
  3. Consider interval adjustment for extreme temperatures
  4. Thermal management reduces power consumption by ~12%
```

### Comparative Analysis
```
Multi-Session Comparison Analysis
================================
Sessions: "Night Sky A", "Night Sky B", "Sunset Valley"
Comparison Period: December 2024

Performance Metrics:
                    Night Sky A  Night Sky B  Sunset Valley
Duration:           3h 30m      4h 15m       2h 45m
Success Rate:       99.5%       97.8%        100%
Timing Precision:   ±0.07s      ±0.15s       ±0.04s
Battery Usage:      15%         22%          12%
Avg Temperature:    18°C        25°C         22°C

Best Performing Configuration:
  - Session: "Sunset Valley"
  - Interval: 45s
  - Camera: Manual focus, f/8, ISO 100
  - Conditions: Stable temperature, low humidity

Key Insights:
  1. Temperature stability correlates with timing precision
  2. Manual focus improves success rates by 1.7%
  3. 45s intervals show best precision for this camera
  4. Higher temperatures increase timing variance

Optimization Recommendations:
  1. Use "Sunset Valley" settings as template
  2. Increase intervals during hot weather
  3. Manual focus for critical sessions
  4. Monitor temperature during long sessions
```

## Analysis Workflows

### 1. Session Quality Assessment
```
Step 1: Load Session Data
  - Parse JSON report files
  - Extract timing and performance data
  - Load corresponding system logs

Step 2: Statistical Analysis
  - Calculate timing precision metrics
  - Analyze drift patterns and trends
  - Identify anomalies and outliers

Step 3: Correlation Analysis
  - Link performance to environmental data
  - Identify causal relationships
  - Generate insights and patterns

Step 4: Recommendation Generation
  - Compare against optimal baselines
  - Suggest specific improvements
  - Provide actionable next steps
```

### 2. Predictive Session Planning
```
Step 1: Historical Analysis
  - Analyze similar past sessions
  - Extract performance patterns
  - Build prediction models

Step 2: Environmental Assessment
  - Consider current conditions
  - Factor in battery and thermal state
  - Assess equipment configuration

Step 3: Success Probability Calculation
  - Calculate completion likelihood
  - Estimate resource requirements
  - Identify potential failure points

Step 4: Optimization Recommendations
  - Suggest optimal intervals
  - Recommend configuration changes
  - Provide contingency plans
```

## Advanced Analytics Features

### Machine Learning Insights
- Pattern recognition in timing data
- Predictive modeling for session success
- Anomaly detection in performance metrics
- Optimization algorithm development

### Trend Analysis
- Long-term performance trends
- Seasonal adjustment patterns
- Equipment degradation detection
- Environmental impact assessment

### Comparative Benchmarking
- Performance against ideal baselines
- Comparison with similar equipment setups
- Industry standard benchmarking
- Best practice identification

## Integration Points

### With Existing Code
- Read from `data/reports/` directory structure
- Use same JSON parsing as `ReportManager`
- Leverage power monitoring data from `PowerManager`
- Correlate with camera settings from `CameraController`

### With Other Agents
- **Camera Testing Agent**: For baseline performance data
- **System Health Agent**: For environmental correlation
- **Network Debugging Agent**: For connectivity impact analysis

## Sample Agent Prompts

### Performance Issues
"My timelapse sessions have inconsistent timing. Analyze my recent sessions and help me identify what's causing the variations."

### Battery Planning
"I want to run an 8-hour night session. Based on my past performance, what interval should I use to ensure completion?"

### Setup Optimization
"Compare my last 5 sessions and tell me which camera settings and intervals give the best results."

### Troubleshooting
"My session from last night had 15 failed photos around midnight. Analyze what went wrong and how to prevent it."

## Optimization Algorithms

### Interval Optimization
```python
def optimize_interval(camera_settings, battery_level, duration_target):
    """
    Calculate optimal interval based on multiple factors
    """
    base_interval = camera_settings.shutter_speed * 2  # Safety margin
    battery_factor = calculate_battery_efficiency(battery_level)
    thermal_factor = estimate_thermal_impact(duration_target)

    optimal_interval = base_interval * battery_factor * thermal_factor
    return round(optimal_interval, 1)
```

### Success Prediction
```python
def predict_session_success(session_plan, historical_data):
    """
    Predict likelihood of successful session completion
    """
    similar_sessions = filter_similar_sessions(historical_data, session_plan)
    success_rate = calculate_average_success_rate(similar_sessions)
    environmental_adjustment = assess_current_conditions()

    prediction = success_rate * environmental_adjustment
    return {
        'probability': prediction,
        'confidence': calculate_confidence(similar_sessions),
        'risk_factors': identify_risk_factors(session_plan)
    }
```

This timelapse analysis agent provides intelligent insights for optimizing photography sessions and system performance based on historical data and predictive modeling.