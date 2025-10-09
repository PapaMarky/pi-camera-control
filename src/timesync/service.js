/**
 * TimeSync Service
 *
 * Manages automatic time synchronization between client, Pi, and camera
 */

import { spawn } from "child_process";
import TimeSyncState from "./state.js";
import { PiProxyState } from "./pi-proxy-state.js";
import { logger } from "../utils/logger.js";

class TimeSyncService {
  constructor() {
    this.state = new TimeSyncState();
    this.piProxyState = new PiProxyState();
    this.wsManager = null;
    this.cameraController = null;
    this.syncCheckTimer = null;
    this.resyncTimer = null;
    this.connectedClients = { ap0: [], wlan0: [] }; // Track connected clients by interface
  }

  /**
   * Initialize the service with dependencies
   */
  initialize(wsManager, cameraController) {
    this.wsManager = wsManager;
    this.cameraController = cameraController;

    // Start scheduled sync checks
    this.startScheduledChecks();

    // Send initial status broadcast after a short delay
    setTimeout(() => {
      logger.info("TimeSyncService: Sending initial status broadcast");
      this.broadcastSyncStatus();
    }, 2000);

    logger.info("TimeSync service initialized");
  }

  /**
   * Send activity log message to clients
   */
  logActivity(message, type = "info") {
    if (this.wsManager && this.wsManager.broadcast) {
      this.wsManager.broadcast({
        type: "activity_log",
        data: {
          message,
          type,
          timestamp: new Date().toISOString(),
        },
      });
    }
    logger.info(`[TimeSync Activity] ${message}`);
  }

  /**
   * Handle new client connection
   */
  async handleClientConnection(clientIP, clientInterface, ws) {
    logger.info(
      `TimeSync: Handling client connection ${clientIP} on ${clientInterface}`,
    );

    // Store client info
    this.connectedClients[clientInterface].push({ ip: clientIP, ws });

    // Rule 1: ap0 Client Connection - Check if already in ap0-device state
    if (clientInterface === "ap0" && this.piProxyState.state === "ap0-device") {
      logger.info(
        `TimeSync: Ignoring ap0 connection from ${clientIP} - already have ap0 proxy`,
      );
      this.logActivity(
        `Device ${clientIP} connected (ap0) - already synchronized with another ap0 device`,
        "info",
      );
      return;
    }

    // Rule 2: wlan0 Client Connection - Check if we should defer to valid ap0 state
    if (
      clientInterface === "wlan0" &&
      this.piProxyState.state === "ap0-device" &&
      this.piProxyState.isValid()
    ) {
      logger.info(
        `TimeSync: Ignoring wlan0 connection from ${clientIP} - ap0 state is valid`,
      );
      this.logActivity(
        `Device ${clientIP} connected (wlan0) - deferring to ap0 proxy`,
        "info",
      );
      return;
    }

    // Rule 2b: wlan0 Client Connection - Check if already in wlan0-device state
    if (
      clientInterface === "wlan0" &&
      this.piProxyState.state === "wlan0-device" &&
      this.piProxyState.isValid()
    ) {
      logger.info(
        `TimeSync: Ignoring wlan0 connection from ${clientIP} - already have wlan0 proxy`,
      );
      this.logActivity(
        `Device ${clientIP} connected (wlan0) - already synchronized with another wlan0 device`,
        "info",
      );
      return;
    }

    // Check if auto-sync should be performed
    if (!this.state.shouldAutoSync(clientIP, clientInterface)) {
      logger.debug(
        `TimeSync: Skipping auto-sync for ${clientIP} on ${clientInterface}`,
      );
      this.logActivity(
        `Device ${clientIP} connected (${clientInterface}) - auto-sync not needed`,
        "info",
      );
      return;
    }

    logger.info(
      `TimeSync: Starting auto-sync for ${clientIP} on ${clientInterface}`,
    );
    this.logActivity(
      `Device ${clientIP} connected to access point - checking time sync`,
      "info",
    );

    // Update state optimistically when initiating sync
    // (Early returns above ensure we only reach here if sync should proceed)
    if (clientInterface === "ap0") {
      this.piProxyState.updateState("ap0-device", clientIP);
      this.startResyncTimer("ap0");
    } else if (clientInterface === "wlan0") {
      this.piProxyState.updateState("wlan0-device", clientIP);
      this.startResyncTimer("wlan0");
    }

    // Wait a moment for client to be ready (skip in test environment)
    if (process.env.NODE_ENV !== "test") {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // Request time from client
    this.requestClientTime(clientIP, ws);
  }

  /**
   * Handle client disconnection
   *
   * Note: We do NOT cancel the resync timer here. The timer will detect the
   * disconnection on its next fire and handle failover to other clients.
   * This allows seamless failover without waiting for explicit disconnect events.
   */
  handleClientDisconnection(clientIP) {
    logger.info(`Client ${clientIP} disconnected`);

    // Remove client from both arrays
    this.connectedClients.ap0 = this.connectedClients.ap0.filter(
      (client) => client.ip !== clientIP,
    );
    this.connectedClients.wlan0 = this.connectedClients.wlan0.filter(
      (client) => client.ip !== clientIP,
    );

    // Check if any AP clients remain
    if (this.connectedClients.ap0.length === 0) {
      this.state.markNoClient();
    }
  }

  /**
   * Start resync timer for ap0 or wlan0
   * Resyncs every 5 minutes to keep acquiredAt fresh
   */
  startResyncTimer(timerType) {
    // Cancel any existing timer
    if (this.resyncTimer) {
      clearInterval(this.resyncTimer);
      this.resyncTimer = null;
    }

    logger.info(`Starting ${timerType} resync timer (5-minute interval)`);

    this.resyncTimer = setInterval(() => {
      this.handleResyncTimer(timerType);
    }, this.state.config.RESYNC_INTERVAL);
  }

  /**
   * Handle resync timer event
   * Implements failover cascade when original client disconnects
   *
   * IMPORTANT: Only update acquiredAt if we successfully request time from a connected client.
   * If no clients are available, cancel the timer but let state expire naturally.
   */
  async handleResyncTimer(timerType) {
    logger.debug(`Resync timer fired for ${timerType}`);

    if (timerType === "ap0") {
      // Check if original ap0 client is still connected
      const originalClient = this.connectedClients.ap0.find(
        (client) => client.ip === this.piProxyState.clientIP,
      );

      if (originalClient) {
        logger.debug(
          `ap0 resync: original client ${originalClient.ip} still connected`,
        );
        // Update acquiredAt to keep state fresh (only when client is connected)
        this.piProxyState.acquiredAt = new Date();
        this.requestClientTime(originalClient.ip, originalClient.ws);
      } else {
        // Original ap0 client lost - trigger failover cascade
        // DO NOT update acquiredAt - let state age naturally if no clients available
        logger.info("ap0 resync: original client lost, triggering failover");
        await this.handleClientFailover("ap0");
      }
    } else if (timerType === "wlan0") {
      // wlan0 must check for ap0 before each resync
      if (this.connectedClients.ap0.length > 0) {
        logger.info("wlan0 resync: ap0 client available, switching to ap0");
        const ap0Client = this.connectedClients.ap0[0];
        clearInterval(this.resyncTimer);
        this.resyncTimer = null;
        await this.handleClientConnection(ap0Client.ip, "ap0", ap0Client.ws);
        return;
      }

      // Check if original wlan0 client is still connected
      const originalClient = this.connectedClients.wlan0.find(
        (client) => client.ip === this.piProxyState.clientIP,
      );

      if (originalClient) {
        logger.debug(
          `wlan0 resync: original client ${originalClient.ip} still connected`,
        );
        // Update acquiredAt to keep state fresh (only when client is connected)
        this.piProxyState.acquiredAt = new Date();
        this.requestClientTime(originalClient.ip, originalClient.ws);
      } else {
        // Original wlan0 client lost - trigger failover cascade
        // DO NOT update acquiredAt - let state age naturally if no clients available
        logger.info("wlan0 resync: original client lost, triggering failover");
        await this.handleClientFailover("wlan0");
      }
    }
  }

  /**
   * Handle client disconnect with fallback to other clients
   * "Treat as new connection" means:
   * - Cancel current resync timer
   * - Reset state
   * - Run the connection handler (Rule 1 or Rule 2) for the fallback client
   * - This resets state and starts fresh sync cycle
   *
   * If no clients are available, cancel the timer but DO NOT change state.
   * Let the state expire naturally after the validity window (10 minutes).
   */
  async handleClientFailover(lostInterface) {
    if (lostInterface === "ap0") {
      // ap0 client lost during resync
      const availableAp0 = this.connectedClients.ap0.filter(
        (client) => client.ws.readyState === 1, // 1 = OPEN
      );

      const availableWlan0 = this.connectedClients.wlan0.filter(
        (client) => client.ws.readyState === 1, // 1 = OPEN
      );

      if (availableAp0.length > 0) {
        // Treat different ap0 client as new connection
        logger.info("ap0 client lost - failing over to different ap0 client");
        const fallbackClient = availableAp0[0];
        // Reset state to allow new connection
        this.piProxyState.updateState("none", null);
        await this.handleClientConnection(
          fallbackClient.ip,
          "ap0",
          fallbackClient.ws,
        );
      } else if (availableWlan0.length > 0) {
        // Fallback to wlan0 as new connection
        logger.info("ap0 client lost - failing over to wlan0 client");
        const fallbackClient = availableWlan0[0];
        // Reset state to allow new connection
        this.piProxyState.updateState("none", null);
        await this.handleClientConnection(
          fallbackClient.ip,
          "wlan0",
          fallbackClient.ws,
        );
      } else {
        // No clients available - cancel timer but preserve state
        // State will expire naturally after validity window (10 min)
        logger.info(
          "ap0 client lost - no fallback clients available, state will expire naturally",
        );
        if (this.resyncTimer) {
          clearInterval(this.resyncTimer);
          this.resyncTimer = null;
        }
        // DO NOT set state to 'none' - let it expire via validity window
      }
    } else if (lostInterface === "wlan0") {
      // wlan0 client lost during resync
      const availableWlan0 = this.connectedClients.wlan0.filter(
        (client) => client.ws.readyState === 1, // 1 = OPEN
      );

      if (availableWlan0.length > 0) {
        // Treat different wlan0 client as new connection
        logger.info(
          "wlan0 client lost - failing over to different wlan0 client",
        );
        const fallbackClient = availableWlan0[0];
        // Reset state to allow new connection
        this.piProxyState.updateState("none", null);
        await this.handleClientConnection(
          fallbackClient.ip,
          "wlan0",
          fallbackClient.ws,
        );
      } else {
        // No wlan0 clients available - cancel timer but preserve state
        // State will expire naturally after validity window (10 min)
        logger.info(
          "wlan0 client lost - no fallback clients available, state will expire naturally",
        );
        if (this.resyncTimer) {
          clearInterval(this.resyncTimer);
          this.resyncTimer = null;
        }
        // DO NOT set state to 'none' - let it expire via validity window
      }
    }
  }

  /**
   * Request time from a specific client
   */
  requestClientTime(clientIP, ws) {
    logger.debug(`Requesting time from client ${clientIP}`);

    // Send time sync request
    ws.send(
      JSON.stringify({
        type: "time-sync-request",
        requestId: Date.now(),
      }),
    );

    // Set timeout for response
    setTimeout(() => {
      const clientExists =
        this.connectedClients.ap0.some((c) => c.ip === clientIP) ||
        this.connectedClients.wlan0.some((c) => c.ip === clientIP);
      if (clientExists) {
        logger.warn(`No time sync response from ${clientIP}`);
      }
    }, 5000);
  }

  /**
   * Handle time sync response from client
   */
  async handleClientTimeResponse(
    clientIP,
    clientTime,
    clientTimezone,
    gps = null,
  ) {
    try {
      const clientTimestamp = new Date(clientTime);
      if (isNaN(clientTimestamp.getTime())) {
        logger.error("Invalid client timestamp received");
        return;
      }

      // Get current Pi time
      const piTime = new Date();
      const driftMs = piTime.getTime() - clientTimestamp.getTime();

      logger.info(`Time drift detected: ${driftMs}ms from client ${clientIP}`);

      // Determine client interface for state updates
      const isAp0 = this.connectedClients.ap0.some((c) => c.ip === clientIP);
      const clientInterface = isAp0
        ? "ap0"
        : this.connectedClients.wlan0.some((c) => c.ip === clientIP)
          ? "wlan0"
          : "unknown";

      // Check if drift exceeds threshold
      if (Math.abs(driftMs) > this.state.config.DRIFT_THRESHOLD) {
        // Check for anomalous jump
        if (this.state.isAnomalousJump(driftMs)) {
          logger.warn(
            `Anomalous time jump detected: ${driftMs}ms - triggering sync`,
          );
        }

        const driftSeconds = (driftMs / 1000).toFixed(1);
        this.logActivity(
          `Pi time drift detected: ${driftSeconds}s - adjusting from device ${clientIP}`,
          "warning",
        );

        // Sync Pi time
        const syncSuccess = await this.syncPiTime(
          clientTimestamp,
          clientTimezone,
        );

        // Record sync event
        this.state.recordPiSync(clientTimestamp, clientIP, driftMs);

        // Update acquiredAt to reflect actual sync time
        // (State was already set optimistically in handleClientConnection)
        if (
          clientInterface === "ap0" &&
          this.piProxyState.state === "ap0-device"
        ) {
          this.piProxyState.acquiredAt = new Date();
        } else if (
          clientInterface === "wlan0" &&
          this.piProxyState.state === "wlan0-device"
        ) {
          this.piProxyState.acquiredAt = new Date();
        }

        // Log sync
        logger.info(
          `Time synchronized from ${clientIP} (drift: ${driftSeconds}s)`,
        );

        if (syncSuccess) {
          this.logActivity(
            `Pi time synchronized successfully (was ${driftSeconds}s off)`,
            "success",
          );
        } else {
          this.logActivity(
            `Pi time sync failed - system may not support time changes`,
            "error",
          );
        }

        // Broadcast sync status
        this.broadcastSyncStatus();

        // If camera is connected and Pi is now reliable, sync camera
        const cameraController =
          typeof this.cameraController === "function"
            ? this.cameraController()
            : this.cameraController;

        if (cameraController?.connected && this.state.isPiTimeReliable()) {
          await this.syncCameraTime();
        }
      } else {
        logger.debug(`Time drift within threshold: ${driftMs}ms`);
        const driftSeconds = (driftMs / 1000).toFixed(1);
        this.logActivity(
          `Time sync check complete - Pi time accurate (${driftSeconds}s drift)`,
          "success",
        );
        // Still record that we checked
        this.state.recordPiSync(clientTimestamp, clientIP, driftMs);

        // Update acquiredAt even when no sync needed (resync scenario)
        if (
          clientInterface === "ap0" &&
          this.piProxyState.state === "ap0-device"
        ) {
          this.piProxyState.acquiredAt = new Date();
        } else if (
          clientInterface === "wlan0" &&
          this.piProxyState.state === "wlan0-device"
        ) {
          this.piProxyState.acquiredAt = new Date();
        }

        // Broadcast sync status update
        this.broadcastSyncStatus();

        // If camera is connected and Pi is now reliable, sync camera
        const cameraController =
          typeof this.cameraController === "function"
            ? this.cameraController()
            : this.cameraController;

        if (cameraController?.connected && this.state.isPiTimeReliable()) {
          await this.syncCameraTime();
        }
      }

      // Store GPS if provided
      if (gps) {
        this.lastGPS = gps;
        logger.info(`GPS location received: ${gps.latitude}, ${gps.longitude}`);
      }
    } catch (error) {
      logger.error("Error handling client time response:", error);
    }
  }

  /**
   * Sync Pi system time
   */
  async syncPiTime(clientTime, timezone) {
    // Skip on non-Linux systems
    if (process.platform !== "linux") {
      logger.warn("Time sync only supported on Linux");
      return false;
    }

    return new Promise((resolve) => {
      // Format time for date command
      const formattedTime = clientTime
        .toISOString()
        .slice(0, 19)
        .replace("T", " ");

      const setTime = spawn("sudo", ["date", "-u", "-s", formattedTime], {
        stdio: "pipe",
      });

      setTime.on("close", async (code) => {
        if (code === 0) {
          logger.info(`System time synchronized to: ${formattedTime} UTC`);

          // Set timezone if provided
          if (timezone) {
            try {
              await this.setSystemTimezone(timezone);
            } catch (error) {
              logger.warn(`Failed to set timezone: ${error.message}`);
            }
          }

          resolve(true);
        } else {
          logger.error(`Failed to set system time, exit code: ${code}`);
          resolve(false);
        }
      });

      setTime.on("error", (error) => {
        logger.error("Error setting system time:", error);
        resolve(false);
      });
    });
  }

  /**
   * Set system timezone
   */
  async setSystemTimezone(timezone) {
    return new Promise((resolve, reject) => {
      const setTz = spawn("sudo", ["timedatectl", "set-timezone", timezone], {
        stdio: "pipe",
      });

      setTz.on("close", (code) => {
        if (code === 0) {
          logger.info(`System timezone set to: ${timezone}`);
          resolve();
        } else {
          reject(new Error(`Failed to set timezone, exit code: ${code}`));
        }
      });

      setTz.on("error", reject);
    });
  }

  /**
   * Sync Pi time from camera (Rule 3B - part 2)
   * Used when Pi has no valid proxy state and camera RTC is more reliable
   */
  async syncPiFromCamera() {
    const cameraController =
      typeof this.cameraController === "function"
        ? this.cameraController()
        : this.cameraController;

    if (!cameraController?.connected) {
      logger.debug("Camera not connected, skipping sync");
      return false;
    }

    try {
      // Get camera time
      const cameraTime = await cameraController.getCameraDateTime();
      if (!cameraTime) {
        logger.error("Could not get camera time");
        return false;
      }

      const cameraTimestamp = new Date(cameraTime);
      const piTime = new Date();
      const driftMs = piTime.getTime() - cameraTimestamp.getTime();

      logger.info(`Pi drift from camera: ${driftMs}ms`);

      // Only sync if drift exceeds threshold
      if (Math.abs(driftMs) > this.state.config.DRIFT_THRESHOLD) {
        const driftSeconds = (driftMs / 1000).toFixed(1);
        logger.info(
          `Syncing Pi from camera (camera RTC more reliable than Pi without proxy)`,
        );
        this.logActivity(
          `Syncing Pi time from camera - Pi has no valid proxy (drift: ${driftSeconds}s)`,
          "warning",
        );

        // Sync Pi from camera
        const syncSuccess = await this.syncPiTime(cameraTimestamp, null);

        if (syncSuccess) {
          // Update piProxyState to 'none' - Pi is not acting as proxy, just has camera time
          this.piProxyState.updateState("none", null);
          this.logActivity(
            `Pi time synchronized from camera (was ${driftSeconds}s off)`,
            "success",
          );

          // Broadcast sync status
          this.broadcastSyncStatus();
          return true;
        } else {
          this.logActivity(
            `Failed to sync Pi from camera - system may not support time changes`,
            "error",
          );
        }
      } else {
        logger.debug(`Pi-camera drift within threshold: ${driftMs}ms`);
      }
    } catch (error) {
      logger.error("Error syncing Pi from camera:", error);
    }

    return false;
  }

  /**
   * Sync camera time from Pi
   * Only syncs if Pi has valid proxy state (Phase 4: piProxyState-based check)
   */
  async syncCameraTime() {
    // Get current camera controller instance
    const cameraController =
      typeof this.cameraController === "function"
        ? this.cameraController()
        : this.cameraController;

    if (!cameraController?.connected) {
      logger.debug("Camera not connected, skipping sync");
      return false;
    }

    // Phase 4: Check piProxyState validity instead of generic Pi reliability
    if (!this.piProxyState.isValid()) {
      logger.warn(
        "Pi proxy state not valid, cannot sync camera (use camera as source instead)",
      );
      return false;
    }

    try {
      // Get current camera time
      const cameraTime = await cameraController.getCameraDateTime();
      if (!cameraTime) {
        logger.error("Could not get camera time");
        return false;
      }

      // Calculate drift
      const piTime = new Date();
      const driftMs = new Date(cameraTime).getTime() - piTime.getTime();

      logger.info(`Camera time drift: ${driftMs}ms`);

      // Sync if drift exceeds threshold
      if (Math.abs(driftMs) > this.state.config.DRIFT_THRESHOLD) {
        const success = await cameraController.setCameraDateTime(piTime);

        if (success) {
          this.state.recordCameraSync(driftMs);
          logger.info(
            `Camera time synchronized (drift: ${(driftMs / 1000).toFixed(1)}s)`,
          );
          this.broadcastSyncStatus();
          return true;
        } else {
          logger.error("Failed to set camera time");
        }
      } else {
        logger.debug(`Camera time drift within threshold: ${driftMs}ms`);
        this.state.recordCameraSync(driftMs);

        // Broadcast sync status update
        this.broadcastSyncStatus();
        return true;
      }
    } catch (error) {
      logger.error("Error syncing camera time:", error);
    }

    return false;
  }

  /**
   * Handle camera connection (Phase 4: State-based sync)
   * Implements Rule 3A and Rule 3B from time sync algorithm
   */
  async handleCameraConnection() {
    logger.info("Camera connected, checking time sync");

    // Check if any clients are connected
    const hasAp0 = this.connectedClients.ap0.length > 0;
    const hasWlan0 = this.connectedClients.wlan0.length > 0;

    if (hasAp0 || hasWlan0) {
      // Rule 3A: Client available - use client as time source
      logger.info("Camera connection: Client available, applying Rule 3A");

      // Select client (preference: ap0 > wlan0)
      const client = hasAp0
        ? this.connectedClients.ap0[0]
        : this.connectedClients.wlan0[0];
      const clientInterface = hasAp0 ? "ap0" : "wlan0";

      logger.info(
        `Syncing Pi from ${clientInterface} client ${client.ip} before camera sync`,
      );

      // Request time from client (will trigger handleClientTimeResponse which updates state)
      this.requestClientTime(client.ip, client.ws);

      // Note: Camera sync will happen in handleClientTimeResponse after Pi is synced
      // This ensures camera gets the fresh client time via Pi proxy
    } else if (this.piProxyState.isValid()) {
      // Rule 3B (part 1): No client, but Pi has valid proxy state
      logger.info(
        `Camera connection: No client but Pi proxy state valid (${this.piProxyState.state}), syncing camera from Pi`,
      );
      this.logActivity(
        `Camera connected - syncing from Pi (Pi has valid ${this.piProxyState.state} proxy)`,
        "info",
      );

      await this.syncCameraTime();
    } else {
      // Rule 3B (part 2): No client, Pi proxy state invalid - use camera as source
      logger.info(
        "Camera connection: No client and Pi proxy state invalid, syncing Pi from camera",
      );
      this.logActivity(
        "Camera connected - syncing Pi from camera (no valid proxy state)",
        "info",
      );

      await this.syncPiFromCamera();
    }
  }

  /**
   * Start scheduled sync checks
   */
  startScheduledChecks() {
    // Clear any existing timers
    if (this.syncCheckTimer) {
      clearInterval(this.syncCheckTimer);
    }

    // Schedule periodic checks every 15 minutes
    this.syncCheckTimer = setInterval(() => {
      this.performScheduledCheck();
    }, this.state.config.SYNC_CHECK_INTERVAL).unref();

    logger.info("Scheduled sync checks started (15-minute interval)");
  }

  /**
   * Perform a scheduled sync check
   */
  async performScheduledCheck() {
    // Find an AP client to sync with
    if (this.connectedClients.ap0.length > 0) {
      const apClient = this.connectedClients.ap0[0];
      logger.debug(`Performing scheduled sync check with ${apClient.ip}`);
      this.logActivity(
        `Scheduled time sync check with device ${apClient.ip}`,
        "info",
      );
      this.requestClientTime(apClient.ip, apClient.ws);
    } else {
      // No AP client available
      this.state.markNoClient();
      this.logActivity(
        "No devices connected for scheduled time sync - monitoring for connections",
        "info",
      );

      // Start minute checks if not already running
      if (!this.minuteCheckTimer) {
        this.startMinuteChecks();
      }
    }
  }

  /**
   * Start minute-interval checks when no client available
   */
  startMinuteChecks() {
    this.minuteCheckTimer = setInterval(() => {
      if (this.connectedClients.ap0.length > 0) {
        // Client found, stop minute checks
        clearInterval(this.minuteCheckTimer);
        this.minuteCheckTimer = null;

        // Perform sync
        const apClient = this.connectedClients.ap0[0];
        this.requestClientTime(apClient.ip, apClient.ws);

        // Log recovery
        const withoutClientMs =
          Date.now() - this.state.noClientSince?.getTime();
        const minutes = Math.floor(withoutClientMs / 60000);
        logger.info(`Time sync resumed after ${minutes} minutes offline`);
      }
    }, this.state.config.MINUTE_CHECK_INTERVAL);

    logger.debug("Started minute-interval sync checks");
  }

  /**
   * Broadcast sync status to all clients
   */
  broadcastSyncStatus() {
    if (!this.wsManager) {
      logger.warn("TimeSyncService: Cannot broadcast - no wsManager");
      return;
    }

    const rawStatus = this.state.getStatus();

    // Transform to UI format
    const uiStatus = {
      pi: {
        isSynchronized: rawStatus.piReliable,
        reliability: this.getPiReliability(rawStatus),
        lastSyncTime: rawStatus.lastPiSync,
      },
      camera: {
        isSynchronized: this.isCameraSynchronized(rawStatus),
        lastSyncTime: rawStatus.lastCameraSync,
      },
      // NEW: Include piProxyState for detailed testing visibility
      piProxyState: this.piProxyState.getInfo(),
      // NEW: Include connected clients count for testing visibility
      connectedClients: {
        ap0Count: this.connectedClients.ap0.length,
        wlan0Count: this.connectedClients.wlan0.length,
      },
    };

    logger.info("TimeSyncService: Broadcasting sync status", {
      piSynchronized: uiStatus.pi.isSynchronized,
      piReliability: uiStatus.pi.reliability,
      piLastSyncTime: uiStatus.pi.lastSyncTime,
      cameraSynchronized: uiStatus.camera.isSynchronized,
      piProxyState: uiStatus.piProxyState.state,
      piProxyValid: uiStatus.piProxyState.valid,
      ap0Clients: uiStatus.connectedClients.ap0Count,
      wlan0Clients: uiStatus.connectedClients.wlan0Count,
      rawPiReliable: rawStatus.piReliable,
      rawLastPiSync: rawStatus.lastPiSync,
    });

    this.wsManager.broadcast({
      type: "time-sync-status",
      data: uiStatus,
    });
  }

  /**
   * Get Pi reliability level for UI
   */
  getPiReliability(status) {
    if (!status.lastPiSync) return "none";

    const timeSinceSync = Date.now() - new Date(status.lastPiSync).getTime();
    const minutes = timeSinceSync / (60 * 1000);

    if (minutes < 5) return "high";
    if (minutes < 60) return "medium";
    if (minutes < 24 * 60) return "low";
    return "none";
  }

  /**
   * Check if camera is currently synchronized
   */
  isCameraSynchronized(status) {
    // Check if camera is currently connected
    const cameraController =
      typeof this.cameraController === "function"
        ? this.cameraController()
        : this.cameraController;

    if (!cameraController?.connected) {
      return false;
    }

    // Check if we have a recent sync
    if (!status.lastCameraSync) {
      return false;
    }

    // Consider camera synchronized if synced within last 30 minutes
    const timeSinceSync =
      Date.now() - new Date(status.lastCameraSync).getTime();
    const minutes = timeSinceSync / (60 * 1000);

    return minutes < 30;
  }

  /**
   * Get sync status
   */
  getStatus() {
    const status = this.state.getStatus();
    // Include piProxyState for frontend display
    status.piProxyState = this.piProxyState.getInfo();
    return status;
  }

  /**
   * Get sync statistics
   */
  getStatistics() {
    return this.state.getStatistics();
  }

  /**
   * Get last GPS location
   */
  getLastGPS() {
    return this.lastGPS || null;
  }

  /**
   * Clean up
   */
  cleanup() {
    if (this.syncCheckTimer) {
      clearInterval(this.syncCheckTimer);
      this.syncCheckTimer = null;
    }

    if (this.minuteCheckTimer) {
      clearInterval(this.minuteCheckTimer);
      this.minuteCheckTimer = null;
    }

    if (this.resyncTimer) {
      clearInterval(this.resyncTimer);
      this.resyncTimer = null;
    }

    this.state.cleanup();
    logger.info("TimeSync service cleaned up");
  }
}

// Export both class and singleton instance for testing
export { TimeSyncService };

// Export singleton instance as default
const timeSyncService = new TimeSyncService();
export default timeSyncService;
