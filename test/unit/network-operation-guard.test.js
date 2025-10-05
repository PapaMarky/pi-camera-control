/**
 * Network Operation Guard Tests
 *
 * Tests for network operation safety checks during active timelapse sessions
 */

import { jest } from "@jest/globals";

// Mock logger
jest.unstable_mockModule("../../src/utils/logger.js", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe("Network Operation Guard", () => {
  let isNetworkOperationSafe;
  let createNetworkOperationError;

  beforeEach(async () => {
    // Clear all mocks
    jest.clearAllMocks();

    // Import after mocks are set up
    const guardModule = await import(
      "../../src/utils/network-operation-guard.js"
    );
    isNetworkOperationSafe = guardModule.isNetworkOperationSafe;
    createNetworkOperationError = guardModule.createNetworkOperationError;
  });

  describe("isNetworkOperationSafe", () => {
    test("should allow network operations when no session active", () => {
      const mockStateManager = {
        getState: jest.fn(() => ({
          state: "stopped",
          hasActiveSession: false,
        })),
      };

      const result = isNetworkOperationSafe(mockStateManager);

      expect(result.safe).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    test("should block network operations during running timelapse", () => {
      const mockStateManager = {
        getState: jest.fn(() => ({
          state: "running",
          hasActiveSession: true,
          stats: {
            photosTaken: 10,
            totalPhotos: 100,
          },
        })),
      };

      const result = isNetworkOperationSafe(mockStateManager);

      expect(result.safe).toBe(false);
      expect(result.reason).toContain("timelapse session is running");
      expect(result.sessionState).toBe("running");
    });

    test("should block network operations during paused timelapse", () => {
      const mockStateManager = {
        getState: jest.fn(() => ({
          state: "paused",
          hasActiveSession: true,
        })),
      };

      const result = isNetworkOperationSafe(mockStateManager);

      expect(result.safe).toBe(false);
      expect(result.reason).toContain("timelapse session is paused");
      expect(result.sessionState).toBe("paused");
    });

    test("should allow network operations when session is stopping", () => {
      const mockStateManager = {
        getState: jest.fn(() => ({
          state: "stopping",
          hasActiveSession: true,
        })),
      };

      const result = isNetworkOperationSafe(mockStateManager);

      expect(result.safe).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    test("should allow network operations when session completed", () => {
      const mockStateManager = {
        getState: jest.fn(() => ({
          state: "stopped",
          hasActiveSession: false,
        })),
      };

      const result = isNetworkOperationSafe(mockStateManager);

      expect(result.safe).toBe(true);
    });

    test("should handle missing state manager gracefully", () => {
      const result = isNetworkOperationSafe(null);

      expect(result.safe).toBe(true);
      expect(result.reason).toBeUndefined();
    });
  });

  describe("createNetworkOperationError", () => {
    test("should create proper error object for blocked operation", () => {
      const error = createNetworkOperationError("running", "WiFi connect");

      expect(error).toEqual({
        success: false,
        error:
          "Network operations are not allowed during an active timelapse session",
        details: {
          operation: "WiFi connect",
          sessionState: "running",
          suggestion:
            "Please stop or complete the timelapse session before changing network settings",
        },
      });
    });

    test("should handle paused session state", () => {
      const error = createNetworkOperationError("paused", "WiFi disconnect");

      expect(error).toEqual({
        success: false,
        error:
          "Network operations are not allowed during an active timelapse session",
        details: {
          operation: "WiFi disconnect",
          sessionState: "paused",
          suggestion:
            "Please stop or complete the timelapse session before changing network settings",
        },
      });
    });
  });
});
