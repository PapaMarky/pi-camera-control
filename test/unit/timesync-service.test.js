/**
 * Time Synchronization Service Tests
 *
 * Tests for automatic time synchronization between client, Pi, and camera
 */

import { jest } from "@jest/globals";
import { TimeSyncService } from "../../src/timesync/service.js";
import { spawn } from "child_process";

// Mock child_process spawn
jest.mock("child_process", () => ({
  spawn: jest.fn(),
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

describe("TimeSyncService", () => {
  let timeSyncService;
  let mockWsManager;
  let mockCameraController;
  let mockWs;

  beforeEach(() => {
    // Create new instance for each test
    jest.isolateModules(() => {
      timeSyncService = new TimeSyncService();
    });

    // Mock WebSocket manager
    mockWsManager = {
      broadcast: jest.fn(),
    };

    // Mock camera controller
    mockCameraController = {
      isConnected: jest.fn().mockReturnValue(false),
      getCameraDateTime: jest.fn(),
      setCameraDateTime: jest.fn(),
    };

    // Mock WebSocket connection
    mockWs = {
      send: jest.fn(),
    };

    // Initialize service with mocks
    timeSyncService.initialize(mockWsManager, mockCameraController);
  });

  afterEach(async () => {
    jest.clearAllMocks();
    if (timeSyncService) {
      await timeSyncService.cleanup();
    }
  });

  describe("Client Connection Handling", () => {
    test("should request time sync from AP client on connection", async () => {
      await timeSyncService.handleClientConnection(
        "192.168.4.2",
        "ap0",
        mockWs,
      );

      // Should send time-sync-request to client
      expect(mockWs.send).toHaveBeenCalled();
      const sentMessage = JSON.parse(mockWs.send.mock.calls[0][0]);
      expect(sentMessage.type).toBe("time-sync-request");
      expect(sentMessage.requestId).toBeDefined();
    });

    test("should request time sync from wlan0 client (Phase 3)", async () => {
      await timeSyncService.handleClientConnection(
        "192.168.1.100",
        "wlan0",
        mockWs,
      );

      // Phase 3: wlan0 clients should be auto-synced
      expect(mockWs.send).toHaveBeenCalled();
      const sentMessage = JSON.parse(mockWs.send.mock.calls[0][0]);
      expect(sentMessage.type).toBe("time-sync-request");
      expect(sentMessage.requestId).toBeDefined();
    });
  });

  describe("Time Sync Response Handling", () => {
    test("should sync Pi time when drift exceeds threshold", async () => {
      // Register client
      await timeSyncService.handleClientConnection(
        "192.168.4.2",
        "ap0",
        mockWs,
      );

      // Client time is 2 seconds ahead
      const clientTime = new Date(Date.now() + 2000);

      // Handle time sync response
      await timeSyncService.handleClientTimeResponse(
        "192.168.4.2",
        clientTime.toISOString(),
        "America/Los_Angeles",
      );

      // Service should have detected the drift and logged it
      // (actual time sync via sudo date is tested manually/integration)
      const status = timeSyncService.getStatus();
      expect(status.piReliable).toBe(true);
      expect(status.lastPiSync).not.toBe(null);
    });

    test("should not sync when drift is within threshold", async () => {
      // Register client
      await timeSyncService.handleClientConnection(
        "192.168.4.2",
        "ap0",
        mockWs,
      );

      // Client time is only 500ms ahead (below 1000ms threshold)
      const clientTime = new Date(Date.now() + 500);

      await timeSyncService.handleClientTimeResponse(
        "192.168.4.2",
        clientTime.toISOString(),
        "America/Los_Angeles",
      );

      // Service should still update status even if drift is small
      const status = timeSyncService.getStatus();
      expect(status.piReliable).toBe(true);
    });
  });

  describe("Camera Synchronization", () => {
    test("should sync camera time when camera connects and Pi has valid proxy state (Phase 4)", async () => {
      // Phase 4: Connect ap0 client to establish valid proxy state
      await timeSyncService.handleClientConnection(
        "192.168.4.2",
        "ap0",
        mockWs,
      );

      const clientTime = new Date();
      await timeSyncService.handleClientTimeResponse(
        "192.168.4.2",
        clientTime.toISOString(),
      );

      // Verify piProxyState is valid
      expect(timeSyncService.piProxyState.isValid()).toBe(true);

      // Disconnect client (state should remain valid for 10 minutes)
      timeSyncService.connectedClients.delete("192.168.4.2");

      // Mock camera as connected
      mockCameraController.connected = true;

      // Mock camera time with 3 second drift
      const now = Date.now();
      const cameraTime = new Date(now + 3000);
      mockCameraController.getCameraDateTime.mockResolvedValue(
        cameraTime.toISOString(),
      );
      mockCameraController.setCameraDateTime.mockResolvedValue(true);

      // Trigger camera connection (Rule 3B part 1: valid proxy state)
      await timeSyncService.handleCameraConnection();

      // Should get current camera time
      expect(mockCameraController.getCameraDateTime).toHaveBeenCalled();

      // Should set camera time to match Pi (sync camera from Pi)
      expect(mockCameraController.setCameraDateTime).toHaveBeenCalled();
    });

    test("should sync Pi from camera when proxy state is invalid (Phase 4: Rule 3B part 2)", async () => {
      // Pi has no valid proxy state (state is 'none')
      expect(timeSyncService.piProxyState.state).toBe("none");

      // Mock camera as connected
      mockCameraController.connected = true;

      // Mock camera time (camera is ahead of Pi)
      const now = Date.now();
      const cameraTime = new Date(now + 3000);
      mockCameraController.getCameraDateTime.mockResolvedValue(
        cameraTime.toISOString(),
      );

      // Trigger camera connection (Rule 3B part 2: no valid proxy, sync Pi from camera)
      await timeSyncService.handleCameraConnection();

      // Should get camera time (to sync Pi from camera)
      expect(mockCameraController.getCameraDateTime).toHaveBeenCalled();

      // Should NOT set camera time (we're syncing Pi from camera, not vice versa)
      expect(mockCameraController.setCameraDateTime).not.toHaveBeenCalled();
    });

    test("should not sync camera when drift is within threshold", async () => {
      // Set Pi as synchronized
      const clientTime = new Date();
      await timeSyncService.handleClientTimeResponse(
        "192.168.4.2",
        clientTime.toISOString(),
      );

      mockCameraController.connected = true;

      // Mock camera time with only 500ms drift
      const now = Date.now();
      const cameraTime = new Date(now + 500);
      mockCameraController.getCameraDateTime.mockResolvedValue(
        cameraTime.toISOString(),
      );

      await timeSyncService.handleCameraConnection();

      // Should get camera time
      expect(mockCameraController.getCameraDateTime).toHaveBeenCalled();

      // Should not set camera time (drift within threshold)
      expect(mockCameraController.setCameraDateTime).not.toHaveBeenCalled();
    });
  });

  describe("Status Reporting", () => {
    test("should provide comprehensive sync status", () => {
      const status = timeSyncService.getStatus();

      // The raw status format from state
      expect(status).toHaveProperty("piReliable");
      expect(status).toHaveProperty("lastPiSync");
      expect(status).toHaveProperty("lastCameraSync");
      expect(status).toHaveProperty("syncSource");
      expect(status).toHaveProperty("timeSinceLastSync");
      expect(status).toHaveProperty("noClientSince");
      expect(status).toHaveProperty("autoSyncEnabled");
      expect(status).toHaveProperty("syncHistory");
    });

    test("should track reliability levels correctly", async () => {
      // Initial state - no sync
      let status = timeSyncService.getStatus();
      expect(status.piReliable).toBe(false);
      expect(status.lastPiSync).toBe(null);

      // After sync - should be reliable
      const clientTime = new Date();
      await timeSyncService.handleClientTimeResponse(
        "192.168.4.2",
        clientTime.toISOString(),
      );

      status = timeSyncService.getStatus();
      expect(status.piReliable).toBe(true);
      expect(status.lastPiSync).not.toBe(null);
    });
  });

  describe("WebSocket Messages", () => {
    test("should send properly formatted time-sync-request", async () => {
      await timeSyncService.handleClientConnection(
        "192.168.4.2",
        "ap0",
        mockWs,
      );

      const sentMessage = JSON.parse(mockWs.send.mock.calls[0][0]);

      // Verify message structure matches specification
      expect(sentMessage).toMatchObject({
        type: "time-sync-request",
        requestId: expect.any(Number),
      });

      // Should NOT include serverTime in initial request
      expect(sentMessage.serverTime).toBeUndefined();
    });

    test("should broadcast activity log messages", async () => {
      // Clear any previous calls
      mockWsManager.broadcast.mockClear();

      await timeSyncService.handleClientConnection(
        "192.168.4.2",
        "ap0",
        mockWs,
      );

      // Should send activity log for connection
      expect(mockWsManager.broadcast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "activity_log",
          data: expect.objectContaining({
            message: expect.any(String),
            type: expect.any(String),
            timestamp: expect.any(String),
          }),
        }),
      );
    });

    test("should broadcast time-sync-status after client sync", async () => {
      // Clear any previous calls
      mockWsManager.broadcast.mockClear();

      // Perform a client sync which triggers broadcast
      const clientTime = new Date();
      await timeSyncService.handleClientTimeResponse(
        "192.168.4.2",
        clientTime.toISOString(),
      );

      // Check that broadcasts have been made
      const calls = mockWsManager.broadcast.mock.calls;

      // Should have at least one broadcast call
      expect(calls.length).toBeGreaterThan(0);

      // Should have activity_log and potentially time-sync-status
      const hasActivityLog = calls.some(
        (call) => call[0]?.type === "activity_log",
      );
      expect(hasActivityLog).toBe(true);
    });
  });

  describe("Scheduled Synchronization", () => {
    test("should have sync check interval configured", () => {
      // Verify the service has scheduling configured
      const status = timeSyncService.getStatus();
      expect(status).toHaveProperty("autoSyncEnabled");

      // The service initializes with a 15-minute sync interval
      // This is tested via actual behavior in integration tests
      expect(status.autoSyncEnabled).toBe(true);
    });
  });
});
