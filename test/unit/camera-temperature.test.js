/**
 * Camera Temperature Status Unit Tests
 *
 * Tests the getCameraTemperature() method to ensure correct handling of CCAPI temperature status.
 * The Canon CCAPI temperature endpoint returns status-based values (not degrees Celsius).
 *
 * CCAPI ver100 temperature status values:
 * - "normal" - Normal operating temperature
 * - "warning" - Temperature warning
 * - "frameratedown" - Reduced frame rate due to heat
 * - "disableliveview" - Live View disabled
 * - "disablerelease" - Shooting prohibited (CRITICAL for intervalometer)
 * - "stillqualitywarning" - Image quality degraded
 * - "restrictionmovierecording" - Movie recording restricted
 * - Combined states like "warning_and_restrictionmovierecording"
 *
 * CCAPI Reference: 4.4.2 - Temperature status
 * Endpoint: GET /ccapi/ver100/devicestatus/temperature
 * Response: { "status": "normal" }
 */

import { jest } from "@jest/globals";

// Mock axios
const mockAxios = {
  get: jest.fn(),
  create: jest.fn(),
};

// Mock dependencies
jest.unstable_mockModule("axios", () => ({
  default: mockAxios,
}));

jest.unstable_mockModule("../../src/utils/logger.js", () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Import after mocking
const { CameraController } = await import("../../src/camera/controller.js");

describe("CameraController - Temperature Status", () => {
  let controller;
  let mockClient;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create mock HTTPS agent
    mockClient = {
      get: jest.fn(),
    };

    mockAxios.create.mockReturnValue(mockClient);

    // Create controller instance
    controller = new CameraController("https://192.168.1.100");
    controller.connected = true; // Simulate connected state
    controller.client = mockClient;
    controller.baseUrl = "https://192.168.1.100:443";
  });

  describe("temperature status parsing", () => {
    test("should parse normal temperature status", async () => {
      const mockResponse = {
        data: {
          status: "normal",
        },
      };

      mockClient.get.mockResolvedValue(mockResponse);

      const result = await controller.getCameraTemperature();

      expect(mockClient.get).toHaveBeenCalledWith(
        "https://192.168.1.100:443/ccapi/ver100/devicestatus/temperature",
      );
      expect(result).toEqual({
        status: "normal",
      });
    });

    test("should parse warning temperature status", async () => {
      const mockResponse = {
        data: {
          status: "warning",
        },
      };

      mockClient.get.mockResolvedValue(mockResponse);

      const result = await controller.getCameraTemperature();

      expect(result.status).toBe("warning");
    });

    test("should parse frameratedown status", async () => {
      const mockResponse = {
        data: {
          status: "frameratedown",
        },
      };

      mockClient.get.mockResolvedValue(mockResponse);

      const result = await controller.getCameraTemperature();

      expect(result.status).toBe("frameratedown");
    });

    test("should parse disableliveview status", async () => {
      const mockResponse = {
        data: {
          status: "disableliveview",
        },
      };

      mockClient.get.mockResolvedValue(mockResponse);

      const result = await controller.getCameraTemperature();

      expect(result.status).toBe("disableliveview");
    });

    test("should parse CRITICAL disablerelease status", async () => {
      const mockResponse = {
        data: {
          status: "disablerelease",
        },
      };

      mockClient.get.mockResolvedValue(mockResponse);

      const result = await controller.getCameraTemperature();

      expect(result.status).toBe("disablerelease");
    });

    test("should parse stillqualitywarning status", async () => {
      const mockResponse = {
        data: {
          status: "stillqualitywarning",
        },
      };

      mockClient.get.mockResolvedValue(mockResponse);

      const result = await controller.getCameraTemperature();

      expect(result.status).toBe("stillqualitywarning");
    });

    test("should parse restrictionmovierecording status", async () => {
      const mockResponse = {
        data: {
          status: "restrictionmovierecording",
        },
      };

      mockClient.get.mockResolvedValue(mockResponse);

      const result = await controller.getCameraTemperature();

      expect(result.status).toBe("restrictionmovierecording");
    });

    test("should parse combined status (warning_and_restrictionmovierecording)", async () => {
      const mockResponse = {
        data: {
          status: "warning_and_restrictionmovierecording",
        },
      };

      mockClient.get.mockResolvedValue(mockResponse);

      const result = await controller.getCameraTemperature();

      expect(result.status).toBe("warning_and_restrictionmovierecording");
    });
  });

  describe("error handling", () => {
    test("should throw error when camera not connected", async () => {
      controller.connected = false;

      await expect(controller.getCameraTemperature()).rejects.toThrow(
        "Camera not connected",
      );
    });

    test("should handle network errors correctly", async () => {
      const networkError = new Error("EHOSTUNREACH");
      networkError.code = "EHOSTUNREACH";
      mockClient.get.mockRejectedValue(networkError);

      // Mock handleDisconnection to prevent side effects
      controller.handleDisconnection = jest.fn();

      await expect(controller.getCameraTemperature()).rejects.toThrow();
      expect(controller.handleDisconnection).toHaveBeenCalled();
    });

    test("should handle CCAPI errors correctly", async () => {
      const apiError = new Error("API Error");
      apiError.response = {
        status: 503,
        statusText: "Service Unavailable",
        data: {
          message: "Camera busy",
        },
      };
      mockClient.get.mockRejectedValue(apiError);

      await expect(controller.getCameraTemperature()).rejects.toThrow(
        "Camera busy",
      );
    });

    test("should handle endpoint not available (404)", async () => {
      const notFoundError = new Error("Not Found");
      notFoundError.response = {
        status: 404,
        statusText: "Not Found",
        data: {
          message: "Endpoint not supported",
        },
      };
      mockClient.get.mockRejectedValue(notFoundError);

      await expect(controller.getCameraTemperature()).rejects.toThrow(
        "Endpoint not supported",
      );
    });
  });

  describe("response format", () => {
    test("should return status object with status field", async () => {
      const mockResponse = {
        data: {
          status: "normal",
        },
      };

      mockClient.get.mockResolvedValue(mockResponse);

      const result = await controller.getCameraTemperature();

      expect(result).toHaveProperty("status");
      expect(typeof result.status).toBe("string");
    });

    test("should preserve exact status value from CCAPI", async () => {
      const mockResponse = {
        data: {
          status: "warning",
        },
      };

      mockClient.get.mockResolvedValue(mockResponse);

      const result = await controller.getCameraTemperature();

      expect(result.status).toBe("warning");
    });
  });

  describe("critical status detection", () => {
    test("should identify disablerelease as critical status", async () => {
      const mockResponse = {
        data: {
          status: "disablerelease",
        },
      };

      mockClient.get.mockResolvedValue(mockResponse);

      const result = await controller.getCameraTemperature();

      // This status means shooting is prohibited
      expect(result.status).toBe("disablerelease");
      expect(result.status).not.toBe("normal");
    });
  });
});
