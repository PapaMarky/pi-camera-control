/**
 * API Routes Unit Tests
 *
 * Tests all REST API endpoints without requiring camera hardware.
 * Comprehensive coverage of camera, intervalometer, network, and system routes.
 */

import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { createApiRouter } from '../../src/routes/api.js';

describe('API Routes Unit Tests', () => {
  let app;
  let mockCameraController;
  let mockPowerManager;
  let mockServer;
  let mockNetworkStateManager;
  let mockDiscoveryManager;
  let mockIntervalometerStateManager;

  beforeEach(() => {
    // Create Express app with router
    app = express();
    app.use(express.json());

    // Mock camera controller
    const mockControllerInstance = {
      getConnectionStatus: jest.fn(() => ({
        connected: true,
        ip: '192.168.4.2',
        port: '443',
        model: 'EOS R50'
      })),
      getCameraSettings: jest.fn(async () => ({
        iso: 100,
        shutterSpeed: '1/60',
        aperture: 'f/2.8',
        imageQuality: 'RAW+JPEG'
      })),
      getCameraBattery: jest.fn(async () => ({
        level: 85,
        status: 'good'
      })),
      takePhoto: jest.fn(async () => ({ success: true })),
      manualReconnect: jest.fn(async () => true),
      updateConfiguration: jest.fn(async () => true),
      validateInterval: jest.fn(async (interval) => ({
        valid: interval >= 5,
        error: interval < 5 ? 'Interval too short' : null,
        recommendedMin: 5
      })),
      capabilities: {
        shutter: true,
        iso: true,
        aperture: true
      }
    };

    mockCameraController = jest.fn(() => mockControllerInstance);
    mockCameraController.instance = mockControllerInstance;

    // Mock power manager
    mockPowerManager = {
      getStatus: jest.fn(() => ({
        isRaspberryPi: true,
        uptime: 3600,
        thermal: { temperature: 45.2 }
      }))
    };

    // Mock server
    mockServer = {
      activeIntervalometerSession: null
    };

    // Mock network state manager
    mockNetworkStateManager = {
      getNetworkStatus: jest.fn(async () => ({
        interfaces: {
          wlan0: {
            connected: true,
            network: 'TestNetwork',
            ip: '192.168.1.100'
          }
        }
      })),
      scanWiFiNetworks: jest.fn(async () => [
        { ssid: 'Network1', signal: 85, security: 'WPA2' },
        { ssid: 'Network2', signal: 72, security: 'WPA3' }
      ]),
      getSavedConnections: jest.fn(async () => [
        { name: 'SavedNetwork1', uuid: 'uuid-1' },
        { name: 'SavedNetwork2', uuid: 'uuid-2' }
      ]),
      connectToWiFi: jest.fn(async () => ({ success: true })),
      disconnectWiFi: jest.fn(async () => ({ success: true })),
      configureAccessPoint: jest.fn(async () => ({ success: true })),
      setWiFiCountry: jest.fn(async () => ({ success: true })),
      getWiFiCountry: jest.fn(async () => ({ country: 'US' })),
      getAvailableCountries: jest.fn(async () => ['US', 'GB', 'JP', 'DE']),
      enableWiFi: jest.fn(async () => ({ success: true })),
      disableWiFi: jest.fn(async () => ({ success: true })),
      isWiFiEnabled: jest.fn(async () => ({ enabled: true }))
    };

    // Mock discovery manager
    mockDiscoveryManager = {
      getStatus: jest.fn(() => ({
        isDiscovering: true,
        cameras: 1
      })),
      getCameras: jest.fn(() => [
        { uuid: 'cam-1', ip: '192.168.4.2', model: 'EOS R50' }
      ]),
      scanForCameras: jest.fn(async () => ({ started: true })),
      setPrimaryCamera: jest.fn(async () => ({ success: true })),
      connectToCamera: jest.fn(async () => ({ success: true })),
      getCamera: jest.fn(() => ({
        uuid: 'cam-1',
        ip: '192.168.4.2',
        model: 'EOS R50'
      })),
      getLastKnownIP: jest.fn(() => ({ ip: '192.168.4.2' })),
      clearConnectionHistory: jest.fn(async () => ({ success: true }))
    };

    // Mock intervalometer state manager
    mockIntervalometerStateManager = {
      createSession: jest.fn(async () => ({
        id: 'session-123',
        start: jest.fn(async () => {}),
        getStatus: jest.fn(() => ({
          state: 'running',
          progress: { shots: 10, total: 100 }
        }))
      })),
      getReports: jest.fn(async () => [
        { id: 'report-1', title: 'Test Report 1' },
        { id: 'report-2', title: 'Test Report 2' }
      ]),
      getReport: jest.fn(async (id) =>
        id === 'report-1' ? { id: 'report-1', title: 'Test Report 1' } : null
      ),
      updateReportTitle: jest.fn(async (id, title) => ({
        id,
        title,
        updated: new Date().toISOString()
      })),
      deleteReport: jest.fn(async () => true),
      saveSessionReport: jest.fn(async () => ({
        id: 'new-report',
        title: 'Saved Session'
      })),
      discardSession: jest.fn(async () => true),
      getState: jest.fn(() => ({
        hasUnsavedSession: false,
        currentSessionId: null
      }))
    };

    // Create router and mount it
    const apiRouter = createApiRouter(
      mockCameraController,
      mockPowerManager,
      mockServer,
      mockNetworkStateManager,
      mockDiscoveryManager,
      mockIntervalometerStateManager
    );

    app.use('/api', apiRouter);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Camera Routes', () => {
    describe('GET /api/camera/status', () => {
      test('returns camera status when connected', async () => {
        const response = await request(app)
          .get('/api/camera/status')
          .expect(200);

        expect(response.body).toEqual({
          connected: true,
          ip: '192.168.4.2',
          port: '443',
          model: 'EOS R50'
        });

        expect(mockCameraController).toHaveBeenCalled();
        expect(mockCameraController.instance.getConnectionStatus).toHaveBeenCalled();
      });

      test('returns not connected when no camera available', async () => {
        mockCameraController.mockReturnValue(null);

        const response = await request(app)
          .get('/api/camera/status')
          .expect(200);

        expect(response.body).toEqual({
          connected: false,
          error: 'No camera available'
        });
      });

      test('handles camera status error', async () => {
        mockCameraController.instance.getConnectionStatus.mockImplementation(() => {
          throw new Error('Connection failed');
        });

        const response = await request(app)
          .get('/api/camera/status')
          .expect(500);

        expect(response.body).toEqual({
          error: 'Failed to get camera status'
        });
      });
    });

    describe('GET /api/camera/settings', () => {
      test('returns camera settings', async () => {
        const response = await request(app)
          .get('/api/camera/settings')
          .expect(200);

        expect(response.body).toEqual({
          iso: 100,
          shutterSpeed: '1/60',
          aperture: 'f/2.8',
          imageQuality: 'RAW+JPEG'
        });

        expect(mockCameraController.instance.getCameraSettings).toHaveBeenCalled();
      });

      test('returns 503 when no camera available', async () => {
        mockCameraController.mockReturnValue(null);

        const response = await request(app)
          .get('/api/camera/settings')
          .expect(503);

        expect(response.body).toEqual({
          error: 'No camera available'
        });
      });

      test('handles camera settings error', async () => {
        mockCameraController.instance.getCameraSettings.mockRejectedValue(
          new Error('Camera communication failed')
        );

        const response = await request(app)
          .get('/api/camera/settings')
          .expect(500);

        expect(response.body).toEqual({
          error: 'Camera communication failed'
        });
      });
    });

    describe('GET /api/camera/battery', () => {
      test('returns camera battery status', async () => {
        const response = await request(app)
          .get('/api/camera/battery')
          .expect(200);

        expect(response.body).toEqual({
          level: 85,
          status: 'good'
        });

        expect(mockCameraController.instance.getCameraBattery).toHaveBeenCalled();
      });

      test('returns 503 when no camera available', async () => {
        mockCameraController.mockReturnValue(null);

        const response = await request(app)
          .get('/api/camera/battery')
          .expect(503);

        expect(response.body).toEqual({
          error: 'No camera available'
        });
      });
    });

    describe('POST /api/camera/photo', () => {
      test('takes a photo successfully', async () => {
        const response = await request(app)
          .post('/api/camera/photo')
          .expect(200);

        expect(response.body).toMatchObject({
          success: true,
          timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
        });

        expect(mockCameraController.instance.takePhoto).toHaveBeenCalled();
      });

      test('handles photo capture error', async () => {
        mockCameraController.instance.takePhoto.mockRejectedValue(
          new Error('Shutter stuck')
        );

        const response = await request(app)
          .post('/api/camera/photo')
          .expect(500);

        expect(response.body).toEqual({
          error: 'Shutter stuck'
        });
      });
    });

    describe('POST /api/camera/configure', () => {
      test('configures camera IP and port', async () => {
        const response = await request(app)
          .post('/api/camera/configure')
          .send({ ip: '192.168.1.200', port: '8080' })
          .expect(200);

        expect(response.body).toEqual({
          success: true,
          message: 'Camera configuration updated successfully',
          configuration: { ip: '192.168.1.200', port: '8080' }
        });

        expect(mockCameraController.instance.updateConfiguration).toHaveBeenCalledWith(
          '192.168.1.200',
          '8080'
        );
      });

      test('validates IP address format', async () => {
        const response = await request(app)
          .post('/api/camera/configure')
          .send({ ip: 'invalid-ip' })
          .expect(400);

        expect(response.body).toEqual({
          success: false,
          error: 'Invalid IP address format'
        });
      });

      test('validates port range', async () => {
        const response = await request(app)
          .post('/api/camera/configure')
          .send({ ip: '192.168.1.200', port: '99999' })
          .expect(400);

        expect(response.body).toEqual({
          success: false,
          error: 'Port must be between 1 and 65535'
        });
      });

      test('requires IP address', async () => {
        const response = await request(app)
          .post('/api/camera/configure')
          .send({ port: '8080' })
          .expect(400);

        expect(response.body).toEqual({
          success: false,
          error: 'IP address is required'
        });
      });
    });

    describe('POST /api/camera/validate-interval', () => {
      test('validates interval successfully', async () => {
        const response = await request(app)
          .post('/api/camera/validate-interval')
          .send({ interval: 30 })
          .expect(200);

        expect(response.body).toEqual({
          valid: true,
          error: null,
          recommendedMin: 5
        });

        expect(mockCameraController.instance.validateInterval).toHaveBeenCalledWith(30);
      });

      test('handles invalid interval', async () => {
        const response = await request(app)
          .post('/api/camera/validate-interval')
          .send({ interval: 2 })
          .expect(200);

        expect(response.body).toEqual({
          valid: false,
          error: 'Interval too short',
          recommendedMin: 5
        });
      });

      test('validates interval parameter', async () => {
        const response = await request(app)
          .post('/api/camera/validate-interval')
          .send({})
          .expect(400);

        expect(response.body).toEqual({
          error: 'Invalid interval value'
        });
      });
    });
  });

  describe('Intervalometer Routes', () => {
    describe('POST /api/intervalometer/start', () => {
      test('starts intervalometer session', async () => {
        const mockSession = {
          id: 'session-123',
          start: jest.fn(async () => {}),
          getStatus: jest.fn(() => ({
            state: 'running',
            progress: { shots: 0, total: 100 }
          }))
        };

        mockIntervalometerStateManager.createSession.mockResolvedValue(mockSession);

        const response = await request(app)
          .post('/api/intervalometer/start')
          .send({ interval: 30, shots: 100 })
          .expect(200);

        expect(response.body).toMatchObject({
          success: true,
          message: 'Intervalometer started successfully'
        });

        expect(mockIntervalometerStateManager.createSession).toHaveBeenCalled();
        expect(mockSession.start).toHaveBeenCalled();
      });

      test('prevents starting when session already running', async () => {
        mockServer.activeIntervalometerSession = { state: 'running' };

        const response = await request(app)
          .post('/api/intervalometer/start')
          .send({ interval: 30, shots: 100 })
          .expect(400);

        expect(response.body).toEqual({
          error: 'Intervalometer is already running'
        });
      });

      test('validates interval parameter', async () => {
        const response = await request(app)
          .post('/api/intervalometer/start')
          .send({ shots: 100 })
          .expect(400);

        expect(response.body).toEqual({
          error: 'Invalid interval value'
        });
      });
    });

    describe('GET /api/intervalometer/status', () => {
      test('returns status when session active', async () => {
        mockServer.activeIntervalometerSession = {
          getStatus: jest.fn(() => ({
            state: 'running',
            progress: { shots: 25, total: 100 },
            stats: { successful: 25, failed: 0 }
          }))
        };

        const response = await request(app)
          .get('/api/intervalometer/status')
          .expect(200);

        expect(response.body).toMatchObject({
          active: true,
          state: 'running',
          progress: { shots: 25, total: 100 }
        });
      });

      test('returns inactive status when no session', async () => {
        mockServer.activeIntervalometerSession = null;

        const response = await request(app)
          .get('/api/intervalometer/status')
          .expect(200);

        expect(response.body).toEqual({
          active: false,
          message: 'No intervalometer session is running'
        });
      });
    });
  });

  describe('Timelapse Report Routes', () => {
    describe('GET /api/timelapse/reports', () => {
      test('returns all timelapse reports', async () => {
        const response = await request(app)
          .get('/api/timelapse/reports')
          .expect(200);

        expect(response.body).toEqual({
          reports: [
            { id: 'report-1', title: 'Test Report 1' },
            { id: 'report-2', title: 'Test Report 2' }
          ]
        });

        expect(mockIntervalometerStateManager.getReports).toHaveBeenCalled();
      });

      test('handles reports error', async () => {
        mockIntervalometerStateManager.getReports.mockRejectedValue(
          new Error('Database error')
        );

        const response = await request(app)
          .get('/api/timelapse/reports')
          .expect(500);

        expect(response.body).toEqual({
          error: 'Database error'
        });
      });
    });

    describe('GET /api/timelapse/reports/:id', () => {
      test('returns specific report', async () => {
        const response = await request(app)
          .get('/api/timelapse/reports/report-1')
          .expect(200);

        expect(response.body).toEqual({
          report: { id: 'report-1', title: 'Test Report 1' }
        });

        expect(mockIntervalometerStateManager.getReport).toHaveBeenCalledWith('report-1');
      });

      test('returns 404 for non-existent report', async () => {
        const response = await request(app)
          .get('/api/timelapse/reports/nonexistent')
          .expect(404);

        expect(response.body).toEqual({
          error: 'Report not found'
        });
      });
    });

    describe('PUT /api/timelapse/reports/:id/title', () => {
      test('updates report title', async () => {
        const response = await request(app)
          .put('/api/timelapse/reports/report-1/title')
          .send({ title: 'Updated Title' })
          .expect(200);

        expect(response.body).toMatchObject({
          success: true,
          report: {
            id: 'report-1',
            title: 'Updated Title'
          }
        });

        expect(mockIntervalometerStateManager.updateReportTitle).toHaveBeenCalledWith(
          'report-1',
          'Updated Title'
        );
      });

      test('validates title parameter', async () => {
        const response = await request(app)
          .put('/api/timelapse/reports/report-1/title')
          .send({})
          .expect(400);

        expect(response.body).toEqual({
          error: 'Title is required'
        });
      });
    });
  });

  describe('Network Routes', () => {
    describe('GET /api/network/status', () => {
      test('returns network status', async () => {
        const response = await request(app)
          .get('/api/network/status')
          .expect(200);

        expect(response.body).toEqual({
          interfaces: {
            wlan0: {
              connected: true,
              network: 'TestNetwork',
              ip: '192.168.1.100'
            }
          }
        });

        expect(mockNetworkStateManager.getNetworkStatus).toHaveBeenCalled();
      });

      test('handles network status error', async () => {
        mockNetworkStateManager.getNetworkStatus.mockRejectedValue(
          new Error('Network error')
        );

        const response = await request(app)
          .get('/api/network/status')
          .expect(500);

        expect(response.body).toEqual({
          error: 'Network error'
        });
      });
    });

    describe('GET /api/network/wifi/scan', () => {
      test('scans for WiFi networks', async () => {
        const response = await request(app)
          .get('/api/network/wifi/scan')
          .expect(200);

        expect(response.body).toEqual({
          networks: [
            { ssid: 'Network1', signal: 85, security: 'WPA2' },
            { ssid: 'Network2', signal: 72, security: 'WPA3' }
          ]
        });

        expect(mockNetworkStateManager.scanWiFiNetworks).toHaveBeenCalled();
      });
    });

    describe('POST /api/network/wifi/connect', () => {
      test('connects to WiFi network', async () => {
        const response = await request(app)
          .post('/api/network/wifi/connect')
          .send({ ssid: 'TestNetwork', password: 'password123' })
          .expect(200);

        expect(response.body).toEqual({
          success: true
        });

        expect(mockNetworkStateManager.connectToWiFi).toHaveBeenCalledWith(
          'TestNetwork',
          'password123'
        );
      });

      test('validates SSID parameter', async () => {
        const response = await request(app)
          .post('/api/network/wifi/connect')
          .send({ password: 'password123' })
          .expect(400);

        expect(response.body).toEqual({
          error: 'SSID is required'
        });
      });
    });
  });

  describe('System Routes', () => {
    describe('GET /api/system/power', () => {
      test('returns power status', async () => {
        const response = await request(app)
          .get('/api/system/power')
          .expect(200);

        expect(response.body).toEqual({
          isRaspberryPi: true,
          uptime: 3600,
          thermal: { temperature: 45.2 }
        });

        expect(mockPowerManager.getStatus).toHaveBeenCalled();
      });

      test('handles power status error', async () => {
        mockPowerManager.getStatus.mockImplementation(() => {
          throw new Error('Power monitoring failed');
        });

        const response = await request(app)
          .get('/api/system/power')
          .expect(500);

        expect(response.body).toEqual({
          error: 'Failed to get power status'
        });
      });
    });

    describe('GET /api/system/status', () => {
      test('returns system status', async () => {
        const response = await request(app)
          .get('/api/system/status')
          .expect(200);

        expect(response.body).toMatchObject({
          timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/),
          camera: {
            connected: true,
            model: 'EOS R50'
          },
          power: {
            isRaspberryPi: true,
            uptime: 3600
          },
          network: {
            interfaces: {
              wlan0: {
                connected: true,
                network: 'TestNetwork'
              }
            }
          }
        });
      });
    });
  });

  describe('Discovery Routes', () => {
    describe('GET /api/discovery/status', () => {
      test('returns discovery status', async () => {
        const response = await request(app)
          .get('/api/discovery/status')
          .expect(200);

        expect(response.body).toEqual({
          isDiscovering: true,
          cameras: 1
        });

        expect(mockDiscoveryManager.getStatus).toHaveBeenCalled();
      });
    });

    describe('GET /api/discovery/cameras', () => {
      test('returns discovered cameras', async () => {
        const response = await request(app)
          .get('/api/discovery/cameras')
          .expect(200);

        expect(response.body).toEqual({
          cameras: [
            { uuid: 'cam-1', ip: '192.168.4.2', model: 'EOS R50' }
          ]
        });

        expect(mockDiscoveryManager.getCameras).toHaveBeenCalled();
      });
    });
  });
});