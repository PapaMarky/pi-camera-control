/**
 * Test Photo Service Tests
 *
 * Tests for the TestPhotoService class that handles test photo capture with EXIF extraction.
 * Following TDD: These tests should fail initially until implementation is complete.
 */

import { jest } from "@jest/globals";
import fs from "fs/promises";

// Mock fs operations
jest.spyOn(fs, "mkdir").mockResolvedValue(undefined);
jest.spyOn(fs, "writeFile").mockResolvedValue(undefined);

// Mock event polling utility
const mockWaitForPhotoComplete = jest.fn();
jest.unstable_mockModule("../../src/utils/event-polling.js", () => ({
  waitForPhotoComplete: mockWaitForPhotoComplete,
}));

// Mock exifr library
const mockExifr = {
  parse: jest.fn(),
};
jest.unstable_mockModule("exifr", () => ({
  default: mockExifr,
}));

describe("TestPhotoService", () => {
  let TestPhotoService;
  let testPhotoService;
  let mockCameraController;

  beforeAll(async () => {
    // Dynamic import to allow mocking
    const module = await import("../../src/camera/test-photo.js");
    TestPhotoService = module.TestPhotoService;
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock camera controller
    mockCameraController = {
      client: {
        get: jest.fn(),
        put: jest.fn(),
        post: jest.fn(),
      },
      baseUrl: "https://192.168.12.98:443",
      connected: true,
    };

    // Create fresh instance with getter function
    testPhotoService = new TestPhotoService(() => mockCameraController);
  });

  describe("Constructor", () => {
    test("should initialize with camera controller getter", () => {
      expect(testPhotoService.getController()).toBe(mockCameraController);
      expect(testPhotoService.photos).toEqual([]);
      expect(testPhotoService.photoId).toBe(1);
    });
  });

  describe("capturePhoto()", () => {
    test("should capture test photo with EXIF metadata successfully", async () => {
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

      // Mock download photo
      const mockImageData = Buffer.from("fake-jpeg-data");
      mockCameraController.client.get.mockResolvedValueOnce({
        status: 200,
        data: mockImageData,
      });

      // Mock restore quality setting
      mockCameraController.client.put.mockResolvedValueOnce({
        status: 200,
        data: {},
      });

      // Mock EXIF extraction - use local time to avoid timezone issues in tests
      mockExifr.parse.mockResolvedValueOnce({
        ISO: 6400,
        ShutterSpeed: "30",
        FNumber: 2.8,
        WhiteBalance: "Auto",
        DateTimeOriginal: new Date("2025-10-02T12:30:00"), // Local time
        Model: "Canon EOS R50",
      });

      const result = await testPhotoService.capturePhoto();

      // Verify quality was set to smallest (ver110 endpoint with jpeg/raw structure)
      expect(mockCameraController.client.put).toHaveBeenNthCalledWith(
        1,
        `${mockCameraController.baseUrl}/ccapi/ver110/shooting/settings/stillimagequality`,
        { value: { jpeg: "small2", raw: "off" } },
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

      // Verify photo was downloaded
      expect(mockCameraController.client.get).toHaveBeenCalledWith(
        `${mockCameraController.baseUrl}/DCIM/100CANON/IMG_0001.JPG`,
        { responseType: "arraybuffer", timeout: 30000 },
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
        exif: {
          ISO: 6400,
          ShutterSpeed: "30",
          FNumber: 2.8,
          WhiteBalance: "Auto",
          DateTimeOriginal: expect.any(Date),
          Model: "Canon EOS R50",
        },
      });

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
      mockCameraController.client.get.mockResolvedValueOnce({
        status: 200,
        data: Buffer.from("fake-jpeg-data"),
      });

      // Mock EXIF without date
      mockExifr.parse.mockResolvedValueOnce({
        ISO: 6400,
        // No DateTimeOriginal
      });

      const result = await testPhotoService.capturePhoto();

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

      // Mock download failure
      mockCameraController.client.get.mockRejectedValueOnce(
        new Error("Download failed"),
      );

      // Mock restore quality (should still be called)
      mockCameraController.client.put.mockResolvedValueOnce({ status: 200 });

      await expect(testPhotoService.capturePhoto()).rejects.toThrow(
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

      await expect(testPhotoService.capturePhoto()).rejects.toThrow(
        "Timeout waiting for photo completion",
      );

      // Verify quality was restored (ver110 structure)
      expect(mockCameraController.client.put).toHaveBeenCalledWith(
        expect.any(String),
        { value: { jpeg: "large_fine", raw: "off" } },
      );
    });

    test("should increment photo ID for each capture", async () => {
      // Setup mocks for two successful captures
      const setupSuccessfulCapture = () => {
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
        mockCameraController.client.get.mockResolvedValueOnce({
          status: 200,
          data: Buffer.from("fake-jpeg-data"),
        });
        mockExifr.parse.mockResolvedValueOnce({
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
