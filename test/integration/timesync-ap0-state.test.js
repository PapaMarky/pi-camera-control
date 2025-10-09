/**
 * Integration Tests for ap0 Sync with PiProxyState
 *
 * Tests ap0 client synchronization using the PiProxyState system.
 * Covers:
 * - ap0 connect → state transitions to 'ap0-device'
 * - Ignore second ap0 when already in ap0-device state
 * - 5-minute resync updates acquiredAt
 * - Failover when ap0 client disconnects during resync
 * - State expires after 10 minutes
 */

import { jest } from "@jest/globals";
import { EventEmitter } from "events";

describe("TimeSync ap0 Sync with PiProxyState Integration", () => {
  let TimeSyncService;
  let timeSyncService;
  let mockWsManager;
  let mockCameraController;
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

    // Mock WebSocket Manager
    mockWsManager = {
      broadcast: jest.fn(),
    };

    // Mock Camera Controller
    mockCameraController = jest.fn(() => ({
      connected: false,
      getCameraDateTime: jest.fn(),
      setCameraDateTime: jest.fn(),
    }));

    // Create fresh service instance
    timeSyncService = new TimeSyncService();
    timeSyncService.initialize(mockWsManager, mockCameraController);
  });

  afterEach(() => {
    timeSyncService.cleanup();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe("State initialization", () => {
    test("should initialize with piProxyState in 'none' state", () => {
      expect(timeSyncService.piProxyState).toBeDefined();
      expect(timeSyncService.piProxyState.state).toBe("none");
      expect(timeSyncService.piProxyState.isValid()).toBe(false);
    });

    test("should have RESYNC_INTERVAL config of 5 minutes", () => {
      expect(timeSyncService.state.config.RESYNC_INTERVAL).toBe(5 * 60 * 1000);
    });

    test("should have STATE_VALIDITY_WINDOW config of 10 minutes", () => {
      expect(timeSyncService.state.config.STATE_VALIDITY_WINDOW).toBe(
        10 * 60 * 1000,
      );
    });
  });

  describe("ap0 client connection with state", () => {
    test("should transition state from 'none' to 'ap0-device' on first ap0 connect", async () => {
      const clientIP = "192.168.12.100";

      await timeSyncService.handleClientConnection(clientIP, "ap0", mockWs);

      expect(timeSyncService.piProxyState.state).toBe("ap0-device");
      expect(timeSyncService.piProxyState.clientIP).toBe(clientIP);
      expect(timeSyncService.piProxyState.isValid()).toBe(true);
    });

    test("should ignore second ap0 client when state is already 'ap0-device'", async () => {
      const firstClient = "192.168.12.100";
      const secondClient = "192.168.12.101";

      // Connect first client
      await timeSyncService.handleClientConnection(firstClient, "ap0", mockWs);
      const firstAcquiredAt = timeSyncService.piProxyState.acquiredAt;

      // Advance time slightly
      jest.advanceTimersByTime(1000);

      // Try to connect second client
      const mockWs2 = new EventEmitter();
      mockWs2.send = jest.fn();
      await timeSyncService.handleClientConnection(
        secondClient,
        "ap0",
        mockWs2,
      );

      // State should not change
      expect(timeSyncService.piProxyState.state).toBe("ap0-device");
      expect(timeSyncService.piProxyState.clientIP).toBe(firstClient);
      expect(timeSyncService.piProxyState.acquiredAt).toEqual(firstAcquiredAt);

      // Second client should not have been sent time request
      expect(mockWs2.send).not.toHaveBeenCalled();
    });

    test("should start 5-minute resync timer on ap0 connect", async () => {
      const clientIP = "192.168.12.100";

      await timeSyncService.handleClientConnection(clientIP, "ap0", mockWs);

      // Verify resync timer was started
      expect(timeSyncService.resyncTimer).toBeDefined();
      expect(timeSyncService.resyncTimer).not.toBeNull();
    });

    test("should send time sync request to ap0 client", async () => {
      const clientIP = "192.168.12.100";

      await timeSyncService.handleClientConnection(clientIP, "ap0", mockWs);

      // Wait for async operations
      jest.advanceTimersByTime(1100); // Wait past the 1s delay

      // Verify time request was sent
      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining("time-sync-request"),
      );
    });
  });

  describe("ap0 resync with state updates", () => {
    test("should update acquiredAt on successful 5-minute resync", async () => {
      const clientIP = "192.168.12.100";

      // Initial connection
      await timeSyncService.handleClientConnection(clientIP, "ap0", mockWs);
      jest.advanceTimersByTime(1100);

      const initialAcquiredAt = timeSyncService.piProxyState.acquiredAt;

      // Simulate successful time sync response
      const clientTime = new Date();
      await timeSyncService.handleClientTimeResponse(
        clientIP,
        clientTime.toISOString(),
        "America/Los_Angeles",
      );

      // Advance to resync time (5 minutes)
      jest.advanceTimersByTime(5 * 60 * 1000);

      // acquiredAt should have been updated
      expect(timeSyncService.piProxyState.acquiredAt.getTime()).toBeGreaterThan(
        initialAcquiredAt.getTime(),
      );
      expect(timeSyncService.piProxyState.state).toBe("ap0-device");
    });

    test("should maintain ap0-device state across multiple resyncs", async () => {
      const clientIP = "192.168.12.100";

      await timeSyncService.handleClientConnection(clientIP, "ap0", mockWs);
      jest.advanceTimersByTime(1100);

      // Simulate time sync response
      const clientTime = new Date();
      await timeSyncService.handleClientTimeResponse(
        clientIP,
        clientTime.toISOString(),
        "America/Los_Angeles",
      );

      // Resync 1 (5 minutes)
      jest.advanceTimersByTime(5 * 60 * 1000);
      expect(timeSyncService.piProxyState.state).toBe("ap0-device");

      // Resync 2 (10 minutes total)
      jest.advanceTimersByTime(5 * 60 * 1000);
      expect(timeSyncService.piProxyState.state).toBe("ap0-device");

      // State should still be valid
      expect(timeSyncService.piProxyState.isValid()).toBe(true);
    });
  });

  describe("ap0 client failover on disconnect", () => {
    test("should failover to different ap0 client when original disconnects", async () => {
      const client1 = "192.168.12.100";
      const client2 = "192.168.12.101";

      // Connect first client
      await timeSyncService.handleClientConnection(client1, "ap0", mockWs);
      jest.advanceTimersByTime(1100);

      // Respond to time sync
      await timeSyncService.handleClientTimeResponse(
        client1,
        new Date().toISOString(),
        "America/Los_Angeles",
      );

      // Connect second client (should be ignored due to existing ap0-device state)
      const mockWs2 = new EventEmitter();
      mockWs2.send = jest.fn();
      await timeSyncService.handleClientConnection(client2, "ap0", mockWs2);

      // Disconnect first client
      timeSyncService.handleClientDisconnection(client1);

      // State should still be ap0-device but should prepare to failover
      expect(timeSyncService.piProxyState.state).toBe("ap0-device");

      // On next resync, should failover to client2
      jest.advanceTimersByTime(5 * 60 * 1000);

      // Should now be syncing with client2
      expect(mockWs2.send).toHaveBeenCalledWith(
        expect.stringContaining("time-sync-request"),
      );
    });

    test("should transition to 'none' when all ap0 clients disconnect and state expires", async () => {
      const clientIP = "192.168.12.100";

      await timeSyncService.handleClientConnection(clientIP, "ap0", mockWs);
      jest.advanceTimersByTime(1100);

      // Sync
      await timeSyncService.handleClientTimeResponse(
        clientIP,
        new Date().toISOString(),
        "America/Los_Angeles",
      );

      // Disconnect client
      timeSyncService.handleClientDisconnection(clientIP);

      // State persists for 10 minutes
      jest.advanceTimersByTime(9 * 60 * 1000);
      expect(timeSyncService.piProxyState.isValid()).toBe(true);

      // After 10 minutes, state should expire
      jest.advanceTimersByTime(2 * 60 * 1000); // Total 11 minutes
      timeSyncService.piProxyState.expire();

      expect(timeSyncService.piProxyState.state).toBe("none");
      expect(timeSyncService.piProxyState.isValid()).toBe(false);
    });
  });

  describe("State validity window", () => {
    test("should keep state valid for 10 minutes after last sync", async () => {
      const clientIP = "192.168.12.100";

      await timeSyncService.handleClientConnection(clientIP, "ap0", mockWs);
      jest.advanceTimersByTime(1100);

      await timeSyncService.handleClientTimeResponse(
        clientIP,
        new Date().toISOString(),
        "America/Los_Angeles",
      );

      // State should be valid at 9 minutes 59 seconds
      jest.advanceTimersByTime(9 * 60 * 1000 + 59000);
      expect(timeSyncService.piProxyState.isValid()).toBe(true);

      // State should be invalid at 10 minutes
      jest.advanceTimersByTime(2000);
      expect(timeSyncService.piProxyState.isValid()).toBe(false);
    });

    test("should transition to 'none' when state expires without resync", async () => {
      const clientIP = "192.168.12.100";

      await timeSyncService.handleClientConnection(clientIP, "ap0", mockWs);
      jest.advanceTimersByTime(1100);

      await timeSyncService.handleClientTimeResponse(
        clientIP,
        new Date().toISOString(),
        "America/Los_Angeles",
      );

      // Disconnect client immediately
      timeSyncService.handleClientDisconnection(clientIP);

      // Wait 10+ minutes
      jest.advanceTimersByTime(11 * 60 * 1000);

      // Manually call expire (would be called periodically in real system)
      timeSyncService.piProxyState.expire();

      expect(timeSyncService.piProxyState.state).toBe("none");
    });
  });

  describe("Camera sync after ap0 sync", () => {
    test("should attempt camera sync after successful Pi sync from ap0", async () => {
      const clientIP = "192.168.12.100";

      // Mock camera as connected
      const mockCamera = {
        connected: true,
        getCameraDateTime: jest
          .fn()
          .mockResolvedValue(new Date().toISOString()),
        setCameraDateTime: jest.fn().mockResolvedValue(true),
      };
      mockCameraController.mockReturnValue(mockCamera);

      await timeSyncService.handleClientConnection(clientIP, "ap0", mockWs);
      jest.advanceTimersByTime(1100);

      // Sync with significant drift to trigger camera sync
      const clientTime = new Date();
      await timeSyncService.handleClientTimeResponse(
        clientIP,
        clientTime.toISOString(),
        "America/Los_Angeles",
      );

      // Verify camera sync was attempted
      expect(mockCamera.getCameraDateTime).toHaveBeenCalled();
    });

    test("should use Pi proxy state when deciding camera sync", async () => {
      const clientIP = "192.168.12.100";

      // Mock camera
      const mockCamera = {
        connected: true,
        getCameraDateTime: jest
          .fn()
          .mockResolvedValue(new Date().toISOString()),
        setCameraDateTime: jest.fn().mockResolvedValue(true),
      };
      mockCameraController.mockReturnValue(mockCamera);

      await timeSyncService.handleClientConnection(clientIP, "ap0", mockWs);
      jest.advanceTimersByTime(1100);

      await timeSyncService.handleClientTimeResponse(
        clientIP,
        new Date().toISOString(),
        "America/Los_Angeles",
      );

      // Pi proxy state should be valid
      expect(timeSyncService.piProxyState.isValid()).toBe(true);

      // Camera sync should proceed because Pi is valid proxy
      expect(mockCamera.getCameraDateTime).toHaveBeenCalled();
    });
  });
});
