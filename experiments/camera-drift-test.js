#!/usr/bin/env node

/**
 * Camera Clock Drift Test
 *
 * Measures the Canon camera's clock drift over time.
 * Run this from a MacBook or other reliable time source.
 *
 * Usage: node camera-drift-test.js <camera-ip> [--duration <hours>] [--interval <minutes>]
 * Example: node camera-drift-test.js 192.168.1.100 --duration 48 --interval 30
 */

import https from 'https';
import fs from 'fs';

// Configuration
const args = process.argv.slice(2);
if (args.length === 0 || args.includes('--help')) {
  console.log(`
Usage: node camera-drift-test.js <camera-ip> [options]

Options:
  --duration <hours>     Test duration in hours (default: 48)
  --interval <minutes>   Check interval in minutes (default: 30)
  --output <file>        Output CSV file (default: camera-drift-<timestamp>.csv)
  --skip-initial-sync    Skip setting camera time at start
  --help                 Show this help message

Example:
  node camera-drift-test.js 192.168.4.100 --duration 24 --interval 15

Note: Camera must be connected to the same network and have CCAPI enabled.
`);
  process.exit(0);
}

const CAMERA_IP = args[0];
const CAMERA_PORT = 443;
const DURATION_HOURS = parseInt(args[args.indexOf('--duration') + 1] || '48');
const CHECK_INTERVAL_MINUTES = parseInt(args[args.indexOf('--interval') + 1] || '30');
const SKIP_INITIAL_SYNC = args.includes('--skip-initial-sync');
const OUTPUT_FILE = args.includes('--output')
  ? args[args.indexOf('--output') + 1]
  : `camera-drift-${new Date().toISOString().slice(0, 19).replace(/:/g, '-').replace('T', '_')}.csv`;

const DURATION_MS = DURATION_HOURS * 60 * 60 * 1000;
const CHECK_INTERVAL_MS = CHECK_INTERVAL_MINUTES * 60 * 1000;

console.log(`
Camera Clock Drift Test Configuration:
- Camera IP: ${CAMERA_IP}:${CAMERA_PORT}
- Duration: ${DURATION_HOURS} hours
- Check Interval: ${CHECK_INTERVAL_MINUTES} minutes
- Output File: ${OUTPUT_FILE}
- Skip Initial Sync: ${SKIP_INITIAL_SYNC}
`);

// HTTPS agent that ignores self-signed certificates
const httpsAgent = new https.Agent({
  rejectUnauthorized: false
});

// Make CCAPI request
function ccapiRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: CAMERA_IP,
      port: CAMERA_PORT,
      path: path,
      method: method,
      headers: {
        'Accept': 'application/json'
      },
      agent: httpsAgent,
      timeout: 10000
    };

    if (body) {
      const bodyStr = JSON.stringify(body);
      options.headers['Content-Type'] = 'application/json';
      options.headers['Content-Length'] = Buffer.byteLength(bodyStr);
    }

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(data ? JSON.parse(data) : {});
          } catch (e) {
            resolve(data);
          }
        } else {
          reject(new Error(`CCAPI request failed: ${res.statusCode} - ${data}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

// Connect to camera (required before other operations)
async function connectToCamera() {
  try {
    console.log('Connecting to camera...');
    await ccapiRequest('GET', '/ccapi');
    console.log('Connected to camera successfully');
    return true;
  } catch (error) {
    console.error('Failed to connect to camera:', error.message);
    return false;
  }
}

// Get camera time
async function getCameraTime() {
  try {
    const response = await ccapiRequest('GET', '/ccapi/ver100/settings/datetime');

    // Camera returns datetime in format: "2024-01-15T10:30:45"
    // May include timezone offset: "2024-01-15T10:30:45+09:00"
    if (response && response.datetime) {
      // If no timezone, assume UTC
      let dateStr = response.datetime;
      if (!dateStr.includes('+') && !dateStr.includes('-') && !dateStr.includes('Z')) {
        dateStr += 'Z';
      }
      return new Date(dateStr);
    }
    throw new Error('Invalid datetime response from camera');
  } catch (error) {
    console.error('Error getting camera time:', error.message);
    throw error;
  }
}

// Set camera time
async function setCameraTime() {
  try {
    const laptopTime = new Date();

    // Format time for camera: "YYYY-MM-DDTHH:MM:SS"
    const year = laptopTime.getUTCFullYear();
    const month = String(laptopTime.getUTCMonth() + 1).padStart(2, '0');
    const day = String(laptopTime.getUTCDate()).padStart(2, '0');
    const hours = String(laptopTime.getUTCHours()).padStart(2, '0');
    const minutes = String(laptopTime.getUTCMinutes()).padStart(2, '0');
    const seconds = String(laptopTime.getUTCSeconds()).padStart(2, '0');

    const datetimeStr = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;

    console.log(`Setting camera time to: ${laptopTime.toISOString()}`);

    const body = {
      datetime: datetimeStr
    };

    await ccapiRequest('PUT', '/ccapi/ver100/settings/datetime', body);

    // Verify the time was set
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
    const cameraTime = await getCameraTime();
    const initialDrift = Math.abs(cameraTime - laptopTime);
    console.log(`Time set. Initial drift: ${initialDrift}ms`);

    return laptopTime;
  } catch (error) {
    console.error('Error setting camera time:', error.message);
    throw error;
  }
}

// Initialize CSV file
function initCSV() {
  const header = 'timestamp,laptop_time,camera_time,drift_ms,drift_seconds,cumulative_drift_seconds,drift_rate_seconds_per_hour,check_number\n';
  fs.writeFileSync(OUTPUT_FILE, header);
  console.log(`Created output file: ${OUTPUT_FILE}`);
}

// Append data to CSV
function appendToCSV(data) {
  const line = `${data.timestamp},${data.laptopTime},${data.cameraTime},${data.driftMs},${data.driftSeconds},${data.cumulativeDrift},${data.driftRate},${data.checkNumber}\n`;
  fs.appendFileSync(OUTPUT_FILE, line);
}

// Calculate statistics
function calculateStats(measurements) {
  if (measurements.length === 0) return null;

  const drifts = measurements.map(m => m.driftMs);
  const sum = drifts.reduce((a, b) => a + b, 0);
  const avg = sum / drifts.length;
  const max = Math.max(...drifts);
  const min = Math.min(...drifts);

  // Calculate drift rate over entire period
  const firstMeasurement = measurements[0];
  const lastMeasurement = measurements[measurements.length - 1];
  const totalTimeHours = (lastMeasurement.checkNumber * CHECK_INTERVAL_MINUTES) / 60;
  const totalDriftSeconds = lastMeasurement.cumulativeDrift;
  const avgDriftRate = totalTimeHours > 0 ? totalDriftSeconds / totalTimeHours : 0;

  return {
    avgDriftMs: avg,
    maxDriftMs: max,
    minDriftMs: min,
    avgDriftRate: avgDriftRate,
    totalDriftSeconds: totalDriftSeconds,
    totalTimeHours: totalTimeHours
  };
}

// Test camera operations
async function testCameraOperations() {
  console.log('\nTesting camera operations...');

  // Test getting camera info
  try {
    const info = await ccapiRequest('GET', '/ccapi/ver100/deviceinformation');
    console.log(`Camera Model: ${info.model || 'Unknown'}`);
    console.log(`Serial Number: ${info.serialnumber || 'Unknown'}`);
  } catch (error) {
    console.warn('Could not get camera info:', error.message);
  }

  // Test getting current datetime
  try {
    const cameraTime = await getCameraTime();
    const laptopTime = new Date();
    const drift = (cameraTime - laptopTime) / 1000;
    console.log(`Current camera time: ${cameraTime.toISOString()}`);
    console.log(`Current laptop time: ${laptopTime.toISOString()}`);
    console.log(`Current drift: ${drift.toFixed(3)} seconds`);
  } catch (error) {
    console.error('Could not get camera time:', error.message);
    throw error;
  }

  console.log('Camera operations test completed\n');
}

// Main test loop
async function runTest() {
  const startTime = Date.now();
  const measurements = [];
  let checkNumber = 0;
  let initialTime = null;

  try {
    // Initialize CSV
    initCSV();

    // Connect to camera
    const connected = await connectToCamera();
    if (!connected) {
      throw new Error('Could not connect to camera');
    }

    // Test camera operations
    await testCameraOperations();

    // Set initial time if requested
    if (!SKIP_INITIAL_SYNC) {
      initialTime = await setCameraTime();
    }

    console.log(`\nStarting drift test for ${DURATION_HOURS} hours...`);
    console.log('Press Ctrl+C to stop early and see results\n');

    // Main measurement loop
    while (Date.now() - startTime < DURATION_MS) {
      // Wait for next check
      await new Promise(resolve => setTimeout(resolve, CHECK_INTERVAL_MS));

      checkNumber++;
      const laptopTime = new Date();

      try {
        const cameraTime = await getCameraTime();
        const driftMs = cameraTime.getTime() - laptopTime.getTime();
        const driftSeconds = driftMs / 1000;
        const elapsedHours = (checkNumber * CHECK_INTERVAL_MINUTES) / 60;
        const driftRate = elapsedHours > 0 ? driftSeconds / elapsedHours : 0;

        const measurement = {
          timestamp: laptopTime.toISOString(),
          laptopTime: laptopTime.toISOString(),
          cameraTime: cameraTime.toISOString(),
          driftMs: driftMs,
          driftSeconds: driftSeconds.toFixed(3),
          cumulativeDrift: driftSeconds.toFixed(3),
          driftRate: driftRate.toFixed(4),
          checkNumber: checkNumber
        };

        measurements.push(measurement);
        globalMeasurements.push(measurement); // Update global for Ctrl+C handler
        appendToCSV(measurement);

        console.log(`Check #${checkNumber} (${elapsedHours.toFixed(1)}h): Drift = ${driftSeconds.toFixed(3)}s (${driftMs}ms), Rate = ${driftRate.toFixed(4)}s/hour`);

      } catch (error) {
        console.error(`Check #${checkNumber} failed:`, error.message);
        // Try to reconnect
        console.log('Attempting to reconnect...');
        const reconnected = await connectToCamera();
        if (!reconnected) {
          console.error('Reconnection failed. Waiting for next check...');
        }
      }
    }

  } catch (error) {
    console.error('Test error:', error);
  } finally {
    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('TEST COMPLETE');
    console.log('='.repeat(60));

    const stats = calculateStats(measurements);
    if (stats) {
      console.log(`
Summary Statistics:
- Total measurements: ${measurements.length}
- Test duration: ${stats.totalTimeHours.toFixed(1)} hours
- Total drift: ${stats.totalDriftSeconds.toFixed(3)} seconds
- Average drift rate: ${stats.avgDriftRate.toFixed(4)} seconds/hour
- Maximum drift: ${(stats.maxDriftMs/1000).toFixed(3)} seconds
- Minimum drift: ${(stats.minDriftMs/1000).toFixed(3)} seconds
- Average drift: ${(stats.avgDriftMs/1000).toFixed(3)} seconds

Results saved to: ${OUTPUT_FILE}
`);

      // Provide recommendations based on results
      if (Math.abs(stats.avgDriftRate) < 0.1) {
        console.log('\nRecommendation: Camera clock is very stable (< 0.1 s/hour drift).');
        console.log('Daily synchronization should be sufficient.');
      } else if (Math.abs(stats.avgDriftRate) < 1) {
        console.log('\nRecommendation: Camera clock is stable (< 1 s/hour drift).');
        console.log('Synchronization every 4-6 hours recommended.');
      } else {
        console.log('\nRecommendation: Camera clock shows significant drift (> 1 s/hour).');
        console.log('Hourly synchronization recommended.');
      }
    } else {
      console.log('No measurements collected');
    }
  }
}

// Store measurements globally for Ctrl+C handler
let globalMeasurements = [];

// Handle Ctrl+C gracefully
process.on('SIGINT', async () => {
  console.log('\n\nInterrupted by user. Shutting down...');

  // Print summary statistics
  console.log('\n' + '='.repeat(60));
  console.log('TEST INTERRUPTED - PARTIAL RESULTS');
  console.log('='.repeat(60));

  const stats = calculateStats(globalMeasurements);
  if (stats && globalMeasurements.length > 0) {
    console.log(`
Summary Statistics:
- Total measurements: ${globalMeasurements.length}
- Test duration: ${stats.totalTimeHours.toFixed(1)} hours
- Total drift: ${stats.totalDriftSeconds.toFixed(3)} seconds
- Average drift rate: ${stats.avgDriftRate.toFixed(4)} seconds/hour
- Maximum drift: ${(stats.maxDriftMs/1000).toFixed(3)} seconds
- Minimum drift: ${(stats.minDriftMs/1000).toFixed(3)} seconds
- Average drift: ${(stats.avgDriftMs/1000).toFixed(3)} seconds

Results saved to: ${OUTPUT_FILE}
`);

    // Provide recommendations based on results
    if (Math.abs(stats.avgDriftRate) < 0.1) {
      console.log('\nRecommendation: Camera clock is very stable (< 0.1 s/hour drift).');
      console.log('Daily synchronization should be sufficient.');
    } else if (Math.abs(stats.avgDriftRate) < 1) {
      console.log('\nRecommendation: Camera clock is stable (< 1 s/hour drift).');
      console.log('Synchronization every 4-6 hours recommended.');
    } else {
      console.log('\nRecommendation: Camera clock shows significant drift (> 1 s/hour).');
      console.log('Hourly synchronization recommended.');
    }
  } else {
    console.log('No measurements collected');
  }

  process.exit(0);
});

// Main entry point
async function main() {
  await runTest();
}

main().catch(console.error);