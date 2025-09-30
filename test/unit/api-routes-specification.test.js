/**
 * API Routes Specification-Based Tests
 *
 * These tests enforce the CORRECT API behavior according to design specifications,
 * not the current implementation. When these tests fail, we fix the CODE, not the tests.
 */

import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { createApiRouter } from '../../src/routes/api.js';
import { validateAPISchema } from '../schemas/api-schemas.js';

describe('API Routes Specification Compliance Tests', () => {
  let app;
  let mockCameraController;
  let mockServer;
  let mockNetworkStateManager;
  let mockIntervalometerStateManager;

  beforeEach(() => {
    app = express();
    app.use(express.json());

    // Mock camera controller with specification-compliant responses
    const mockControllerInstance = {
      getConnectionStatus: jest.fn(() => ({
        // Based on api-specification.md lines 19-28
        connected: true,
        ip: '192.168.4.2',
        port: '443',
        lastError: null,
        shutterEndpoint: '/ccapi/ver100/shooting/liveview/shutterbutton/manual',
        hasCapabilities: true
      })),
      getCameraSettings: jest.fn(async () => ({
        // Based on api-specification.md lines 38-43
        av: { value: '5.6', available: ['1.4', '2.8', '5.6', '8.0'] },
        tv: { value: '1/60', available: ['1/30', '1/60', '1/125'] },
        iso: { value: '100', available: ['100', '200', '400', '800'] }
      })),
      getCameraBattery: jest.fn(async () => ({
        // Based on real Canon CCAPI documentation (CameraControlAPI_Reference_v140/4.4.5)
        batterylist: [
          {
            position: 'camera',
            name: 'LP-E17',
            kind: 'battery',
            level: '85',  // Canon returns string, not number
            quality: 'good'
          }
        ]
      })),
      takePhoto: jest.fn(async () => ({ success: true }))
    };

    mockCameraController = jest.fn(() => mockControllerInstance);
    mockCameraController.instance = mockControllerInstance;

    // Mock server with proper intervalometer session
    mockServer = {
      activeIntervalometerSession: null
    };

    // Mock network state manager with specification-compliant responses
    mockNetworkStateManager = {
      getNetworkStatus: jest.fn(async () => ({
        // Based on api-specification.md lines 210-230
        interfaces: {
          wlan0: {
            active: true,          // ← REQUIRED by specification
            connected: true,
            network: 'ExternalWiFi',
            signal: 85,
            ip: '192.168.1.100'
          },
          ap0: {
            active: true,          // ← REQUIRED by specification
            network: 'Pi-Camera-Control',
            ip: '192.168.4.1'
          }
        },
        services: {
          hostapd: { active: true },    // ← REQUIRED by specification
          dnsmasq: { active: true }     // ← REQUIRED by specification
        }
      }))
    };

    // Mock intervalometer state manager
    mockIntervalometerStateManager = {
      // Not used in these tests - we test the legacy route behavior
    };

    // Create router
    const apiRouter = createApiRouter(
      mockCameraController,
      null, // powerManager
      mockServer,
      mockNetworkStateManager,
      null, // discoveryManager
      mockIntervalometerStateManager
    );

    app.use('/api', apiRouter);
  });

  describe('Camera Status Specification Compliance', () => {
    test('GET /api/camera/status returns specification-compliant response', async () => {
      const response = await request(app)
        .get('/api/camera/status')
        .expect(200);

      // Validate against specification schema
      const validation = validateAPISchema(response.body, 'cameraStatus');

      if (!validation.valid) {
        console.error('API Specification Violation:', validation.errors);
        console.error('Actual Response:', JSON.stringify(response.body, null, 2));
      }

      expect(validation.valid).toBe(true);
      expect(validation.errors).toEqual([]);

      // Verify specific specification requirements
      expect(response.body).toHaveProperty('connected');
      expect(response.body).toHaveProperty('hasCapabilities');
      expect(response.body).toHaveProperty('shutterEndpoint');
    });

    test('GET /api/camera/settings returns specification-compliant response', async () => {
      const response = await request(app)
        .get('/api/camera/settings')
        .expect(200);

      // Validate against specification schema
      const validation = validateAPISchema(response.body, 'cameraSettings');

      if (!validation.valid) {
        console.error('API Specification Violation:', validation.errors);
        console.error('Actual Response:', JSON.stringify(response.body, null, 2));
      }

      expect(validation.valid).toBe(true);

      // Verify specification format: each setting has value and available array
      expect(response.body.av).toHaveProperty('value');
      expect(response.body.av).toHaveProperty('available');
      expect(Array.isArray(response.body.av.available)).toBe(true);

      expect(response.body.tv).toHaveProperty('value');
      expect(response.body.tv).toHaveProperty('available');
      expect(Array.isArray(response.body.tv.available)).toBe(true);

      expect(response.body.iso).toHaveProperty('value');
      expect(response.body.iso).toHaveProperty('available');
      expect(Array.isArray(response.body.iso.available)).toBe(true);
    });

    test('GET /api/camera/battery returns specification-compliant response', async () => {
      const response = await request(app)
        .get('/api/camera/battery')
        .expect(200);

      // Validate against specification schema
      const validation = validateAPISchema(response.body, 'cameraBattery');

      // Always show details for debugging
      console.log('Battery API Response:', JSON.stringify(response.body, null, 2));
      console.log('Validation Result:', validation);

      if (!validation.valid) {
        console.error('API Specification Violation:', validation.errors);
        console.error('Actual Response:', JSON.stringify(response.body, null, 2));
      }

      expect(validation.valid).toBe(true);

      // Verify specification format: batterylist array with name, level, quality
      expect(response.body).toHaveProperty('batterylist');
      expect(Array.isArray(response.body.batterylist)).toBe(true);
      expect(response.body.batterylist[0]).toHaveProperty('name');
      expect(response.body.batterylist[0]).toHaveProperty('level');
      expect(response.body.batterylist[0]).toHaveProperty('quality');
    });

    test('POST /api/camera/photo returns specification-compliant response', async () => {
      const response = await request(app)
        .post('/api/camera/photo')
        .expect(200);

      // Validate against specification schema
      const validation = validateAPISchema(response.body, 'photoResponse');

      if (!validation.valid) {
        console.error('API Specification Violation:', validation.errors);
        console.error('Actual Response:', JSON.stringify(response.body, null, 2));
      }

      expect(validation.valid).toBe(true);

      // Verify specification requirements: success and timestamp
      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('timestamp');
      expect(typeof response.body.success).toBe('boolean');
      expect(typeof response.body.timestamp).toBe('string');
    });
  });

  describe('Intervalometer Status Specification Compliance', () => {
    test('GET /api/intervalometer/status returns spec-compliant response when INACTIVE', async () => {
      // Ensure no active session
      mockServer.activeIntervalometerSession = null;

      const response = await request(app)
        .get('/api/intervalometer/status')
        .expect(200);

      // Validate against specification schema for inactive state
      const validation = validateAPISchema(response.body, 'intervalometerStatus', 'inactive');

      if (!validation.valid) {
        console.error('API Specification Violation for INACTIVE intervalometer:', validation.errors);
        console.error('Actual Response:', JSON.stringify(response.body, null, 2));
        console.error('Expected Format (from specification):');
        console.error(JSON.stringify({ running: false, state: 'stopped' }, null, 2));
      }

      expect(validation.valid).toBe(true);

      // Specification requirements for inactive state
      expect(response.body.running).toBe(false);
      expect(['stopped', 'inactive']).toContain(response.body.state);

      // Specification DOES NOT include 'message' field for inactive state
      expect(response.body).not.toHaveProperty('message');
    });

    test('GET /api/intervalometer/status returns spec-compliant response when ACTIVE', async () => {
      // Mock active session with all required specification fields
      mockServer.activeIntervalometerSession = {
        getStatus: jest.fn(() => ({
          // Based on api-specification.md lines 142-157
          state: 'running',
          progress: {
            shots: 25,
            total: 100
          },
          stats: {
            startTime: '2024-01-01T20:00:00.000Z',
            shotsTaken: 25,
            shotsSuccessful: 24,
            shotsFailed: 1,
            currentShot: 26,
            nextShotTime: '2024-01-01T20:12:30.000Z'
          },
          options: {
            interval: 30,
            totalShots: 100
          }
        }))
      };

      const response = await request(app)
        .get('/api/intervalometer/status')
        .expect(200);

      // Validate against specification schema for active state
      const validation = validateAPISchema(response.body, 'intervalometerStatus', 'active');

      if (!validation.valid) {
        console.error('API Specification Violation for ACTIVE intervalometer:', validation.errors);
        console.error('Actual Response:', JSON.stringify(response.body, null, 2));
        console.error('Expected Format (from specification):');
        console.error(JSON.stringify({
          running: true,
          state: 'running',
          stats: { /* required fields */ },
          options: { /* required fields */ }
        }, null, 2));
      }

      expect(validation.valid).toBe(true);

      // Specification requirements for active state
      expect(response.body.running).toBe(true);
      expect(response.body.state).toBe('running');
      expect(response.body).toHaveProperty('stats');
      expect(response.body).toHaveProperty('options');

      // Required stats fields per specification
      expect(response.body.stats).toHaveProperty('startTime');
      expect(response.body.stats).toHaveProperty('shotsTaken');
      expect(response.body.stats).toHaveProperty('shotsSuccessful');
      expect(response.body.stats).toHaveProperty('shotsFailed');
      expect(response.body.stats).toHaveProperty('currentShot');

      // Required options fields per specification
      expect(response.body.options).toHaveProperty('interval');
    });
  });

  describe('Network Status Specification Compliance', () => {
    test('GET /api/network/status returns specification-compliant response', async () => {
      const response = await request(app)
        .get('/api/network/status')
        .expect(200);

      // Validate against specification schema
      const validation = validateAPISchema(response.body, 'networkStatus');

      if (!validation.valid) {
        console.error('API Specification Violation:', validation.errors);
        console.error('Actual Response:', JSON.stringify(response.body, null, 2));
        console.error('Expected Format (from specification):');
        console.error(JSON.stringify({
          interfaces: {
            wlan0: { active: true, /* other fields */ },
            ap0: { active: true, /* other fields */ }
          },
          services: {
            hostapd: { active: true },
            dnsmasq: { active: true }
          }
        }, null, 2));
      }

      expect(validation.valid).toBe(true);

      // Specification requirements
      expect(response.body).toHaveProperty('interfaces');
      expect(response.body).toHaveProperty('services');

      // All interfaces must have 'active' field per specification
      for (const [interfaceName, interfaceData] of Object.entries(response.body.interfaces)) {
        expect(interfaceData).toHaveProperty('active');
        expect(typeof interfaceData.active).toBe('boolean');
      }

      // Service status must have 'active' field per specification
      if (response.body.services) {
        expect(response.body.services.hostapd).toHaveProperty('active');
        expect(response.body.services.dnsmasq).toHaveProperty('active');
      }
    });
  });

  describe('Error Response Specification Compliance', () => {
    test('Camera not available returns consistent error format', async () => {
      mockCameraController.mockReturnValue(null);

      const response = await request(app)
        .get('/api/camera/status')
        .expect(200);

      // Even error cases should follow specification patterns
      expect(response.body).toHaveProperty('connected');
      expect(response.body.connected).toBe(false);

      // Should still include other specification fields, even if null/default
      expect(response.body).toHaveProperty('ip');
      expect(response.body).toHaveProperty('port');
    });

    test('Service unavailable returns specification-compliant error', async () => {
      mockNetworkStateManager.getNetworkStatus.mockRejectedValue(new Error('Network service unavailable'));

      const response = await request(app)
        .get('/api/network/status')
        .expect(500);

      // Error responses should use standardized format
      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('timestamp');
      expect(typeof response.body.error).toBe('object');
      expect(response.body.error).toHaveProperty('message');
    });
  });
});