/**
 * Time Synchronization Service Tests
 *
 * Tests for automatic time synchronization between client, Pi, and camera
 */

import { jest } from '@jest/globals';
import TimeSyncService from '../../src/timesync/service.js';

// Mock child_process spawn
jest.mock('child_process', () => ({
  spawn: jest.fn()
}));

// Mock logger
jest.mock('../../src/utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

describe('TimeSyncService', () => {
  let timeSyncService;
  let mockWsManager;
  let mockCameraController;
  let mockWs;

  beforeEach(() => {
    // Create new instance for each test
    jest.isolateModules(() => {
      timeSyncService = new TimeSyncService();
    });

    // Mock WebSocket manager
    mockWsManager = {
      broadcast: jest.fn()
    };

    // Mock camera controller
    mockCameraController = {
      isConnected: jest.fn().mockReturnValue(false),
      getCameraDateTime: jest.fn(),
      setCameraDateTime: jest.fn()
    };

    // Mock WebSocket connection
    mockWs = {
      send: jest.fn()
    };

    // Initialize service with mocks
    timeSyncService.initialize(mockWsManager, mockCameraController);
  });

  afterEach(() => {
    jest.clearAllMocks();
    if (timeSyncService) {
      timeSyncService.cleanup();
    }
  });

  describe('Client Connection Handling', () => {
    test('should request time sync from AP client on connection', async () => {
      await timeSyncService.handleClientConnection('192.168.4.2', 'ap0', mockWs);

      // Should send time-sync-request to client
      expect(mockWs.send).toHaveBeenCalled();
      const sentMessage = JSON.parse(mockWs.send.mock.calls[0][0]);
      expect(sentMessage.type).toBe('time-sync-request');
      expect(sentMessage.requestId).toBeDefined();
    });

    test('should not request time sync from non-AP client', async () => {
      await timeSyncService.handleClientConnection('192.168.1.100', 'wlan0', mockWs);

      // Should not send time-sync-request
      expect(mockWs.send).not.toHaveBeenCalled();
    });
  });

  describe('Time Sync Response Handling', () => {
    test('should sync Pi time when drift exceeds threshold', async () => {
      const { spawn } = require('child_process');
      const mockProcess = {
        on: jest.fn(),
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() }
      };
      spawn.mockReturnValue(mockProcess);

      // Register client
      await timeSyncService.handleClientConnection('192.168.4.2', 'ap0', mockWs);

      // Mock current time (Pi time)
      const piTime = new Date('2024-01-01T12:00:00Z');
      jest.spyOn(global, 'Date').mockImplementation(() => piTime);

      // Client time is 2 seconds ahead
      const clientTime = new Date('2024-01-01T12:00:02Z');

      // Handle time sync response
      await timeSyncService.handleClientTimeResponse(
        '192.168.4.2',
        clientTime.toISOString(),
        'America/Los_Angeles'
      );

      // Should attempt to sync system time
      expect(spawn).toHaveBeenCalledWith(
        'sudo',
        expect.arrayContaining(['date', '-u', '-s']),
        expect.any(Object)
      );

      // Simulate successful sync
      const onCloseCallback = mockProcess.on.mock.calls.find(
        call => call[0] === 'close'
      )[1];
      await onCloseCallback(0);

      // Should broadcast sync status
      expect(mockWsManager.broadcast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'time-sync-status'
        })
      );
    });

    test('should not sync when drift is within threshold', async () => {
      const { spawn } = require('child_process');

      // Register client
      await timeSyncService.handleClientConnection('192.168.4.2', 'ap0', mockWs);

      // Mock current time
      const piTime = new Date('2024-01-01T12:00:00Z');
      jest.spyOn(global, 'Date').mockImplementation(() => piTime);

      // Client time is only 500ms ahead (below 1000ms threshold)
      const clientTime = new Date('2024-01-01T12:00:00.500Z');

      await timeSyncService.handleClientTimeResponse(
        '192.168.4.2',
        clientTime.toISOString(),
        'America/Los_Angeles'
      );

      // Should not attempt to sync
      expect(spawn).not.toHaveBeenCalled();
    });
  });

  describe('Camera Synchronization', () => {
    test('should sync camera time when camera connects and Pi time is reliable', async () => {
      // Set Pi as synchronized
      const clientTime = new Date();
      await timeSyncService.handleClientTimeResponse('192.168.4.2', clientTime.toISOString());

      // Mock camera as connected
      mockCameraController.isConnected.mockReturnValue(true);

      // Mock camera time with 3 second drift
      const cameraTime = new Date(Date.now() + 3000);
      mockCameraController.getCameraDateTime.mockResolvedValue(cameraTime.toISOString());
      mockCameraController.setCameraDateTime.mockResolvedValue(true);

      // Trigger camera connection
      await timeSyncService.handleCameraConnection();

      // Should get current camera time
      expect(mockCameraController.getCameraDateTime).toHaveBeenCalled();

      // Should set camera time to match Pi
      expect(mockCameraController.setCameraDateTime).toHaveBeenCalledWith(
        expect.any(Date)
      );

      // Should broadcast sync status
      expect(mockWsManager.broadcast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'time-sync-status'
        })
      );
    });

    test('should not sync camera when Pi time is not reliable', async () => {
      // Pi is not synchronized (no client sync has occurred)
      mockCameraController.isConnected.mockReturnValue(true);

      await timeSyncService.handleCameraConnection();

      // Should not attempt to get or set camera time
      expect(mockCameraController.getCameraDateTime).not.toHaveBeenCalled();
      expect(mockCameraController.setCameraDateTime).not.toHaveBeenCalled();
    });

    test('should not sync camera when drift is within threshold', async () => {
      // Set Pi as synchronized
      const clientTime = new Date();
      await timeSyncService.handleClientTimeResponse('192.168.4.2', clientTime.toISOString());

      mockCameraController.isConnected.mockReturnValue(true);

      // Mock camera time with only 500ms drift
      const cameraTime = new Date(Date.now() + 500);
      mockCameraController.getCameraDateTime.mockResolvedValue(cameraTime.toISOString());

      await timeSyncService.handleCameraConnection();

      // Should get camera time
      expect(mockCameraController.getCameraDateTime).toHaveBeenCalled();

      // Should not set camera time (drift within threshold)
      expect(mockCameraController.setCameraDateTime).not.toHaveBeenCalled();
    });
  });

  describe('Status Reporting', () => {
    test('should provide comprehensive sync status', () => {
      const status = timeSyncService.getStatus();

      expect(status).toHaveProperty('pi');
      expect(status.pi).toHaveProperty('isSynchronized');
      expect(status.pi).toHaveProperty('lastSyncTime');
      expect(status.pi).toHaveProperty('syncSource');
      expect(status.pi).toHaveProperty('reliability');

      expect(status).toHaveProperty('camera');
      expect(status.camera).toHaveProperty('isSynchronized');
      expect(status.camera).toHaveProperty('lastSyncTime');
      expect(status.camera).toHaveProperty('lastDrift');
    });

    test('should track reliability levels correctly', async () => {
      // Initial state - no sync
      let status = timeSyncService.getStatus();
      expect(status.pi.reliability).toBe('none');

      // After sync - should be high
      const clientTime = new Date();
      await timeSyncService.handleClientTimeResponse('192.168.4.2', clientTime.toISOString());

      status = timeSyncService.getStatus();
      expect(status.pi.reliability).toBe('high');
    });
  });

  describe('WebSocket Messages', () => {
    test('should send properly formatted time-sync-request', async () => {
      await timeSyncService.handleClientConnection('192.168.4.2', 'ap0', mockWs);

      const sentMessage = JSON.parse(mockWs.send.mock.calls[0][0]);

      // Verify message structure matches specification
      expect(sentMessage).toMatchObject({
        type: 'time-sync-request',
        requestId: expect.any(Number)
      });

      // Should NOT include serverTime in initial request
      expect(sentMessage.serverTime).toBeUndefined();
    });

    test('should broadcast time-sync-status updates', async () => {
      const clientTime = new Date();
      await timeSyncService.handleClientTimeResponse('192.168.4.2', clientTime.toISOString());

      expect(mockWsManager.broadcast).toHaveBeenCalledWith({
        type: 'time-sync-status',
        data: expect.objectContaining({
          pi: expect.objectContaining({
            isSynchronized: expect.any(Boolean),
            reliability: expect.any(String)
          }),
          camera: expect.objectContaining({
            isSynchronized: expect.any(Boolean)
          })
        })
      });
    });

    test('should send activity log messages', async () => {
      await timeSyncService.handleClientConnection('192.168.4.2', 'ap0', mockWs);

      expect(mockWsManager.broadcast).toHaveBeenCalledWith({
        type: 'activity_log',
        data: expect.objectContaining({
          message: expect.any(String),
          type: expect.any(String),
          timestamp: expect.any(String)
        })
      });
    });
  });

  describe('Scheduled Synchronization', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test('should perform periodic sync checks', async () => {
      // Register an AP client
      await timeSyncService.handleClientConnection('192.168.4.2', 'ap0', mockWs);

      // Clear previous calls
      mockWs.send.mockClear();

      // Advance time by 15 minutes (sync interval)
      jest.advanceTimersByTime(15 * 60 * 1000);

      // Should request another sync
      expect(mockWs.send).toHaveBeenCalled();
      const sentMessage = JSON.parse(mockWs.send.mock.calls[0][0]);
      expect(sentMessage.type).toBe('time-sync-request');
    });
  });
});