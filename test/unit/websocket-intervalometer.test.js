/**
 * WebSocket Intervalometer Handler Tests
 *
 * Tests intervalometer-specific WebSocket message handling without camera hardware.
 * Focus on session management, validation, and report operations.
 */

import { jest } from '@jest/globals';
import { createWebSocketHandler } from '../../src/websocket/handler.js';
import { validateSchema } from '../schemas/websocket-messages.test.js';
import { StandardErrorFormat } from '../errors/error-standardization.test.js';

// Mock timesync service - no longer using singleton import, passed as parameter
const mockTimeSyncService = {
  handleClientConnection: jest.fn(async () => {
    // Return immediately without starting any timers
    return Promise.resolve();
  }),
  handleClientDisconnection: jest.fn(() => {}),
  handleClientTimeResponse: jest.fn(async () => {}),
  requestClientTime: jest.fn(() => {}), // Added for time sync before intervalometer start
  broadcastSyncStatus: jest.fn(() => {}), // Added for broadcast after connection
  getStatus: jest.fn(() => ({
    synced: false,
    reliability: 'unknown',
    lastSync: null,
    drift: 0
  })),
  getStatistics: jest.fn(() => ({ count: 0 })),
  startScheduledChecks: jest.fn(() => {}),
  stopScheduledChecks: jest.fn(() => {}),
  cleanup: jest.fn(() => {})
};

describe('WebSocket Intervalometer Handler Tests', () => {
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
  let mockSession;

  beforeEach(() => {
    // Use fake timers to control intervals
    jest.useFakeTimers();

    // Reset sent messages tracking
    sentMessages = [];

    // Mock WebSocket client
    mockWebSocket = {
      readyState: 1, // OPEN
      OPEN: 1,
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

    // Mock intervalometer session
    mockSession = {
      id: 'session-123',
      title: 'Test Session',
      state: 'running',
      on: jest.fn(),
      start: jest.fn(),
      stop: jest.fn(),
      cleanup: jest.fn(),
      getStatus: jest.fn(() => ({
        state: 'running',
        progress: {
          shots: 15,
          total: 100,
          percentage: 15
        },
        stats: {
          successful: 15,
          failed: 0,
          totalTime: 300
        }
      }))
    };

    // Mock camera controller
    const mockControllerInstance = {
      getConnectionStatus: jest.fn(() => ({
        connected: true,
        ip: '192.168.4.2',
        model: 'EOS R50'
      })),
      validateInterval: jest.fn((interval) => ({
        valid: interval > 0 && interval >= 5,
        error: interval < 5 ? 'Interval must be at least 5 seconds' : null,
        recommendedMin: 5,
        currentShutter: '1/60'
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

    // Mock server
    mockServer = {
      activeIntervalometerSession: null
    };

    // Mock network manager
    mockNetworkManager = {
      getNetworkStatus: jest.fn(async () => ({
        interfaces: {
          wlan0: { connected: true, network: 'TestNetwork' }
        }
      })),
      stateManager: { on: jest.fn() }
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
      createSession: jest.fn(async () => mockSession),
      getReports: jest.fn(async () => [
        { id: 'report-1', title: 'Night Sky 1', shots: 120 },
        { id: 'report-2', title: 'Sunset Timelapse', shots: 300 }
      ]),
      getReport: jest.fn(async (id) => {
        if (id === 'report-1') {
          return {
            id: 'report-1',
            title: 'Night Sky 1',
            shots: 120,
            interval: 30,
            duration: 3600
          };
        }
        return null;
      }),
      updateReportTitle: jest.fn(async (id, title) => ({
        id,
        title,
        shots: 120,
        updated: new Date().toISOString()
      })),
      deleteReport: jest.fn(async () => true),
      saveSessionReport: jest.fn(async (sessionId, title) => ({
        id: 'new-report-id',
        sessionId,
        title: title || 'Saved Session',
        saved: new Date().toISOString()
      })),
      discardSession: jest.fn(async () => true),
      getState: jest.fn(() => ({
        hasUnsavedSession: false,
        currentSessionId: null
      }))
    };

    // Create WebSocket handler
    // Mock LiveViewManager
    const mockLiveViewManager = {
      captureImage: jest.fn(),
      listCaptures: jest.fn(),
      getCapture: jest.fn(),
      clearAll: jest.fn()
    };

    wsHandler = createWebSocketHandler(
      mockCameraController,
      mockPowerManager,
      mockServer,
      mockNetworkManager,
      mockDiscoveryManager,
      mockIntervalometerStateManager,
      mockLiveViewManager,
      mockTimeSyncService
    );

    jest.clearAllTimers();
  });

  afterEach(() => {
    if (wsHandler && wsHandler.cleanup) {
      wsHandler.cleanup();
    }
    jest.clearAllTimers();
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  // validate_interval message type removed - validation now happens automatically during intervalometer start

  describe('Intervalometer Session Management', () => {
    beforeEach(async () => {
      await wsHandler(mockWebSocket, mockRequest);
      sentMessages = [];
    });

    test('starts intervalometer with title', async () => {
      const messageHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'message')[1];

      const startMessage = JSON.stringify({
        type: 'start_intervalometer_with_title',
        data: {
          interval: 30,
          shots: 100,
          stopCondition: 'stop-after',
          title: 'Night Sky Test'
        }
      });

      // Start the async handler (don't await yet)
      const handlerPromise = messageHandler(Buffer.from(startMessage));

      // Advance timers to handle the 500ms delay for time sync
      await jest.advanceTimersByTimeAsync(600);

      // Wait for handler to complete
      await handlerPromise;

      expect(mockIntervalometerStateManager.createSession).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          interval: 30,
          totalShots: 100,
          title: 'Night Sky Test'
        })
      );

      expect(mockTimeSyncService.requestClientTime).toHaveBeenCalled();
      expect(mockSession.start).toHaveBeenCalled();
      expect(sentMessages).toHaveLength(1);
      expect(sentMessages[0].type).toBe('intervalometer_start');
      expect(sentMessages[0].data.success).toBe(true);
      expect(sentMessages[0].data.sessionId).toBe('session-123');
      expect(sentMessages[0].data.title).toBe('Test Session');
    });

    test('starts intervalometer with stop time', async () => {
      const messageHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'message')[1];

      const startMessage = JSON.stringify({
        type: 'start_intervalometer_with_title',
        data: {
          interval: 15,
          stopTime: '23:30',
          stopCondition: 'stop-at',
          title: 'Sunset Session'
        }
      });

      const handlerPromise = messageHandler(Buffer.from(startMessage));
      await jest.advanceTimersByTimeAsync(600);
      await handlerPromise;

      const createSessionCall = mockIntervalometerStateManager.createSession.mock.calls[0];
      const options = createSessionCall[1];

      expect(options.interval).toBe(15);
      expect(options.title).toBe('Sunset Session');
      expect(options.stopTime).toBeInstanceOf(Date);
      expect(options.stopTime.getHours()).toBe(23);
      expect(options.stopTime.getMinutes()).toBe(30);
    });

    test('handles stop time in the past (next day)', async () => {
      const messageHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'message')[1];

      // Use a time that's definitely in the past
      const startMessage = JSON.stringify({
        type: 'start_intervalometer_with_title',
        data: {
          interval: 15,
          stopTime: '01:00', // 1 AM (assuming test runs during day)
          stopCondition: 'stop-at',
          title: 'Early Morning Session'
        }
      });

      const handlerPromise = messageHandler(Buffer.from(startMessage));
      await jest.advanceTimersByTimeAsync(600);
      await handlerPromise;

      const createSessionCall = mockIntervalometerStateManager.createSession.mock.calls[0];
      const options = createSessionCall[1];

      expect(options.stopTime).toBeInstanceOf(Date);
      // Should be tomorrow at 1 AM
      expect(options.stopTime.getHours()).toBe(1);
      expect(options.stopTime.getMinutes()).toBe(0);
      // Stop time should be in the future (comparison by timestamp is more reliable)
      expect(options.stopTime.getTime()).toBeGreaterThan(new Date().getTime());
    });

    test('prevents starting when session already running', async () => {
      // Set active session
      mockServer.activeIntervalometerSession = mockSession;

      const messageHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'message')[1];

      const startMessage = JSON.stringify({
        type: 'start_intervalometer_with_title',
        data: {
          interval: 30,
          shots: 100,
          stopCondition: 'stop-after',
          title: 'Should Fail'
        }
      });

      await messageHandler(Buffer.from(startMessage));

      expect(sentMessages).toHaveLength(1);
      expect(sentMessages[0].type).toBe('error');
      expect(sentMessages[0].error.message).toBe('Intervalometer is already running');
    });

    test('cleans up existing session before starting new one', async () => {
      // Set inactive session
      const oldSession = {
        state: 'stopped',
        cleanup: jest.fn()
      };
      mockServer.activeIntervalometerSession = oldSession;

      const messageHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'message')[1];

      const startMessage = JSON.stringify({
        type: 'start_intervalometer_with_title',
        data: {
          interval: 30,
          shots: 100,
          stopCondition: 'stop-after',
          title: 'New Session'
        }
      });

      const handlerPromise = messageHandler(Buffer.from(startMessage));
      await jest.advanceTimersByTimeAsync(600);
      await handlerPromise;

      expect(oldSession.cleanup).toHaveBeenCalled();
      expect(mockIntervalometerStateManager.createSession).toHaveBeenCalled();
    });

    test('handles validation failure on start', async () => {
      // Mock validation failure
      mockCameraController.instance.validateInterval.mockReturnValue({
        valid: false,
        error: 'Interval conflicts with current shutter speed'
      });

      const messageHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'message')[1];

      const startMessage = JSON.stringify({
        type: 'start_intervalometer_with_title',
        data: {
          interval: 1, // Too short
          shots: 100,
          stopCondition: 'stop-after',
          title: 'Should Fail'
        }
      });

      await messageHandler(Buffer.from(startMessage));

      expect(sentMessages).toHaveLength(1);
      expect(sentMessages[0].type).toBe('error');
      expect(sentMessages[0].error.message).toBe('Interval conflicts with current shutter speed');
    });

    test('stops intervalometer session', async () => {
      // Set active session
      mockServer.activeIntervalometerSession = mockSession;

      const messageHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'message')[1];

      const stopMessage = JSON.stringify({
        type: 'stop_intervalometer',
        data: {}
      });

      await messageHandler(Buffer.from(stopMessage));

      expect(mockSession.stop).toHaveBeenCalled();
      expect(sentMessages).toHaveLength(1);
      expect(sentMessages[0].type).toBe('intervalometer_stop');
      expect(sentMessages[0].data.success).toBe(true);
    });

    test('handles stop when no session running', async () => {
      // No active session
      mockServer.activeIntervalometerSession = null;

      const messageHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'message')[1];

      const stopMessage = JSON.stringify({
        type: 'stop_intervalometer',
        data: {}
      });

      await messageHandler(Buffer.from(stopMessage));

      expect(sentMessages).toHaveLength(1);
      expect(sentMessages[0].type).toBe('error');
      expect(sentMessages[0].error.message).toBe('No intervalometer session is running');
    });

    test('handles legacy start_intervalometer message', async () => {
      const messageHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'message')[1];

      const legacyStartMessage = JSON.stringify({
        type: 'start_intervalometer',
        data: {
          interval: 30,
          shots: 50,
          stopCondition: 'stop-after'
        }
      });

      const handlerPromise = messageHandler(Buffer.from(legacyStartMessage));
      await jest.advanceTimersByTimeAsync(600);
      await handlerPromise;

      // Should delegate to the title version
      // Note: title is not included in options when it's null/empty
      expect(mockIntervalometerStateManager.createSession).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          interval: 30,
          totalShots: 50
        })
      );
    });
  });

  describe('Session Event Handling', () => {
    beforeEach(async () => {
      await wsHandler(mockWebSocket, mockRequest);
      sentMessages = [];
    });

    test('sets up session event handlers', async () => {
      const messageHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'message')[1];

      const startMessage = JSON.stringify({
        type: 'start_intervalometer_with_title',
        data: {
          interval: 30,
          shots: 100,
          stopCondition: 'stop-after',
          title: 'Event Test'
        }
      });

      const handlerPromise = messageHandler(Buffer.from(startMessage));
      await jest.advanceTimersByTimeAsync(600);
      await handlerPromise;

      // Verify event handlers were registered
      expect(mockSession.on).toHaveBeenCalledWith('started', expect.any(Function));
      expect(mockSession.on).toHaveBeenCalledWith('photo_taken', expect.any(Function));
      expect(mockSession.on).toHaveBeenCalledWith('photo_failed', expect.any(Function));
      expect(mockSession.on).toHaveBeenCalledWith('completed', expect.any(Function));
      expect(mockSession.on).toHaveBeenCalledWith('stopped', expect.any(Function));
      expect(mockSession.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    test('handles session started event', async () => {
      const messageHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'message')[1];

      const startMessage = JSON.stringify({
        type: 'start_intervalometer_with_title',
        data: {
          interval: 30,
          shots: 100,
          stopCondition: 'stop-after',
          title: 'Event Test'
        }
      });

      const handlerPromise = messageHandler(Buffer.from(startMessage));
      await jest.advanceTimersByTimeAsync(600);
      await handlerPromise;

      // Get the started event handler
      const startedHandler = mockSession.on.mock.calls.find(call => call[0] === 'started')[1];

      // Clear start response
      sentMessages.length = 0;

      // Trigger started event
      startedHandler({ started: true, interval: 30 });

      expect(sentMessages).toHaveLength(1);
      expect(sentMessages[0].type).toBe('event');
      expect(sentMessages[0].eventType).toBe('intervalometer_started');
      expect(sentMessages[0].data.sessionId).toBe('session-123');
      expect(sentMessages[0].data.title).toBe('Test Session');
    });

    test('handles session completed event', async () => {
      const messageHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'message')[1];

      const startMessage = JSON.stringify({
        type: 'start_intervalometer_with_title',
        data: {
          interval: 30,
          shots: 100,
          stopCondition: 'stop-after',
          title: 'Completion Test'
        }
      });

      const handlerPromise = messageHandler(Buffer.from(startMessage));
      await jest.advanceTimersByTimeAsync(600);
      await handlerPromise;

      // Get the completed event handler
      const completedHandler = mockSession.on.mock.calls.find(call => call[0] === 'completed')[1];

      sentMessages.length = 0; // Clear start response

      // Trigger completed event
      completedHandler({
        sessionId: 'session-123',
        title: 'Completion Test',
        stats: { successful: 100, failed: 0 }
      });

      expect(sentMessages).toHaveLength(2);
      expect(sentMessages[0].type).toBe('event');
      expect(sentMessages[0].eventType).toBe('intervalometer_completed');
      expect(sentMessages[1].type).toBe('event');
      expect(sentMessages[1].eventType).toBe('timelapse_session_needs_decision');
    });
  });

  describe('Report Management', () => {
    beforeEach(async () => {
      await wsHandler(mockWebSocket, mockRequest);
      sentMessages = [];
    });

    test('gets timelapse reports', async () => {
      const messageHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'message')[1];

      const getReportsMessage = JSON.stringify({
        type: 'get_timelapse_reports',
        data: {}
      });

      await messageHandler(Buffer.from(getReportsMessage));

      expect(mockIntervalometerStateManager.getReports).toHaveBeenCalled();
      expect(sentMessages).toHaveLength(1);
      expect(sentMessages[0].type).toBe('timelapse_reports');
      expect(sentMessages[0].data.reports).toHaveLength(2);
      expect(sentMessages[0].data.reports[0].title).toBe('Night Sky 1');
    });

    test('gets specific timelapse report', async () => {
      const messageHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'message')[1];

      const getReportMessage = JSON.stringify({
        type: 'get_timelapse_report',
        data: { id: 'report-1' }
      });

      await messageHandler(Buffer.from(getReportMessage));

      expect(mockIntervalometerStateManager.getReport).toHaveBeenCalledWith('report-1');
      expect(sentMessages).toHaveLength(1);
      expect(sentMessages[0].type).toBe('timelapse_report');
      expect(sentMessages[0].data.report.title).toBe('Night Sky 1');
    });

    test('handles report not found', async () => {
      const messageHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'message')[1];

      const getReportMessage = JSON.stringify({
        type: 'get_timelapse_report',
        data: { id: 'nonexistent' }
      });

      await messageHandler(Buffer.from(getReportMessage));

      expect(sentMessages).toHaveLength(1);
      expect(sentMessages[0].type).toBe('error');
      expect(sentMessages[0].error.message).toBe('Report not found');
    });

    test('saves session as report', async () => {
      const messageHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'message')[1];

      const saveMessage = JSON.stringify({
        type: 'save_session_as_report',
        data: {
          sessionId: 'session-123',
          title: 'Saved Session Report'
        }
      });

      await messageHandler(Buffer.from(saveMessage));

      expect(mockIntervalometerStateManager.saveSessionReport).toHaveBeenCalledWith(
        'session-123',
        'Saved Session Report'
      );
      // Dual emission: direct response + timelapse_event broadcast
      expect(sentMessages).toHaveLength(2);
      expect(sentMessages[0].type).toBe('session_saved');
      expect(sentMessages[0].data.sessionId).toBe('session-123');
      expect(sentMessages[1].type).toBe('timelapse_event');
      expect(sentMessages[1].eventType).toBe('report_saved');
    });

    test('discards session', async () => {
      const messageHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'message')[1];

      const discardMessage = JSON.stringify({
        type: 'discard_session',
        data: { sessionId: 'session-123' }
      });

      await messageHandler(Buffer.from(discardMessage));

      expect(mockIntervalometerStateManager.discardSession).toHaveBeenCalledWith('session-123');
      // Dual emission: direct response + timelapse_event broadcast
      expect(sentMessages).toHaveLength(2);
      expect(sentMessages[0].type).toBe('session_discarded');
      expect(sentMessages[0].data.sessionId).toBe('session-123');
      expect(sentMessages[1].type).toBe('timelapse_event');
      expect(sentMessages[1].eventType).toBe('session_discarded');
    });

    test('deletes timelapse report', async () => {
      const messageHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'message')[1];

      const deleteMessage = JSON.stringify({
        type: 'delete_timelapse_report',
        data: { id: 'report-1' }
      });

      await messageHandler(Buffer.from(deleteMessage));

      expect(mockIntervalometerStateManager.deleteReport).toHaveBeenCalledWith('report-1');
      // Dual emission: direct response + timelapse_event broadcast
      expect(sentMessages).toHaveLength(2);
      expect(sentMessages[0].type).toBe('report_deleted');
      expect(sentMessages[0].data.reportId).toBe('report-1');
      expect(sentMessages[1].type).toBe('timelapse_event');
      expect(sentMessages[1].eventType).toBe('report_deleted');
    });

    test('gets unsaved session status', async () => {
      // Mock unsaved session state
      mockIntervalometerStateManager.getState.mockReturnValue({
        hasUnsavedSession: true,
        currentSessionId: 'session-456'
      });

      const messageHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'message')[1];

      const getUnsavedMessage = JSON.stringify({
        type: 'get_unsaved_session',
        data: {}
      });

      await messageHandler(Buffer.from(getUnsavedMessage));

      expect(sentMessages).toHaveLength(1);
      expect(sentMessages[0].type).toBe('unsaved_session');
      expect(sentMessages[0].data.unsavedSession.sessionId).toBe('session-456');
    });
  });

  describe('Error Validation', () => {
    beforeEach(async () => {
      await wsHandler(mockWebSocket, mockRequest);
      sentMessages = [];
    });

    test('validates required fields for session operations', async () => {
      const messageHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'message')[1];

      // Test missing sessionId for save
      const invalidSaveMessage = JSON.stringify({
        type: 'save_session_as_report',
        data: { title: 'No Session ID' }
      });

      await messageHandler(Buffer.from(invalidSaveMessage));

      expect(sentMessages).toHaveLength(1);
      expect(sentMessages[0].type).toBe('error');
      expect(sentMessages[0].error.message).toBe('Session ID is required');

      // Test missing sessionId for discard
      sentMessages.length = 0;
      const invalidDiscardMessage = JSON.stringify({
        type: 'discard_session',
        data: {}
      });

      await messageHandler(Buffer.from(invalidDiscardMessage));

      expect(sentMessages).toHaveLength(1);
      expect(sentMessages[0].type).toBe('error');
      expect(sentMessages[0].error.message).toBe('Session ID is required');
    });

    test('handles intervalometer state manager not available', async () => {
      // Create a NEW WebSocket mock to avoid handler conflicts
      const newMockWs = {
        readyState: 1,
        OPEN: 1,
        send: jest.fn((message) => {
          sentMessages.push(JSON.parse(message));
        }),
        on: jest.fn(),
        close: jest.fn()
      };

      const newMockRequest = {
        socket: {
          remoteAddress: '192.168.4.102',
          remotePort: 54323
        }
      };

      // Create handler without intervalometer state manager
      const handlerWithoutStateManager = createWebSocketHandler(
        mockCameraController,
        mockPowerManager,
        mockServer,
        mockNetworkManager,
        mockDiscoveryManager,
        null, // No state manager
        mockTimeSyncService
      );

      sentMessages = []; // Clear previous messages
      await handlerWithoutStateManager(newMockWs, newMockRequest);
      sentMessages = []; // Clear welcome message

      // Get the NEW message handler from the NEW WebSocket
      const messageHandler = newMockWs.on.mock.calls.find(call => call[0] === 'message')[1];

      const getReportsMessage = JSON.stringify({
        type: 'get_timelapse_reports',
        data: {}
      });

      await messageHandler(Buffer.from(getReportsMessage));

      expect(sentMessages).toHaveLength(1);
      expect(sentMessages[0].type).toBe('error');
      expect(sentMessages[0].error.message).toBe('Timelapse reporting not available');
    });
  });
});