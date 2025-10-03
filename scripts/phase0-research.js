#!/usr/bin/env node
/**
 * Phase 0 CCAPI Research Script
 *
 * This script tests critical CCAPI functionality needed for the Test Shot feature:
 * 1. Live view capture performance
 * 2. Event polling + simultaneous camera control
 * 3. Camera settings query
 * 4. EXIF extraction from sample photo
 *
 * Run on Pi: node scripts/phase0-research.js
 */

import axios from 'axios';
import https from 'https';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

// Disable SSL verification for local camera
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const CAMERA_IP = process.env.CAMERA_IP || '192.168.4.2'; // Default Pi AP IP
const CAMERA_PORT = '443';
const BASE_URL = `https://${CAMERA_IP}:${CAMERA_PORT}`;
const OUTPUT_DIR = './data/phase0-research';

// Create axios client with appropriate timeouts
const client = axios.create({
  timeout: 40000, // 40 seconds to handle long exposures
  httpsAgent: new https.Agent({
    rejectUnauthorized: false,
  }),
});

// Utility functions
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const formatBytes = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const formatDuration = (ms) => {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
};

// Initialize output directory
async function initOutputDir() {
  if (!existsSync(OUTPUT_DIR)) {
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
  }
  console.log(`✓ Output directory: ${OUTPUT_DIR}\n`);
}

// Test 1: Live View Capture
async function testLiveView() {
  console.log('=== TEST 1: LIVE VIEW CAPTURE ===\n');

  try {
    // Enable live view
    console.log('1. Enabling live view (small size)...');
    const startTime = Date.now();
    await client.post(`${BASE_URL}/ccapi/ver100/shooting/liveview`, {
      liveviewsize: 'small',
      cameradisplay: 'on'
    });
    console.log(`   ✓ Live view enabled in ${formatDuration(Date.now() - startTime)}\n`);

    // Wait for camera to settle
    await sleep(1000);

    // Capture live view image
    console.log('2. Capturing live view image (flip)...');
    const captureStart = Date.now();
    const response = await client.get(`${BASE_URL}/ccapi/ver100/shooting/liveview/flip`, {
      responseType: 'arraybuffer'
    });
    const captureTime = Date.now() - captureStart;

    // Save image
    const imagePath = path.join(OUTPUT_DIR, 'liveview-test.jpg');
    await fs.writeFile(imagePath, Buffer.from(response.data));

    console.log(`   ✓ Live view captured in ${formatDuration(captureTime)}`);
    console.log(`   ✓ Image size: ${formatBytes(response.data.byteLength)}`);
    console.log(`   ✓ Image saved: ${imagePath}`);
    console.log(`   ✓ Content-Type: ${response.headers['content-type']}\n`);

    // Disable live view
    console.log('3. Disabling live view...');
    await client.post(`${BASE_URL}/ccapi/ver100/shooting/liveview`, {
      liveviewsize: 'off'
    });
    console.log('   ✓ Live view disabled\n');

    return {
      success: true,
      responseTime: captureTime,
      imageSize: response.data.byteLength,
      imagePath,
      acceptable: captureTime < 3000 // Target: < 3 seconds
    };

  } catch (error) {
    console.error('   ✗ Error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

// Test 2: Event Polling + Simultaneous Control (CRITICAL)
async function testEventPolling() {
  console.log('=== TEST 2: EVENT POLLING + SIMULTANEOUS CONTROL (CRITICAL) ===\n');

  try {
    console.log('1. Starting event polling...');

    // Start polling in background (this is a long-poll, will block)
    let pollingResponse = null;
    let pollingError = null;
    let pollingComplete = false;

    const pollingPromise = client.get(`${BASE_URL}/ccapi/ver100/event/polling`, {
      params: { continue: 'on' },
      timeout: 40000 // Allow up to 40 seconds for long exposure + processing
    }).then(response => {
      pollingResponse = response.data;
      pollingComplete = true;
    }).catch(error => {
      pollingError = error;
      pollingComplete = true;
    });

    console.log('   ✓ Event polling started (long-poll in progress)\n');

    // Wait a moment to ensure polling is active
    await sleep(2000);

    // CRITICAL TEST: Try to take a photo while polling is active
    console.log('2. CRITICAL: Taking photo WHILE polling is active...');
    const shutterStart = Date.now();

    try {
      await client.post(`${BASE_URL}/ccapi/ver100/shooting/control/shutterbutton`, {
        af: false
      }, {
        timeout: 35000 // 30s max shutter + 5s safety
      });
      const shutterTime = Date.now() - shutterStart;
      console.log(`   ✓ Shutter command succeeded in ${formatDuration(shutterTime)}`);
      console.log('   ✓ RESULT: Camera CAN handle simultaneous polling + control!\n');
    } catch (shutterError) {
      console.error('   ✗ Shutter command failed:', shutterError.message);
      console.log('   ✗ RESULT: Polling appears to BLOCK camera operations\n');

      // Stop polling
      try {
        await client.post(`${BASE_URL}/ccapi/ver100/event/polling`, {
          continue: 'off'
        });
      } catch (e) {
        // Ignore stop error
      }

      return {
        success: false,
        blocksOperations: true,
        error: shutterError.message
      };
    }

    // Wait for polling to complete
    console.log('3. Waiting for event polling response...');
    const eventStart = Date.now();
    await pollingPromise;
    const eventTime = Date.now() - eventStart;

    if (pollingError) {
      console.error('   ✗ Polling error:', pollingError.message);
      return {
        success: false,
        error: pollingError.message
      };
    }

    console.log(`   ✓ Event received in ${formatDuration(eventTime)}`);
    console.log('   ✓ Event data:', JSON.stringify(pollingResponse, null, 2), '\n');

    // Check for addedcontents
    if (pollingResponse && pollingResponse.addedcontents) {
      console.log('   ✓ Found addedcontents event!');
      console.log('   ✓ Photos:', pollingResponse.addedcontents, '\n');
    } else {
      console.log('   ⚠ No addedcontents in response (photo may still be processing)\n');
    }

    // Save event data
    const eventPath = path.join(OUTPUT_DIR, 'event-polling-response.json');
    await fs.writeFile(eventPath, JSON.stringify(pollingResponse, null, 2));
    console.log(`   ✓ Event data saved: ${eventPath}\n`);

    return {
      success: true,
      blocksOperations: false,
      eventLatency: eventTime,
      eventData: pollingResponse,
      hasAddedContents: !!(pollingResponse && pollingResponse.addedcontents)
    };

  } catch (error) {
    console.error('   ✗ Error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

// Test 3: Camera Settings Query
async function testCameraSettings() {
  console.log('=== TEST 3: CAMERA SETTINGS QUERY ===\n');

  try {
    console.log('1. Querying all camera settings...');
    const response = await client.get(`${BASE_URL}/ccapi/ver100/shooting/settings`);

    const settings = response.data;
    const settingsPath = path.join(OUTPUT_DIR, 'camera-settings.json');
    await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2));

    console.log(`   ✓ Settings retrieved successfully`);
    console.log(`   ✓ Settings saved: ${settingsPath}`);
    console.log(`   ✓ Total settings count: ${Object.keys(settings).length}\n`);

    // Find quality settings
    console.log('2. Analyzing quality settings...');
    if (settings.stillimagequality) {
      console.log('   ✓ Image quality setting found:');
      console.log('   - Current:', settings.stillimagequality.value);
      console.log('   - Available:', settings.stillimagequality.ability || 'N/A');

      // Try to identify smallest quality
      const abilities = settings.stillimagequality.ability || [];
      if (abilities.length > 0) {
        // Typically smallest is last in list, but let's show all
        console.log('   - Smallest (recommended for tests):', abilities[abilities.length - 1]);
      }
    } else {
      console.log('   ⚠ No stillimagequality setting found');
    }
    console.log('');

    return {
      success: true,
      settingsCount: Object.keys(settings).length,
      settingsPath,
      hasQualitySetting: !!settings.stillimagequality,
      qualityOptions: settings.stillimagequality?.ability || []
    };

  } catch (error) {
    console.error('   ✗ Error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

// Test 4: EXIF Extraction (requires exifr library)
async function testEXIFExtraction() {
  console.log('=== TEST 4: EXIF EXTRACTION ===\n');

  try {
    // Check if exifr is installed
    let exifr;
    try {
      exifr = await import('exifr');
      console.log('   ✓ exifr library available\n');
    } catch (e) {
      console.log('   ⚠ exifr not installed - run: npm install exifr');
      console.log('   Skipping EXIF extraction test\n');
      return {
        success: false,
        error: 'exifr not installed'
      };
    }

    // Download a sample photo from camera (if available)
    console.log('1. Downloading sample photo from camera...');

    // First, list contents to find a photo
    const contentsResponse = await client.get(`${BASE_URL}/ccapi/ver100/contents/sd`);

    // Look for image files
    let samplePhotoUrl = null;

    // Parse XML response (CCAPI returns XML for contents)
    const xmlData = contentsResponse.data;
    console.log('   Contents response type:', typeof xmlData);

    // For now, let's try to download the first image from root
    // This is a simplified approach - real implementation would parse the directory structure
    try {
      // Try common Canon image naming patterns
      const testPaths = [
        '/DCIM/100CANON/IMG_0001.JPG',
        '/DCIM/100CANON/IMG_0001.CR3'
      ];

      for (const testPath of testPaths) {
        try {
          console.log(`   Trying: ${testPath}`);
          const photoResponse = await client.get(
            `${BASE_URL}/ccapi/ver100/contents/sd${testPath}`,
            { responseType: 'arraybuffer', timeout: 15000 }
          );

          samplePhotoUrl = testPath;
          const photoPath = path.join(OUTPUT_DIR, 'sample-photo.jpg');
          await fs.writeFile(photoPath, Buffer.from(photoResponse.data));
          console.log(`   ✓ Sample photo downloaded: ${photoPath}\n`);

          // Extract EXIF
          console.log('2. Extracting EXIF metadata...');
          const exifData = await exifr.parse(photoPath);

          if (exifData) {
            console.log('   ✓ EXIF data extracted successfully:');
            console.log('   - ISO:', exifData.ISO);
            console.log('   - Shutter Speed:', exifData.ExposureTime);
            console.log('   - Aperture:', exifData.FNumber);
            console.log('   - White Balance:', exifData.WhiteBalance);
            console.log('   - Date/Time:', exifData.DateTimeOriginal);
            console.log('   - Camera Model:', exifData.Model);
            console.log('   - Lens Model:', exifData.LensModel);
            console.log('');

            // Save EXIF data
            const exifPath = path.join(OUTPUT_DIR, 'sample-exif.json');
            await fs.writeFile(exifPath, JSON.stringify(exifData, null, 2));
            console.log(`   ✓ EXIF data saved: ${exifPath}\n`);

            return {
              success: true,
              photoPath,
              exifPath,
              exifData: {
                iso: exifData.ISO,
                shutterSpeed: exifData.ExposureTime,
                aperture: exifData.FNumber,
                whiteBalance: exifData.WhiteBalance,
                timestamp: exifData.DateTimeOriginal,
                model: exifData.Model
              }
            };
          } else {
            console.log('   ⚠ No EXIF data found in image\n');
          }

          break; // Found a photo, stop trying
        } catch (err) {
          // Try next path
          continue;
        }
      }

      if (!samplePhotoUrl) {
        console.log('   ⚠ Could not find sample photo on camera');
        console.log('   ℹ Take a test photo first, then re-run this script\n');
        return {
          success: false,
          error: 'No sample photo found on camera'
        };
      }

    } catch (error) {
      console.error('   ✗ Error downloading/parsing photo:', error.message);
      return {
        success: false,
        error: error.message
      };
    }

  } catch (error) {
    console.error('   ✗ Error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

// Main execution
async function main() {
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║       Phase 0 CCAPI Research - Test Shot Feature         ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');
  console.log(`Camera: ${BASE_URL}`);
  console.log(`Date: ${new Date().toISOString()}\n`);

  await initOutputDir();

  const results = {
    timestamp: new Date().toISOString(),
    camera: BASE_URL,
    tests: {}
  };

  // Run all tests
  results.tests.liveView = await testLiveView();
  results.tests.eventPolling = await testEventPolling();
  results.tests.cameraSettings = await testCameraSettings();
  results.tests.exifExtraction = await testEXIFExtraction();

  // Generate summary
  console.log('═══════════════════════════════════════════════════════════');
  console.log('                    TEST SUMMARY                           ');
  console.log('═══════════════════════════════════════════════════════════\n');

  console.log('Live View:');
  if (results.tests.liveView.success) {
    console.log(`  ✓ Response time: ${formatDuration(results.tests.liveView.responseTime)}`);
    console.log(`  ✓ Image size: ${formatBytes(results.tests.liveView.imageSize)}`);
    console.log(`  ${results.tests.liveView.acceptable ? '✓' : '⚠'} Performance: ${results.tests.liveView.acceptable ? 'ACCEPTABLE' : 'SLOW'} (target: <3s)`);
  } else {
    console.log('  ✗ FAILED:', results.tests.liveView.error);
  }
  console.log('');

  console.log('Event Polling (CRITICAL):');
  if (results.tests.eventPolling.success) {
    console.log(`  ✓ Polling works correctly`);
    console.log(`  ✓ Simultaneous control: ${results.tests.eventPolling.blocksOperations ? 'BLOCKED' : 'WORKS'}`);
    console.log(`  ${results.tests.eventPolling.hasAddedContents ? '✓' : '⚠'} addedcontents event: ${results.tests.eventPolling.hasAddedContents ? 'RECEIVED' : 'NOT RECEIVED'}`);
    if (!results.tests.eventPolling.blocksOperations) {
      console.log('  ✓ RECOMMENDATION: Can use polling during photo operations');
    } else {
      console.log('  ⚠ RECOMMENDATION: Must use sequential approach (poll after photo)');
    }
  } else {
    console.log('  ✗ FAILED:', results.tests.eventPolling.error);
  }
  console.log('');

  console.log('Camera Settings:');
  if (results.tests.cameraSettings.success) {
    console.log(`  ✓ Retrieved ${results.tests.cameraSettings.settingsCount} settings`);
    console.log(`  ${results.tests.cameraSettings.hasQualitySetting ? '✓' : '⚠'} Quality setting: ${results.tests.cameraSettings.hasQualitySetting ? 'AVAILABLE' : 'NOT FOUND'}`);
    if (results.tests.cameraSettings.qualityOptions.length > 0) {
      console.log(`  ✓ Smallest quality: ${results.tests.cameraSettings.qualityOptions[results.tests.cameraSettings.qualityOptions.length - 1]}`);
    }
  } else {
    console.log('  ✗ FAILED:', results.tests.cameraSettings.error);
  }
  console.log('');

  console.log('EXIF Extraction:');
  if (results.tests.exifExtraction.success) {
    console.log('  ✓ EXIF extraction works');
    console.log('  ✓ Available metadata: ISO, Shutter, Aperture, WB, Timestamp');
  } else {
    console.log('  ⚠ Not tested:', results.tests.exifExtraction.error);
  }
  console.log('');

  // Save complete results
  const resultsPath = path.join(OUTPUT_DIR, 'phase0-results.json');
  await fs.writeFile(resultsPath, JSON.stringify(results, null, 2));
  console.log(`\n✓ Complete results saved: ${resultsPath}`);
  console.log(`\n✓ All test data in: ${OUTPUT_DIR}\n`);
}

// Run
main().catch(error => {
  console.error('\n✗ Fatal error:', error);
  process.exit(1);
});
