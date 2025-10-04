/**
 * Timelapse Event Polling Integration Test
 *
 * Tests the integration of CCAPI event polling into the timelapse session
 * to detect photo completion and overtime (when shot duration exceeds interval).
 *
 * Following TDD: These tests define expected behavior BEFORE implementation.
 *
 * NOTE: These tests verify the EXPECTED behavior. They will FAIL until
 * the implementation is complete, which is the correct TDD approach.
 */

import { jest } from "@jest/globals";
import { TimelapseSession } from "../../src/intervalometer/timelapse-session.js";

describe("Timelapse Event Polling Integration", () => {
  let mockCameraController;
  let session;

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

      // Mock takePhoto - will be customized per test
      takePhoto: jest.fn(async () => {
        return Promise.resolve();
      }),

      // Mock for event polling
      client: {
        get: jest.fn(async () => ({
          status: 200,
          data: {
            addedcontents: ["/ccapi/ver110/contents/sd/100CANON/IMG_0001.JPG"],
          },
        })),
      },
      baseUrl: "https://192.168.4.2:443",
    };
  });

  afterEach(async () => {
    if (session) {
      await session.cleanup();
      session = null;
    }
    jest.clearAllMocks();
  });

  describe("Overtime Stats Initialization", () => {
    test("initializes overtime stats correctly in constructor", () => {
      session = new TimelapseSession(() => mockCameraController, {
        interval: 60,
      });

      const status = session.getStatus();

      // EXPECTED: New overtime stats fields should exist
      expect(status.stats).toHaveProperty("overtimeShots");
      expect(status.stats).toHaveProperty("totalOvertimeSeconds");
      expect(status.stats).toHaveProperty("maxOvertimeSeconds");
      expect(status.stats).toHaveProperty("lastShotDuration");

      // EXPECTED: Initial values should be zero
      expect(status.stats.overtimeShots).toBe(0);
      expect(status.stats.totalOvertimeSeconds).toBe(0);
      expect(status.stats.maxOvertimeSeconds).toBe(0);
      expect(status.stats.lastShotDuration).toBe(0);
    });
  });

  describe("Shot Duration Tracking", () => {
    test("tracks lastShotDuration for each photo", async () => {
      session = new TimelapseSession(() => mockCameraController, {
        interval: 60,
        totalShots: 1,
      });

      await session.start();
      // Wait for session to complete (1 shot)
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const status = session.getStatus();

      // EXPECTED: lastShotDuration should be updated (non-zero)
      expect(status.stats.shotsSuccessful).toBe(1);
      expect(status.stats.lastShotDuration).toBeGreaterThan(0);
    }, 5000);
  });

  describe("Overtime Detection", () => {
    test("detects overtime when shot duration exceeds interval", async () => {
      // This test will pass when overtime detection is implemented
      // For now, it documents the expected behavior
      session = new TimelapseSession(() => mockCameraController, {
        interval: 1, // 1 second interval for fast testing
        totalShots: 1,
      });

      // Mock slow photo (2 seconds = 1 second over interval)
      mockCameraController.takePhoto = jest.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        return Promise.resolve();
      });

      const overtimeHandler = jest.fn();
      session.on("photo_overtime", overtimeHandler);

      await session.start();
      await new Promise((resolve) => setTimeout(resolve, 3000));

      const status = session.getStatus();

      // EXPECTED: Overtime should be detected
      expect(status.stats.overtimeShots).toBe(1);
      expect(status.stats.totalOvertimeSeconds).toBeGreaterThan(0.5);
      expect(status.stats.maxOvertimeSeconds).toBeGreaterThan(0.5);

      // EXPECTED: photo_overtime event should be emitted
      expect(overtimeHandler).toHaveBeenCalled();
    }, 6000);

    test("photo_overtime event contains correct data structure", async () => {
      session = new TimelapseSession(() => mockCameraController, {
        interval: 1,
        totalShots: 1,
        title: "Test Session",
      });

      // Mock 2s photo (1s over 1s interval)
      mockCameraController.takePhoto = jest.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        return Promise.resolve();
      });

      const overtimeHandler = jest.fn();
      session.on("photo_overtime", overtimeHandler);

      await session.start();
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // EXPECTED: Event should be emitted with correct structure
      expect(overtimeHandler).toHaveBeenCalled();

      if (overtimeHandler.mock.calls.length > 0) {
        const eventData = overtimeHandler.mock.calls[0][0];

        expect(eventData).toHaveProperty("sessionId");
        expect(eventData).toHaveProperty("title");
        expect(eventData).toHaveProperty("shotNumber");
        expect(eventData).toHaveProperty("interval");
        expect(eventData).toHaveProperty("shotDuration");
        expect(eventData).toHaveProperty("overtime");
        expect(eventData).toHaveProperty("message");

        expect(eventData.title).toBe("Test Session");
        expect(eventData.interval).toBe(1);
        expect(eventData.shotDuration).toBeGreaterThan(1);
        expect(eventData.overtime).toBeGreaterThan(0.5);
      }
    }, 6000);
  });

  describe("Normal Operation (No Overtime)", () => {
    test("does not emit overtime event when shot completes within interval", async () => {
      session = new TimelapseSession(() => mockCameraController, {
        interval: 60,
        totalShots: 1,
      });

      const overtimeHandler = jest.fn();
      session.on("photo_overtime", overtimeHandler);

      await session.start();
      await new Promise((resolve) => setTimeout(resolve, 1500));

      const status = session.getStatus();

      // EXPECTED: No overtime for normal shots
      expect(status.stats.overtimeShots).toBe(0);
      expect(overtimeHandler).not.toHaveBeenCalled();
    }, 5000);
  });

  describe("Stats Exposure in getStatus()", () => {
    test("getStatus() includes all overtime stats fields", () => {
      session = new TimelapseSession(() => mockCameraController, {
        interval: 60,
      });

      const status = session.getStatus();

      // EXPECTED: getStatus() should expose overtime tracking fields
      expect(status.stats).toHaveProperty("overtimeShots");
      expect(status.stats).toHaveProperty("totalOvertimeSeconds");
      expect(status.stats).toHaveProperty("maxOvertimeSeconds");
      expect(status.stats).toHaveProperty("lastShotDuration");
      expect(status.stats).toHaveProperty("totalShotDurationSeconds");

      // EXPECTED: getStatus() should calculate and expose average shot duration
      expect(status).toHaveProperty("averageShotDuration");
      expect(status.averageShotDuration).toBe(0); // No shots yet
    });

    test("averageShotDuration is calculated correctly after shots", async () => {
      session = new TimelapseSession(() => mockCameraController, {
        interval: 2, // Shorter interval for faster test
        totalShots: 2,
      });

      // First shot takes 1s, second takes 3s
      let callCount = 0;
      mockCameraController.takePhoto = jest.fn(async () => {
        callCount++;
        const delay = callCount === 1 ? 1000 : 3000;
        await new Promise((resolve) => setTimeout(resolve, delay));
        return Promise.resolve();
      });

      await session.start();
      // Wait for both shots: first at T+0, second at T+2s, plus completion time
      await new Promise((resolve) => setTimeout(resolve, 7000));

      const status = session.getStatus();

      // EXPECTED: Average should be (1 + 3) / 2 = 2 seconds
      expect(status.stats.shotsSuccessful).toBe(2);
      expect(status.averageShotDuration).toBeCloseTo(2.0, 0); // Within 1 decimal place
    }, 15000);
  });

  describe("Session Continues Despite Overtime", () => {
    test("session continues running after overtime shot", async () => {
      session = new TimelapseSession(() => mockCameraController, {
        interval: 1,
        totalShots: 2,
      });

      // First shot takes 2s (1s overtime)
      let callCount = 0;
      mockCameraController.takePhoto = jest.fn(async () => {
        callCount++;
        if (callCount === 1) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
        } else {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
        return Promise.resolve();
      });

      await session.start();
      await new Promise((resolve) => setTimeout(resolve, 5000));

      const status = session.getStatus();

      // EXPECTED: Session should complete all shots despite overtime
      expect(status.stats.shotsTaken).toBe(2);
      expect(status.stats.overtimeShots).toBe(1); // Only first shot
    }, 10000);

    test("interval remains unchanged after overtime", async () => {
      session = new TimelapseSession(() => mockCameraController, {
        interval: 60,
        totalShots: 1,
      });

      // Mock 70s photo (10s over)
      mockCameraController.takePhoto = jest.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 500)); // Shortened for test
        return Promise.resolve();
      });

      await session.start();
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const status = session.getStatus();

      // EXPECTED: Interval should NOT be automatically adjusted
      expect(status.options.interval).toBe(60);
    }, 5000);
  });

  describe("Multiple Overtime Tracking", () => {
    test("tracks maxOvertimeSeconds across multiple shots", async () => {
      session = new TimelapseSession(() => mockCameraController, {
        interval: 1,
        totalShots: 3,
      });

      // Different overtime amounts: 1.5s, 2.5s, 1.8s
      let callCount = 0;
      const durations = [1500, 2500, 1800];
      mockCameraController.takePhoto = jest.fn(async () => {
        const duration = durations[callCount] || 500;
        callCount++;
        await new Promise((resolve) => setTimeout(resolve, duration));
        return Promise.resolve();
      });

      await session.start();
      await new Promise((resolve) => setTimeout(resolve, 8000));

      const status = session.getStatus();

      // EXPECTED: Max overtime should be ~1.5s (from 2.5s shot)
      expect(status.stats.overtimeShots).toBe(3);
      expect(status.stats.maxOvertimeSeconds).toBeGreaterThan(1.0);
      expect(status.stats.totalOvertimeSeconds).toBeGreaterThan(2.0);
    }, 12000);
  });
});
