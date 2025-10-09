/**
 * Integration Tests for wlan0 Sync with PiProxyState
 *
 * Tests wlan0 client synchronization using the PiProxyState system.
 * Covers:
 * - wlan0 connect when state is 'none' → state transitions to 'wlan0-device'
 * - wlan0 defers to valid ap0 state (ignores wlan0 when ap0 is valid)
 * - wlan0 → ap0 transition when ap0 connects
 * - wlan0 resync checks for ap0 before each resync
 * - wlan0 failover to different wlan0 client
 * - wlan0 state expires after 10 minutes without resync
 */

import { jest } from "@jest/globals";
import { EventEmitter } from "events";

describe("TimeSync wlan0 Sync with PiProxyState Integration", () => {
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

  describe("wlan0 client connection when state is 'none'", () => {
    test("should transition state from 'none' to 'wlan0-device' on first wlan0 connect", async () => {
      const clientIP = "192.168.1.100";

      await timeSyncService.handleClientConnection(clientIP, "wlan0", mockWs);

      expect(timeSyncService.piProxyState.state).toBe("wlan0-device");
      expect(timeSyncService.piProxyState.clientIP).toBe(clientIP);
      expect(timeSyncService.piProxyState.isValid()).toBe(true);
    });

    test("should start 5-minute resync timer on wlan0 connect", async () => {
      const clientIP = "192.168.1.100";

      await timeSyncService.handleClientConnection(clientIP, "wlan0", mockWs);

      expect(timeSyncService.resyncTimer).toBeDefined();
      expect(timeSyncService.resyncTimer).not.toBeNull();
    });

    test("should send time sync request to wlan0 client", async () => {
      const clientIP = "192.168.1.100";

      await timeSyncService.handleClientConnection(clientIP, "wlan0", mockWs);
      jest.advanceTimersByTime(1100); // Wait past the 1s delay

      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining("time-sync-request"),
      );
    });
  });

  describe("wlan0 defers to valid ap0 state", () => {
    test("should ignore wlan0 when ap0 state is valid", async () => {
      const ap0ClientIP = "192.168.12.100";
      const wlan0ClientIP = "192.168.1.100";

      // Connect ap0 client first
      await timeSyncService.handleClientConnection(
        ap0ClientIP,
        "ap0",
        mockWs,
      );
      jest.advanceTimersByTime(1100);

      // Sync with ap0
      await timeSyncService.handleClientTimeResponse(
        ap0ClientIP,
        new Date().toISOString(),
        "America/Los_Angeles",
      );

      const ap0AcquiredAt = timeSyncService.piProxyState.acquiredAt;

      // Try to connect wlan0 client
      const mockWs2 = new EventEmitter();
      mockWs2.send = jest.fn();
      mockWs2.readyState = 1;

      await timeSyncService.handleClientConnection(
        wlan0ClientIP,
        "wlan0",
        mockWs2,
      );

      // State should remain ap0-device
      expect(timeSyncService.piProxyState.state).toBe("ap0-device");
      expect(timeSyncService.piProxyState.clientIP).toBe(ap0ClientIP);
      expect(timeSyncService.piProxyState.acquiredAt).toEqual(ap0AcquiredAt);

      // wlan0 client should not have been sent time request
      expect(mockWs2.send).not.toHaveBeenCalled();
    });

    test("should accept wlan0 when ap0 state has expired", async () => {
      const ap0ClientIP = "192.168.12.100";
      const wlan0ClientIP = "192.168.1.100";

      // Connect and sync with ap0
      await timeSyncService.handleClientConnection(
        ap0ClientIP,
        "ap0",
        mockWs,
      );
      jest.advanceTimersByTime(1100);
      await timeSyncService.handleClientTimeResponse(
        ap0ClientIP,
        new Date().toISOString(),
        "America/Los_Angeles",
      );

      // Disconnect ap0 client
      timeSyncService.handleClientDisconnection(ap0ClientIP);

      // Advance time past validity window (10+ minutes)
      jest.advanceTimersByTime(11 * 60 * 1000);

      // Expire the state
      timeSyncService.piProxyState.expire();
      expect(timeSyncService.piProxyState.state).toBe("none");

      // Connect wlan0 client - should be accepted
      const mockWs2 = new EventEmitter();
      mockWs2.send = jest.fn();
      mockWs2.readyState = 1;

      await timeSyncService.handleClientConnection(
        wlan0ClientIP,
        "wlan0",
        mockWs2,
      );

      expect(timeSyncService.piProxyState.state).toBe("wlan0-device");
      expect(timeSyncService.piProxyState.clientIP).toBe(wlan0ClientIP);
    });
  });

  describe("wlan0 → ap0 transition", () => {
    test("should transition from wlan0-device to ap0-device when ap0 connects", async () => {
      const wlan0ClientIP = "192.168.1.100";
      const ap0ClientIP = "192.168.12.100";

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

      // Sync with wlan0
      await timeSyncService.handleClientTimeResponse(
        wlan0ClientIP,
        new Date().toISOString(),
        "America/Los_Angeles",
      );

      expect(timeSyncService.piProxyState.state).toBe("wlan0-device");

      // Connect ap0 client - should take priority
      const mockWs2 = new EventEmitter();
      mockWs2.send = jest.fn();
      mockWs2.readyState = 1;

      await timeSyncService.handleClientConnection(
        ap0ClientIP,
        "ap0",
        mockWs2,
      );

      // State should transition to ap0-device
      expect(timeSyncService.piProxyState.state).toBe("ap0-device");
      expect(timeSyncService.piProxyState.clientIP).toBe(ap0ClientIP);
    });

    test("should cancel wlan0 resync timer when ap0 takes over", async () => {
      const wlan0ClientIP = "192.168.1.100";
      const ap0ClientIP = "192.168.12.100";

      // Connect wlan0 client
      await timeSyncService.handleClientConnection(
        wlan0ClientIP,
        "wlan0",
        mockWs,
      );
      const wlan0Timer = timeSyncService.resyncTimer;
      expect(wlan0Timer).not.toBeNull();

      // Connect ap0 client
      const mockWs2 = new EventEmitter();
      mockWs2.send = jest.fn();
      mockWs2.readyState = 1;

      await timeSyncService.handleClientConnection(
        ap0ClientIP,
        "ap0",
        mockWs2,
      );

      // New timer should be set (different from wlan0 timer)
      expect(timeSyncService.resyncTimer).not.toEqual(wlan0Timer);
    });
  });

  describe("wlan0 resync with ap0 priority check", () => {
    test("should check for ap0 clients before each wlan0 resync", async () => {
      const wlan0ClientIP = "192.168.1.100";
      const ap0ClientIP = "192.168.12.100";

      // Connect wlan0 client
      const mockWs1 = new EventEmitter();
      mockWs1.send = jest.fn();
      mockWs1.readyState = 1;

      await timeSyncService.handleClientConnection(
        wlan0ClientIP,
        "wlan0",
        mockWs1,
      );
      jest.advanceTimersByTime(1100);

      // Sync with wlan0
      await timeSyncService.handleClientTimeResponse(
        wlan0ClientIP,
        new Date().toISOString(),
        "America/Los_Angeles",
      );

      // Connect ap0 client (but don't initiate sync)
      const mockWs2 = new EventEmitter();
      mockWs2.send = jest.fn();
      mockWs2.readyState = 1;

      // Add ap0 client to connected clients without triggering connection handler
      timeSyncService.connectedClients.set(ap0ClientIP, {
        ws: mockWs2,
        interface: "ap0",
        lastSeen: new Date(),
      });

      // Advance to resync time (5 minutes)
      jest.advanceTimersByTime(5 * 60 * 1000);

      // Should have transitioned to ap0-device
      expect(timeSyncService.piProxyState.state).toBe("ap0-device");
      expect(timeSyncService.piProxyState.clientIP).toBe(ap0ClientIP);
    });

    test("should continue wlan0 resync when no ap0 clients available", async () => {
      const wlan0ClientIP = "192.168.1.100";

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

      const initialAcquiredAt = timeSyncService.piProxyState.acquiredAt;

      // Advance to resync time (5 minutes)
      jest.advanceTimersByTime(5 * 60 * 1000);

      // State should remain wlan0-device with updated acquiredAt
      expect(timeSyncService.piProxyState.state).toBe("wlan0-device");
      expect(timeSyncService.piProxyState.acquiredAt.getTime()).toBeGreaterThan(
        initialAcquiredAt.getTime(),
      );
    });
  });

  describe("wlan0 client failover", () => {
    test("should failover to different wlan0 client when original disconnects", async () => {
      const client1 = "192.168.1.100";
      const client2 = "192.168.1.101";

      // Connect first wlan0 client
      const mockWs1 = new EventEmitter();
      mockWs1.send = jest.fn();
      mockWs1.readyState = 1;

      await timeSyncService.handleClientConnection(client1, "wlan0", mockWs1);
      jest.advanceTimersByTime(1100);

      // Sync with first client
      await timeSyncService.handleClientTimeResponse(
        client1,
        new Date().toISOString(),
        "America/Los_Angeles",
      );

      // Connect second wlan0 client (should be ignored initially)
      const mockWs2 = new EventEmitter();
      mockWs2.send = jest.fn();
      mockWs2.readyState = 1;

      await timeSyncService.handleClientConnection(client2, "wlan0", mockWs2);

      // Disconnect first client
      timeSyncService.handleClientDisconnection(client1);

      // State should still be wlan0-device
      expect(timeSyncService.piProxyState.state).toBe("wlan0-device");

      // On next resync, should failover to client2
      jest.advanceTimersByTime(5 * 60 * 1000);

      // Should now be syncing with client2
      expect(mockWs2.send).toHaveBeenCalledWith(
        expect.stringContaining("time-sync-request"),
      );
    });

    test("should transition to 'none' when all wlan0 clients disconnect and state expires", async () => {
      const clientIP = "192.168.1.100";

      await timeSyncService.handleClientConnection(clientIP, "wlan0", mockWs);
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

  describe("wlan0 state validity window", () => {
    test("should keep state valid for 10 minutes after last sync", async () => {
      const clientIP = "192.168.1.100";

      await timeSyncService.handleClientConnection(clientIP, "wlan0", mockWs);
      jest.advanceTimersByTime(1100);

      await timeSyncService.handleClientTimeResponse(
        clientIP,
        new Date().toISOString(),
        "America/Los_Angeles",
      );

      // Disconnect client so resync timer doesn't refresh state
      timeSyncService.handleClientDisconnection(clientIP);

      // State should be valid at 9 minutes 59 seconds after disconnect
      jest.advanceTimersByTime(9 * 60 * 1000 + 59000);
      expect(timeSyncService.piProxyState.isValid()).toBe(true);

      // State should be invalid at 10 minutes after disconnect
      jest.advanceTimersByTime(2000);
      expect(timeSyncService.piProxyState.isValid()).toBe(false);
    });

    test("should transition to 'none' when state expires without resync", async () => {
      const clientIP = "192.168.1.100";

      await timeSyncService.handleClientConnection(clientIP, "wlan0", mockWs);
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

    test("should maintain wlan0-device state across multiple resyncs", async () => {
      const clientIP = "192.168.1.100";

      await timeSyncService.handleClientConnection(clientIP, "wlan0", mockWs);
      jest.advanceTimersByTime(1100);

      // Sync with wlan0
      await timeSyncService.handleClientTimeResponse(
        clientIP,
        new Date().toISOString(),
        "America/Los_Angeles",
      );

      // Resync 1 (5 minutes)
      jest.advanceTimersByTime(5 * 60 * 1000);
      expect(timeSyncService.piProxyState.state).toBe("wlan0-device");

      // Resync 2 (10 minutes total)
      jest.advanceTimersByTime(5 * 60 * 1000);
      expect(timeSyncService.piProxyState.state).toBe("wlan0-device");

      // State should still be valid
      expect(timeSyncService.piProxyState.isValid()).toBe(true);
    });
  });

  describe("Camera sync after wlan0 sync", () => {
    test("should attempt camera sync after successful Pi sync from wlan0", async () => {
      const clientIP = "192.168.1.100";

      // Mock camera as connected
      const mockCamera = {
        connected: true,
        getCameraDateTime: jest
          .fn()
          .mockResolvedValue(new Date().toISOString()),
        setCameraDateTime: jest.fn().mockResolvedValue(true),
      };
      mockCameraController.mockReturnValue(mockCamera);

      await timeSyncService.handleClientConnection(clientIP, "wlan0", mockWs);
      jest.advanceTimersByTime(1100);

      // Sync with wlan0
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
      const clientIP = "192.168.1.100";

      // Mock camera
      const mockCamera = {
        connected: true,
        getCameraDateTime: jest
          .fn()
          .mockResolvedValue(new Date().toISOString()),
        setCameraDateTime: jest.fn().mockResolvedValue(true),
      };
      mockCameraController.mockReturnValue(mockCamera);

      await timeSyncService.handleClientConnection(clientIP, "wlan0", mockWs);
      jest.advanceTimersByTime(1100);

      await timeSyncService.handleClientTimeResponse(
        clientIP,
        new Date().toISOString(),
        "America/Los_Angeles",
      );

      // Pi proxy state should be valid
      expect(timeSyncService.piProxyState.isValid()).toBe(true);
      expect(timeSyncService.piProxyState.state).toBe("wlan0-device");

      // Camera sync should proceed because Pi is valid proxy
      expect(mockCamera.getCameraDateTime).toHaveBeenCalled();
    });
  });

  describe("Mixed ap0 and wlan0 scenarios", () => {
    test("should ignore second wlan0 when already in wlan0-device state", async () => {
      const client1 = "192.168.1.100";
      const client2 = "192.168.1.101";

      // Connect first wlan0 client
      await timeSyncService.handleClientConnection(client1, "wlan0", mockWs);
      jest.advanceTimersByTime(1100);

      await timeSyncService.handleClientTimeResponse(
        client1,
        new Date().toISOString(),
        "America/Los_Angeles",
      );

      const firstAcquiredAt = timeSyncService.piProxyState.acquiredAt;

      // Advance time slightly
      jest.advanceTimersByTime(1000);

      // Try to connect second wlan0 client
      const mockWs2 = new EventEmitter();
      mockWs2.send = jest.fn();
      mockWs2.readyState = 1;

      await timeSyncService.handleClientConnection(client2, "wlan0", mockWs2);

      // State should not change
      expect(timeSyncService.piProxyState.state).toBe("wlan0-device");
      expect(timeSyncService.piProxyState.clientIP).toBe(client1);
      expect(timeSyncService.piProxyState.acquiredAt).toEqual(firstAcquiredAt);

      // Second client should not have been sent time request
      expect(mockWs2.send).not.toHaveBeenCalled();
    });

    test("should failover from ap0 to wlan0 when no other ap0 clients available", async () => {
      const ap0ClientIP = "192.168.12.100";
      const wlan0ClientIP = "192.168.1.100";

      // Connect ap0 client
      const mockWs1 = new EventEmitter();
      mockWs1.send = jest.fn();
      mockWs1.readyState = 1;

      await timeSyncService.handleClientConnection(
        ap0ClientIP,
        "ap0",
        mockWs1,
      );
      jest.advanceTimersByTime(1100);

      await timeSyncService.handleClientTimeResponse(
        ap0ClientIP,
        new Date().toISOString(),
        "America/Los_Angeles",
      );

      // Connect wlan0 client (should be ignored due to ap0 priority)
      const mockWs2 = new EventEmitter();
      mockWs2.send = jest.fn();
      mockWs2.readyState = 1;

      await timeSyncService.handleClientConnection(
        wlan0ClientIP,
        "wlan0",
        mockWs2,
      );

      expect(timeSyncService.piProxyState.state).toBe("ap0-device");

      // Disconnect ap0 client
      timeSyncService.handleClientDisconnection(ap0ClientIP);

      // On next resync, should failover to wlan0
      jest.advanceTimersByTime(5 * 60 * 1000);

      // Should now be syncing with wlan0 client
      expect(mockWs2.send).toHaveBeenCalledWith(
        expect.stringContaining("time-sync-request"),
      );
      expect(timeSyncService.piProxyState.state).toBe("wlan0-device");
    });
  });
});
