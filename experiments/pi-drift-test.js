#!/usr/bin/env node

/**
 * Pi Clock Drift Test
 *
 * Measures the Raspberry Pi's clock drift over time when not using NTP.
 * Run this from a MacBook or other reliable time source.
 *
 * Usage: node pi-drift-test.js <pi-hostname> [--duration <hours>] [--interval <minutes>]
 * Example: node pi-drift-test.js picontrol-002.local --duration 48 --interval 15
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

// Configuration
const args = process.argv.slice(2);
if (args.length === 0 || args.includes('--help')) {
  console.log(`
Usage: node pi-drift-test.js <pi-hostname> [options]

Options:
  --duration <hours>     Test duration in hours (default: 48)
  --interval <minutes>   Check interval in minutes (default: 15)
  --output <file>        Output CSV file (default: pi-drift-<timestamp>.csv)
  --skip-ntp-disable     Skip disabling NTP on the Pi
  --help                 Show this help message

Example:
  node pi-drift-test.js picontrol-002.local --duration 24 --interval 10
`);
  process.exit(0);
}

const PI_HOST = args[0];
const DURATION_HOURS = parseInt(args[args.indexOf('--duration') + 1] || '48');
const CHECK_INTERVAL_MINUTES = parseInt(args[args.indexOf('--interval') + 1] || '15');
const SKIP_NTP = args.includes('--skip-ntp-disable');
const OUTPUT_FILE = args.includes('--output')
  ? args[args.indexOf('--output') + 1]
  : `pi-drift-${new Date().toISOString().slice(0, 19).replace(/:/g, '-').replace('T', '_')}.csv`;

const DURATION_MS = DURATION_HOURS * 60 * 60 * 1000;
const CHECK_INTERVAL_MS = CHECK_INTERVAL_MINUTES * 60 * 1000;

console.log(`
Pi Clock Drift Test Configuration:
- Pi Host: ${PI_HOST}
- Duration: ${DURATION_HOURS} hours
- Check Interval: ${CHECK_INTERVAL_MINUTES} minutes
- Output File: ${OUTPUT_FILE}
- Skip NTP Disable: ${SKIP_NTP}
`);

// SSH command wrapper
function sshCommand(command) {
  return new Promise((resolve, reject) => {
    const ssh = spawn('ssh', [`pi@${PI_HOST}`, command]);

    let stdout = '';
    let stderr = '';

    ssh.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    ssh.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ssh.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`SSH command failed: ${stderr || stdout}`));
      } else {
        resolve(stdout.trim());
      }
    });

    ssh.on('error', (err) => {
      reject(err);
    });
  });
}

// Get current time from Pi
async function getPiTime() {
  try {
    // Get time in ISO format with nanoseconds for precision
    const timeStr = await sshCommand('date -u +"%Y-%m-%dT%H:%M:%S.%N"');
    // Convert nanoseconds to milliseconds
    const match = timeStr.match(/^(.+)\.(\d{9})$/);
    if (match) {
      const baseTime = match[1] + 'Z';
      const nanos = parseInt(match[2]);
      const millis = Math.floor(nanos / 1000000);
      const date = new Date(baseTime);
      date.setMilliseconds(millis);
      return date;
    }
    return new Date(timeStr + 'Z');
  } catch (error) {
    console.error('Error getting Pi time:', error.message);
    throw error;
  }
}

// Set Pi time to current laptop time
async function setPiTime() {
  try {
    const laptopTime = new Date();
    const timeStr = laptopTime.toISOString().slice(0, 19).replace('T', ' ');

    console.log(`Setting Pi time to: ${laptopTime.toISOString()}`);
    await sshCommand(`sudo date -u -s "${timeStr}"`);

    // Verify the time was set
    const piTime = await getPiTime();
    const initialDrift = Math.abs(piTime - laptopTime);
    console.log(`Time set. Initial drift: ${initialDrift}ms`);

    return laptopTime;
  } catch (error) {
    console.error('Error setting Pi time:', error.message);
    throw error;
  }
}

// Disable NTP on the Pi
async function disableNTP() {
  console.log('Disabling NTP on Pi...');
  try {
    // Try systemd-timesyncd first (most common on modern Raspberry Pi OS)
    await sshCommand('sudo systemctl stop systemd-timesyncd 2>/dev/null || true');
    await sshCommand('sudo systemctl disable systemd-timesyncd 2>/dev/null || true');

    // Also try ntp service if it exists
    await sshCommand('sudo systemctl stop ntp 2>/dev/null || true');
    await sshCommand('sudo systemctl disable ntp 2>/dev/null || true');

    // And chrony if it exists
    await sshCommand('sudo systemctl stop chrony 2>/dev/null || true');
    await sshCommand('sudo systemctl disable chrony 2>/dev/null || true');

    console.log('NTP services disabled');
  } catch (error) {
    console.warn('Warning: Could not fully disable NTP:', error.message);
  }
}

// Re-enable NTP on the Pi
async function enableNTP() {
  console.log('Re-enabling NTP on Pi...');
  try {
    await sshCommand('sudo systemctl enable systemd-timesyncd 2>/dev/null || true');
    await sshCommand('sudo systemctl start systemd-timesyncd 2>/dev/null || true');
    console.log('NTP re-enabled');
  } catch (error) {
    console.warn('Warning: Could not re-enable NTP:', error.message);
  }
}

// Initialize CSV file
function initCSV() {
  const header = 'timestamp,laptop_time,pi_time,drift_ms,drift_seconds,cumulative_drift_seconds,drift_rate_seconds_per_hour,check_number\n';
  fs.writeFileSync(OUTPUT_FILE, header);
  console.log(`Created output file: ${OUTPUT_FILE}`);
}

// Append data to CSV
function appendToCSV(data) {
  const line = `${data.timestamp},${data.laptopTime},${data.piTime},${data.driftMs},${data.driftSeconds},${data.cumulativeDrift},${data.driftRate},${data.checkNumber}\n`;
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
  const totalDriftSeconds = parseFloat(lastMeasurement.cumulativeDrift) || (lastMeasurement.driftMs / 1000);
  const avgDriftRate = totalDriftSeconds / totalTimeHours;

  return {
    avgDriftMs: avg,
    maxDriftMs: max,
    minDriftMs: min,
    avgDriftRate: avgDriftRate,
    totalDriftSeconds: totalDriftSeconds,
    totalTimeHours: totalTimeHours
  };
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

    // Disable NTP if requested
    if (!SKIP_NTP) {
      await disableNTP();
    }

    // Set initial time
    initialTime = await setPiTime();

    console.log(`\nStarting drift test for ${DURATION_HOURS} hours...`);
    console.log('Press Ctrl+C to stop early and see results\n');

    // Main measurement loop
    while (Date.now() - startTime < DURATION_MS) {
      // Wait for next check
      await new Promise(resolve => setTimeout(resolve, CHECK_INTERVAL_MS));

      checkNumber++;
      const laptopTime = new Date();

      try {
        const piTime = await getPiTime();
        const driftMs = piTime.getTime() - laptopTime.getTime();
        const driftSeconds = driftMs / 1000;
        const elapsedHours = (checkNumber * CHECK_INTERVAL_MINUTES) / 60;
        const driftRate = driftSeconds / elapsedHours;

        const measurement = {
          timestamp: laptopTime.toISOString(),
          laptopTime: laptopTime.toISOString(),
          piTime: piTime.toISOString(),
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
      }
    }

  } catch (error) {
    console.error('Test error:', error);
  } finally {
    // Re-enable NTP
    if (!SKIP_NTP) {
      await enableNTP();
    }

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
    } else {
      console.log('No measurements collected');
    }
  }
}

// Store measurements globally for Ctrl+C handler
let globalMeasurements = [];

// Handle Ctrl+C gracefully
process.on('SIGINT', async () => {
  console.log('\n\nInterrupted by user. Cleaning up...');
  if (!SKIP_NTP) {
    await enableNTP();
  }

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
  } else {
    console.log('No measurements collected');
  }

  process.exit(0);
});

// Verify SSH connection before starting
async function verifyConnection() {
  console.log(`Testing SSH connection to ${PI_HOST}...`);
  try {
    const result = await sshCommand('echo "Connection successful"');
    console.log(result);
    return true;
  } catch (error) {
    console.error(`Cannot connect to ${PI_HOST}:`, error.message);
    console.error('Make sure:');
    console.error('1. The Pi is powered on and connected to the network');
    console.error('2. SSH is enabled on the Pi');
    console.error('3. You can SSH without a password (SSH keys configured)');
    return false;
  }
}

// Main entry point
async function main() {
  const connected = await verifyConnection();
  if (!connected) {
    process.exit(1);
  }

  await runTest();
}

main().catch(console.error);