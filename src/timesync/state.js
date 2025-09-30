/**
 * TimeSync State Manager
 *
 * Manages synchronization state and tracks reliability windows
 * Based on experimental results showing Pi drift of 0.1-0.3 s/hour with high variability
 */

import { EventEmitter } from "events";
import { logger } from "../utils/logger.js";

class TimeSyncState extends EventEmitter {
  constructor() {
    super();

    // Configuration based on experimental results
    this.config = {
      DRIFT_THRESHOLD: 1000, // 1 second in milliseconds
      RELIABILITY_WINDOW: 15 * 60 * 1000, // 15 minutes (reduced from 30 due to high variability)
      SYNC_CHECK_INTERVAL: 15 * 60 * 1000, // Check every 15 minutes
      MINUTE_CHECK_INTERVAL: 60 * 1000, // 1 minute for fallback checks
      MAX_SYNC_HISTORY: 10, // Number of sync events to retain
      VARIABILITY_THRESHOLD: 500, // 0.5 second max acceptable jump
      AUTO_SYNC_ENABLED: true, // Global enable/disable
      AP_ONLY_AUTO_SYNC: true, // Only auto-sync ap0 clients
    };

    // State tracking
    this.piReliable = false;
    this.lastPiSync = null;
    this.lastCameraSync = null;
    this.syncSource = null; // IP address of last sync source
    this.syncHistory = []; // Array of sync events
    this.noClientSince = null; // Track when client was last available
    this.scheduledCheckTimer = null;
    this.minuteCheckTimer = null;
  }

  /**
   * Check if Pi time is considered reliable
   */
  isPiTimeReliable() {
    if (!this.lastPiSync) return false;
    const timeSinceSync = Date.now() - this.lastPiSync.getTime();
    return timeSinceSync < this.config.RELIABILITY_WINDOW;
  }

  /**
   * Record a Pi sync event
   */
  recordPiSync(clientTime, clientIP, driftMs) {
    const syncEvent = {
      timestamp: new Date(),
      type: "pi_sync",
      source: clientIP,
      drift: driftMs,
      clientTime: clientTime,
    };

    this.lastPiSync = new Date();
    this.piReliable = true;
    this.syncSource = clientIP;

    // Add to history
    this.syncHistory.unshift(syncEvent);
    if (this.syncHistory.length > this.config.MAX_SYNC_HISTORY) {
      this.syncHistory.pop();
    }

    // Emit event for UI updates (using snake_case for consistency)
    this.emit("pi_sync", syncEvent);

    // Reset no-client timer
    this.noClientSince = null;

    logger.info(`Pi time synchronized from ${clientIP}, drift: ${driftMs}ms`);
  }

  /**
   * Record a camera sync event
   */
  recordCameraSync(driftMs) {
    const syncEvent = {
      timestamp: new Date(),
      type: "camera_sync",
      drift: driftMs,
    };

    this.lastCameraSync = new Date();

    // Add to history
    this.syncHistory.unshift(syncEvent);
    if (this.syncHistory.length > this.config.MAX_SYNC_HISTORY) {
      this.syncHistory.pop();
    }

    // Emit event for UI updates (using snake_case for consistency)
    this.emit("camera_sync", syncEvent);

    logger.info(`Camera time synchronized, drift: ${driftMs}ms`);
  }

  /**
   * Check if time jump indicates anomaly
   */
  isAnomalousJump(driftMs) {
    return Math.abs(driftMs) > this.config.VARIABILITY_THRESHOLD;
  }

  /**
   * Mark that no client is available
   */
  markNoClient() {
    if (!this.noClientSince) {
      this.noClientSince = new Date();
      logger.warn("No client available for time sync");
    }

    // Check how long we've been without a client
    const withoutClientMs = Date.now() - this.noClientSince.getTime();
    if (withoutClientMs > this.config.RELIABILITY_WINDOW) {
      this.piReliable = false;
      this.emit("reliability_lost");
    }
  }

  /**
   * Get current sync status
   */
  getStatus() {
    return {
      piReliable: this.isPiTimeReliable(),
      lastPiSync: this.lastPiSync ? this.lastPiSync.toISOString() : null,
      lastCameraSync: this.lastCameraSync
        ? this.lastCameraSync.toISOString()
        : null,
      syncSource: this.syncSource,
      timeSinceLastSync: this.lastPiSync
        ? Date.now() - this.lastPiSync.getTime()
        : null,
      noClientSince: this.noClientSince
        ? this.noClientSince.toISOString()
        : null,
      autoSyncEnabled: this.config.AUTO_SYNC_ENABLED,
      syncHistory: this.syncHistory.slice(0, 5), // Return last 5 events
    };
  }

  /**
   * Get sync statistics
   */
  getStatistics() {
    if (this.syncHistory.length === 0) {
      return { message: "No sync events recorded" };
    }

    const piSyncs = this.syncHistory.filter((e) => e.type === "pi_sync");
    const cameraSyncs = this.syncHistory.filter(
      (e) => e.type === "camera_sync",
    );

    const calculateStats = (syncs) => {
      if (syncs.length === 0) return null;
      const drifts = syncs.map((s) => s.drift);
      const sum = drifts.reduce((a, b) => a + b, 0);
      const avg = sum / drifts.length;
      const max = Math.max(...drifts);
      const min = Math.min(...drifts);
      return { avg, max, min, count: syncs.length };
    };

    return {
      pi: calculateStats(piSyncs),
      camera: calculateStats(cameraSyncs),
      totalSyncs: this.syncHistory.length,
      lastSync: this.syncHistory[0],
    };
  }

  /**
   * Check if auto-sync should be performed for a client
   */
  shouldAutoSync(clientIP, clientInterface) {
    if (!this.config.AUTO_SYNC_ENABLED) {
      return false;
    }

    // Check if AP-only restriction applies
    if (this.config.AP_ONLY_AUTO_SYNC && clientInterface !== "ap0") {
      logger.debug(
        `Auto-sync skipped for ${clientIP} - not on ap0 (on ${clientInterface})`,
      );
      return false;
    }

    return true;
  }

  /**
   * Clean up timers
   */
  cleanup() {
    if (this.scheduledCheckTimer) {
      clearTimeout(this.scheduledCheckTimer);
      this.scheduledCheckTimer = null;
    }
    if (this.minuteCheckTimer) {
      clearInterval(this.minuteCheckTimer);
      this.minuteCheckTimer = null;
    }
  }
}

export default TimeSyncState;
