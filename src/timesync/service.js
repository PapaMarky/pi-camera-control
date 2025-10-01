/**
 * TimeSync Service
 *
 * Manages automatic time synchronization between client, Pi, and camera
 */

import { spawn } from "child_process";
import TimeSyncState from "./state.js";
import { logger } from "../utils/logger.js";

class TimeSyncService {
  constructor() {
    this.state = new TimeSyncState();
    this.wsManager = null;
    this.cameraController = null;
    this.syncCheckTimer = null;
    this.connectedClients = new Map(); // Track connected clients
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
    this.connectedClients.set(clientIP, { interface: clientInterface, ws });

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

    // Wait a moment for client to be ready
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Request time from client
    this.requestClientTime(clientIP, ws);
  }

  /**
   * Handle client disconnection
   */
  handleClientDisconnection(clientIP) {
    this.connectedClients.delete(clientIP);

    // Check if any AP clients remain
    const hasApClient = Array.from(this.connectedClients.values()).some(
      (client) => client.interface === "ap0",
    );

    if (!hasApClient) {
      this.state.markNoClient();
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
      if (this.connectedClients.has(clientIP)) {
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
   * Sync camera time from Pi
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

    if (!this.state.isPiTimeReliable()) {
      logger.warn("Pi time not reliable, skipping camera sync");
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
      }
    } catch (error) {
      logger.error("Error syncing camera time:", error);
    }

    return false;
  }

  /**
   * Handle camera connection
   */
  async handleCameraConnection() {
    logger.info("Camera connected, checking time sync");

    // Always sync camera on connection for timezone changes
    await this.syncCameraTime();
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
    const apClient = Array.from(this.connectedClients.entries()).find(
      ([_ip, client]) => client.interface === "ap0",
    );

    if (apClient) {
      const [clientIP, { ws }] = apClient;
      logger.debug(`Performing scheduled sync check with ${clientIP}`);
      this.logActivity(
        `Scheduled time sync check with device ${clientIP}`,
        "info",
      );
      this.requestClientTime(clientIP, ws);
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
      const apClient = Array.from(this.connectedClients.entries()).find(
        ([_ip, client]) => client.interface === "ap0",
      );

      if (apClient) {
        // Client found, stop minute checks
        clearInterval(this.minuteCheckTimer);
        this.minuteCheckTimer = null;

        // Perform sync
        const [clientIP, { ws }] = apClient;
        this.requestClientTime(clientIP, ws);

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
    };

    logger.info("TimeSyncService: Broadcasting sync status", {
      piSynchronized: uiStatus.pi.isSynchronized,
      piReliability: uiStatus.pi.reliability,
      cameraSynchronized: uiStatus.camera.isSynchronized,
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
    return this.state.getStatus();
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

    this.state.cleanup();
    logger.info("TimeSync service cleaned up");
  }
}

// Export both class and singleton instance for testing
export { TimeSyncService };

// Export singleton instance as default
const timeSyncService = new TimeSyncService();
export default timeSyncService;