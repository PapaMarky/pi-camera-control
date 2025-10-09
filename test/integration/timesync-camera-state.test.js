/**
 * Integration Tests for Camera Sync with PiProxyState
 *
 * Tests camera synchronization using the PiProxyState system.
 * Covers:
 * - Rule 3A: Camera connects with client available → sync via client
 * - Rule 3B part 1: Camera connects with valid proxy state → sync camera from Pi
 * - Rule 3B part 2: Camera connects with no valid state → sync Pi from camera
 */

import { jest } from "@jest/globals";
import { EventEmitter } from "events";

describe("TimeSync Camera Sync with PiProxyState Integration", () => {
  let TimeSyncService;
  let timeSyncService;
  let mockWsManager;
  let mockCameraController;
  let mockCamera;
  let mockWs;

  beforeAll(async () => {
    // Dynamic import to allow mocking
    const module = await import("../../src/timesync/service.js");
    TimeSyncService = module.TimeSyncService;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Mock WebSocket
    mockWs = new EventEmitter();
    mockWs.send = jest.fn();
    mockWs.readyState = 1; // OPEN

    // Mock Camera
    mockCamera = {
      connected: true,
      getCameraDateTime: jest.fn(),
      setCameraDateTime: jest.fn(),
    };

    // Mock Camera Controller (function that returns camera instance)
    mockCameraController = jest.fn(() => mockCamera);

    // Mock WebSocket Manager
    mockWsManager = {
      broadcast: jest.fn(),
    };

    // Create fresh service instance
    timeSyncService = new TimeSyncService();
    timeSyncService.initialize(mockWsManager, mockCameraController);
  });

  afterEach(() => {
    timeSyncService.cleanup();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe("Rule 3A: Camera with client available", () => {
    test("should sync camera via ap0 client when ap0 available", async () => {
      const ap0ClientIP = "192.168.12.100";

      // Connect ap0 client
      await timeSyncService.handleClientConnection(ap0ClientIP, "ap0", mockWs);
      jest.advanceTimersByTime(1100);

      // Sync with ap0
      await timeSyncService.handleClientTimeResponse(
        ap0ClientIP,
        new Date().toISOString(),
        "America/Los_Angeles",
      );

      // Mock camera time with drift
      mockCamera.getCameraDateTime.mockResolvedValue(
        new Date(Date.now() + 2000).toISOString(),
      );
      mockCamera.setCameraDateTime.mockResolvedValue(true);

      // Camera connects - should sync via ap0 client
      await timeSyncService.handleCameraConnection();

      // Should request time from ap0 client
      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining("time-sync-request"),
      );
    });

    test("should sync camera via wlan0 client when only wlan0 available", async () => {
      const wlan0ClientIP = "192.168.1.100";

      // Connect wlan0 client
      await timeSyncService.handleClientConnection(
        wlan0ClientIP,
        "wlan0",
        mockWs,
      );
      jest.advanceTimersByTime(1100);

      // Sync with wlan0
      await timeSyncService.handleClientTimeResponse(
        wlan0ClientIP,
        new Date().toISOString(),
        "America/Los_Angeles",
      );

      // Camera connects - should sync via wlan0 client
      await timeSyncService.handleCameraConnection();

      // Should request time from wlan0 client
      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining("time-sync-request"),
      );
    });

    test("should prefer ap0 over wlan0 when both available", async () => {
      const ap0ClientIP = "192.168.12.100";
      const wlan0ClientIP = "192.168.1.100";

      // Connect wlan0 client first
      const mockWs1 = new EventEmitter();
      mockWs1.send = jest.fn();
      mockWs1.readyState = 1;

      await timeSyncService.handleClientConnection(
        wlan0ClientIP,
        "wlan0",
        mockWs1,
      );
      jest.advanceTimersByTime(1100);

      await timeSyncService.handleClientTimeResponse(
        wlan0ClientIP,
        new Date().toISOString(),
        "America/Los_Angeles",
      );

      // Connect ap0 client
      const mockWs2 = new EventEmitter();
      mockWs2.send = jest.fn();
      mockWs2.readyState = 1;

      await timeSyncService.handleClientConnection(
        ap0ClientIP,
        "ap0",
        mockWs2,
      );
      jest.advanceTimersByTime(1100);

      // Camera connects - should prefer ap0
      await timeSyncService.handleCameraConnection();

      // Should request time from ap0 client (mockWs2)
      expect(mockWs2.send).toHaveBeenCalledWith(
        expect.stringContaining("time-sync-request"),
      );

      // Should NOT request from wlan0 client
      expect(mockWs1.send).toHaveBeenCalledTimes(1); // Only initial connection
    });
  });

  describe("Rule 3B part 1: Camera with valid proxy state", () => {
    test("should sync camera from Pi when ap0 proxy state is valid", async () => {
      const clientIP = "192.168.12.100";

      // Connect and sync with ap0
      await timeSyncService.handleClientConnection(clientIP, "ap0", mockWs);
      jest.advanceTimersByTime(1100);

      await timeSyncService.handleClientTimeResponse(
        clientIP,
        new Date().toISOString(),
        "America/Los_Angeles",
      );

      // Disconnect client to test proxy state validity without active client
      timeSyncService.handleClientDisconnection(clientIP);

      // State should still be valid
      expect(timeSyncService.piProxyState.state).toBe("ap0-device");
      expect(timeSyncService.piProxyState.isValid()).toBe(true);

      // Mock camera time with drift
      mockCamera.getCameraDateTime.mockResolvedValue(
        new Date(Date.now() + 2000).toISOString(),
      );
      mockCamera.setCameraDateTime.mockResolvedValue(true);

      // Camera connects - should sync from Pi (valid proxy state)
      await timeSyncService.handleCameraConnection();

      // Should get camera time
      expect(mockCamera.getCameraDateTime).toHaveBeenCalled();

      // Should set camera time
      expect(mockCamera.setCameraDateTime).toHaveBeenCalled();
    });

    test("should sync camera from Pi when wlan0 proxy state is valid", async () => {
      const clientIP = "192.168.1.100";

      // Connect and sync with wlan0
      await timeSyncService.handleClientConnection(clientIP, "wlan0", mockWs);
      jest.advanceTimersByTime(1100);

      await timeSyncService.handleClientTimeResponse(
        clientIP,
        new Date().toISOString(),
        "America/Los_Angeles",
      );

      // Disconnect client
      timeSyncService.handleClientDisconnection(clientIP);

      // State should still be valid
      expect(timeSyncService.piProxyState.state).toBe("wlan0-device");
      expect(timeSyncService.piProxyState.isValid()).toBe(true);

      // Mock camera time with drift
      mockCamera.getCameraDateTime.mockResolvedValue(
        new Date(Date.now() + 2000).toISOString(),
      );
      mockCamera.setCameraDateTime.mockResolvedValue(true);

      // Camera connects - should sync from Pi (valid proxy state)
      await timeSyncService.handleCameraConnection();

      // Should sync camera from Pi
      expect(mockCamera.getCameraDateTime).toHaveBeenCalled();
      expect(mockCamera.setCameraDateTime).toHaveBeenCalled();
    });

    test("should not sync camera if proxy state is invalid", async () => {
      const clientIP = "192.168.12.100";

      // Connect and sync with ap0
      await timeSyncService.handleClientConnection(clientIP, "ap0", mockWs);
      jest.advanceTimersByTime(1100);

      await timeSyncService.handleClientTimeResponse(
        clientIP,
        new Date().toISOString(),
        "America/Los_Angeles",
      );

      // Disconnect client
      timeSyncService.handleClientDisconnection(clientIP);

      // Advance time past validity window (10+ minutes)
      jest.advanceTimersByTime(11 * 60 * 1000);

      // Expire the state
      timeSyncService.piProxyState.expire();
      expect(timeSyncService.piProxyState.isValid()).toBe(false);

      // Mock camera time
      mockCamera.getCameraDateTime.mockResolvedValue(
        new Date().toISOString(),
      );

      // Camera connects with invalid proxy state - should sync Pi from camera instead
      await timeSyncService.handleCameraConnection();

      // Should get camera time (to sync Pi from camera)
      expect(mockCamera.getCameraDateTime).toHaveBeenCalled();

      // Should NOT set camera time (Rule 3B part 2: sync Pi from camera)
      expect(mockCamera.setCameraDateTime).not.toHaveBeenCalled();
    });
  });

  describe("Rule 3B part 2: Camera with no valid state", () => {
    test("should sync Pi from camera when state is none", async () => {
      // No client connections, state is 'none'
      expect(timeSyncService.piProxyState.state).toBe("none");

      // Mock camera time (Pi is behind by 3 seconds)
      const cameraTime = new Date();
      const piTime = new Date(cameraTime.getTime() - 3000);
      jest.setSystemTime(piTime);

      mockCamera.getCameraDateTime.mockResolvedValue(
        cameraTime.toISOString(),
      );

      // Camera connects with no valid state - should sync Pi from camera
      await timeSyncService.handleCameraConnection();

      // Should get camera time
      expect(mockCamera.getCameraDateTime).toHaveBeenCalled();

      // Should NOT set camera time (we're syncing Pi from camera, not camera from Pi)
      expect(mockCamera.setCameraDateTime).not.toHaveBeenCalled();

      // State should remain 'none' (Pi is not acting as proxy, just has camera time)
      expect(timeSyncService.piProxyState.state).toBe("none");
    });

    test("should sync Pi from camera when state is expired", async () => {
      const clientIP = "192.168.12.100";

      // Connect and sync with ap0
      await timeSyncService.handleClientConnection(clientIP, "ap0", mockWs);
      jest.advanceTimersByTime(1100);

      await timeSyncService.handleClientTimeResponse(
        clientIP,
        new Date().toISOString(),
        "America/Los_Angeles",
      );

      // Disconnect client and advance time past validity window
      timeSyncService.handleClientDisconnection(clientIP);
      jest.advanceTimersByTime(11 * 60 * 1000);

      // Expire the state
      timeSyncService.piProxyState.expire();
      expect(timeSyncService.piProxyState.state).toBe("none");

      // Mock camera time (Pi is behind)
      const cameraTime = new Date();
      mockCamera.getCameraDateTime.mockResolvedValue(
        cameraTime.toISOString(),
      );

      // Camera connects with expired state - should sync Pi from camera
      await timeSyncService.handleCameraConnection();

      // Should get camera time to sync Pi
      expect(mockCamera.getCameraDateTime).toHaveBeenCalled();
    });

    test("should not sync if drift is within threshold", async () => {
      // No valid state
      expect(timeSyncService.piProxyState.state).toBe("none");

      // Mock camera time with minimal drift (< 1 second)
      const cameraTime = new Date();
      const piTime = new Date(cameraTime.getTime() - 500); // Only 500ms drift
      jest.setSystemTime(piTime);

      mockCamera.getCameraDateTime.mockResolvedValue(
        cameraTime.toISOString(),
      );

      // Camera connects - should check but not sync
      await timeSyncService.handleCameraConnection();

      // Should get camera time for comparison
      expect(mockCamera.getCameraDateTime).toHaveBeenCalled();

      // State should remain 'none' (no sync occurred)
      expect(timeSyncService.piProxyState.state).toBe("none");
    });
  });

  describe("Camera sync after client sync", () => {
    test("should sync camera after successful Pi sync from ap0", async () => {
      const clientIP = "192.168.12.100";

      // Mock camera with significant drift
      mockCamera.getCameraDateTime.mockResolvedValue(
        new Date(Date.now() + 3000).toISOString(),
      );
      mockCamera.setCameraDateTime.mockResolvedValue(true);

      await timeSyncService.handleClientConnection(clientIP, "ap0", mockWs);
      jest.advanceTimersByTime(1100);

      // Sync with ap0 - this should trigger camera sync
      await timeSyncService.handleClientTimeResponse(
        clientIP,
        new Date().toISOString(),
        "America/Los_Angeles",
      );

      // Verify camera sync was attempted
      expect(mockCamera.getCameraDateTime).toHaveBeenCalled();
      expect(mockCamera.setCameraDateTime).toHaveBeenCalled();
    });

    test("should sync camera after successful Pi sync from wlan0", async () => {
      const clientIP = "192.168.1.100";

      // Set a fixed camera time ahead of Pi (3 seconds ahead)
      const baseTime = new Date("2025-01-09T12:00:00Z");
      const cameraTime = new Date(baseTime.getTime() + 3000);

      mockCamera.getCameraDateTime.mockResolvedValue(
        cameraTime.toISOString(),
      );
      mockCamera.setCameraDateTime.mockResolvedValue(true);

      // Set system time to base time
      jest.setSystemTime(baseTime);

      await timeSyncService.handleClientConnection(clientIP, "wlan0", mockWs);
      jest.advanceTimersByTime(1100);

      // Sync with wlan0
      await timeSyncService.handleClientTimeResponse(
        clientIP,
        baseTime.toISOString(),
        "America/Los_Angeles",
      );

      // Verify camera sync was attempted
      expect(mockCamera.getCameraDateTime).toHaveBeenCalled();
      expect(mockCamera.setCameraDateTime).toHaveBeenCalled();
    });

    test("should not sync camera if not connected", async () => {
      const clientIP = "192.168.12.100";

      // Camera not connected
      mockCamera.connected = false;

      await timeSyncService.handleClientConnection(clientIP, "ap0", mockWs);
      jest.advanceTimersByTime(1100);

      // Sync with ap0
      await timeSyncService.handleClientTimeResponse(
        clientIP,
        new Date().toISOString(),
        "America/Los_Angeles",
      );

      // Camera sync should not be attempted
      expect(mockCamera.getCameraDateTime).not.toHaveBeenCalled();
      expect(mockCamera.setCameraDateTime).not.toHaveBeenCalled();
    });
  });

  describe("State validity checks", () => {
    test("should use piProxyState for camera sync decision", async () => {
      const clientIP = "192.168.12.100";

      // Connect and sync with ap0
      await timeSyncService.handleClientConnection(clientIP, "ap0", mockWs);
      jest.advanceTimersByTime(1100);

      await timeSyncService.handleClientTimeResponse(
        clientIP,
        new Date().toISOString(),
        "America/Los_Angeles",
      );

      // Disconnect client but state should remain valid
      timeSyncService.handleClientDisconnection(clientIP);

      // Verify state is valid
      expect(timeSyncService.piProxyState.isValid()).toBe(true);
      expect(timeSyncService.piProxyState.state).toBe("ap0-device");

      // Mock camera
      mockCamera.getCameraDateTime.mockResolvedValue(
        new Date(Date.now() + 2000).toISOString(),
      );
      mockCamera.setCameraDateTime.mockResolvedValue(true);

      // Camera connects - should use valid proxy state
      await timeSyncService.handleCameraConnection();

      // Should sync camera from Pi (valid proxy state)
      expect(mockCamera.setCameraDateTime).toHaveBeenCalled();
    });

    test("should respect 10-minute validity window", async () => {
      const clientIP = "192.168.12.100";

      // Connect and sync
      await timeSyncService.handleClientConnection(clientIP, "ap0", mockWs);
      jest.advanceTimersByTime(1100);

      await timeSyncService.handleClientTimeResponse(
        clientIP,
        new Date().toISOString(),
        "America/Los_Angeles",
      );

      // Disconnect and advance time to just before expiry (9m 59s)
      timeSyncService.handleClientDisconnection(clientIP);
      jest.advanceTimersByTime(9 * 60 * 1000 + 59000);

      // State should still be valid
      expect(timeSyncService.piProxyState.isValid()).toBe(true);

      // Mock camera
      mockCamera.getCameraDateTime.mockResolvedValue(
        new Date(Date.now() + 2000).toISOString(),
      );
      mockCamera.setCameraDateTime.mockResolvedValue(true);

      // Camera connects - should sync from Pi (still valid)
      await timeSyncService.handleCameraConnection();
      expect(mockCamera.setCameraDateTime).toHaveBeenCalled();

      // Reset mocks
      mockCamera.getCameraDateTime.mockClear();
      mockCamera.setCameraDateTime.mockClear();

      // Advance time past expiry (10m 1s total)
      jest.advanceTimersByTime(2000);
      expect(timeSyncService.piProxyState.isValid()).toBe(false);

      // Camera connects again - should sync Pi from camera now
      await timeSyncService.handleCameraConnection();

      // Should get camera time but NOT set it
      expect(mockCamera.getCameraDateTime).toHaveBeenCalled();
      expect(mockCamera.setCameraDateTime).not.toHaveBeenCalled();
    });
  });
});
