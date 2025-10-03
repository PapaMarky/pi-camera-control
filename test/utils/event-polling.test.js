/**
 * Event Polling Utility Tests
 *
 * Tests for the CCAPI event polling utility that waits for photo completion events.
 * Following TDD: These tests should fail initially until implementation is complete.
 */

import { jest } from "@jest/globals";

describe("EventPollingUtility", () => {
  let waitForPhotoComplete;
  let mockCameraController;

  beforeAll(async () => {
    // Dynamic import to allow mocking
    const module = await import("../../src/utils/event-polling.js");
    waitForPhotoComplete = module.waitForPhotoComplete;
  });

  beforeEach(() => {
    // Mock camera controller
    mockCameraController = {
      client: {
        get: jest.fn(),
      },
      baseUrl: "https://192.168.12.98:443",
      connected: true,
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("waitForPhotoComplete()", () => {
    test("should wait for addedcontents event and return file path", async () => {
      // Mock successful event polling response with addedcontents
      mockCameraController.client.get.mockResolvedValueOnce({
        status: 200,
        data: {
          addedcontents: ["/DCIM/100CANON/IMG_0001.JPG"],
        },
      });

      const filePath = await waitForPhotoComplete(mockCameraController);

      // Verify event polling was called with correct parameters (ver110)
      expect(mockCameraController.client.get).toHaveBeenCalledWith(
        `${mockCameraController.baseUrl}/ccapi/ver110/event/polling`,
        expect.objectContaining({
          params: { timeout: "long" },
          timeout: expect.any(Number),
        }),
      );

      // Verify correct file path was returned
      expect(filePath).toBe("/DCIM/100CANON/IMG_0001.JPG");
    });

    test("should use custom timeout when provided", async () => {
      mockCameraController.client.get.mockResolvedValueOnce({
        status: 200,
        data: {
          addedcontents: ["/DCIM/100CANON/IMG_0001.JPG"],
        },
      });

      const customTimeout = 60000; // 60 seconds
      await waitForPhotoComplete(mockCameraController, customTimeout);

      expect(mockCameraController.client.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          timeout: customTimeout,
        }),
      );
    });

    test("should use default timeout of 35 seconds when not provided", async () => {
      mockCameraController.client.get.mockResolvedValueOnce({
        status: 200,
        data: {
          addedcontents: ["/DCIM/100CANON/IMG_0001.JPG"],
        },
      });

      await waitForPhotoComplete(mockCameraController);

      expect(mockCameraController.client.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          timeout: 35000, // 30s max shutter + 5s margin
        }),
      );
    });

    test("should throw error when timeout occurs", async () => {
      // Mock timeout error
      const timeoutError = new Error("timeout of 35000ms exceeded");
      timeoutError.code = "ECONNABORTED";
      mockCameraController.client.get.mockRejectedValueOnce(timeoutError);

      await expect(waitForPhotoComplete(mockCameraController)).rejects.toThrow(
        "Timeout waiting for photo completion (35000ms)",
      );
    });

    test("should throw error when camera disconnects during polling", async () => {
      const disconnectError = new Error("Network Error");
      disconnectError.code = "ECONNREFUSED";
      mockCameraController.client.get.mockRejectedValueOnce(disconnectError);

      await expect(waitForPhotoComplete(mockCameraController)).rejects.toThrow(
        "Camera disconnected during photo capture",
      );
    });

    test("should throw error when CCAPI returns error status", async () => {
      const apiError = new Error("Request failed with status code 503");
      apiError.response = {
        status: 503,
        data: { message: "Camera is busy" },
      };
      mockCameraController.client.get.mockRejectedValueOnce(apiError);

      await expect(waitForPhotoComplete(mockCameraController)).rejects.toThrow(
        "Camera is busy",
      );
    });

    test("should throw error when no addedcontents in response", async () => {
      // Mock response without addedcontents
      mockCameraController.client.get.mockResolvedValueOnce({
        status: 200,
        data: {
          // No addedcontents field
          someOtherEvent: "value",
        },
      });

      await expect(waitForPhotoComplete(mockCameraController)).rejects.toThrow(
        "No photo path in event response",
      );
    });

    test("should throw error when addedcontents is empty array", async () => {
      mockCameraController.client.get.mockResolvedValueOnce({
        status: 200,
        data: {
          addedcontents: [], // Empty array
        },
      });

      await expect(waitForPhotoComplete(mockCameraController)).rejects.toThrow(
        "No photo path in event response",
      );
    });

    test("should handle multiple files and return first one", async () => {
      mockCameraController.client.get.mockResolvedValueOnce({
        status: 200,
        data: {
          addedcontents: [
            "/DCIM/100CANON/IMG_0001.JPG",
            "/DCIM/100CANON/IMG_0001.CR3", // RAW file
          ],
        },
      });

      const filePath = await waitForPhotoComplete(mockCameraController);
      expect(filePath).toBe("/DCIM/100CANON/IMG_0001.JPG");
    });

    test("should throw error when camera controller is null", async () => {
      await expect(waitForPhotoComplete(null)).rejects.toThrow(
        "Camera controller is required",
      );
    });

    test("should throw error when camera controller is undefined", async () => {
      await expect(waitForPhotoComplete(undefined)).rejects.toThrow(
        "Camera controller is required",
      );
    });
  });
});
