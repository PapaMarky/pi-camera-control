/**
 * Live View Manager Tests
 *
 * Tests for the LiveViewManager class that handles live view image capture
 * from the camera via CCAPI.
 */

import { jest } from '@jest/globals';
import fs from 'fs/promises';

// Mock fs operations
jest.spyOn(fs, 'mkdir').mockResolvedValue(undefined);
jest.spyOn(fs, 'writeFile').mockResolvedValue(undefined);

// Mock dependencies
const mockCameraController = {
  client: {
    post: jest.fn(),
    get: jest.fn(),
  },
  baseUrl: 'https://192.168.12.98:443',
  connected: true,
};

describe('LiveViewManager', () => {
  let LiveViewManager;
  let liveViewManager;
  let fs;
  let path;

  beforeAll(async () => {
    // Dynamic import to allow mocking
    const module = await import('../../src/camera/liveview-manager.js');
    LiveViewManager = module.LiveViewManager;
  });

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Reset camera state
    mockCameraController.connected = true;

    // Create fresh instance with getter function
    liveViewManager = new LiveViewManager(() => mockCameraController);
  });

  describe('Constructor', () => {
    test('should initialize with camera controller getter', () => {
      expect(liveViewManager.getController()).toBe(mockCameraController);
      expect(liveViewManager.captures).toEqual([]);
      expect(liveViewManager.captureId).toBe(1);
    });
  });

  describe('captureImage()', () => {
    test('should capture live view image successfully', async () => {
      // Mock successful live view enable
      mockCameraController.client.post.mockResolvedValueOnce({
        status: 200,
        data: {},
      });

      // Mock successful image capture
      const mockImageData = Buffer.from('fake-jpeg-data');
      mockCameraController.client.get.mockResolvedValueOnce({
        status: 200,
        data: mockImageData,
        headers: { 'content-type': 'image/jpeg' },
      });

      // Mock successful live view disable
      mockCameraController.client.post.mockResolvedValueOnce({
        status: 200,
        data: {},
      });

      const result = await liveViewManager.captureImage();

      // Verify the result
      expect(result).toMatchObject({
        id: 1,
        url: expect.stringContaining('/api/camera/liveview/images/1'),
        timestamp: expect.any(String),
        size: expect.any(Number),
      });

      // Verify live view was enabled
      expect(mockCameraController.client.post).toHaveBeenCalledWith(
        `${mockCameraController.baseUrl}/ccapi/ver100/shooting/liveview`,
        { liveviewsize: 'small', cameradisplay: 'on' }
      );

      // Verify image was captured
      expect(mockCameraController.client.get).toHaveBeenCalledWith(
        `${mockCameraController.baseUrl}/ccapi/ver100/shooting/liveview/flip`,
        expect.objectContaining({ responseType: 'arraybuffer' })
      );

      // Verify live view was disabled
      expect(mockCameraController.client.post).toHaveBeenCalledWith(
        `${mockCameraController.baseUrl}/ccapi/ver100/shooting/liveview`,
        { liveviewsize: 'off' }
      );

      // Verify capture was added to list
      expect(liveViewManager.captures).toHaveLength(1);
      expect(liveViewManager.captures[0]).toMatchObject({
        id: 1,
        timestamp: expect.any(String),
      });
    });

    test('should handle camera offline error', async () => {
      mockCameraController.connected = false;

      await expect(liveViewManager.captureImage()).rejects.toThrow(
        'Camera not connected'
      );
    });

    test('should handle live view enable failure', async () => {
      mockCameraController.client.post.mockRejectedValueOnce(
        new Error('Failed to enable live view')
      );

      await expect(liveViewManager.captureImage()).rejects.toThrow(
        'Failed to enable live view'
      );
    });

    test('should handle image capture failure', async () => {
      // Mock successful enable
      mockCameraController.client.post.mockResolvedValueOnce({
        status: 200,
        data: {},
      });

      // Mock failed capture
      mockCameraController.client.get.mockRejectedValueOnce(
        new Error('Failed to capture image')
      );

      // Mock successful disable (cleanup)
      mockCameraController.client.post.mockResolvedValueOnce({
        status: 200,
        data: {},
      });

      await expect(liveViewManager.captureImage()).rejects.toThrow(
        'Failed to capture image'
      );

      // Verify cleanup happened
      expect(mockCameraController.client.post).toHaveBeenCalledWith(
        `${mockCameraController.baseUrl}/ccapi/ver100/shooting/liveview`,
        { liveviewsize: 'off' }
      );
    });

    test('should increment capture ID for each capture', async () => {
      // Setup successful mocks
      mockCameraController.client.post.mockResolvedValue({ status: 200, data: {} });
      mockCameraController.client.get.mockResolvedValue({
        status: 200,
        data: Buffer.from('fake-data'),
        headers: { 'content-type': 'image/jpeg' },
      });

      const result1 = await liveViewManager.captureImage();
      const result2 = await liveViewManager.captureImage();

      expect(result1.id).toBe(1);
      expect(result2.id).toBe(2);
      expect(liveViewManager.captures).toHaveLength(2);
    });
  });

  describe('listCaptures()', () => {
    test('should return empty array initially', () => {
      const captures = liveViewManager.listCaptures();
      expect(captures).toEqual([]);
    });

    test('should return list of captures', async () => {
      // Add mock captures
      liveViewManager.captures = [
        { id: 1, timestamp: '2025-10-02T12:00:00.000Z', url: '/api/camera/liveview/images/1', size: 29000 },
        { id: 2, timestamp: '2025-10-02T12:01:00.000Z', url: '/api/camera/liveview/images/2', size: 30000 },
      ];

      const captures = liveViewManager.listCaptures();
      expect(captures).toHaveLength(2);
      expect(captures[0].id).toBe(1);
      expect(captures[1].id).toBe(2);
    });
  });

  describe('getCapture()', () => {
    beforeEach(() => {
      liveViewManager.captures = [
        { id: 1, timestamp: '2025-10-02T12:00:00.000Z', url: '/api/camera/liveview/images/1', size: 29000 },
        { id: 2, timestamp: '2025-10-02T12:01:00.000Z', url: '/api/camera/liveview/images/2', size: 30000 },
      ];
    });

    test('should return capture by ID', () => {
      const capture = liveViewManager.getCapture(1);
      expect(capture).toMatchObject({ id: 1 });
    });

    test('should return undefined for non-existent ID', () => {
      const capture = liveViewManager.getCapture(999);
      expect(capture).toBeUndefined();
    });
  });

  describe('clearAll()', () => {
    test('should clear all captures', async () => {
      liveViewManager.captures = [
        { id: 1, filepath: '/data/test-shots/liveview/1.jpg' },
        { id: 2, filepath: '/data/test-shots/liveview/2.jpg' },
      ];

      await liveViewManager.clearAll();

      expect(liveViewManager.captures).toEqual([]);
    });

    test('should reset capture ID counter', async () => {
      liveViewManager.captureId = 5;
      await liveViewManager.clearAll();
      expect(liveViewManager.captureId).toBe(1);
    });
  });
});
