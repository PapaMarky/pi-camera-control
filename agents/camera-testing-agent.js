#!/usr/bin/env node

import axios from 'axios';
import https from 'https';
import { spawn } from 'child_process';
import { promisify } from 'util';
import dgram from 'dgram';
import { EventEmitter } from 'events';

const execAsync = promisify(spawn);

// Disable SSL verification for Canon cameras
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

class CameraTestingAgent {
    constructor() {
        this.client = axios.create({
            timeout: 10000,
            httpsAgent: new https.Agent({
                rejectUnauthorized: false
            })
        });
        this.results = {};
    }

    async runTest(testType, options = {}) {
        console.log(`\n🔍 Running Camera Test: ${testType.toUpperCase()}`);
        console.log('=' .repeat(50));

        try {
            switch (testType.toLowerCase()) {
                case 'discovery':
                    return await this.testDiscovery(options);
                case 'connection':
                    return await this.testConnection(options.ip, options.port);
                case 'endpoints':
                    return await this.testEndpoints(options.ip, options.port);
                case 'interval':
                    return await this.testInterval(options.ip, options.interval, options.port);
                case 'comprehensive':
                    return await this.runComprehensiveTest(options);
                default:
                    throw new Error(`Unknown test type: ${testType}`);
            }
        } catch (error) {
            console.error(`❌ Test failed: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    async testDiscovery(options = {}) {
        const results = {
            upnp: { found: [], status: 'pending' },
            ipScan: { found: [], status: 'pending' },
            recommendations: []
        };

        console.log('📡 Testing UPnP Discovery...');
        try {
            const upnpDevices = await this.performUPnPDiscovery();
            results.upnp.found = upnpDevices;
            results.upnp.status = upnpDevices.length > 0 ? 'success' : 'no_devices';

            if (upnpDevices.length > 0) {
                console.log(`✅ UPnP: Found ${upnpDevices.length} device(s)`);
                upnpDevices.forEach(device => {
                    console.log(`   - ${device.modelName} at ${device.ip}:${device.port}`);
                });
            } else {
                console.log('⚠️  UPnP: No devices found');
            }
        } catch (error) {
            console.log(`❌ UPnP: ${error.message}`);
            results.upnp.status = 'failed';
            results.upnp.error = error.message;
        }

        console.log('\n🔍 Testing IP Range Scanning...');
        try {
            const scanResults = await this.performIPScan(options.ranges);
            results.ipScan.found = scanResults;
            results.ipScan.status = scanResults.length > 0 ? 'success' : 'no_devices';

            if (scanResults.length > 0) {
                console.log(`✅ IP Scan: Found ${scanResults.length} camera(s)`);
                scanResults.forEach(camera => {
                    console.log(`   - ${camera.ip}:${camera.port} (${camera.method})`);
                });
            } else {
                console.log('⚠️  IP Scan: No cameras found');
            }
        } catch (error) {
            console.log(`❌ IP Scan: ${error.message}`);
            results.ipScan.status = 'failed';
            results.ipScan.error = error.message;
        }

        // Generate recommendations
        this.generateDiscoveryRecommendations(results);

        return results;
    }

    async performUPnPDiscovery() {
        return new Promise((resolve, reject) => {
            const socket = dgram.createSocket('udp4');
            const devices = [];

            const msearchMessage = [
                'M-SEARCH * HTTP/1.1',
                'HOST: 239.255.255.250:1900',
                'MAN: "ssdp:discover"',
                'ST: upnp:rootdevice',
                'MX: 3',
                '', ''
            ].join('\r\n');

            socket.on('message', (msg, rinfo) => {
                const response = msg.toString();
                if (response.includes('Canon') || response.includes('camera')) {
                    devices.push({
                        ip: rinfo.address,
                        port: '443',
                        modelName: this.extractModelName(response),
                        method: 'upnp',
                        response: response
                    });
                }
            });

            socket.bind(() => {
                socket.setBroadcast(true);
                socket.send(msearchMessage, 1900, '239.255.255.250');
            });

            setTimeout(() => {
                socket.close();
                resolve(devices);
            }, 5000);
        });
    }

    async performIPScan(ranges = ['192.168.4', '192.168.12', '192.168.1']) {
        const cameras = [];

        for (const baseRange of ranges) {
            console.log(`   Scanning ${baseRange}.x...`);
            const promises = [];

            // Scan different ranges based on network type
            const scanRange = baseRange === '192.168.4' ?
                { start: 2, end: 20 } :  // AP network
                { start: 90, end: 99 };  // Common camera ranges

            for (let i = scanRange.start; i <= scanRange.end; i++) {
                const ip = `${baseRange}.${i}`;
                promises.push(this.testCameraAtIP(ip));
            }

            const results = await Promise.allSettled(promises);
            results.forEach((result, index) => {
                if (result.status === 'fulfilled' && result.value) {
                    cameras.push(result.value);
                }
            });
        }

        return cameras;
    }

    async testCameraAtIP(ip, port = '443') {
        try {
            const response = await this.client.get(`https://${ip}:${port}/ccapi`, {
                timeout: 2000
            });

            if (response.status === 200 && response.data) {
                return {
                    ip: ip,
                    port: port,
                    method: 'ip-scan',
                    modelName: response.data.model || 'Canon Camera',
                    capabilities: Object.keys(response.data).length
                };
            }
        } catch (error) {
            // Expected for most IPs
            return null;
        }
    }

    async testConnection(ip, port = '443') {
        if (!ip) {
            throw new Error('IP address is required for connection test');
        }

        console.log(`🔗 Testing connection to ${ip}:${port}...`);
        const results = {
            connectivity: { status: 'pending' },
            ssl: { status: 'pending' },
            ccapi: { status: 'pending' },
            endpoints: { status: 'pending' },
            camera: { status: 'pending' },
            overall: 'pending'
        };

        // Test basic connectivity
        try {
            console.log('   Testing network connectivity...');
            await this.testNetworkConnectivity(ip, port);
            results.connectivity.status = 'pass';
            console.log('   ✅ Network connectivity: PASS');
        } catch (error) {
            results.connectivity.status = 'fail';
            results.connectivity.error = error.message;
            console.log(`   ❌ Network connectivity: FAIL (${error.message})`);
            return results;
        }

        // Test SSL handshake
        try {
            console.log('   Testing SSL handshake...');
            const response = await this.client.get(`https://${ip}:${port}/ccapi/`);
            results.ssl.status = 'pass';
            results.ccapi.status = 'pass';
            results.ccapi.data = response.data;
            console.log('   ✅ SSL handshake: PASS');
            console.log('   ✅ CCAPI root: PASS');
        } catch (error) {
            results.ssl.status = 'fail';
            results.ssl.error = error.message;
            console.log(`   ❌ SSL/CCAPI: FAIL (${error.message})`);
            return results;
        }

        // Test key endpoints
        try {
            console.log('   Testing key endpoints...');
            const endpointTests = await this.testKeyEndpoints(ip, port, results.ccapi.data);
            results.endpoints = endpointTests;

            const passCount = Object.values(endpointTests).filter(e => e.status === 'pass').length;
            console.log(`   ✅ Endpoints: ${passCount}/${Object.keys(endpointTests).length} PASS`);
        } catch (error) {
            results.endpoints.status = 'fail';
            results.endpoints.error = error.message;
            console.log(`   ❌ Endpoints: FAIL (${error.message})`);
        }

        // Get camera status
        try {
            console.log('   Getting camera status...');
            const cameraInfo = await this.getCameraInfo(ip, port);
            results.camera = cameraInfo;
            console.log(`   ✅ Camera: ${cameraInfo.model} (${cameraInfo.mode})`);
            console.log(`   📋 Battery: ${cameraInfo.battery}%`);
        } catch (error) {
            results.camera.status = 'fail';
            results.camera.error = error.message;
            console.log(`   ⚠️  Camera info: Limited (${error.message})`);
        }

        // Calculate overall status
        results.overall = this.calculateConnectionHealth(results);

        this.printConnectionSummary(results, ip, port);
        return results;
    }

    async testKeyEndpoints(ip, port, capabilities) {
        const endpoints = {
            shutter: { status: 'pending' },
            settings: { status: 'pending' },
            battery: { status: 'pending' }
        };

        // Test shutter endpoint
        const shutterEndpoint = this.findShutterEndpoint(capabilities);
        if (shutterEndpoint) {
            try {
                await this.client.get(`https://${ip}:${port}${shutterEndpoint}`);
                endpoints.shutter.status = 'pass';
                endpoints.shutter.endpoint = shutterEndpoint;
            } catch (error) {
                endpoints.shutter.status = 'fail';
                endpoints.shutter.error = error.message;
            }
        } else {
            endpoints.shutter.status = 'not_found';
        }

        // Test settings endpoint
        try {
            await this.client.get(`https://${ip}:${port}/ccapi/ver100/shooting/settings`);
            endpoints.settings.status = 'pass';
        } catch (error) {
            endpoints.settings.status = 'fail';
            endpoints.settings.error = error.message;
        }

        // Test battery endpoint
        try {
            await this.client.get(`https://${ip}:${port}/ccapi/ver110/devicestatus/batterylist`);
            endpoints.battery.status = 'pass';
        } catch (error) {
            try {
                await this.client.get(`https://${ip}:${port}/ccapi/ver100/devicestatus/battery`);
                endpoints.battery.status = 'pass';
            } catch (fallbackError) {
                endpoints.battery.status = 'fail';
                endpoints.battery.error = fallbackError.message;
            }
        }

        return endpoints;
    }

    async testInterval(ip, interval, port = '443') {
        if (!ip || !interval) {
            throw new Error('IP address and interval are required for interval test');
        }

        console.log(`⏱️  Testing ${interval}s interval with camera at ${ip}:${port}...`);

        const results = {
            connection: { status: 'pending' },
            settings: { status: 'pending' },
            validation: { status: 'pending' },
            timing: { status: 'pending' },
            recommendation: 'pending'
        };

        // Test connection first
        try {
            console.log('   Verifying camera connection...');
            const connectionTest = await this.testConnection(ip, port);
            if (connectionTest.overall !== 'excellent' && connectionTest.overall !== 'good') {
                throw new Error('Camera connection issues detected');
            }
            results.connection = connectionTest;
            console.log('   ✅ Camera connection verified');
        } catch (error) {
            results.connection.status = 'fail';
            results.connection.error = error.message;
            console.log(`   ❌ Connection: ${error.message}`);
            return results;
        }

        // Get camera settings
        try {
            console.log('   Getting camera settings...');
            const settings = await this.client.get(`https://${ip}:${port}/ccapi/ver100/shooting/settings`);
            results.settings.data = settings.data;
            results.settings.status = 'pass';
            console.log('   ✅ Camera settings retrieved');
        } catch (error) {
            results.settings.status = 'fail';
            results.settings.error = error.message;
            console.log(`   ⚠️  Settings: ${error.message}`);
        }

        // Validate interval against shutter speed
        if (results.settings.status === 'pass') {
            try {
                console.log('   Validating interval against camera settings...');
                const validation = this.validateInterval(interval, results.settings.data);
                results.validation = validation;

                if (validation.valid) {
                    console.log(`   ✅ Interval ${interval}s is compatible`);
                    console.log(`   📝 Shutter: ${validation.shutterSpeed}s, Buffer: ${validation.buffer}s`);
                } else {
                    console.log(`   ❌ Interval incompatible: ${validation.error}`);
                }
            } catch (error) {
                results.validation.status = 'fail';
                results.validation.error = error.message;
            }
        }

        // Test actual timing (5 photos)
        if (results.validation.valid) {
            try {
                console.log('   Testing actual photo timing (5 photos)...');
                const timingTest = await this.testPhotoTiming(ip, port, interval, 5);
                results.timing = timingTest;

                console.log(`   ✅ Timing test complete:`);
                console.log(`      Average: ${timingTest.average}s ± ${timingTest.stdDev}s`);
                console.log(`      Range: ${timingTest.min}s - ${timingTest.max}s`);
            } catch (error) {
                results.timing.status = 'fail';
                results.timing.error = error.message;
                console.log(`   ⚠️  Timing test: ${error.message}`);
            }
        }

        // Generate recommendation
        results.recommendation = this.generateIntervalRecommendation(results, interval);

        this.printIntervalSummary(results, interval);
        return results;
    }

    async runComprehensiveTest(options = {}) {
        console.log('🔬 Running Comprehensive Camera Test Suite...');

        const results = {
            discovery: null,
            connections: [],
            performance: {
                startTime: new Date().toISOString(),
                endTime: null,
                duration: null
            }
        };

        // Run discovery test
        console.log('\n--- DISCOVERY TEST ---');
        results.discovery = await this.testDiscovery(options);

        // Test all discovered cameras
        const allCameras = [
            ...results.discovery.upnp.found,
            ...results.discovery.ipScan.found
        ];

        if (allCameras.length > 0) {
            console.log('\n--- CONNECTION TESTS ---');
            for (const camera of allCameras) {
                console.log(`\nTesting ${camera.ip}:${camera.port}...`);
                const connectionTest = await this.testConnection(camera.ip, camera.port);
                results.connections.push({
                    camera: camera,
                    test: connectionTest
                });
            }

            // Test intervals on best camera
            const bestCamera = this.findBestCamera(results.connections);
            if (bestCamera && options.testInterval) {
                console.log('\n--- INTERVAL TEST ---');
                const intervalTest = await this.testInterval(
                    bestCamera.camera.ip,
                    options.testInterval,
                    bestCamera.camera.port
                );
                results.intervalTest = intervalTest;
            }
        }

        results.performance.endTime = new Date().toISOString();
        results.performance.duration = Date.now() - new Date(results.performance.startTime).getTime();

        this.printComprehensiveReport(results);
        return results;
    }

    // Utility methods
    extractModelName(upnpResponse) {
        const modelMatch = upnpResponse.match(/model[^:]*:\s*([^\r\n]+)/i);
        return modelMatch ? modelMatch[1].trim() : 'Canon Camera';
    }

    findShutterEndpoint(capabilities) {
        const endpoints = [];

        for (const [version, endpointsList] of Object.entries(capabilities)) {
            if (Array.isArray(endpointsList)) {
                for (const endpoint of endpointsList) {
                    if (endpoint?.path && endpoint.path.includes('shutterbutton') && endpoint.post) {
                        endpoints.push(endpoint.path);
                    }
                }
            }
        }

        return endpoints.find(ep => ep.includes('manual')) || endpoints[0];
    }

    validateInterval(interval, settings) {
        const shutterSpeed = this.parseShutterSpeed(settings?.tv);

        if (!shutterSpeed) {
            return {
                valid: true,
                warning: 'Could not determine shutter speed - validation skipped',
                shutterSpeed: 'unknown'
            };
        }

        const buffer = interval - shutterSpeed;

        if (interval <= shutterSpeed) {
            return {
                valid: false,
                error: `Interval (${interval}s) must be longer than shutter speed (${shutterSpeed}s)`,
                shutterSpeed: shutterSpeed,
                buffer: buffer
            };
        }

        return {
            valid: true,
            shutterSpeed: shutterSpeed,
            buffer: buffer,
            quality: buffer > shutterSpeed * 2 ? 'excellent' : 'good'
        };
    }

    parseShutterSpeed(tvSetting) {
        if (!tvSetting?.value) return null;

        try {
            const tvValue = tvSetting.value;

            if (typeof tvValue === 'string') {
                if (tvValue.includes('/')) {
                    const [numerator, denominator] = tvValue.split('/');
                    return parseFloat(numerator) / parseFloat(denominator);
                }
                return parseFloat(tvValue);
            }

            return parseFloat(tvValue);
        } catch (error) {
            return null;
        }
    }

    async testPhotoTiming(ip, port, targetInterval, photoCount) {
        const timings = [];
        const startTime = Date.now();

        for (let i = 0; i < photoCount; i++) {
            const photoStart = Date.now();

            try {
                // Simulate photo capture (we won't actually take photos in testing)
                await new Promise(resolve => setTimeout(resolve, 100));

                if (i > 0) {
                    const actualInterval = (photoStart - lastPhotoTime) / 1000;
                    timings.push(actualInterval);
                }

                var lastPhotoTime = photoStart;

                // Wait for next interval
                const elapsed = (Date.now() - photoStart) / 1000;
                const waitTime = Math.max(0, targetInterval - elapsed);
                if (waitTime > 0) {
                    await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
                }
            } catch (error) {
                throw new Error(`Photo ${i + 1} failed: ${error.message}`);
            }
        }

        // Calculate statistics
        const average = timings.reduce((a, b) => a + b, 0) / timings.length;
        const variance = timings.reduce((a, b) => a + Math.pow(b - average, 2), 0) / timings.length;
        const stdDev = Math.sqrt(variance);

        return {
            status: 'pass',
            timings: timings,
            average: Math.round(average * 100) / 100,
            stdDev: Math.round(stdDev * 100) / 100,
            min: Math.min(...timings),
            max: Math.max(...timings),
            target: targetInterval,
            accuracy: Math.abs(average - targetInterval) / targetInterval * 100
        };
    }

    async testNetworkConnectivity(ip, port) {
        return new Promise((resolve, reject) => {
            const net = require('net');
            const socket = new net.Socket();

            socket.setTimeout(5000);

            socket.on('connect', () => {
                socket.destroy();
                resolve(true);
            });

            socket.on('timeout', () => {
                socket.destroy();
                reject(new Error('Connection timeout'));
            });

            socket.on('error', (error) => {
                reject(error);
            });

            socket.connect(port, ip);
        });
    }

    async getCameraInfo(ip, port) {
        try {
            // Get basic info from CCAPI root
            const ccapiResponse = await this.client.get(`https://${ip}:${port}/ccapi/`);
            const info = {
                model: ccapiResponse.data.model || 'Unknown',
                mode: 'Unknown',
                battery: 'Unknown'
            };

            // Try to get battery info
            try {
                const batteryResponse = await this.client.get(`https://${ip}:${port}/ccapi/ver110/devicestatus/batterylist`);
                if (batteryResponse.data.batterylist && batteryResponse.data.batterylist[0]) {
                    info.battery = batteryResponse.data.batterylist[0].level || 'Unknown';
                }
            } catch (error) {
                // Try fallback battery endpoint
                try {
                    const batteryResponse = await this.client.get(`https://${ip}:${port}/ccapi/ver100/devicestatus/battery`);
                    info.battery = batteryResponse.data.level || 'Unknown';
                } catch (fallbackError) {
                    // Battery info not available
                }
            }

            // Try to determine camera mode
            try {
                const settingsResponse = await this.client.get(`https://${ip}:${port}/ccapi/ver100/shooting/settings`);
                info.mode = 'Shooting';
            } catch (error) {
                info.mode = 'Unknown';
            }

            return info;
        } catch (error) {
            throw new Error(`Could not get camera info: ${error.message}`);
        }
    }

    calculateConnectionHealth(results) {
        const scores = [];

        if (results.connectivity.status === 'pass') scores.push(25);
        if (results.ssl.status === 'pass') scores.push(25);
        if (results.ccapi.status === 'pass') scores.push(25);

        const endpointPasses = Object.values(results.endpoints).filter(e => e.status === 'pass').length;
        const endpointTotal = Object.keys(results.endpoints).length;
        scores.push((endpointPasses / endpointTotal) * 25);

        const totalScore = scores.reduce((a, b) => a + b, 0);

        if (totalScore >= 90) return 'excellent';
        if (totalScore >= 75) return 'good';
        if (totalScore >= 50) return 'fair';
        return 'poor';
    }

    generateDiscoveryRecommendations(results) {
        results.recommendations = [];

        if (results.upnp.status === 'success' && results.ipScan.status === 'success') {
            results.recommendations.push('✅ Camera discovery working perfectly via both UPnP and IP scanning');
        } else if (results.upnp.status === 'success') {
            results.recommendations.push('✅ UPnP discovery working - cameras found automatically');
            results.recommendations.push('ℹ️ IP scanning found no additional cameras');
        } else if (results.ipScan.status === 'success') {
            results.recommendations.push('⚠️ UPnP discovery failed - but IP scanning found cameras');
            results.recommendations.push('🔧 Consider checking UPnP network configuration');
        } else {
            results.recommendations.push('❌ No cameras found via any method');
            results.recommendations.push('🔧 Check camera is on same network and CCAPI enabled');
            results.recommendations.push('🔧 Verify camera is in shooting mode (not playback)');
        }
    }

    generateIntervalRecommendation(results, interval) {
        if (!results.validation.valid) {
            return `❌ ${interval}s interval is incompatible - increase to at least ${Math.ceil(results.validation.shutterSpeed * 2)}s`;
        }

        if (results.timing.status === 'pass') {
            const accuracy = results.timing.accuracy;
            if (accuracy < 1) {
                return `✅ ${interval}s interval is excellent - timing accuracy within 1%`;
            } else if (accuracy < 5) {
                return `✅ ${interval}s interval is good - timing accuracy within 5%`;
            } else {
                return `⚠️ ${interval}s interval works but has ${accuracy.toFixed(1)}% timing variance`;
            }
        }

        return `✅ ${interval}s interval is compatible with camera settings`;
    }

    findBestCamera(connections) {
        let bestCamera = null;
        let bestScore = 0;

        for (const connection of connections) {
            const health = connection.test.overall;
            let score = 0;

            switch (health) {
                case 'excellent': score = 4; break;
                case 'good': score = 3; break;
                case 'fair': score = 2; break;
                case 'poor': score = 1; break;
                default: score = 0;
            }

            if (score > bestScore) {
                bestScore = score;
                bestCamera = connection;
            }
        }

        return bestCamera;
    }

    printConnectionSummary(results, ip, port) {
        console.log(`\n📋 Connection Summary: ${ip}:${port}`);
        console.log('=' .repeat(40));
        console.log(`Overall Health: ${results.overall.toUpperCase()}`);

        if (results.camera.model) {
            console.log(`Camera: ${results.camera.model}`);
            console.log(`Mode: ${results.camera.mode}`);
            console.log(`Battery: ${results.camera.battery}%`);
        }

        console.log(`\nTest Results:`);
        console.log(`- Network: ${results.connectivity.status === 'pass' ? '✅' : '❌'}`);
        console.log(`- SSL/CCAPI: ${results.ssl.status === 'pass' ? '✅' : '❌'}`);

        if (results.endpoints.shutter) {
            console.log(`- Shutter: ${results.endpoints.shutter.status === 'pass' ? '✅' : '❌'}`);
        }
        if (results.endpoints.settings) {
            console.log(`- Settings: ${results.endpoints.settings.status === 'pass' ? '✅' : '❌'}`);
        }
        if (results.endpoints.battery) {
            console.log(`- Battery: ${results.endpoints.battery.status === 'pass' ? '✅' : '❌'}`);
        }
    }

    printIntervalSummary(results, interval) {
        console.log(`\n📋 Interval Test Summary: ${interval}s`);
        console.log('=' .repeat(40));

        if (results.validation.valid) {
            console.log(`✅ Interval is COMPATIBLE`);
            if (results.timing.status === 'pass') {
                console.log(`Timing Accuracy: ${(100 - results.timing.accuracy).toFixed(1)}%`);
                console.log(`Average Interval: ${results.timing.average}s`);
                console.log(`Precision: ±${results.timing.stdDev}s`);
            }
        } else {
            console.log(`❌ Interval is INCOMPATIBLE`);
            console.log(`Issue: ${results.validation.error}`);
        }

        console.log(`\nRecommendation: ${results.recommendation}`);
    }

    printComprehensiveReport(results) {
        console.log(`\n📊 COMPREHENSIVE TEST REPORT`);
        console.log('=' .repeat(50));

        console.log(`\nDiscovery Results:`);
        console.log(`- UPnP: ${results.discovery.upnp.found.length} devices`);
        console.log(`- IP Scan: ${results.discovery.ipScan.found.length} devices`);

        console.log(`\nConnection Tests:`);
        results.connections.forEach((conn, index) => {
            console.log(`${index + 1}. ${conn.camera.ip} - ${conn.test.overall.toUpperCase()}`);
        });

        if (results.intervalTest) {
            console.log(`\nInterval Test: ${results.intervalTest.validation.valid ? 'PASS' : 'FAIL'}`);
        }

        const duration = Math.round(results.performance.duration / 1000);
        console.log(`\nTest Duration: ${duration} seconds`);
        console.log(`Completed: ${results.performance.endTime}`);
    }
}

// CLI Interface
async function main() {
    const args = process.argv.slice(2);
    const command = args[0];

    if (!command) {
        console.log(`
Camera Testing Agent - Canon CCAPI Testing Tool

Usage: node camera-testing-agent.js <command> [options]

Commands:
  discovery                    - Test UPnP and IP scanning discovery
  connection <ip> [port]       - Test connection to specific camera
  endpoints <ip> [port]        - Test all CCAPI endpoints
  interval <ip> <interval> [port] - Test intervalometer timing
  comprehensive [--test-interval 30] - Run all tests

Examples:
  node camera-testing-agent.js discovery
  node camera-testing-agent.js connection 192.168.4.2
  node camera-testing-agent.js endpoints 192.168.4.2 443
  node camera-testing-agent.js interval 192.168.4.2 30
  node camera-testing-agent.js comprehensive --test-interval 30
        `);
        process.exit(1);
    }

    const agent = new CameraTestingAgent();

    try {
        let result;

        switch (command.toLowerCase()) {
            case 'discovery':
                result = await agent.runTest('discovery');
                break;

            case 'connection':
                if (!args[1]) {
                    console.error('Error: IP address required for connection test');
                    process.exit(1);
                }
                result = await agent.runTest('connection', {
                    ip: args[1],
                    port: args[2] || '443'
                });
                break;

            case 'endpoints':
                if (!args[1]) {
                    console.error('Error: IP address required for endpoints test');
                    process.exit(1);
                }
                result = await agent.runTest('endpoints', {
                    ip: args[1],
                    port: args[2] || '443'
                });
                break;

            case 'interval':
                if (!args[1] || !args[2]) {
                    console.error('Error: IP address and interval required for interval test');
                    process.exit(1);
                }
                result = await agent.runTest('interval', {
                    ip: args[1],
                    interval: parseFloat(args[2]),
                    port: args[3] || '443'
                });
                break;

            case 'comprehensive':
                const testIntervalIndex = args.indexOf('--test-interval');
                const testInterval = testIntervalIndex !== -1 ? parseFloat(args[testIntervalIndex + 1]) : null;

                result = await agent.runTest('comprehensive', {
                    testInterval: testInterval
                });
                break;

            default:
                console.error(`Unknown command: ${command}`);
                process.exit(1);
        }

        // Output JSON result for programmatic use
        if (process.env.OUTPUT_JSON) {
            console.log('\n' + JSON.stringify(result, null, 2));
        }

    } catch (error) {
        console.error(`\n❌ Agent Error: ${error.message}`);
        process.exit(1);
    }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}

export default CameraTestingAgent;