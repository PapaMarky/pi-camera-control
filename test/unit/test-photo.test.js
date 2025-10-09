/**
 * Test Photo Service Tests
 *
 * Tests for the TestPhotoService class that handles test photo capture with EXIF extraction.
 * Supports both JPEG and RAW (CR3) file formats via exiftool-vendored library.
 * Following TDD: These tests should fail initially until implementation is complete.
 */

import { jest } from "@jest/globals";
import fs from "fs/promises";

// Mock fs operations
jest.spyOn(fs, "mkdir").mockResolvedValue(undefined);
jest.spyOn(fs, "writeFile").mockResolvedValue(undefined);
jest.spyOn(fs, "rename").mockResolvedValue(undefined);

// Mock event polling utility
const mockWaitForPhotoComplete = jest.fn();
jest.unstable_mockModule("../../src/utils/event-polling.js", () => ({
  waitForPhotoComplete: mockWaitForPhotoComplete,
}));

// Mock exiftool-vendored library
const mockExiftool = {
  read: jest.fn(),
  end: jest.fn().mockResolvedValue(undefined),
};
jest.unstable_mockModule("exiftool-vendored", () => ({
  exiftool: mockExiftool,
}));

// Mock axios for photo downloads
const mockAxios = {
  get: jest.fn(),
};
jest.unstable_mockModule("axios", () => ({
  default: mockAxios,
}));

// Mock https module for Agent creation
const mockHttpsAgent = jest.fn().mockImplementation(() => ({
  destroy: jest.fn(),
}));
jest.unstable_mockModule("https", () => ({
  default: {
    Agent: mockHttpsAgent,
  },
}));

describe("TestPhotoService", () => {
  let TestPhotoService;
  let testPhotoService;
  let mockCameraController;
  let mockWsHandler;

  beforeAll(async () => {
    // Dynamic import to allow mocking
    const module = await import("../../src/camera/test-photo.js");
    TestPhotoService = module.TestPhotoService;
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Configure axios mock to return photo data
    mockAxios.get.mockResolvedValue({
      status: 200,
      data: Buffer.from("fake-photo-data"),
    });

    // Mock camera controller
    mockCameraController = {
      client: {
        get: jest.fn(),
        put: jest.fn(),
        post: jest.fn(),
      },
      baseUrl: "https://192.168.12.98:443",
      connected: true,
      pauseConnectionMonitoring: jest.fn(),
      resumeConnectionMonitoring: jest.fn(),
    };

    // Mock WebSocket handler
    mockWsHandler = {
      broadcast: jest.fn(),
    };

    // Create fresh instance with getter function and wsHandler
    testPhotoService = new TestPhotoService(
      () => mockCameraController,
      mockWsHandler,
    );
  });

  describe("Constructor", () => {
    test("should initialize with camera controller getter", () => {
      expect(testPhotoService.getController()).toBe(mockCameraController);
      expect(testPhotoService.photos).toEqual([]);
      expect(testPhotoService.photoId).toBe(1);
    });
  });

  describe("capturePhoto()", () => {
    test("should use current camera settings when useCurrentSettings=true", async () => {
      // Mock shutter button press
      mockCameraController.client.post.mockResolvedValueOnce({
        status: 200,
        data: {},
      });

      // Mock event polling returns file path
      mockWaitForPhotoComplete.mockResolvedValueOnce(
        "/DCIM/100CANON/IMG_0001.JPG",
      );

      // Mock file size retrieval
      mockCameraController.client.get.mockResolvedValueOnce({
        status: 200,
        data: { filesize: 12345 },
      });

      // Mock download photo
      const mockImageData = Buffer.from("fake-jpeg-data");
      mockCameraController.client.get.mockResolvedValueOnce({
        status: 200,
        data: mockImageData,
      });

      // Mock EXIF extraction
      mockExiftool.read.mockResolvedValueOnce({
        ISO: 6400,
        ShutterSpeed: "30",
        FNumber: 2.8,
        DateTimeOriginal: new Date("2025-10-02T12:30:00"),
      });

      const result = await testPhotoService.capturePhoto(true);

      // Verify NO quality settings were retrieved (no GET to settings endpoint)
      expect(mockCameraController.client.get).not.toHaveBeenCalledWith(
        `${mockCameraController.baseUrl}/ccapi/ver110/shooting/settings`,
      );

      // Verify NO quality override (no PUT to quality endpoint)
      expect(mockCameraController.client.put).not.toHaveBeenCalled();

      // Verify shutter was pressed
      expect(mockCameraController.client.post).toHaveBeenCalledWith(
        `${mockCameraController.baseUrl}/ccapi/ver100/shooting/control/shutterbutton`,
        { af: true },
      );

      // Verify photo capture completed successfully
      expect(result.id).toBe(1);
      expect(result.exif.ISO).toBe(6400);
    });

    test("should default to using current settings when useCurrentSettings is not specified", async () => {
      // Mock shutter button press
      mockCameraController.client.post.mockResolvedValueOnce({
        status: 200,
        data: {},
      });

      // Mock event polling returns file path
      mockWaitForPhotoComplete.mockResolvedValueOnce(
        "/DCIM/100CANON/IMG_0001.JPG",
      );

      // Mock file size retrieval
      mockCameraController.client.get.mockResolvedValueOnce({
        status: 200,
        data: { filesize: 12345 },
      });

      // Mock download photo
      const mockImageData = Buffer.from("fake-jpeg-data");
      mockCameraController.client.get.mockResolvedValueOnce({
        status: 200,
        data: mockImageData,
      });

      // Mock EXIF extraction
      mockExiftool.read.mockResolvedValueOnce({
        ISO: 6400,
        ShutterSpeed: "30",
        FNumber: 2.8,
        DateTimeOriginal: new Date("2025-10-02T12:30:00"),
      });

      // Call without parameter (should default to true - use current settings)
      const result = await testPhotoService.capturePhoto();

      // Verify NO quality settings were retrieved (no GET to settings endpoint)
      expect(mockCameraController.client.get).not.toHaveBeenCalledWith(
        `${mockCameraController.baseUrl}/ccapi/ver110/shooting/settings`,
      );

      // Verify NO quality override (no PUT to quality endpoint)
      expect(mockCameraController.client.put).not.toHaveBeenCalled();

      // Verify shutter was pressed
      expect(mockCameraController.client.post).toHaveBeenCalledWith(
        `${mockCameraController.baseUrl}/ccapi/ver100/shooting/control/shutterbutton`,
        { af: true },
      );

      // Verify photo capture completed successfully
      expect(result.id).toBe(1);
      expect(result.exif.ISO).toBe(6400);
    });

    test("should capture test photo with EXIF metadata successfully (explicit useCurrentSettings=false)", async () => {
      // Mock get current quality settings (ver110 settings response structure)
      mockCameraController.client.get.mockResolvedValueOnce({
        status: 200,
        data: {
          stillimagequality: {
            value: { jpeg: "large_fine", raw: "off" },
            ability: {
              jpeg: ["large_fine", "medium_fine", "small_fine", "small2"],
              raw: ["off", "raw"],
            },
          },
        },
      });

      // Mock set quality to smallest
      mockCameraController.client.put.mockResolvedValueOnce({
        status: 200,
        data: {},
      });

      // Mock shutter button press
      mockCameraController.client.post.mockResolvedValueOnce({
        status: 200,
        data: {},
      });

      // Mock event polling returns file path
      mockWaitForPhotoComplete.mockResolvedValueOnce(
        "/DCIM/100CANON/IMG_0001.JPG",
      );

      // Note: File size retrieval is skipped in current implementation to avoid connection conflicts
      // Photo download now uses axios directly (mocked in beforeEach)

      // Mock restore quality setting
      mockCameraController.client.put.mockResolvedValueOnce({
        status: 200,
        data: {},
      });

      // Mock EXIF extraction - use local time to avoid timezone issues in tests
      mockExiftool.read.mockResolvedValueOnce({
        ISO: 6400,
        ShutterSpeed: "30",
        FNumber: 2.8,
        WhiteBalance: "Auto",
        DateTimeOriginal: new Date("2025-10-02T12:30:00"), // Local time
        Model: "Canon EOS R50",
      });

      const result = await testPhotoService.capturePhoto(false);

      // Verify quality was set to smallest (ver110 endpoint with jpeg/raw structure)
      expect(mockCameraController.client.put).toHaveBeenNthCalledWith(
        1,
        `${mockCameraController.baseUrl}/ccapi/ver110/shooting/settings/stillimagequality`,
        { value: { jpeg: "small2", raw: "none" } },
      );

      // Verify shutter button was pressed
      expect(mockCameraController.client.post).toHaveBeenCalledWith(
        `${mockCameraController.baseUrl}/ccapi/ver100/shooting/control/shutterbutton`,
        { af: true },
      );

      // Verify event polling was called with 60s timeout
      expect(mockWaitForPhotoComplete).toHaveBeenCalledWith(
        mockCameraController,
        60000,
      );

      // Verify photo was downloaded via axios with 120s timeout (2 minutes for large files)
      expect(mockAxios.get).toHaveBeenCalledWith(
        `${mockCameraController.baseUrl}/DCIM/100CANON/IMG_0001.JPG`,
        expect.objectContaining({
          responseType: "arraybuffer",
          timeout: 120000, // 2 minutes for large CR3 files
        }),
      );

      // Verify quality was restored (ver110 endpoint)
      expect(mockCameraController.client.put).toHaveBeenNthCalledWith(
        2,
        `${mockCameraController.baseUrl}/ccapi/ver110/shooting/settings/stillimagequality`,
        { value: { jpeg: "large_fine", raw: "off" } },
      );

      // Verify result has correct structure
      expect(result).toMatchObject({
        id: 1,
        url: expect.stringContaining("/api/camera/photos/test/1"),
        filename: expect.stringMatching(/^\d{8}_\d{6}_IMG_0001\.JPG$/),
        timestamp: expect.any(String),
        processingTimeMs: expect.any(Number),
        exif: {
          ISO: 6400,
          ShutterSpeed: "30",
          FNumber: 2.8,
          WhiteBalance: "Auto",
          DateTimeOriginal: expect.any(Date),
          Model: "Canon EOS R50",
        },
      });

      // Verify processingTimeMs is a non-negative number (mocks can resolve instantly with 0ms)
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);

      // Verify filename uses EXIF timestamp
      expect(result.filename).toMatch(/^20251002_123000_IMG_0001\.JPG$/);
    });

    test("should use download timestamp when EXIF date is missing", async () => {
      // Setup mocks for successful capture (ver110 structure)
      mockCameraController.client.get.mockResolvedValueOnce({
        status: 200,
        data: {
          stillimagequality: {
            value: { jpeg: "large_fine", raw: "off" },
            ability: { jpeg: ["large_fine", "small_fine"], raw: ["off"] },
          },
        },
      });
      mockCameraController.client.put.mockResolvedValue({ status: 200 });
      mockCameraController.client.post.mockResolvedValueOnce({ status: 200 });
      mockWaitForPhotoComplete.mockResolvedValueOnce(
        "/DCIM/100CANON/IMG_0001.JPG",
      );
      // Mock file size retrieval
      mockCameraController.client.get.mockResolvedValueOnce({
        status: 200,
        data: { filesize: 12345 },
      });
      // Mock download
      mockCameraController.client.get.mockResolvedValueOnce({
        status: 200,
        data: Buffer.from("fake-jpeg-data"),
      });

      // Mock EXIF without date
      mockExiftool.read.mockResolvedValueOnce({
        ISO: 6400,
        // No DateTimeOriginal
      });

      const result = await testPhotoService.capturePhoto(false);

      // Verify filename uses download timestamp with "dl" marker
      expect(result.filename).toMatch(/^\d{8}_\d{6}_dl_IMG_0001\.JPG$/);
    });

    test("should restore quality setting even if download fails", async () => {
      // Setup mocks (ver110 structure)
      mockCameraController.client.get.mockResolvedValueOnce({
        status: 200,
        data: {
          stillimagequality: {
            value: { jpeg: "large_fine", raw: "off" },
            ability: { jpeg: ["large_fine", "small_fine"], raw: ["off"] },
          },
        },
      });
      mockCameraController.client.put.mockResolvedValueOnce({ status: 200 });
      mockCameraController.client.post.mockResolvedValueOnce({ status: 200 });
      mockWaitForPhotoComplete.mockResolvedValueOnce(
        "/DCIM/100CANON/IMG_0001.JPG",
      );

      // Mock download failure via axios (after max retries)
      mockAxios.get.mockRejectedValue(new Error("Download failed"));

      // Mock restore quality (should still be called)
      mockCameraController.client.put.mockResolvedValueOnce({ status: 200 });

      await expect(testPhotoService.capturePhoto(false)).rejects.toThrow(
        "Download failed",
      );

      // Verify quality was restored despite failure (ver110 endpoint)
      expect(mockCameraController.client.put).toHaveBeenNthCalledWith(
        2,
        `${mockCameraController.baseUrl}/ccapi/ver110/shooting/settings/stillimagequality`,
        { value: { jpeg: "large_fine", raw: "off" } },
      );
    });

    test("should throw error when camera not connected", async () => {
      mockCameraController.connected = false;

      await expect(testPhotoService.capturePhoto()).rejects.toThrow(
        "Camera not connected",
      );
    });

    test("should throw error when timeout occurs during event polling", async () => {
      // Setup successful quality change (ver110 structure)
      mockCameraController.client.get.mockResolvedValueOnce({
        status: 200,
        data: {
          stillimagequality: {
            value: { jpeg: "large_fine", raw: "off" },
            ability: { jpeg: ["large_fine", "small_fine"], raw: ["off"] },
          },
        },
      });
      mockCameraController.client.put.mockResolvedValue({ status: 200 });
      mockCameraController.client.post.mockResolvedValueOnce({ status: 200 });

      // Mock timeout during event polling
      mockWaitForPhotoComplete.mockRejectedValueOnce(
        new Error("Timeout waiting for photo completion (35000ms)"),
      );

      await expect(testPhotoService.capturePhoto(false)).rejects.toThrow(
        "Timeout waiting for photo completion",
      );

      // Verify quality was restored (ver110 structure)
      expect(mockCameraController.client.put).toHaveBeenCalledWith(
        expect.any(String),
        { value: { jpeg: "large_fine", raw: "off" } },
      );
    });

    test("should increment photo ID for each capture", async () => {
      // Setup mocks for two successful captures (using default - current settings, no quality override)
      const setupSuccessfulCapture = () => {
        mockCameraController.client.post.mockResolvedValueOnce({ status: 200 });
        mockWaitForPhotoComplete.mockResolvedValueOnce(
          "/DCIM/100CANON/IMG_0001.JPG",
        );
        // Mock file size retrieval
        mockCameraController.client.get.mockResolvedValueOnce({
          status: 200,
          data: { filesize: 12345 },
        });
        // Mock download
        mockCameraController.client.get.mockResolvedValueOnce({
          status: 200,
          data: Buffer.from("fake-jpeg-data"),
        });
        mockExiftool.read.mockResolvedValueOnce({
          ISO: 6400,
          DateTimeOriginal: new Date("2025-10-02T19:30:00.000Z"),
        });
      };

      setupSuccessfulCapture();
      const result1 = await testPhotoService.capturePhoto();

      setupSuccessfulCapture();
      const result2 = await testPhotoService.capturePhoto();

      expect(result1.id).toBe(1);
      expect(result2.id).toBe(2);
      expect(testPhotoService.photos).toHaveLength(2);
    });

    test("should handle camera busy error gracefully", async () => {
      mockCameraController.client.get.mockResolvedValueOnce({
        status: 200,
        data: {
          stillimagequality: {
            value: { jpeg: "large_fine", raw: "off" },
            ability: { jpeg: ["large_fine", "small_fine"], raw: ["off"] },
          },
        },
      });
      mockCameraController.client.put.mockResolvedValueOnce({ status: 200 });

      // Mock camera busy error on shutter press
      const busyError = new Error("Request failed with status code 503");
      busyError.response = {
        status: 503,
        data: { message: "Camera is busy" },
      };
      mockCameraController.client.post.mockRejectedValueOnce(busyError);

      // Restore quality should still be called
      mockCameraController.client.put.mockResolvedValueOnce({ status: 200 });

      await expect(testPhotoService.capturePhoto()).rejects.toThrow(
        "Camera busy (503) - please wait a moment before trying again",
      );
    });

    test("should measure processingTimeMs accurately (shutter press to addedcontents event)", async () => {
      // Setup mocks for successful capture
      mockCameraController.client.get.mockResolvedValueOnce({
        status: 200,
        data: {
          stillimagequality: {
            value: { jpeg: "large_fine", raw: "off" },
            ability: { jpeg: ["large_fine", "small_fine"], raw: ["off"] },
          },
        },
      });
      mockCameraController.client.put.mockResolvedValue({ status: 200 });

      // Mock shutter button press - capture timestamp when this is called
      let shutterPressTime;
      mockCameraController.client.post.mockImplementation(() => {
        shutterPressTime = Date.now();
        return Promise.resolve({ status: 200, data: {} });
      });

      // Mock event polling with 1500ms delay to simulate camera processing
      const processingDelay = 1500;
      mockWaitForPhotoComplete.mockImplementation(() => {
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve("/DCIM/100CANON/IMG_0001.JPG");
          }, processingDelay);
        });
      });

      // Mock file size retrieval
      mockCameraController.client.get.mockResolvedValueOnce({
        status: 200,
        data: { filesize: 12345 },
      });

      // Mock download photo
      mockCameraController.client.get.mockResolvedValueOnce({
        status: 200,
        data: Buffer.from("fake-jpeg-data"),
      });

      // Mock EXIF extraction
      mockExiftool.read.mockResolvedValueOnce({
        ISO: 6400,
        DateTimeOriginal: new Date("2025-10-02T12:30:00"),
      });

      const result = await testPhotoService.capturePhoto(false);

      // Verify processingTimeMs is present
      expect(result.processingTimeMs).toBeDefined();
      expect(typeof result.processingTimeMs).toBe("number");

      // Verify processingTimeMs is approximately correct (within 100ms of expected)
      // This accounts for test execution overhead
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(
        processingDelay - 100,
      );
      expect(result.processingTimeMs).toBeLessThanOrEqual(
        processingDelay + 200,
      );

      // Verify download time is NOT included (download happens after processing completes)
      // Processing time should be approximately the delay we set, not including download
      const totalElapsed = Date.now() - shutterPressTime;
      expect(result.processingTimeMs).toBeLessThan(totalElapsed);
    });

    // Note: File size retrieval test removed - implementation now skips file size
    // to avoid connection conflicts. Download uses axios directly with no pre-download size check.

    test("should emit download progress events via WebSocket", async () => {
      // Setup mocks
      mockCameraController.client.get.mockResolvedValueOnce({
        status: 200,
        data: {
          stillimagequality: {
            value: { jpeg: "large_fine", raw: "off" },
            ability: { jpeg: ["large_fine", "small_fine"], raw: ["off"] },
          },
        },
      });
      mockCameraController.client.put.mockResolvedValue({ status: 200 });
      mockCameraController.client.post.mockResolvedValueOnce({ status: 200 });
      mockWaitForPhotoComplete.mockResolvedValueOnce(
        "/DCIM/100CANON/IMG_0001.JPG",
      );

      // Mock axios download with progress events
      const fileSize = 5242880; // 5MB
      mockAxios.get.mockImplementationOnce((url, config) => {
        // Simulate progress events
        if (config.onDownloadProgress) {
          config.onDownloadProgress({ loaded: 2621440, total: fileSize }); // 50%
          config.onDownloadProgress({ loaded: 5242880, total: fileSize }); // 100%
        }
        return Promise.resolve({
          status: 200,
          data: Buffer.from("fake-jpeg-data"),
        });
      });

      mockExiftool.read.mockResolvedValueOnce({ ISO: 6400 });

      await testPhotoService.capturePhoto(false);

      // Verify WebSocket progress events were broadcast
      expect(mockWsHandler.broadcast).toHaveBeenCalledWith(
        "test_photo_download_progress",
        expect.objectContaining({
          percentage: 50,
          loaded: 2621440,
          total: fileSize,
          photoId: 1,
        }),
      );

      expect(mockWsHandler.broadcast).toHaveBeenCalledWith(
        "test_photo_download_progress",
        expect.objectContaining({
          percentage: 100,
          loaded: 5242880,
          total: fileSize,
          photoId: 1,
        }),
      );
    });

    test("should continue download if file size retrieval fails", async () => {
      // Setup mocks
      mockCameraController.client.get.mockResolvedValueOnce({
        status: 200,
        data: {
          stillimagequality: {
            value: { jpeg: "large_fine", raw: "off" },
            ability: { jpeg: ["large_fine", "small_fine"], raw: ["off"] },
          },
        },
      });
      mockCameraController.client.put.mockResolvedValue({ status: 200 });
      mockCameraController.client.post.mockResolvedValueOnce({ status: 200 });
      mockWaitForPhotoComplete.mockResolvedValueOnce(
        "/DCIM/100CANON/IMG_0001.JPG",
      );

      // Mock kind=info failure
      mockCameraController.client.get.mockRejectedValueOnce(
        new Error("Info endpoint failed"),
      );

      // Mock photo download still succeeds
      mockCameraController.client.get.mockResolvedValueOnce({
        status: 200,
        data: Buffer.from("fake-jpeg-data"),
      });

      mockExiftool.read.mockResolvedValueOnce({ ISO: 6400 });

      const result = await testPhotoService.capturePhoto(false);

      // Should succeed despite info failure
      expect(result.id).toBe(1);
    });

    test("should handle progress without total size (bytes-only mode)", async () => {
      // Setup mocks
      mockCameraController.client.get.mockResolvedValueOnce({
        status: 200,
        data: {
          stillimagequality: {
            value: { jpeg: "large_fine", raw: "off" },
            ability: { jpeg: ["large_fine", "small_fine"], raw: ["off"] },
          },
        },
      });
      mockCameraController.client.put.mockResolvedValue({ status: 200 });
      mockCameraController.client.post.mockResolvedValueOnce({ status: 200 });
      mockWaitForPhotoComplete.mockResolvedValueOnce(
        "/DCIM/100CANON/IMG_0001.JPG",
      );

      // Mock axios download with progress events (no total)
      mockAxios.get.mockImplementationOnce((url, config) => {
        if (config.onDownloadProgress) {
          // Axios may not provide 'total' if Content-Length header is missing
          config.onDownloadProgress({ loaded: 2621440, total: 0 });
        }
        return Promise.resolve({
          status: 200,
          data: Buffer.from("fake-jpeg-data"),
        });
      });

      mockExiftool.read.mockResolvedValueOnce({ ISO: 6400 });

      await testPhotoService.capturePhoto(false);

      // Should not emit progress event when total is 0
      expect(mockWsHandler.broadcast).not.toHaveBeenCalledWith(
        "test_photo_download_progress",
        expect.anything(),
      );
    });

    test("should use 120s timeout for photo downloads (including large RAW files)", async () => {
      // Setup mocks
      mockCameraController.client.get.mockResolvedValueOnce({
        status: 200,
        data: {
          stillimagequality: {
            value: { jpeg: "large_fine", raw: "off" },
            ability: { jpeg: ["large_fine", "small_fine"], raw: ["off"] },
          },
        },
      });
      mockCameraController.client.put.mockResolvedValue({ status: 200 });
      mockCameraController.client.post.mockResolvedValueOnce({ status: 200 });
      mockWaitForPhotoComplete.mockResolvedValueOnce(
        "/DCIM/100CANON/IMG_0001.JPG",
      );

      mockExiftool.read.mockResolvedValueOnce({ ISO: 6400 });

      await testPhotoService.capturePhoto(false);

      // Verify axios download was called with 120s timeout (2 minutes for large CR3 files)
      expect(mockAxios.get).toHaveBeenCalledWith(
        expect.stringContaining("/DCIM/100CANON/IMG_0001.JPG"),
        expect.objectContaining({
          timeout: 120000, // 2 minutes for large CR3 files
          responseType: "arraybuffer",
        }),
      );
    });

    test("should handle RAW-only mode by enabling JPEG and disabling RAW (useCurrentSettings=false)", async () => {
      // Camera is in RAW-only mode (jpeg is null/undefined/off)
      mockCameraController.client.get.mockResolvedValueOnce({
        status: 200,
        data: {
          stillimagequality: {
            value: { jpeg: null, raw: "raw" }, // RAW-only mode
            ability: {
              jpeg: ["large_fine", "medium_fine", "small_fine", "small2"],
              raw: ["off", "raw"],
            },
          },
        },
      });

      // Mock set quality to smallest JPEG with RAW disabled
      mockCameraController.client.put.mockResolvedValueOnce({
        status: 200,
        data: {},
      });

      mockCameraController.client.post.mockResolvedValueOnce({ status: 200 });
      mockWaitForPhotoComplete.mockResolvedValueOnce(
        "/DCIM/100CANON/IMG_0001.JPG",
      );

      // Mock file size retrieval
      mockCameraController.client.get.mockResolvedValueOnce({
        status: 200,
        data: { filesize: 12345 },
      });

      // Mock download photo
      mockCameraController.client.get.mockResolvedValueOnce({
        status: 200,
        data: Buffer.from("fake-jpeg-data"),
      });

      // Mock restore quality setting
      mockCameraController.client.put.mockResolvedValueOnce({
        status: 200,
        data: {},
      });

      mockExiftool.read.mockResolvedValueOnce({
        ISO: 6400,
        DateTimeOriginal: new Date("2025-10-02T12:30:00"),
      });

      const result = await testPhotoService.capturePhoto(false);

      // Verify quality was set to smallest JPEG with RAW turned off
      expect(mockCameraController.client.put).toHaveBeenNthCalledWith(
        1,
        `${mockCameraController.baseUrl}/ccapi/ver110/shooting/settings/stillimagequality`,
        { value: { jpeg: "small2", raw: "none" } },
      );

      // Verify quality was restored to original RAW-only settings
      expect(mockCameraController.client.put).toHaveBeenNthCalledWith(
        2,
        `${mockCameraController.baseUrl}/ccapi/ver110/shooting/settings/stillimagequality`,
        { value: { jpeg: null, raw: "raw" } },
      );

      // Verify photo capture succeeded
      expect(result.id).toBe(1);
    });

    test("should handle RAW-only mode with jpeg='off' by enabling smallest JPEG", async () => {
      // Camera is in RAW-only mode (jpeg is "off" string)
      mockCameraController.client.get.mockResolvedValueOnce({
        status: 200,
        data: {
          stillimagequality: {
            value: { jpeg: "off", raw: "raw" }, // RAW-only mode with "off" string
            ability: {
              jpeg: ["off", "large_fine", "small2"],
              raw: ["off", "raw"],
            },
          },
        },
      });

      mockCameraController.client.put.mockResolvedValueOnce({ status: 200 });
      mockCameraController.client.post.mockResolvedValueOnce({ status: 200 });
      mockWaitForPhotoComplete.mockResolvedValueOnce(
        "/DCIM/100CANON/IMG_0001.JPG",
      );

      mockCameraController.client.get.mockResolvedValueOnce({
        status: 200,
        data: { filesize: 12345 },
      });

      mockCameraController.client.get.mockResolvedValueOnce({
        status: 200,
        data: Buffer.from("fake-jpeg-data"),
      });

      mockCameraController.client.put.mockResolvedValueOnce({ status: 200 });
      mockExiftool.read.mockResolvedValueOnce({
        ISO: 6400,
        DateTimeOriginal: new Date("2025-10-02T12:30:00"),
      });

      await testPhotoService.capturePhoto(false);

      // Verify quality was set to smallest JPEG with RAW turned off
      expect(mockCameraController.client.put).toHaveBeenNthCalledWith(
        1,
        `${mockCameraController.baseUrl}/ccapi/ver110/shooting/settings/stillimagequality`,
        { value: { jpeg: "small2", raw: "none" } },
      );

      // Verify original settings were restored
      expect(mockCameraController.client.put).toHaveBeenNthCalledWith(
        2,
        `${mockCameraController.baseUrl}/ccapi/ver110/shooting/settings/stillimagequality`,
        { value: { jpeg: "off", raw: "raw" } },
      );
    });

    test("should successfully handle CR3 (RAW) files with exiftool", async () => {
      // Use current settings (RAW-only mode)
      mockCameraController.client.post.mockResolvedValueOnce({ status: 200 });
      mockWaitForPhotoComplete.mockResolvedValueOnce(
        "/DCIM/100CANON/IMG_0001.CR3", // CR3 file returned
      );

      // Mock file size
      mockCameraController.client.get.mockResolvedValueOnce({
        status: 200,
        data: { filesize: 25000000 }, // 25MB RAW file
      });

      // Mock download CR3 file
      mockCameraController.client.get.mockResolvedValueOnce({
        status: 200,
        data: Buffer.from("fake-cr3-raw-data"),
      });

      // Mock exiftool successful extraction from CR3 file
      mockExiftool.read.mockResolvedValueOnce({
        ISO: 6400,
        ExposureTime: 30,
        ShutterSpeedValue: "30",
        FNumber: 2.8,
        WhiteBalance: "Auto",
        DateTimeOriginal: new Date("2025-10-02T12:30:00"),
        Model: "Canon EOS R50",
        FileType: "CR3",
      });

      const result = await testPhotoService.capturePhoto(true);

      // Verify CR3 file was successfully processed
      expect(result).toBeDefined();
      expect(result.exif.ISO).toBe(6400);
      expect(result.exif.Model).toBe("Canon EOS R50");
      expect(result.filename).toContain("IMG_0001.CR3");
    });

    test("should handle RAW+JPEG mode without changing RAW setting (useCurrentSettings=false)", async () => {
      // Camera is in RAW+JPEG mode
      mockCameraController.client.get.mockResolvedValueOnce({
        status: 200,
        data: {
          stillimagequality: {
            value: { jpeg: "large_fine", raw: "raw" }, // RAW+JPEG mode
            ability: {
              jpeg: ["large_fine", "medium_fine", "small2"],
              raw: ["off", "raw"],
            },
          },
        },
      });

      mockCameraController.client.put.mockResolvedValueOnce({ status: 200 });
      mockCameraController.client.post.mockResolvedValueOnce({ status: 200 });
      mockWaitForPhotoComplete.mockResolvedValueOnce(
        "/DCIM/100CANON/IMG_0001.JPG",
      );

      mockCameraController.client.get.mockResolvedValueOnce({
        status: 200,
        data: { filesize: 12345 },
      });

      mockCameraController.client.get.mockResolvedValueOnce({
        status: 200,
        data: Buffer.from("fake-jpeg-data"),
      });

      mockCameraController.client.put.mockResolvedValueOnce({ status: 200 });
      mockExiftool.read.mockResolvedValueOnce({
        ISO: 6400,
        DateTimeOriginal: new Date("2025-10-02T12:30:00"),
      });

      await testPhotoService.capturePhoto(false);

      // Verify quality was set to smallest JPEG with RAW turned OFF
      // (to avoid downloading large RAW files)
      expect(mockCameraController.client.put).toHaveBeenNthCalledWith(
        1,
        `${mockCameraController.baseUrl}/ccapi/ver110/shooting/settings/stillimagequality`,
        { value: { jpeg: "small2", raw: "none" } },
      );

      // Verify original RAW+JPEG settings were restored
      expect(mockCameraController.client.put).toHaveBeenNthCalledWith(
        2,
        `${mockCameraController.baseUrl}/ccapi/ver110/shooting/settings/stillimagequality`,
        { value: { jpeg: "large_fine", raw: "raw" } },
      );
    });

    test("should handle JPEG-only mode by NOT including 'raw' property (useCurrentSettings=false)", async () => {
      // Camera is in JPEG-only mode (no 'raw' property in value)
      mockCameraController.client.get.mockResolvedValueOnce({
        status: 200,
        data: {
          stillimagequality: {
            value: { jpeg: "large_fine" }, // JPEG-only mode - no 'raw' property
            ability: {
              jpeg: ["large_fine", "medium_fine", "small2"],
            },
          },
        },
      });

      mockCameraController.client.put.mockResolvedValueOnce({ status: 200 });
      mockCameraController.client.post.mockResolvedValueOnce({ status: 200 });
      mockWaitForPhotoComplete.mockResolvedValueOnce(
        "/DCIM/100CANON/IMG_0001.JPG",
      );

      mockCameraController.client.get.mockResolvedValueOnce({
        status: 200,
        data: { filesize: 12345 },
      });

      mockCameraController.client.get.mockResolvedValueOnce({
        status: 200,
        data: Buffer.from("fake-jpeg-data"),
      });

      mockCameraController.client.put.mockResolvedValueOnce({ status: 200 });
      mockExiftool.read.mockResolvedValueOnce({
        ISO: 6400,
        DateTimeOriginal: new Date("2025-10-02T12:30:00"),
      });

      await testPhotoService.capturePhoto(false);

      // Verify quality was set to smallest JPEG WITHOUT 'raw' property
      // (because original settings didn't have it - JPEG-only mode)
      expect(mockCameraController.client.put).toHaveBeenNthCalledWith(
        1,
        `${mockCameraController.baseUrl}/ccapi/ver110/shooting/settings/stillimagequality`,
        { value: { jpeg: "small2" } }, // NO 'raw' property!
      );

      // Verify original JPEG-only settings were restored (no 'raw' property)
      expect(mockCameraController.client.put).toHaveBeenNthCalledWith(
        2,
        `${mockCameraController.baseUrl}/ccapi/ver110/shooting/settings/stillimagequality`,
        { value: { jpeg: "large_fine" } }, // NO 'raw' property!
      );
    });
  });

  describe("listPhotos()", () => {
    test("should return empty array initially", () => {
      const photos = testPhotoService.listPhotos();
      expect(photos).toEqual([]);
    });

    test("should return list of photos", () => {
      testPhotoService.photos = [
        {
          id: 1,
          filename: "20251002_193000_IMG_0001.JPG",
          url: "/api/camera/photos/test/1",
          exif: { ISO: 6400 },
        },
        {
          id: 2,
          filename: "20251002_193100_IMG_0002.JPG",
          url: "/api/camera/photos/test/2",
          exif: { ISO: 3200 },
        },
      ];

      const photos = testPhotoService.listPhotos();
      expect(photos).toHaveLength(2);
      expect(photos[0].id).toBe(1);
      expect(photos[1].id).toBe(2);
    });
  });

  describe("getPhoto()", () => {
    beforeEach(() => {
      testPhotoService.photos = [
        {
          id: 1,
          filename: "20251002_193000_IMG_0001.JPG",
          filepath: "/data/test-shots/photos/20251002_193000_IMG_0001.JPG",
        },
        {
          id: 2,
          filename: "20251002_193100_IMG_0002.JPG",
          filepath: "/data/test-shots/photos/20251002_193100_IMG_0002.JPG",
        },
      ];
    });

    test("should return photo by ID", () => {
      const photo = testPhotoService.getPhoto(1);
      expect(photo).toMatchObject({ id: 1 });
    });

    test("should return undefined for non-existent ID", () => {
      const photo = testPhotoService.getPhoto(999);
      expect(photo).toBeUndefined();
    });
  });

  describe("deletePhoto()", () => {
    test("should delete photo by ID", async () => {
      testPhotoService.photos = [
        {
          id: 1,
          filepath: "/data/test-shots/photos/20251002_193000_IMG_0001.JPG",
        },
      ];

      // Mock fs.unlink
      jest.spyOn(fs, "unlink").mockResolvedValueOnce(undefined);

      const result = await testPhotoService.deletePhoto(1);

      expect(result).toBe(true);
      expect(testPhotoService.photos).toHaveLength(0);
    });

    test("should return false for non-existent ID", async () => {
      const result = await testPhotoService.deletePhoto(999);
      expect(result).toBe(false);
    });
  });
});
