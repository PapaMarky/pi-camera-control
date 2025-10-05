/**
 * System Time Sync Utility Tests
 *
 * Tests for system time synchronization utilities
 * Verifies async/await pattern is correctly implemented
 */

import { jest } from "@jest/globals";

// Mock child_process
const mockSpawn = jest.fn();
jest.unstable_mockModule("child_process", () => ({
  spawn: mockSpawn,
}));

// Mock logger
jest.unstable_mockModule("../../src/utils/logger.js", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe("System Time Sync Utilities", () => {
  let syncSystemTime;
  let setSystemTimezone;

  beforeEach(async () => {
    // Clear all mocks
    jest.clearAllMocks();

    // Import after mocks are set up
    const systemTimeModule = await import("../../src/utils/system-time.js");
    syncSystemTime = systemTimeModule.syncSystemTime;
    setSystemTimezone = systemTimeModule.setSystemTimezone;
  });

  describe("syncSystemTime", () => {
    test("should reject on non-Linux platforms", async () => {
      // Mock platform
      const originalPlatform = process.platform;
      Object.defineProperty(process, "platform", {
        value: "darwin",
        configurable: true,
      });

      const clientTime = new Date("2025-01-15T12:00:00.000Z");

      await expect(syncSystemTime(clientTime)).rejects.toThrow(
        "only supported on Linux",
      );

      // Restore platform
      Object.defineProperty(process, "platform", {
        value: originalPlatform,
        configurable: true,
      });
    });

    test("should properly await spawn completion before resolving", async () => {
      // Mock platform as Linux
      const originalPlatform = process.platform;
      Object.defineProperty(process, "platform", {
        value: "linux",
        configurable: true,
      });

      // Mock EventEmitter for spawn
      let closeHandler;
      const mockChildProcess = {
        on: jest.fn((event, handler) => {
          if (event === "close") {
            closeHandler = handler;
          }
        }),
      };

      mockSpawn.mockReturnValue(mockChildProcess);

      const clientTime = new Date("2025-01-15T12:00:00.000Z");

      // Start the async operation
      const syncPromise = syncSystemTime(clientTime);

      // Verify promise hasn't resolved yet
      let resolved = false;
      syncPromise.then(() => {
        resolved = true;
      });

      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(resolved).toBe(false);

      // Simulate spawn completion
      closeHandler(0);

      // Wait for promise to resolve
      const result = await syncPromise;

      // Now should be resolved
      expect(result).toEqual(
        expect.objectContaining({
          success: true,
          newTime: expect.any(String),
          timezone: expect.any(String),
        }),
      );

      // Restore platform
      Object.defineProperty(process, "platform", {
        value: originalPlatform,
        configurable: true,
      });
    });

    test("should reject if spawn fails", async () => {
      // Mock platform as Linux
      const originalPlatform = process.platform;
      Object.defineProperty(process, "platform", {
        value: "linux",
        configurable: true,
      });

      // Mock EventEmitter for spawn
      let closeHandler;
      const mockChildProcess = {
        on: jest.fn((event, handler) => {
          if (event === "close") {
            closeHandler = handler;
          }
        }),
      };

      mockSpawn.mockReturnValue(mockChildProcess);

      const clientTime = new Date("2025-01-15T12:00:00.000Z");

      // Start the async operation
      const syncPromise = syncSystemTime(clientTime);

      // Simulate spawn failure
      closeHandler(1);

      // Should reject
      await expect(syncPromise).rejects.toThrow("exit code: 1");

      // Restore platform
      Object.defineProperty(process, "platform", {
        value: originalPlatform,
        configurable: true,
      });
    });

    test("should reject if spawn errors", async () => {
      // Mock platform as Linux
      const originalPlatform = process.platform;
      Object.defineProperty(process, "platform", {
        value: "linux",
        configurable: true,
      });

      // Mock EventEmitter for spawn
      let errorHandler;
      const mockChildProcess = {
        on: jest.fn((event, handler) => {
          if (event === "error") {
            errorHandler = handler;
          }
        }),
      };

      mockSpawn.mockReturnValue(mockChildProcess);

      const clientTime = new Date("2025-01-15T12:00:00.000Z");

      // Start the async operation
      const syncPromise = syncSystemTime(clientTime);

      // Simulate spawn error
      errorHandler(new Error("Permission denied"));

      // Should reject
      await expect(syncPromise).rejects.toThrow("Permission denied");

      // Restore platform
      Object.defineProperty(process, "platform", {
        value: originalPlatform,
        configurable: true,
      });
    });

    test("should handle timezone sync gracefully on failure", async () => {
      // Mock platform as Linux
      const originalPlatform = process.platform;
      Object.defineProperty(process, "platform", {
        value: "linux",
        configurable: true,
      });

      // Mock two spawn calls - time succeeds, timezone fails
      let closeHandlers = [];
      mockSpawn.mockImplementation(() => {
        const index = closeHandlers.length;
        const mockChildProcess = {
          on: jest.fn((event, handler) => {
            if (event === "close") {
              closeHandlers[index] = handler;
            }
          }),
        };
        return mockChildProcess;
      });

      const clientTime = new Date("2025-01-15T12:00:00.000Z");

      // Start the async operation with timezone
      const syncPromise = syncSystemTime(clientTime, "America/Los_Angeles");

      // Simulate time sync success
      closeHandlers[0](0);

      // Wait a tick
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Simulate timezone sync failure
      closeHandlers[1](1);

      // Should still resolve (timezone failure is non-fatal)
      const result = await syncPromise;

      expect(result).toEqual(
        expect.objectContaining({
          success: true,
          newTime: expect.any(String),
          timezone: expect.any(String),
          timezoneSync: expect.objectContaining({
            success: false,
          }),
        }),
      );

      // Restore platform
      Object.defineProperty(process, "platform", {
        value: originalPlatform,
        configurable: true,
      });
    });
  });
});
