/**
 * Error Handler Utility Tests
 *
 * Tests for the standardized error handling utilities
 */

import {
  createStandardError,
  createApiError,
  broadcastError,
  convertLegacyError,
  ErrorCodes,
  Components
} from '../../src/utils/error-handlers.js';
import { StandardErrorFormat } from '../errors/error-standardization.test.js';
import { validateSchema } from '../schemas/websocket-messages.test.js';

describe('Error Handler Utilities', () => {
  describe('createStandardError', () => {
    test('creates basic error with message only', () => {
      const error = createStandardError('Test error message');

      expect(error.type).toBe('error');
      expect(error.timestamp).toBeDefined();
      expect(error.error.message).toBe('Test error message');

      const errors = validateSchema(error, StandardErrorFormat);
      expect(errors).toEqual([]);
    });

    test('creates error with all optional fields', () => {
      const error = createStandardError('Camera connection failed', {
        code: ErrorCodes.CAMERA_OFFLINE,
        operation: 'connect',
        component: Components.CAMERA_CONTROLLER,
        details: { ip: '192.168.4.2', attempts: 3 }
      });

      expect(error.error.message).toBe('Camera connection failed');
      expect(error.error.code).toBe('CAMERA_OFFLINE');
      expect(error.error.operation).toBe('connect');
      expect(error.error.component).toBe('CameraController');
      expect(error.error.details).toEqual({ ip: '192.168.4.2', attempts: 3 });

      const errors = validateSchema(error, StandardErrorFormat);
      expect(errors).toEqual([]);
    });

    test('timestamp is recent ISO string', () => {
      const before = new Date();
      const error = createStandardError('Test');
      const after = new Date();
      const errorTime = new Date(error.timestamp);

      expect(errorTime).toBeInstanceOf(Date);
      expect(errorTime.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(errorTime.getTime()).toBeLessThanOrEqual(after.getTime());
      expect(() => new Date(error.timestamp)).not.toThrow();
    });
  });

  describe('createApiError', () => {
    test('creates API-compatible error format', () => {
      const apiError = createApiError('Network connection failed', {
        code: ErrorCodes.NETWORK_ERROR,
        component: Components.NETWORK_MANAGER
      });

      expect(apiError).toHaveProperty('error');
      expect(apiError).toHaveProperty('timestamp');
      expect(apiError).not.toHaveProperty('type'); // API errors don't have 'type'

      expect(apiError.error.message).toBe('Network connection failed');
      expect(apiError.error.code).toBe('NETWORK_ERROR');
    });
  });

  describe('broadcastError', () => {
    test('broadcasts error to open WebSocket clients', () => {
      const mockClients = new Set();
      const sentMessages = [];

      // Mock WebSocket clients
      const mockClient1 = {
        readyState: 1, // OPEN
        OPEN: 1,
        send: (message) => {
          sentMessages.push(JSON.parse(message));
          mockClient1.sendCalled = true;
        },
        sendCalled: false
      };

      const mockClient2 = {
        readyState: 1, // OPEN
        OPEN: 1,
        send: (message) => {
          sentMessages.push(JSON.parse(message));
          mockClient2.sendCalled = true;
        },
        sendCalled: false
      };

      mockClients.add(mockClient1);
      mockClients.add(mockClient2);

      const result = broadcastError(mockClients, 'Test broadcast error', {
        code: 'TEST_ERROR',
        component: 'TestComponent'
      });

      // Check return value
      expect(result.error.message).toBe('Test broadcast error');
      const errors = validateSchema(result, StandardErrorFormat);
      expect(errors).toEqual([]);

      // Check that both clients received the message
      expect(mockClient1.sendCalled).toBe(true);
      expect(mockClient2.sendCalled).toBe(true);
      expect(sentMessages).toHaveLength(2);

      // Check message content
      expect(sentMessages[0].error.message).toBe('Test broadcast error');
      expect(sentMessages[1].error.message).toBe('Test broadcast error');
    });

    test('handles closed WebSocket clients gracefully', () => {
      const mockClients = new Set();
      const openClient = {
        readyState: 1, // OPEN
        OPEN: 1,
        send: () => { openClient.sendCalled = true; },
        sendCalled: false
      };

      const closedClient = {
        readyState: 3, // CLOSED
        OPEN: 1,
        send: () => { closedClient.sendCalled = true; },
        sendCalled: false
      };

      mockClients.add(openClient);
      mockClients.add(closedClient);

      broadcastError(mockClients, 'Test error');

      expect(openClient.sendCalled).toBe(true);
      expect(closedClient.sendCalled).toBe(false);
    });

    test('handles send errors without throwing', () => {
      const mockClients = new Set();
      const errorClient = {
        readyState: 1,
        OPEN: 1,
        send: () => {
          errorClient.sendCalled = true;
          throw new Error('Send failed');
        },
        sendCalled: false
      };

      mockClients.add(errorClient);

      // Should not throw despite client send error
      expect(() => {
        broadcastError(mockClients, 'Test error');
      }).not.toThrow();

      expect(errorClient.sendCalled).toBe(true);
    });
  });

  describe('convertLegacyError', () => {
    test('converts operation_result format', () => {
      const legacyError = {
        type: 'operation_result',
        success: false,
        error: 'Photo capture failed',
        timestamp: '2024-01-01T12:00:00.000Z'
      };

      const converted = convertLegacyError(legacyError, 'CameraController');

      expect(converted.type).toBe('error');
      expect(converted.error.message).toBe('Photo capture failed');
      expect(converted.error.code).toBe('OPERATION_FAILED');
      expect(converted.error.component).toBe('CameraController');

      const errors = validateSchema(converted, StandardErrorFormat);
      expect(errors).toEqual([]);
    });

    test('converts old WebSocket error format', () => {
      const legacyError = {
        type: 'error',
        timestamp: '2024-01-01T12:00:00.000Z',
        data: { message: 'Camera not available' }
      };

      const converted = convertLegacyError(legacyError, 'WebSocketHandler');

      expect(converted.type).toBe('error');
      expect(converted.error.message).toBe('Camera not available');
      expect(converted.error.component).toBe('WebSocketHandler');

      const errors = validateSchema(converted, StandardErrorFormat);
      expect(errors).toEqual([]);
    });

    test('converts API error format', () => {
      const legacyError = {
        error: 'Network connection failed',
        code: 'NETWORK_ERROR',
        timestamp: '2024-01-01T12:00:00.000Z'
      };

      const converted = convertLegacyError(legacyError, 'NetworkManager');

      expect(converted.type).toBe('error');
      expect(converted.error.message).toBe('Network connection failed');
      expect(converted.error.code).toBe('NETWORK_ERROR');
      expect(converted.error.component).toBe('NetworkManager');

      const errors = validateSchema(converted, StandardErrorFormat);
      expect(errors).toEqual([]);
    });

    test('returns standard format unchanged', () => {
      const standardError = createStandardError('Already standard', {
        code: 'TEST_ERROR'
      });

      const converted = convertLegacyError(standardError, 'TestComponent');

      expect(converted).toBe(standardError); // Should be the same object
    });
  });

  describe('Error Codes and Components', () => {
    test('exports comprehensive error codes', () => {
      expect(ErrorCodes.CAMERA_OFFLINE).toBe('CAMERA_OFFLINE');
      expect(ErrorCodes.NETWORK_ERROR).toBe('NETWORK_ERROR');
      expect(ErrorCodes.VALIDATION_FAILED).toBe('VALIDATION_FAILED');
      expect(ErrorCodes.OPERATION_FAILED).toBe('OPERATION_FAILED');
    });

    test('exports component names', () => {
      expect(Components.CAMERA_CONTROLLER).toBe('CameraController');
      expect(Components.NETWORK_MANAGER).toBe('NetworkManager');
      expect(Components.WEBSOCKET_HANDLER).toBe('WebSocketHandler');
    });
  });
});