/**
 * Camera Storage API Tests
 *
 * Tests for SD card storage information via Canon CCAPI
 */

import { jest } from "@jest/globals";
import axios from "axios";
import { CameraController } from "../../src/camera/controller.js";

// Mock axios
const mockClient = {
  get: jest.fn(),
  put: jest.fn(),
  post: jest.fn(),
};

jest.mock("axios", () => ({
  default: {
    create: jest.fn(() => mockClient),
  },
}));

// Mock logger
jest.mock("../../src/utils/logger.js", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

describe("Camera Storage CCAPI", () => {
  let controller;

  beforeEach(() => {
    mockClient.get.mockClear();
    mockClient.put.mockClear();
    mockClient.post.mockClear();

    controller = new CameraController("192.168.4.3", 443);
    controller.connected = true; // Mock as connected
    controller.baseUrl = "https://192.168.4.3:443";
    controller.client = mockClient;
  });

  describe("getStorageInfo", () => {
    test("should return storage info when camera connected with SD card mounted", async () => {
      // Mock successful response with storage data
      // Based on Canon CCAPI specification for devicestatus/storage
      mockClient.get.mockResolvedValue({
        status: 200,
        data: {
          storagelist: [
            {
              name: "SD1",
              url: "http://192.168.4.3:8080/ccapi/ver110/contents/sd",
              maxsize: 64424509440, // 60GB in bytes
              spacesize: 32212254720, // 30GB free in bytes
              contentsnumber: 1234,
              accesscapability: "readwrite",
            },
          ],
        },
      });

      const result = await controller.getStorageInfo();

      // Should call the correct CCAPI endpoint
      expect(mockClient.get).toHaveBeenCalledWith(
        "https://192.168.4.3:443/ccapi/ver110/devicestatus/storage",
      );

      // Verify all fields are present and calculated correctly
      expect(result).toEqual({
        mounted: true,
        name: "SD1",
        totalBytes: 64424509440,
        freeBytes: 32212254720,
        usedBytes: 32212254720, // totalBytes - freeBytes
        totalMB: 61440, // Math.round(64424509440 / 1024 / 1024)
        freeMB: 30720, // Math.round(32212254720 / 1024 / 1024)
        usedMB: 30720, // Math.round(32212254720 / 1024 / 1024)
        percentUsed: 50, // Math.round((32212254720 / 64424509440) * 100)
        contentCount: 1234,
        accessMode: "readwrite",
      });
    });

    test("should calculate MB correctly from bytes", async () => {
      mockClient.get.mockResolvedValue({
        status: 200,
        data: {
          storagelist: [
            {
              name: "SD1",
              url: "http://192.168.4.3:8080/ccapi/ver110/contents/sd",
              maxsize: 128849018880, // 120GB
              spacesize: 107374182400, // 100GB free
              contentsnumber: 500,
              accesscapability: "readwrite",
            },
          ],
        },
      });

      const result = await controller.getStorageInfo();

      // Verify MB calculations (bytes / 1024 / 1024)
      expect(result.totalMB).toBe(122880); // Math.round(128849018880 / 1024 / 1024)
      expect(result.freeMB).toBe(102400); // Math.round(107374182400 / 1024 / 1024)
      expect(result.usedMB).toBe(20480); // Math.round(21474836480 / 1024 / 1024)
    });

    test("should calculate percentage used correctly", async () => {
      mockClient.get.mockResolvedValue({
        status: 200,
        data: {
          storagelist: [
            {
              name: "SD1",
              url: "http://192.168.4.3:8080/ccapi/ver110/contents/sd",
              maxsize: 100000000, // 100MB total
              spacesize: 25000000, // 25MB free
              contentsnumber: 100,
              accesscapability: "readwrite",
            },
          ],
        },
      });

      const result = await controller.getStorageInfo();

      // Used = 100MB - 25MB = 75MB
      // Percentage = (75 / 100) * 100 = 75%
      expect(result.percentUsed).toBe(75);
    });

    test("should return mounted:false when no SD card present", async () => {
      // Mock response with empty storagelist (no SD card inserted)
      mockClient.get.mockResolvedValue({
        status: 200,
        data: {
          storagelist: [],
        },
      });

      const result = await controller.getStorageInfo();

      // Should call the endpoint
      expect(mockClient.get).toHaveBeenCalledWith(
        "https://192.168.4.3:443/ccapi/ver110/devicestatus/storage",
      );

      // Verify mounted: false and all numeric fields are 0
      expect(result).toEqual({
        mounted: false,
        name: null,
        totalBytes: 0,
        freeBytes: 0,
        usedBytes: 0,
        totalMB: 0,
        freeMB: 0,
        usedMB: 0,
        percentUsed: 0,
        contentCount: 0,
        accessMode: null,
      });
    });

    test("should throw error when camera not connected", async () => {
      controller.connected = false;

      await expect(controller.getStorageInfo()).rejects.toThrow(
        "Camera not connected",
      );

      // Should not make API call if not connected
      expect(mockClient.get).not.toHaveBeenCalled();
    });

    test("should handle invalid CCAPI response without storagelist field", async () => {
      // Mock invalid response (missing storagelist field)
      mockClient.get.mockResolvedValue({
        status: 200,
        data: {
          // Missing storagelist field
        },
      });

      await expect(controller.getStorageInfo()).rejects.toThrow(
        "Invalid storage response from camera",
      );
    });

    test("should handle invalid CCAPI response with null data", async () => {
      // Mock invalid response (null data)
      mockClient.get.mockResolvedValue({
        status: 200,
        data: null,
      });

      await expect(controller.getStorageInfo()).rejects.toThrow(
        "Invalid storage response from camera",
      );
    });

    test("should handle CCAPI network error gracefully", async () => {
      // Mock network error
      const networkError = new Error("Network timeout");
      networkError.response = {
        status: 503,
        data: { message: "Service Unavailable" },
      };
      mockClient.get.mockRejectedValue(networkError);

      await expect(controller.getStorageInfo()).rejects.toThrow();
    });

    test("should handle CCAPI 404 error (endpoint not found)", async () => {
      // Mock 404 error
      const notFoundError = new Error("Not Found");
      notFoundError.response = {
        status: 404,
        data: { message: "Endpoint not found" },
      };
      mockClient.get.mockRejectedValue(notFoundError);

      await expect(controller.getStorageInfo()).rejects.toThrow();
    });

    test("should handle CCAPI 500 error (internal camera error)", async () => {
      // Mock camera internal error
      const serverError = new Error("Internal Server Error");
      serverError.response = {
        status: 500,
        data: { message: "Camera internal error" },
      };
      mockClient.get.mockRejectedValue(serverError);

      await expect(controller.getStorageInfo()).rejects.toThrow();
    });

    test("should handle single storage slot correctly (EOS R50 has one card slot)", async () => {
      // EOS R50 has single SD card slot
      mockClient.get.mockResolvedValue({
        status: 200,
        data: {
          storagelist: [
            {
              name: "SD",
              url: "http://192.168.4.3:8080/ccapi/ver110/contents/sd",
              maxsize: 32000000000, // 32GB
              spacesize: 16000000000, // 16GB free
              contentsnumber: 500,
              accesscapability: "readwrite",
            },
          ],
        },
      });

      const result = await controller.getStorageInfo();

      // Should use first (and only) storage from list
      expect(result.mounted).toBe(true);
      expect(result.name).toBe("SD");
    });

    test("should handle readonly access mode", async () => {
      mockClient.get.mockResolvedValue({
        status: 200,
        data: {
          storagelist: [
            {
              name: "SD1",
              url: "http://192.168.4.3:8080/ccapi/ver110/contents/sd",
              maxsize: 64424509440,
              spacesize: 32212254720,
              contentsnumber: 1234,
              accesscapability: "readonly", // Card is write-protected
            },
          ],
        },
      });

      const result = await controller.getStorageInfo();

      expect(result.accessMode).toBe("readonly");
    });

    test("should handle very small storage (edge case)", async () => {
      mockClient.get.mockResolvedValue({
        status: 200,
        data: {
          storagelist: [
            {
              name: "SD1",
              url: "http://192.168.4.3:8080/ccapi/ver110/contents/sd",
              maxsize: 1048576, // 1MB total
              spacesize: 524288, // 0.5MB free
              contentsnumber: 10,
              accesscapability: "readwrite",
            },
          ],
        },
      });

      const result = await controller.getStorageInfo();

      // Should calculate correctly even with small values
      expect(result.totalMB).toBe(1); // Math.round(1048576 / 1024 / 1024)
      expect(result.freeMB).toBe(1); // Math.round(524288 / 1024 / 1024) = 0.5, rounds to 1
      expect(result.percentUsed).toBe(50);
    });

    test("should handle full storage (100% used)", async () => {
      mockClient.get.mockResolvedValue({
        status: 200,
        data: {
          storagelist: [
            {
              name: "SD1",
              url: "http://192.168.4.3:8080/ccapi/ver110/contents/sd",
              maxsize: 64424509440,
              spacesize: 0, // No free space
              contentsnumber: 5000,
              accesscapability: "readwrite",
            },
          ],
        },
      });

      const result = await controller.getStorageInfo();

      expect(result.freeBytes).toBe(0);
      expect(result.freeMB).toBe(0);
      expect(result.percentUsed).toBe(100);
    });

    test("should handle empty storage (0% used)", async () => {
      mockClient.get.mockResolvedValue({
        status: 200,
        data: {
          storagelist: [
            {
              name: "SD1",
              url: "http://192.168.4.3:8080/ccapi/ver110/contents/sd",
              maxsize: 64424509440,
              spacesize: 64424509440, // All space free
              contentsnumber: 0,
              accesscapability: "readwrite",
            },
          ],
        },
      });

      const result = await controller.getStorageInfo();

      expect(result.usedBytes).toBe(0);
      expect(result.usedMB).toBe(0);
      expect(result.percentUsed).toBe(0);
      expect(result.contentCount).toBe(0);
    });
  });
});
