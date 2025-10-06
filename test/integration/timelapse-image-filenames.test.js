/**
 * Timelapse Image Filename Tracking Test
 *
 * Tests that timelapse sessions correctly track the first and last image filenames
 * captured during a session for use in video generation workflows.
 *
 * Following TDD: These tests define expected behavior.
 */

import { jest } from "@jest/globals";
import { TimelapseSession } from "../../src/intervalometer/timelapse-session.js";
import { IntervalometerStateManager } from "../../src/intervalometer/state-manager.js";

describe("Timelapse Image Filename Tracking", () => {
  let mockCameraController;
  let session;
  let stateManager;

  beforeEach(() => {
    // Create mock camera controller
    mockCameraController = {
      getConnectionStatus: jest.fn(() => ({ connected: true })),
      getDeviceInformation: jest.fn(() => ({
        productname: "EOS R50",
        serialnumber: "123456",
      })),
      getCameraSettings: jest.fn(() => ({ av: "5.6", tv: "1/60", iso: "100" })),
      validateInterval: jest.fn(() => ({ valid: true })),
      pauseInfoPolling: jest.fn(),
      pauseConnectionMonitoring: jest.fn(),
      resumeInfoPolling: jest.fn(),
      resumeConnectionMonitoring: jest.fn(),

      // Mock takePhoto
      takePhoto: jest.fn(async () => {
        return Promise.resolve();
      }),

      // Mock for event polling - returns different filenames per call
      client: {
        get: jest.fn(),
      },
      baseUrl: "https://192.168.4.2:443",
    };

    // Create state manager for report testing
    stateManager = new IntervalometerStateManager();
  });

  afterEach(async () => {
    if (session) {
      await session.cleanup();
      session = null;
    }
    if (stateManager) {
      await stateManager.cleanup();
      stateManager = null;
    }
    jest.clearAllMocks();
  });

  describe("Image Filename Stats Initialization", () => {
    test("initializes image filename fields in constructor", () => {
      session = new TimelapseSession(() => mockCameraController, {
        interval: 30,
      });

      const status = session.getStatus();

      // EXPECTED: New image filename fields should exist
      expect(status.stats).toHaveProperty("firstImageName");
      expect(status.stats).toHaveProperty("lastImageName");

      // EXPECTED: Initial values should be null
      expect(status.stats.firstImageName).toBeNull();
      expect(status.stats.lastImageName).toBeNull();
    });

    test("resets image filename fields when session starts", async () => {
      session = new TimelapseSession(() => mockCameraController, {
        interval: 30,
        totalShots: 1,
      });

      // Manually set values to simulate previous state
      session.stats.firstImageName = "OLD_IMG.JPG";
      session.stats.lastImageName = "OLD_IMG.JPG";

      // Mock event polling response
      mockCameraController.client.get.mockResolvedValue({
        status: 200,
        data: {
          addedcontents: ["/ccapi/ver110/contents/sd/100CANON/IMG_0001.JPG"],
        },
      });

      await session.start();
      await new Promise((resolve) => setTimeout(resolve, 200));

      const status = session.getStatus();

      // EXPECTED: Fields should be reset and then updated with first captured image
      // After taking the first shot, both should be "IMG_0001.JPG"
      expect(status.stats.firstImageName).toBe("IMG_0001.JPG");
      expect(status.stats.lastImageName).toBe("IMG_0001.JPG");
    });
  });

  describe("First Image Capture", () => {
    test("captures first image filename from CCAPI path", async () => {
      session = new TimelapseSession(() => mockCameraController, {
        interval: 30,
        totalShots: 1,
      });

      // Mock event polling to return a specific image path
      mockCameraController.client.get.mockResolvedValue({
        status: 200,
        data: {
          addedcontents: ["/ccapi/ver110/contents/sd/100CANON/IMG_0042.JPG"],
        },
      });

      await session.start();
      await new Promise((resolve) => setTimeout(resolve, 200));

      const status = session.getStatus();

      // EXPECTED: First image filename should be extracted from CCAPI path
      expect(status.stats.firstImageName).toBe("IMG_0042.JPG");
      expect(status.stats.lastImageName).toBe("IMG_0042.JPG");
    });

    test("extracts filename correctly from various path formats", async () => {
      session = new TimelapseSession(() => mockCameraController, {
        interval: 30,
        totalShots: 1,
      });

      // Test with different CCAPI path formats
      const testPaths = [
        {
          path: "/ccapi/ver110/contents/sd/100CANON/IMG_1234.JPG",
          expected: "IMG_1234.JPG",
        },
        {
          path: "/ccapi/ver110/contents/sd/100CANON/CR3_5678.CR3",
          expected: "CR3_5678.CR3",
        },
        {
          path: "/ccapi/ver110/contents/sd/DCIM/100EOS/IMG_0001.JPG",
          expected: "IMG_0001.JPG",
        },
      ];

      for (const { path, expected } of testPaths) {
        // Reset session for each test
        session.stats.firstImageName = null;
        session.stats.lastImageName = null;
        session.stats.shotsTaken = 0;
        session.stats.shotsSuccessful = 0;

        mockCameraController.client.get.mockResolvedValue({
          status: 200,
          data: {
            addedcontents: [path],
          },
        });

        await session.start();
        await new Promise((resolve) => setTimeout(resolve, 200));
        await session.stop();

        const status = session.getStatus();
        expect(status.stats.firstImageName).toBe(expected);
        expect(status.stats.lastImageName).toBe(expected);
      }
    });
  });

  describe("Multiple Image Captures", () => {
    test("updates lastImageName while preserving firstImageName", async () => {
      session = new TimelapseSession(() => mockCameraController, {
        interval: 1, // Short interval for faster test
        totalShots: 3,
      });

      // Mock event polling to return different images sequentially
      let callCount = 0;
      const imagePaths = [
        "/ccapi/ver110/contents/sd/100CANON/IMG_0010.JPG",
        "/ccapi/ver110/contents/sd/100CANON/IMG_0011.JPG",
        "/ccapi/ver110/contents/sd/100CANON/IMG_0012.JPG",
      ];

      mockCameraController.client.get.mockImplementation(() => {
        const path = imagePaths[callCount % imagePaths.length];
        callCount++;
        return Promise.resolve({
          status: 200,
          data: {
            addedcontents: [path],
          },
        });
      });

      await session.start();

      // Wait for all shots to complete
      await new Promise((resolve) => setTimeout(resolve, 4000));

      const status = session.getStatus();

      // EXPECTED: First image should remain unchanged
      expect(status.stats.firstImageName).toBe("IMG_0010.JPG");

      // EXPECTED: Last image should be the most recent
      expect(status.stats.lastImageName).toBe("IMG_0012.JPG");

      // Verify shot count
      expect(status.stats.shotsTaken).toBe(3);
    }, 10000);
  });

  describe("Report Generation", () => {
    test("includes image filenames in generated report", async () => {
      // Create a session through state manager
      session = await stateManager.createSession(() => mockCameraController, {
        interval: 30,
        totalShots: 1,
        title: "Test Session",
      });

      // Mock event polling
      mockCameraController.client.get.mockResolvedValue({
        status: 200,
        data: {
          addedcontents: ["/ccapi/ver110/contents/sd/100CANON/IMG_9999.JPG"],
        },
      });

      await session.start();
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Generate report
      const report = stateManager.generateSessionReport(session, {
        reason: "Test completion",
      });

      // EXPECTED: Report should include image filenames in results
      expect(report.results).toHaveProperty("firstImageName");
      expect(report.results).toHaveProperty("lastImageName");
      expect(report.results.firstImageName).toBe("IMG_9999.JPG");
      expect(report.results.lastImageName).toBe("IMG_9999.JPG");
    });

    test("includes null values when no images captured", async () => {
      // Create a session that will fail immediately
      session = await stateManager.createSession(() => mockCameraController, {
        interval: 30,
        totalShots: 1,
        title: "Failed Session",
      });

      // Mock event polling to timeout (no images captured)
      mockCameraController.client.get.mockRejectedValue(
        new Error("Timeout waiting for photo completion"),
      );

      try {
        await session.start();
        await new Promise((resolve) => setTimeout(resolve, 200));
      } catch (error) {
        // Expected to fail
      }

      // Generate report even with no successful shots
      const report = stateManager.generateSessionReport(session, {
        reason: "Session failed",
      });

      // EXPECTED: Report should include null values for image filenames
      expect(report.results.firstImageName).toBeNull();
      expect(report.results.lastImageName).toBeNull();
    });
  });

  describe("Edge Cases", () => {
    test("handles null or undefined filePath gracefully", async () => {
      session = new TimelapseSession(() => mockCameraController, {
        interval: 30,
        totalShots: 1,
      });

      // Mock event polling to return empty addedcontents
      mockCameraController.client.get.mockResolvedValue({
        status: 200,
        data: {
          addedcontents: [],
        },
      });

      await session.start();
      await new Promise((resolve) => setTimeout(resolve, 200));

      const status = session.getStatus();

      // EXPECTED: Should handle empty response gracefully
      expect(status.stats.firstImageName).toBeNull();
      expect(status.stats.lastImageName).toBeNull();
    });

    test("handles RAW+JPEG dual capture (uses first path)", async () => {
      session = new TimelapseSession(() => mockCameraController, {
        interval: 30,
        totalShots: 1,
      });

      // Mock event polling to return both CR3 and JPG
      mockCameraController.client.get.mockResolvedValue({
        status: 200,
        data: {
          addedcontents: [
            "/ccapi/ver110/contents/sd/100CANON/IMG_0100.JPG",
            "/ccapi/ver110/contents/sd/100CANON/IMG_0100.CR3",
          ],
        },
      });

      await session.start();
      await new Promise((resolve) => setTimeout(resolve, 200));

      const status = session.getStatus();

      // EXPECTED: Should use first file in addedcontents array (typically JPG)
      expect(status.stats.firstImageName).toBe("IMG_0100.JPG");
      expect(status.stats.lastImageName).toBe("IMG_0100.JPG");
    });
  });
});
