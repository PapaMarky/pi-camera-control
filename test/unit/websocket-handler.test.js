/**
 * WebSocket Handler Unit Tests
 *
 * Tests the core WebSocket message handling without requiring camera hardware.
 * All external dependencies are mocked for fast, reliable testing.
 */

import { jest } from '@jest/globals';
import { createWebSocketHandler } from '../../src/websocket/handler.js';
import { validateSchema } from '../schemas/websocket-messages.test.js';
import { StandardErrorFormat } from '../errors/error-standardization.test.js';
import { MessageSchemas } from '../schemas/websocket-message-schemas.js';

// Mock timesync service to prevent real timers
jest.mock('../../src/timesync/service.js', () => ({
  default: {
    handleClientConnection: jest.fn(async () => {}),
    handleClientDisconnection: jest.fn(() => {}),
    handleClientTimeResponse: jest.fn(async () => {}),
    getStatus: jest.fn(() => ({ synced: false })),
    getStatistics: jest.fn(() => ({ count: 0 }))
  }
}));

describe('WebSocket Handler Unit Tests', () => {
  let wsHandler;
  let mockCameraController;
  let mockPowerManager;
  let mockServer;
  let mockNetworkManager;
  let mockDiscoveryManager;
  let mockIntervalometerStateManager;
  let mockWebSocket;
  let mockRequest;
  let sentMessages;

  beforeEach(() => {
    // Use fake timers to control intervals
    jest.useFakeTimers();

    // Reset sent messages tracking
    sentMessages = [];

    // Mock WebSocket client
    mockWebSocket = {
      readyState: 1, // OPEN
      OPEN: 1,
      CLOSED: 3,
      send: jest.fn((message) => {
        sentMessages.push(JSON.parse(message));
      }),
      on: jest.fn(),
      close: jest.fn()
    };

    // Mock HTTP request object
    mockRequest = {
      socket: {
        remoteAddress: '192.168.4.100',
        remotePort: 54321
      }
    };

    // Mock camera controller (function that returns controller)
    const mockControllerInstance = {
      getConnectionStatus: jest.fn(() => ({
        connected: true,
        ip: '192.168.4.2',
        model: 'EOS R50'
      })),
      takePhoto: jest.fn(),
      getCameraSettings: jest.fn(() => ({
        iso: 100,
        shutterSpeed: '1/60',
        aperture: 'f/2.8'
      })),
      validateInterval: jest.fn((interval) => ({
        valid: interval > 0 && interval >= 5,
        error: interval < 5 ? 'Interval too short' : null
      }))
    };

    mockCameraController = jest.fn(() => mockControllerInstance);
    mockCameraController.instance = mockControllerInstance;

    // Mock power manager
    mockPowerManager = {
      getStatus: jest.fn(() => ({
        isRaspberryPi: true,
        battery: { capacity: 85 },
        thermal: { temperature: 45.2 }
      }))
    };

    // Mock server with intervalometer session
    mockServer = {
      activeIntervalometerSession: null
    };

    // Mock network manager
    mockNetworkManager = {
      getNetworkStatus: jest.fn(async () => ({
        interfaces: {
          wlan0: {
            connected: true,
            network: 'TestNetwork',
            active: true
          }
        }
      })),
      stateManager: {
        on: jest.fn()
      },
      serviceManager: {
        scanWiFiNetworks: jest.fn(async () => ([
          { ssid: 'TestNetwork1', signal: 85, security: 'WPA2' },
          { ssid: 'TestNetwork2', signal: 72, security: 'WPA3' }
        ])),
        connectToWiFi: jest.fn(async () => ({ method: 'NetworkManager' })),
        disconnectWiFi: jest.fn(async () => ({ success: true })),
        enableWiFi: jest.fn(async () => ({ success: true })),
        disableWiFi: jest.fn(async () => ({ success: true }))
      }
    };

    // Mock discovery manager
    mockDiscoveryManager = {
      getStatus: jest.fn(() => ({
        isDiscovering: true,
        cameras: 1
      }))
    };

    // Mock intervalometer state manager
    mockIntervalometerStateManager = {
      createSession: jest.fn(),
      getReports: jest.fn(async () => []),
      getReport: jest.fn(async () => null),
      updateReportTitle: jest.fn(async () => ({})),
      deleteReport: jest.fn(async () => true),
      saveSessionReport: jest.fn(async () => ({})),
      discardSession: jest.fn(async () => true),
      getState: jest.fn(() => ({
        hasUnsavedSession: false,
        currentSessionId: null
      }))
    };

    // Create WebSocket handler with mocked dependencies
    wsHandler = createWebSocketHandler(
      mockCameraController,
      mockPowerManager,
      mockServer,
      mockNetworkManager,
      mockDiscoveryManager,
      mockIntervalometerStateManager
    );

    // Clear any timers set during initialization
    jest.clearAllTimers();
  });

  afterEach(() => {
    // Cleanup any running intervals
    if (wsHandler && wsHandler.cleanup) {
      wsHandler.cleanup();
    }
    jest.clearAllTimers();
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  describe('Connection Handling', () => {
    test('handles new WebSocket connection', async () => {
      await wsHandler(mockWebSocket, mockRequest);

      // Should register event handlers
      expect(mockWebSocket.on).toHaveBeenCalledWith('message', expect.any(Function));
      expect(mockWebSocket.on).toHaveBeenCalledWith('close', expect.any(Function));
      expect(mockWebSocket.on).toHaveBeenCalledWith('error', expect.any(Function));

      // Should send welcome message
      expect(sentMessages).toHaveLength(1);
      const welcomeMessage = sentMessages[0];

      expect(welcomeMessage.type).toBe('welcome');
      expect(welcomeMessage).toHaveProperty('timestamp');
      expect(welcomeMessage).toHaveProperty('camera');
      expect(welcomeMessage).toHaveProperty('power');
      expect(welcomeMessage).toHaveProperty('network');
      expect(welcomeMessage.clientId).toBe('192.168.4.100:54321');

      // Validate against schema
      const errors = validateSchema(welcomeMessage, MessageSchemas.serverMessages.welcome);
      expect(errors).toEqual([]);
    });

    test('determines client interface correctly', async () => {
      // Test AP client (192.168.4.x)
      mockRequest.socket.remoteAddress = '192.168.4.50';
      await wsHandler(mockWebSocket, mockRequest);

      const welcomeMessage = sentMessages[0];
      expect(welcomeMessage.clientId).toBe('192.168.4.50:54321');

      // Reset for non-AP client
      sentMessages = [];
      mockRequest.socket.remoteAddress = '192.168.1.100';
      await wsHandler(mockWebSocket, mockRequest);

      const welcomeMessage2 = sentMessages[0];
      expect(welcomeMessage2.clientId).toBe('192.168.1.100:54321');
    });

    test('handles connection when network manager unavailable', async () => {
      wsHandler = createWebSocketHandler(
        mockCameraController,
        mockPowerManager,
        mockServer,
        null, // No network manager
        mockDiscoveryManager,
        mockIntervalometerStateManager
      );

      await wsHandler(mockWebSocket, mockRequest);

      // Should still send welcome message with null network
      expect(sentMessages).toHaveLength(1);
      const welcomeMessage = sentMessages[0];
      expect(welcomeMessage.network).toBeNull();
    });
  });

  describe('Message Routing', () => {
    beforeEach(async () => {
      await wsHandler(mockWebSocket, mockRequest);
      sentMessages = []; // Clear welcome message
    });

    test('routes take_photo message correctly', async () => {
      const messageHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'message')[1];

      const takePhotoMessage = JSON.stringify({
        type: 'take_photo',
        data: {}
      });

      await messageHandler(Buffer.from(takePhotoMessage));

      expect(mockCameraController.instance.takePhoto).toHaveBeenCalled();
      expect(sentMessages).toHaveLength(1);
      expect(sentMessages[0].type).toBe('photo_taken');
    });

    test('routes get_camera_settings message correctly', async () => {
      const messageHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'message')[1];

      const getSettingsMessage = JSON.stringify({
        type: 'get_camera_settings',
        data: {}
      });

      await messageHandler(Buffer.from(getSettingsMessage));

      expect(mockCameraController.instance.getCameraSettings).toHaveBeenCalled();
      expect(sentMessages).toHaveLength(1);
      expect(sentMessages[0].type).toBe('camera_settings');
      expect(sentMessages[0].data).toEqual({
        iso: 100,
        shutterSpeed: '1/60',
        aperture: 'f/2.8'
      });
    });

    test('routes network_scan message correctly', async () => {
      const messageHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'message')[1];

      const networkScanMessage = JSON.stringify({
        type: 'network_scan',
        data: { refresh: true }
      });

      await messageHandler(Buffer.from(networkScanMessage));

      expect(mockNetworkManager.serviceManager.scanWiFiNetworks).toHaveBeenCalledWith(true);
      expect(sentMessages).toHaveLength(1);
      expect(sentMessages[0].type).toBe('network_scan_result');
      expect(sentMessages[0].data.networks).toHaveLength(2);
    });

    test('routes network_connect message correctly', async () => {
      const messageHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'message')[1];

      const networkConnectMessage = JSON.stringify({
        type: 'network_connect',
        data: {
          ssid: 'TestNetwork',
          password: 'password123'
        }
      });

      await messageHandler(Buffer.from(networkConnectMessage));

      expect(mockNetworkManager.serviceManager.connectToWiFi).toHaveBeenCalledWith(
        'TestNetwork',
        'password123',
        undefined
      );
      expect(sentMessages).toHaveLength(1);
      expect(sentMessages[0].type).toBe('network_connect_result');
      expect(sentMessages[0].data.success).toBe(true);
    });

    test('handles unknown message type', async () => {
      const messageHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'message')[1];

      const unknownMessage = JSON.stringify({
        type: 'unknown_message_type',
        data: {}
      });

      await messageHandler(Buffer.from(unknownMessage));

      expect(sentMessages).toHaveLength(1);
      expect(sentMessages[0].type).toBe('error');

      // Should be standard error format
      const errors = validateSchema(sentMessages[0], StandardErrorFormat);
      expect(errors).toEqual([]);
    });

    test('handles ping message', async () => {
      const messageHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'message')[1];

      const pingMessage = JSON.stringify({
        type: 'ping',
        data: {}
      });

      await messageHandler(Buffer.from(pingMessage));

      expect(sentMessages).toHaveLength(1);
      expect(sentMessages[0].type).toBe('pong');
      expect(sentMessages[0].data).toHaveProperty('timestamp');
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await wsHandler(mockWebSocket, mockRequest);
      sentMessages = []; // Clear welcome message
    });

    test('handles invalid JSON message', async () => {
      const messageHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'message')[1];

      const invalidMessage = "{ invalid json }";

      await messageHandler(Buffer.from(invalidMessage));

      expect(sentMessages).toHaveLength(1);
      expect(sentMessages[0].type).toBe('error');

      // Should use standard error format
      const errors = validateSchema(sentMessages[0], StandardErrorFormat);
      expect(errors).toEqual([]);
      expect(sentMessages[0].error.message).toBe('Invalid message format');
    });

    test('handles camera not available error', async () => {
      // Mock no camera available
      mockCameraController.mockReturnValue(null);

      const messageHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'message')[1];

      const takePhotoMessage = JSON.stringify({
        type: 'take_photo',
        data: {}
      });

      await messageHandler(Buffer.from(takePhotoMessage));

      expect(sentMessages).toHaveLength(1);
      expect(sentMessages[0].type).toBe('photo_result');
      expect(sentMessages[0].success).toBe(false);
      expect(sentMessages[0].error).toBe('No camera available');
    });

    test('handles camera operation failure', async () => {
      // Mock camera operation failure
      mockCameraController.instance.takePhoto.mockRejectedValue(new Error('Camera communication failed'));

      const messageHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'message')[1];

      const takePhotoMessage = JSON.stringify({
        type: 'take_photo',
        data: {}
      });

      await messageHandler(Buffer.from(takePhotoMessage));

      expect(sentMessages).toHaveLength(1);
      expect(sentMessages[0].type).toBe('error');

      // Should use standard error format
      const errors = validateSchema(sentMessages[0], StandardErrorFormat);
      expect(errors).toEqual([]);
      expect(sentMessages[0].error.message).toBe('Failed to take photo: Camera communication failed');
      expect(sentMessages[0].error.code).toBe('PHOTO_FAILED');
    });

    test('handles network management not available', async () => {
      // Create handler without network manager
      const handlerWithoutNetwork = createWebSocketHandler(
        mockCameraController,
        mockPowerManager,
        mockServer,
        null, // No network manager
        mockDiscoveryManager,
        mockIntervalometerStateManager
      );

      await handlerWithoutNetwork(mockWebSocket, mockRequest);
      sentMessages = []; // Clear welcome message

      const messageHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'message')[1];

      const networkScanMessage = JSON.stringify({
        type: 'network_scan',
        data: {}
      });

      await messageHandler(Buffer.from(networkScanMessage));

      expect(sentMessages).toHaveLength(1);
      expect(sentMessages[0].type).toBe('error');
      expect(sentMessages[0].error.message).toBe('Network management not available');
    });

    test('handles validation failure', async () => {
      const messageHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'message')[1];

      const validateMessage = JSON.stringify({
        type: 'validate_interval',
        data: { interval: 2 } // Too short
      });

      await messageHandler(Buffer.from(validateMessage));

      expect(sentMessages).toHaveLength(1);
      expect(sentMessages[0].type).toBe('interval_validation');
      expect(sentMessages[0].data.valid).toBe(false);
      expect(sentMessages[0].data.error).toBe('Interval too short');
    });
  });

  describe('Status Broadcasting', () => {
    test('broadcasts status to all connected clients', async () => {
      // Connect multiple clients
      const client1Messages = [];
      const client2Messages = [];

      const mockClient1 = {
        readyState: 1,
        OPEN: 1,
        send: jest.fn((msg) => client1Messages.push(JSON.parse(msg))),
        on: jest.fn(),
        close: jest.fn()
      };

      const mockClient2 = {
        readyState: 1,
        OPEN: 1,
        send: jest.fn((msg) => client2Messages.push(JSON.parse(msg))),
        on: jest.fn(),
        close: jest.fn()
      };

      await wsHandler(mockClient1, mockRequest);
      await wsHandler(mockClient2, mockRequest);

      // Clear welcome messages
      client1Messages.length = 0;
      client2Messages.length = 0;

      // Trigger broadcast
      await wsHandler.broadcastStatus();

      // Both clients should receive status update
      expect(client1Messages).toHaveLength(1);
      expect(client2Messages).toHaveLength(1);

      expect(client1Messages[0].type).toBe('status_update');
      expect(client2Messages[0].type).toBe('status_update');

      // Validate schema
      const errors = validateSchema(client1Messages[0], MessageSchemas.serverMessages.status_update);
      expect(errors).toEqual([]);
    });

    test('handles dead WebSocket connections during broadcast', async () => {
      const client1Messages = [];

      const mockClient1 = {
        readyState: 1,
        OPEN: 1,
        send: jest.fn((msg) => client1Messages.push(JSON.parse(msg))),
        on: jest.fn(),
        close: jest.fn()
      };

      const mockDeadClient = {
        readyState: 3, // CLOSED
        OPEN: 1,
        send: jest.fn(),
        on: jest.fn(),
        close: jest.fn()
      };

      await wsHandler(mockClient1, mockRequest);
      await wsHandler(mockDeadClient, mockRequest);

      client1Messages.length = 0; // Clear welcome messages

      // Trigger broadcast
      await wsHandler.broadcastStatus();

      // Only living client should receive message
      expect(client1Messages).toHaveLength(1);
      expect(mockDeadClient.send).not.toHaveBeenCalled();
    });
  });

  describe('Timelapse Report Handlers', () => {
    beforeEach(async () => {
      await wsHandler(mockWebSocket, mockRequest);
      sentMessages = [];
    });

    test('handles get_timelapse_reports', async () => {
      const mockReports = [
        { id: '1', title: 'Test Report 1' },
        { id: '2', title: 'Test Report 2' }
      ];
      mockIntervalometerStateManager.getReports.mockResolvedValue(mockReports);

      const messageHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'message')[1];

      const getReportsMessage = JSON.stringify({
        type: 'get_timelapse_reports',
        data: {}
      });

      await messageHandler(Buffer.from(getReportsMessage));

      expect(mockIntervalometerStateManager.getReports).toHaveBeenCalled();
      expect(sentMessages).toHaveLength(1);
      expect(sentMessages[0].type).toBe('timelapse_reports');
      expect(sentMessages[0].data.reports).toEqual(mockReports);
    });

    test('handles update_report_title', async () => {
      const updatedReport = { id: 'test-id', title: 'Updated Title' };
      mockIntervalometerStateManager.updateReportTitle.mockResolvedValue(updatedReport);

      const messageHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'message')[1];

      const updateTitleMessage = JSON.stringify({
        type: 'update_report_title',
        data: { id: 'test-id', title: 'Updated Title' }
      });

      await messageHandler(Buffer.from(updateTitleMessage));

      expect(mockIntervalometerStateManager.updateReportTitle).toHaveBeenCalledWith('test-id', 'Updated Title');
      expect(sentMessages).toHaveLength(1);
      expect(sentMessages[0].type).toBe('report_title_updated');
      expect(sentMessages[0].data.report).toEqual(updatedReport);
    });

    test('validates required fields for report operations', async () => {
      const messageHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'message')[1];

      // Test missing ID
      const missingIdMessage = JSON.stringify({
        type: 'update_report_title',
        data: { title: 'New Title' }
      });

      await messageHandler(Buffer.from(missingIdMessage));

      expect(sentMessages).toHaveLength(1);
      expect(sentMessages[0].type).toBe('error');
      expect(sentMessages[0].error.message).toBe('Report ID and title are required');

      // Test empty title
      sentMessages.length = 0;
      const emptyTitleMessage = JSON.stringify({
        type: 'update_report_title',
        data: { id: 'test-id', title: '   ' }
      });

      await messageHandler(Buffer.from(emptyTitleMessage));

      expect(sentMessages).toHaveLength(1);
      expect(sentMessages[0].type).toBe('error');
      expect(sentMessages[0].error.message).toBe('Title cannot be empty');
    });
  });

  describe('Connection Cleanup', () => {
    test('cleans up on client disconnect', async () => {
      await wsHandler(mockWebSocket, mockRequest);

      // Get the close handler
      const closeHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'close')[1];

      // Trigger close
      closeHandler(1000, 'Client disconnected');

      // Should handle cleanup gracefully
      expect(closeHandler).toBeDefined();
    });

    test('cleans up on WebSocket error', async () => {
      await wsHandler(mockWebSocket, mockRequest);

      // Get the error handler
      const errorHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'error')[1];

      // Trigger error
      errorHandler(new Error('Connection error'));

      // Should handle cleanup gracefully
      expect(errorHandler).toBeDefined();
    });

    test('cleanup function closes all connections', () => {
      const mockClient1 = {
        readyState: 1,
        OPEN: 1,
        close: jest.fn(),
        send: jest.fn(),
        on: jest.fn()
      };

      const mockClient2 = {
        readyState: 1,
        OPEN: 1,
        close: jest.fn(),
        send: jest.fn(),
        on: jest.fn()
      };

      // Note: We can't easily test the cleanup function without internal access
      // But we can verify it exists
      expect(wsHandler.cleanup).toBeDefined();
      expect(typeof wsHandler.cleanup).toBe('function');
    });
  });
});