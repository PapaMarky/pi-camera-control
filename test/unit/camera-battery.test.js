/**
 * Camera Battery Information Unit Tests
 *
 * Tests the getCameraBattery() method to ensure correct parsing of CCAPI ver100 battery data.
 * The Canon EOS R50 returns incorrect data from ver110/batterylist but correct data from ver100/battery.
 *
 * CCAPI ver100 battery level values:
 * - "low", "quarter", "half", "high", "full", "unknown", "charge", "chargestop", "chargecomp", "none"
 *
 * CCAPI ver100 battery kind values:
 * - "battery", "not_inserted", "ac_adapter", "dc_coupler", "unknown", "batterygrip"
 *
 * CCAPI ver100 battery quality values:
 * - "bad", "normal", "good", "unknown"
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

describe("CameraController - Battery Information (ver100)", () => {
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

  describe("ver100 battery data parsing", () => {
    test("should parse full battery level correctly", async () => {
      const mockResponse = {
        data: {
          name: "LP-E17",
          kind: "battery",
          level: "full",
          quality: "good",
        },
      };

      mockClient.get.mockResolvedValue(mockResponse);

      const result = await controller.getCameraBattery();

      expect(mockClient.get).toHaveBeenCalledWith(
        "https://192.168.1.100:443/ccapi/ver100/devicestatus/battery",
      );
      expect(result).toEqual({
        batterylist: [
          {
            name: "LP-E17",
            kind: "battery",
            level: "full",
            quality: "good",
          },
        ],
      });
    });

    test("should parse half battery level correctly", async () => {
      const mockResponse = {
        data: {
          name: "LP-E17",
          kind: "battery",
          level: "half",
          quality: "good",
        },
      };

      mockClient.get.mockResolvedValue(mockResponse);

      const result = await controller.getCameraBattery();

      expect(result.batterylist[0].level).toBe("half");
    });

    test("should parse quarter battery level correctly", async () => {
      const mockResponse = {
        data: {
          name: "LP-E17",
          kind: "battery",
          level: "quarter",
          quality: "normal",
        },
      };

      mockClient.get.mockResolvedValue(mockResponse);

      const result = await controller.getCameraBattery();

      expect(result.batterylist[0].level).toBe("quarter");
    });

    test("should parse low battery level correctly", async () => {
      const mockResponse = {
        data: {
          name: "LP-E17",
          kind: "battery",
          level: "low",
          quality: "normal",
        },
      };

      mockClient.get.mockResolvedValue(mockResponse);

      const result = await controller.getCameraBattery();

      expect(result.batterylist[0].level).toBe("low");
    });

    test("should parse high battery level correctly", async () => {
      const mockResponse = {
        data: {
          name: "LP-E17",
          kind: "battery",
          level: "high",
          quality: "good",
        },
      };

      mockClient.get.mockResolvedValue(mockResponse);

      const result = await controller.getCameraBattery();

      expect(result.batterylist[0].level).toBe("high");
    });

    test("should parse charging battery correctly", async () => {
      const mockResponse = {
        data: {
          name: "LP-E17",
          kind: "battery",
          level: "charge",
          quality: "good",
        },
      };

      mockClient.get.mockResolvedValue(mockResponse);

      const result = await controller.getCameraBattery();

      expect(result.batterylist[0].level).toBe("charge");
    });

    test("should parse unknown battery correctly", async () => {
      const mockResponse = {
        data: {
          name: "unknown",
          kind: "unknown",
          level: "unknown",
          quality: "unknown",
        },
      };

      mockClient.get.mockResolvedValue(mockResponse);

      const result = await controller.getCameraBattery();

      expect(result.batterylist[0]).toEqual({
        name: "unknown",
        kind: "unknown",
        level: "unknown",
        quality: "unknown",
      });
    });

    test("should parse AC adapter correctly", async () => {
      const mockResponse = {
        data: {
          name: "AC-E6N",
          kind: "ac_adapter",
          level: "full",
          quality: "good",
        },
      };

      mockClient.get.mockResolvedValue(mockResponse);

      const result = await controller.getCameraBattery();

      expect(result.batterylist[0].kind).toBe("ac_adapter");
    });

    test("should parse battery with bad quality correctly", async () => {
      const mockResponse = {
        data: {
          name: "LP-E17",
          kind: "battery",
          level: "half",
          quality: "bad",
        },
      };

      mockClient.get.mockResolvedValue(mockResponse);

      const result = await controller.getCameraBattery();

      expect(result.batterylist[0].quality).toBe("bad");
    });
  });

  describe("error handling", () => {
    test("should throw error when camera not connected", async () => {
      controller.connected = false;

      await expect(controller.getCameraBattery()).rejects.toThrow(
        "Camera not connected",
      );
    });

    test("should handle network errors correctly", async () => {
      const networkError = new Error("EHOSTUNREACH");
      networkError.code = "EHOSTUNREACH";
      mockClient.get.mockRejectedValue(networkError);

      // Mock handleDisconnection to prevent side effects
      controller.handleDisconnection = jest.fn();

      await expect(controller.getCameraBattery()).rejects.toThrow();
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

      await expect(controller.getCameraBattery()).rejects.toThrow(
        "Camera busy",
      );
    });
  });

  describe("response format", () => {
    test("should always return batterylist array wrapper", async () => {
      const mockResponse = {
        data: {
          name: "LP-E17",
          kind: "battery",
          level: "full",
          quality: "good",
        },
      };

      mockClient.get.mockResolvedValue(mockResponse);

      const result = await controller.getCameraBattery();

      expect(result).toHaveProperty("batterylist");
      expect(Array.isArray(result.batterylist)).toBe(true);
      expect(result.batterylist).toHaveLength(1);
    });

    test("should preserve all battery data fields", async () => {
      const mockResponse = {
        data: {
          name: "LP-E17",
          kind: "battery",
          level: "half",
          quality: "normal",
        },
      };

      mockClient.get.mockResolvedValue(mockResponse);

      const result = await controller.getCameraBattery();

      expect(result.batterylist[0]).toHaveProperty("name");
      expect(result.batterylist[0]).toHaveProperty("kind");
      expect(result.batterylist[0]).toHaveProperty("level");
      expect(result.batterylist[0]).toHaveProperty("quality");
    });
  });
});
