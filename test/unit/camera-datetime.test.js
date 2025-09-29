/**
 * Camera DateTime API Tests
 *
 * Tests for camera date/time synchronization via Canon CCAPI
 */

import { jest } from '@jest/globals';
import axios from 'axios';
import { CameraController } from '../../src/camera/controller.js';

// Mock axios
const mockClient = {
  get: jest.fn(),
  put: jest.fn(),
  post: jest.fn()
};

jest.mock('axios', () => ({
  default: {
    create: jest.fn(() => mockClient)
  }
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

describe('Camera DateTime CCAPI', () => {
  let controller;

  beforeEach(() => {
    mockClient.get.mockClear();
    mockClient.put.mockClear();
    mockClient.post.mockClear();

    controller = new CameraController('192.168.4.3', 443);
    controller.connected = true; // Mock as connected
    controller.baseUrl = 'https://192.168.4.3:443';
    controller.client = mockClient;
  });

  describe('getCameraDateTime', () => {
    test('should use correct CCAPI endpoint for getting datetime', async () => {
      // Mock successful response with camera datetime in RFC1123 format
      mockClient.get.mockResolvedValue({
        status: 200,
        data: {
          datetime: 'Mon, 01 Jan 2024 12:00:00 GMT',
          dst: false
        }
      });

      const result = await controller.getCameraDateTime();

      // Should call the correct CCAPI endpoint as per Canon documentation
      expect(mockClient.get).toHaveBeenCalledWith(
        'https://192.168.4.3:443/ccapi/ver100/functions/datetime'
      );

      // Should return ISO string for consistency
      expect(result).toBe('2024-01-01T12:00:00.000Z');
    });

    test('should handle datetime with timezone offset', async () => {
      mockClient.get.mockResolvedValue({
        status: 200,
        data: {
          datetime: 'Tue, 01 Jan 2024 12:00:00 +0900',
          dst: false
        }
      });

      const result = await controller.getCameraDateTime();

      // Should convert to UTC (12:00 JST = 03:00 UTC)
      expect(result).toBe('2024-01-01T03:00:00.000Z');
    });

    test('should throw error when camera not connected', async () => {
      controller.connected = false;

      await expect(controller.getCameraDateTime()).rejects.toThrow('Camera not connected');
      expect(mockClient.get).not.toHaveBeenCalled();
    });

    test('should handle API errors gracefully', async () => {
      mockClient.get.mockRejectedValue(new Error('Network error'));

      const result = await controller.getCameraDateTime();

      expect(result).toBeNull();
    });
  });

  describe('setCameraDateTime', () => {
    test('should use correct CCAPI endpoint for setting datetime', async () => {
      mockClient.put.mockResolvedValue({
        status: 200
      });

      const testDate = new Date('2024-01-01T12:00:00Z');
      const result = await controller.setCameraDateTime(testDate);

      // Should call the correct CCAPI endpoint as per Canon documentation
      expect(mockClient.put).toHaveBeenCalledWith(
        'https://192.168.4.3:443/ccapi/ver100/functions/datetime',
        {
          datetime: 'Mon, 01 Jan 2024 12:00:00 GMT',
          dst: false
        }
      );

      expect(result).toBe(true);
    });

    test('should format datetime correctly for camera', async () => {
      mockClient.put.mockResolvedValue({
        status: 200
      });

      const testDate = new Date('2024-12-31T23:59:59Z');
      await controller.setCameraDateTime(testDate);

      expect(mockClient.put).toHaveBeenCalledWith(
        expect.any(String),
        {
          datetime: 'Tue, 31 Dec 2024 23:59:59 GMT',
          dst: false
        }
      );
    });

    test('should handle timezone offsets', async () => {
      mockClient.put.mockResolvedValue({
        status: 200
      });

      // Create date with timezone offset
      const testDate = new Date('2024-01-01T12:00:00+09:00');
      await controller.setCameraDateTime(testDate);

      // Should convert to UTC and send RFC1123 format
      expect(mockClient.put).toHaveBeenCalledWith(
        expect.any(String),
        {
          datetime: 'Mon, 01 Jan 2024 03:00:00 GMT', // Converted to UTC
          dst: false
        }
      );
    });

    test('should return false on API error', async () => {
      mockClient.put.mockRejectedValue(new Error('Network error'));

      const testDate = new Date();
      const result = await controller.setCameraDateTime(testDate);

      expect(result).toBe(false);
    });

    test('should throw error when camera not connected', async () => {
      controller.connected = false;
      const testDate = new Date();

      await expect(controller.setCameraDateTime(testDate)).rejects.toThrow('Camera not connected');
      expect(mockClient.put).not.toHaveBeenCalled();
    });

    test('should handle 204 No Content response', async () => {
      mockClient.put.mockResolvedValue({
        status: 204 // No Content
      });

      const testDate = new Date();
      const result = await controller.setCameraDateTime(testDate);

      expect(result).toBe(true);
    });

    test('should handle non-200/204 status codes', async () => {
      mockClient.put.mockResolvedValue({
        status: 400,
        data: { error: 'Invalid datetime format' }
      });

      const testDate = new Date();
      const result = await controller.setCameraDateTime(testDate);

      expect(result).toBe(false);
    });
  });

  describe('DateTime Format Compatibility', () => {
    test('should accept Date object', async () => {
      mockClient.put.mockResolvedValue({ status: 200 });

      const date = new Date('2024-01-01T12:00:00Z');
      await controller.setCameraDateTime(date);

      expect(mockClient.put).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          datetime: 'Mon, 01 Jan 2024 12:00:00 GMT',
          dst: false
        })
      );
    });

    test('should accept ISO string', async () => {
      mockClient.put.mockResolvedValue({ status: 200 });

      await controller.setCameraDateTime('2024-01-01T12:00:00Z');

      expect(mockClient.put).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          datetime: 'Mon, 01 Jan 2024 12:00:00 GMT',
          dst: false
        })
      );
    });

    test('should accept timestamp number', async () => {
      mockClient.put.mockResolvedValue({ status: 200 });

      const timestamp = new Date('2024-01-01T12:00:00Z').getTime();
      await controller.setCameraDateTime(timestamp);

      expect(mockClient.put).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          datetime: 'Mon, 01 Jan 2024 12:00:00 GMT',
          dst: false
        })
      );
    });
  });
});