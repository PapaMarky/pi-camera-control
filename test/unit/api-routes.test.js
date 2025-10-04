/**
 * API Routes Unit Tests
 *
 * Tests all REST API endpoints without requiring camera hardware.
 * Comprehensive coverage of camera, intervalometer, network, and system routes.
 */

import { jest } from "@jest/globals";
import express from "express";
import request from "supertest";
import { createApiRouter } from "../../src/routes/api.js";

// Mock IntervalometerSession class
jest.mock("../../src/intervalometer/session.js", () => ({
  IntervalometerSession: jest
    .fn()
    .mockImplementation((getCameraController, options) => ({
      id: "session-123",
      state: "initialized",
      options,
      start: jest.fn(async function () {
        this.state = "running";
      }),
      stop: jest.fn(async function () {
        this.state = "stopped";
      }),
      cleanup: jest.fn(),
      getStatus: jest.fn(() => ({
        state: "running",
        progress: { shots: 0, total: parseInt(options.totalShots || 0) },
        stats: { successful: 0, failed: 0 },
      })),
    })),
}));

describe("API Routes Unit Tests", () => {
  let app;
  let mockCameraController;
  let mockPowerManager;
  let mockServer;
  let mockNetworkStateManager;
  let mockDiscoveryManager;
  let mockIntervalometerStateManager;

  beforeEach(() => {
    // Create Express app with router
    app = express();
    app.use(express.json());

    // Mock camera controller
    const mockControllerInstance = {
      getConnectionStatus: jest.fn(() => ({
        connected: true,
        ip: "192.168.4.2",
        port: "443",
        model: "EOS R50",
      })),
      getCameraSettings: jest.fn(async () => ({
        iso: 100,
        shutterSpeed: "1/60",
        aperture: "f/2.8",
        imageQuality: "RAW+JPEG",
      })),
      getCameraBattery: jest.fn(async () => ({
        level: 85,
        status: "good",
      })),
      getDeviceInformation: jest.fn(async () => ({
        model: "EOS R50",
        firmware: "1.0.0",
        serialNumber: "ABC123",
      })),
      takePhoto: jest.fn(async () => ({ success: true })),
      manualReconnect: jest.fn(async () => true),
      updateConfiguration: jest.fn(async () => true),
      validateInterval: jest.fn(async (interval) => ({
        valid: interval >= 5,
        error: interval < 5 ? "Interval too short" : null,
        recommendedMin: 5,
      })),
      pauseInfoPolling: jest.fn(),
      resumeInfoPolling: jest.fn(),
      pauseConnectionMonitoring: jest.fn(),
      resumeConnectionMonitoring: jest.fn(),
      capabilities: {
        shutter: true,
        iso: true,
        aperture: true,
      },
    };

    mockCameraController = jest.fn(() => mockControllerInstance);
    mockCameraController.instance = mockControllerInstance;

    // Mock power manager
    mockPowerManager = {
      getStatus: jest.fn(() => ({
        isRaspberryPi: true,
        uptime: 3600,
        thermal: { temperature: 45.2 },
      })),
    };

    // Mock intervalometer state manager (defined before mockServer)
    mockIntervalometerStateManager = {
      createSession: jest.fn(async () => ({
        id: "session-123",
        start: jest.fn(async () => {}),
        getStatus: jest.fn(() => ({
          state: "running",
          progress: { shots: 10, total: 100 },
        })),
      })),
      getSessionStatus: jest.fn(function () {
        // Check mockServer for active session
        if (mockServer && mockServer.activeIntervalometerSession) {
          return mockServer.activeIntervalometerSession.getStatus();
        }
        return {
          state: "stopped",
          message: "No active intervalometer session",
        };
      }),
      getReports: jest.fn(async () => [
        { id: "report-1", title: "Test Report 1" },
        { id: "report-2", title: "Test Report 2" },
      ]),
      getReport: jest.fn(async (id) =>
        id === "report-1" ? { id: "report-1", title: "Test Report 1" } : null,
      ),
      updateReportTitle: jest.fn(async (id, title) => ({
        id,
        title,
        updated: new Date().toISOString(),
      })),
      deleteReport: jest.fn(async () => true),
      getUnsavedSession: jest.fn(async () => null),
      saveSessionAsReport: jest.fn(async () => true),
      saveSessionReport: jest.fn(async () => ({
        id: "new-report",
        title: "Saved Session",
      })),
      discardSession: jest.fn(async () => true),
      getState: jest.fn(() => ({
        hasUnsavedSession: false,
        currentSessionId: null,
      })),
    };

    // Mock server
    mockServer = {
      activeIntervalometerSession: null,
      intervalometerStateManager: mockIntervalometerStateManager,
    };

    // Mock network state manager with serviceManager
    mockNetworkStateManager = {
      getNetworkStatus: jest.fn(async () => ({
        interfaces: {
          wlan0: {
            connected: true,
            network: "TestNetwork",
            ip: "192.168.1.100",
          },
        },
      })),
      serviceManager: {
        scanWiFiNetworks: jest.fn(async () => [
          { ssid: "Network1", signal: 85, security: "WPA2" },
          { ssid: "Network2", signal: 72, security: "WPA3" },
        ]),
        getSavedNetworks: jest.fn(async () => [
          { name: "SavedNetwork1", uuid: "uuid-1" },
          { name: "SavedNetwork2", uuid: "uuid-2" },
        ]),
        connectToWiFi: jest.fn(async () => ({ success: true })),
        disconnectWiFi: jest.fn(async () => ({ success: true })),
        configureAccessPoint: jest.fn(async () => ({ success: true })),
        setWiFiCountry: jest.fn(async () => ({ success: true })),
        getWiFiCountry: jest.fn(async () => ({ country: "US" })),
        getAvailableCountries: jest.fn(async () => ["US", "GB", "JP", "DE"]),
        enableWiFi: jest.fn(async () => ({ success: true })),
        disableWiFi: jest.fn(async () => ({ success: true })),
        isWiFiEnabled: jest.fn(async () => ({ enabled: true })),
      },
    };

    // Mock discovery manager
    mockDiscoveryManager = {
      getStatus: jest.fn(() => ({
        isDiscovering: true,
        cameras: 1,
      })),
      getDiscoveredCameras: jest.fn(() => [
        { uuid: "cam-1", ip: "192.168.4.2", model: "EOS R50" },
      ]),
      searchForCameras: jest.fn(async () => ({ started: true })),
      setPrimaryCamera: jest.fn(async () => ({ success: true })),
      connectToCamera: jest.fn(async () => ({ success: true })),
      getCamera: jest.fn(() => ({
        uuid: "cam-1",
        ip: "192.168.4.2",
        model: "EOS R50",
      })),
      getLastKnownIP: jest.fn(() => ({ ip: "192.168.4.2" })),
      clearConnectionHistory: jest.fn(async () => ({ success: true })),
    };

    // Create router and mount it
    const apiRouter = createApiRouter(
      mockCameraController,
      mockPowerManager,
      mockServer,
      mockNetworkStateManager,
      mockDiscoveryManager,
      mockIntervalometerStateManager,
    );

    app.use("/api", apiRouter);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("Camera Routes", () => {
    describe("GET /api/camera/status", () => {
      test("returns camera status when connected", async () => {
        const response = await request(app)
          .get("/api/camera/status")
          .expect(200);

        expect(response.body).toEqual({
          connected: true,
          ip: "192.168.4.2",
          port: "443",
          model: "EOS R50",
        });

        expect(mockCameraController).toHaveBeenCalled();
        expect(
          mockCameraController.instance.getConnectionStatus,
        ).toHaveBeenCalled();
      });

      test("returns not connected when no camera available", async () => {
        mockCameraController.mockReturnValue(null);

        const response = await request(app)
          .get("/api/camera/status")
          .expect(200);

        expect(response.body).toEqual({
          connected: false,
          ip: null,
          port: null,
          lastError: "No camera available",
          shutterEndpoint: null,
          hasCapabilities: false,
        });
      });

      test("handles camera status error", async () => {
        mockCameraController.instance.getConnectionStatus.mockImplementation(
          () => {
            throw new Error("Connection failed");
          },
        );

        const response = await request(app)
          .get("/api/camera/status")
          .expect(500);

        expect(response.body).toHaveProperty("error");
        expect(response.body).toHaveProperty("timestamp");
        expect(response.body.error).toHaveProperty(
          "message",
          "Failed to get camera status",
        );
        expect(response.body.error).toHaveProperty("code");
        expect(response.body.error).toHaveProperty("component");
      });
    });

    describe("GET /api/camera/settings", () => {
      test("returns camera settings", async () => {
        const response = await request(app)
          .get("/api/camera/settings")
          .expect(200);

        expect(response.body).toEqual({
          iso: 100,
          shutterSpeed: "1/60",
          aperture: "f/2.8",
          imageQuality: "RAW+JPEG",
        });

        expect(
          mockCameraController.instance.getCameraSettings,
        ).toHaveBeenCalled();
      });

      test("returns 503 when no camera available", async () => {
        mockCameraController.mockReturnValue(null);

        const response = await request(app)
          .get("/api/camera/settings")
          .expect(503);

        expect(response.body).toHaveProperty("error");
        expect(response.body).toHaveProperty("timestamp");
        expect(response.body.error).toHaveProperty(
          "message",
          "No camera available",
        );
        expect(response.body.error).toHaveProperty("code");
        expect(response.body.error).toHaveProperty("component");
      });

      test("handles camera settings error", async () => {
        mockCameraController.instance.getCameraSettings.mockRejectedValue(
          new Error("Camera communication failed"),
        );

        const response = await request(app)
          .get("/api/camera/settings")
          .expect(500);

        expect(response.body).toHaveProperty("error");
        expect(response.body).toHaveProperty("timestamp");
        expect(response.body.error).toHaveProperty(
          "message",
          "Camera communication failed",
        );
      });
    });

    describe("GET /api/camera/battery", () => {
      test("returns camera battery status", async () => {
        const response = await request(app)
          .get("/api/camera/battery")
          .expect(200);

        expect(response.body).toEqual({
          level: 85,
          status: "good",
        });

        expect(
          mockCameraController.instance.getCameraBattery,
        ).toHaveBeenCalled();
      });

      test("returns 503 when no camera available", async () => {
        mockCameraController.mockReturnValue(null);

        const response = await request(app)
          .get("/api/camera/battery")
          .expect(503);

        expect(response.body).toHaveProperty("error");
        expect(response.body).toHaveProperty("timestamp");
        expect(response.body.error).toHaveProperty(
          "message",
          "No camera available",
        );
      });
    });

    describe("GET /api/camera/storage", () => {
      beforeEach(() => {
        // Add getStorageInfo mock to camera controller
        mockCameraController.instance.getStorageInfo = jest.fn(async () => ({
          mounted: true,
          name: "SD1",
          totalBytes: 64424509440,
          freeBytes: 32212254720,
          usedBytes: 32212254720,
          totalMB: 61440,
          freeMB: 30720,
          usedMB: 30720,
          percentUsed: 50,
          contentCount: 1234,
          accessMode: "readwrite",
        }));
      });

      test("returns storage info when camera available", async () => {
        const response = await request(app)
          .get("/api/camera/storage")
          .expect(200);

        expect(response.body).toEqual({
          mounted: true,
          name: "SD1",
          totalBytes: 64424509440,
          freeBytes: 32212254720,
          usedBytes: 32212254720,
          totalMB: 61440,
          freeMB: 30720,
          usedMB: 30720,
          percentUsed: 50,
          contentCount: 1234,
          accessMode: "readwrite",
        });

        expect(mockCameraController.instance.getStorageInfo).toHaveBeenCalled();
      });

      test("returns 503 when no camera available", async () => {
        mockCameraController.mockReturnValue(null);

        const response = await request(app)
          .get("/api/camera/storage")
          .expect(503);

        expect(response.body).toHaveProperty("error");
        expect(response.body).toHaveProperty("timestamp");
        expect(response.body.error).toHaveProperty(
          "message",
          "No camera available",
        );
        expect(response.body.error).toHaveProperty("code");
        expect(response.body.error).toHaveProperty("component");
      });

      test("returns 500 when getStorageInfo throws error", async () => {
        mockCameraController.instance.getStorageInfo.mockRejectedValue(
          new Error("Camera communication failed"),
        );

        const response = await request(app)
          .get("/api/camera/storage")
          .expect(500);

        expect(response.body).toHaveProperty("error");
        expect(response.body).toHaveProperty("timestamp");
        expect(response.body.error).toHaveProperty(
          "message",
          "Camera communication failed",
        );
        expect(response.body.error).toHaveProperty("code");
        expect(response.body.error).toHaveProperty("component");
      });

      test("response format matches schema for mounted SD card", async () => {
        const response = await request(app)
          .get("/api/camera/storage")
          .expect(200);

        // Verify all required fields are present
        expect(response.body).toHaveProperty("mounted");
        expect(response.body).toHaveProperty("name");
        expect(response.body).toHaveProperty("totalBytes");
        expect(response.body).toHaveProperty("freeBytes");
        expect(response.body).toHaveProperty("usedBytes");
        expect(response.body).toHaveProperty("totalMB");
        expect(response.body).toHaveProperty("freeMB");
        expect(response.body).toHaveProperty("usedMB");
        expect(response.body).toHaveProperty("percentUsed");
        expect(response.body).toHaveProperty("contentCount");
        expect(response.body).toHaveProperty("accessMode");

        // Verify field types
        expect(typeof response.body.mounted).toBe("boolean");
        expect(typeof response.body.name).toBe("string");
        expect(typeof response.body.totalBytes).toBe("number");
        expect(typeof response.body.freeBytes).toBe("number");
        expect(typeof response.body.usedBytes).toBe("number");
        expect(typeof response.body.totalMB).toBe("number");
        expect(typeof response.body.freeMB).toBe("number");
        expect(typeof response.body.usedMB).toBe("number");
        expect(typeof response.body.percentUsed).toBe("number");
        expect(typeof response.body.contentCount).toBe("number");
        expect(typeof response.body.accessMode).toBe("string");
      });

      test("response format matches schema for no SD card", async () => {
        mockCameraController.instance.getStorageInfo.mockResolvedValue({
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

        const response = await request(app)
          .get("/api/camera/storage")
          .expect(200);

        expect(response.body.mounted).toBe(false);
        expect(response.body.name).toBeNull();
        expect(response.body.accessMode).toBeNull();
        expect(response.body.totalBytes).toBe(0);
        expect(response.body.percentUsed).toBe(0);
      });

      test("handles camera not connected error", async () => {
        mockCameraController.instance.getStorageInfo.mockRejectedValue(
          new Error("Camera not connected"),
        );

        const response = await request(app)
          .get("/api/camera/storage")
          .expect(500);

        expect(response.body).toHaveProperty("error");
        expect(response.body.error).toHaveProperty(
          "message",
          "Camera not connected",
        );
      });
    });

    describe("POST /api/camera/photo", () => {
      test("takes a photo successfully", async () => {
        const response = await request(app)
          .post("/api/camera/photo")
          .expect(200);

        expect(response.body).toMatchObject({
          success: true,
          timestamp: expect.stringMatching(
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
          ),
        });

        expect(mockCameraController.instance.takePhoto).toHaveBeenCalled();
      });

      test("handles photo capture error", async () => {
        mockCameraController.instance.takePhoto.mockRejectedValue(
          new Error("Shutter stuck"),
        );

        const response = await request(app)
          .post("/api/camera/photo")
          .expect(500);

        expect(response.body).toHaveProperty("error");
        expect(response.body).toHaveProperty("timestamp");
        expect(response.body.error).toHaveProperty("message", "Shutter stuck");
      });
    });

    describe("POST /api/camera/configure", () => {
      test("configures camera IP and port", async () => {
        const response = await request(app)
          .post("/api/camera/configure")
          .send({ ip: "192.168.1.200", port: "8080" })
          .expect(200);

        expect(response.body).toEqual({
          success: true,
          message: "Camera configuration updated successfully",
          configuration: { ip: "192.168.1.200", port: "8080" },
        });

        expect(
          mockCameraController.instance.updateConfiguration,
        ).toHaveBeenCalledWith("192.168.1.200", "8080");
      });

      test("validates IP address format", async () => {
        const response = await request(app)
          .post("/api/camera/configure")
          .send({ ip: "invalid-ip" })
          .expect(400);

        expect(response.body).toHaveProperty("error");
        expect(response.body).toHaveProperty("timestamp");
        expect(response.body.error).toHaveProperty(
          "message",
          "Invalid IP address format",
        );
      });

      test("validates port range", async () => {
        const response = await request(app)
          .post("/api/camera/configure")
          .send({ ip: "192.168.1.200", port: "99999" })
          .expect(400);

        expect(response.body).toHaveProperty("error");
        expect(response.body).toHaveProperty("timestamp");
        expect(response.body.error).toHaveProperty(
          "message",
          "Port must be between 1 and 65535",
        );
      });

      test("requires IP address", async () => {
        const response = await request(app)
          .post("/api/camera/configure")
          .send({ port: "8080" })
          .expect(400);

        expect(response.body).toHaveProperty("error");
        expect(response.body).toHaveProperty("timestamp");
        expect(response.body.error).toHaveProperty(
          "message",
          "IP address is required",
        );
      });
    });

    // validate-interval endpoint removed - validation now happens automatically during intervalometer start
  });

  describe("Intervalometer Routes", () => {
    describe("POST /api/intervalometer/start", () => {
      test("starts intervalometer session", async () => {
        // The route uses IntervalometerSession directly, not through state manager
        // So we need to set up the server's activeIntervalometerSession after creation
        const response = await request(app)
          .post("/api/intervalometer/start")
          .send({ interval: 30, shots: 100, stopCondition: "stop-after" })
          .expect(200);

        expect(response.body).toMatchObject({
          success: true,
          message: "Intervalometer started successfully",
        });

        // The API should have created a session
        expect(mockServer.activeIntervalometerSession).toBeDefined();
      });

      test("supports title parameter", async () => {
        const response = await request(app)
          .post("/api/intervalometer/start")
          .send({
            interval: 30,
            shots: 100,
            stopCondition: "stop-after",
            title: "Test Session",
          })
          .expect(200);

        expect(response.body).toMatchObject({
          success: true,
          message: "Intervalometer started successfully",
        });
      });

      test("prevents starting when session already running", async () => {
        mockServer.activeIntervalometerSession = { state: "running" };

        const response = await request(app)
          .post("/api/intervalometer/start")
          .send({ interval: 30, shots: 100, stopCondition: "stop-after" })
          .expect(400);

        expect(response.body).toHaveProperty("error");
        expect(response.body).toHaveProperty("timestamp");
        expect(response.body.error).toHaveProperty(
          "message",
          "Intervalometer is already running",
        );
      });

      test("validates interval parameter", async () => {
        const response = await request(app)
          .post("/api/intervalometer/start")
          .send({ shots: 100 })
          .expect(400);

        expect(response.body).toHaveProperty("error");
        expect(response.body).toHaveProperty("timestamp");
        expect(response.body.error).toHaveProperty(
          "message",
          "Invalid interval value",
        );
      });
    });

    describe("GET /api/intervalometer/status", () => {
      test("returns status when session active", async () => {
        mockServer.activeIntervalometerSession = {
          getStatus: jest.fn(() => ({
            state: "running",
            progress: { shots: 25, total: 100 },
            stats: {
              startTime: "2024-01-01T20:00:00.000Z",
              shotsTaken: 25,
              shotsSuccessful: 24,
              shotsFailed: 1,
              currentShot: 26,
              nextShotTime: "2024-01-01T20:12:30.000Z",
            },
            options: {
              interval: 30,
              totalShots: 100,
            },
          })),
        };

        const response = await request(app)
          .get("/api/intervalometer/status")
          .expect(200);

        expect(response.body).toMatchObject({
          running: true,
          state: "running",
          stats: {
            shotsTaken: 25,
            shotsSuccessful: 24,
            shotsFailed: 1,
          },
          options: {
            interval: 30,
            totalShots: 100,
          },
        });
      });

      test("returns inactive status when no session", async () => {
        mockServer.activeIntervalometerSession = null;

        const response = await request(app)
          .get("/api/intervalometer/status")
          .expect(200);

        expect(response.body).toEqual({
          running: false,
          state: "stopped",
        });
      });
    });
  });

  describe("Timelapse Report Routes", () => {
    describe("GET /api/timelapse/reports", () => {
      test("returns all timelapse reports", async () => {
        const response = await request(app)
          .get("/api/timelapse/reports")
          .expect(200);

        expect(response.body).toEqual({
          reports: [
            { id: "report-1", title: "Test Report 1" },
            { id: "report-2", title: "Test Report 2" },
          ],
        });

        expect(mockIntervalometerStateManager.getReports).toHaveBeenCalled();
      });

      test("handles reports error", async () => {
        mockIntervalometerStateManager.getReports.mockRejectedValue(
          new Error("Database error"),
        );

        const response = await request(app)
          .get("/api/timelapse/reports")
          .expect(500);

        expect(response.body).toHaveProperty("error");
        expect(response.body).toHaveProperty("timestamp");
        expect(response.body.error).toHaveProperty("message", "Database error");
      });
    });

    describe("GET /api/timelapse/reports/:id", () => {
      test("returns specific report", async () => {
        const response = await request(app)
          .get("/api/timelapse/reports/report-1")
          .expect(200);

        expect(response.body).toEqual({
          id: "report-1",
          title: "Test Report 1",
        });

        expect(mockIntervalometerStateManager.getReport).toHaveBeenCalledWith(
          "report-1",
        );
      });

      test("returns 404 for non-existent report", async () => {
        const response = await request(app)
          .get("/api/timelapse/reports/nonexistent")
          .expect(404);

        expect(response.body).toHaveProperty("error");
        expect(response.body).toHaveProperty("timestamp");
        expect(response.body.error).toHaveProperty(
          "message",
          "Report not found",
        );
      });
    });

    describe("PUT /api/timelapse/reports/:id/title", () => {
      test("updates report title", async () => {
        const response = await request(app)
          .put("/api/timelapse/reports/report-1/title")
          .send({ title: "Updated Title" })
          .expect(200);

        expect(response.body).toMatchObject({
          id: "report-1",
          title: "Updated Title",
        });

        expect(
          mockIntervalometerStateManager.updateReportTitle,
        ).toHaveBeenCalledWith("report-1", "Updated Title");
      });

      test("validates title parameter", async () => {
        const response = await request(app)
          .put("/api/timelapse/reports/report-1/title")
          .send({})
          .expect(400);

        expect(response.body).toHaveProperty("error");
        expect(response.body).toHaveProperty("timestamp");
        expect(response.body.error).toHaveProperty(
          "message",
          "Title cannot be empty",
        );
      });
    });
  });

  describe("Network Routes", () => {
    describe("GET /api/network/status", () => {
      test("returns network status", async () => {
        const response = await request(app)
          .get("/api/network/status")
          .expect(200);

        expect(response.body).toEqual({
          interfaces: {
            wlan0: {
              connected: true,
              network: "TestNetwork",
              ip: "192.168.1.100",
            },
          },
        });

        expect(mockNetworkStateManager.getNetworkStatus).toHaveBeenCalled();
      });

      test("handles network status error", async () => {
        mockNetworkStateManager.getNetworkStatus.mockRejectedValue(
          new Error("Network error"),
        );

        const response = await request(app)
          .get("/api/network/status")
          .expect(500);

        expect(response.body).toHaveProperty("error");
        expect(response.body).toHaveProperty("timestamp");
        expect(response.body.error).toHaveProperty("message", "Network error");
      });
    });

    describe("GET /api/network/wifi/scan", () => {
      test("scans for WiFi networks", async () => {
        const response = await request(app)
          .get("/api/network/wifi/scan")
          .expect(200);

        expect(response.body).toEqual({
          networks: [
            { ssid: "Network1", signal: 85, security: "WPA2" },
            { ssid: "Network2", signal: 72, security: "WPA3" },
          ],
        });

        expect(
          mockNetworkStateManager.serviceManager.scanWiFiNetworks,
        ).toHaveBeenCalled();
      });
    });

    describe("POST /api/network/wifi/connect", () => {
      test("connects to WiFi network", async () => {
        const response = await request(app)
          .post("/api/network/wifi/connect")
          .send({ ssid: "TestNetwork", password: "password123" })
          .expect(200);

        expect(response.body).toEqual({
          success: true,
        });

        expect(
          mockNetworkStateManager.serviceManager.connectToWiFi,
        ).toHaveBeenCalledWith("TestNetwork", "password123", undefined);
      });

      test("validates SSID parameter", async () => {
        const response = await request(app)
          .post("/api/network/wifi/connect")
          .send({ password: "password123" })
          .expect(400);

        expect(response.body).toHaveProperty("error");
        expect(response.body).toHaveProperty("timestamp");
        expect(response.body.error).toHaveProperty(
          "message",
          "SSID is required",
        );
      });
    });
  });

  describe("System Routes", () => {
    describe("GET /api/system/power", () => {
      test("returns power status", async () => {
        const response = await request(app)
          .get("/api/system/power")
          .expect(200);

        expect(response.body).toEqual({
          isRaspberryPi: true,
          uptime: 3600,
          thermal: { temperature: 45.2 },
        });

        expect(mockPowerManager.getStatus).toHaveBeenCalled();
      });

      test("handles power status error", async () => {
        mockPowerManager.getStatus.mockImplementation(() => {
          throw new Error("Power monitoring failed");
        });

        const response = await request(app)
          .get("/api/system/power")
          .expect(500);

        expect(response.body).toHaveProperty("error");
        expect(response.body).toHaveProperty("timestamp");
        expect(response.body.error).toHaveProperty(
          "message",
          "Failed to get power status",
        );
      });
    });

    describe("GET /api/system/status", () => {
      test("returns system status", async () => {
        const response = await request(app)
          .get("/api/system/status")
          .expect(200);

        expect(response.body).toMatchObject({
          timestamp: expect.stringMatching(
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
          ),
          uptime: expect.any(Number),
          memory: expect.any(Object),
          platform: expect.any(String),
          nodeVersion: expect.any(String),
          power: {
            isRaspberryPi: true,
            uptime: 3600,
            thermal: { temperature: 45.2 },
          },
        });
      });
    });
  });

  describe("Discovery Routes", () => {
    describe("GET /api/discovery/status", () => {
      test("returns discovery status", async () => {
        const response = await request(app)
          .get("/api/discovery/status")
          .expect(200);

        expect(response.body).toEqual({
          isDiscovering: true,
          cameras: 1,
        });

        expect(mockDiscoveryManager.getStatus).toHaveBeenCalled();
      });
    });

    describe("GET /api/discovery/cameras", () => {
      test("returns discovered cameras", async () => {
        const response = await request(app)
          .get("/api/discovery/cameras")
          .expect(200);

        expect(response.body).toEqual([
          { uuid: "cam-1", ip: "192.168.4.2", model: "EOS R50" },
        ]);

        expect(mockDiscoveryManager.getDiscoveredCameras).toHaveBeenCalled();
      });
    });
  });
});
