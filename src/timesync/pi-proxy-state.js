/**
 * Pi Proxy State Management for Time Synchronization
 *
 * Tracks which time source (if any) the Pi is currently acting as a proxy for.
 * The Pi can only be considered reliable when synced to a client recently.
 *
 * State values:
 * - 'none': Pi is not a proxy (no recent client sync OR sync >10 min ago)
 * - 'ap0-device': Pi is proxy for ap0 client (synced within last 10 minutes)
 * - 'wlan0-device': Pi is proxy for wlan0 client (synced within last 10 minutes)
 *
 * Key principle: "The Pi should never be considered reliable because its RTC
 * does not have a battery." The Pi can only be reliable as a proxy.
 *
 * Adaptive Intervals:
 * Uses observed clock drift to adaptively calculate state validity and resync intervals.
 * Conservative defaults (10 min validity, 5 min resync) are used until drift is measured.
 */

import { logger } from "../utils/logger.js";

const DEFAULT_MIN_VALIDITY_WINDOW = 10 * 60 * 1000; // 10 minutes (conservative minimum)
const DEFAULT_MIN_RESYNC_INTERVAL = 5 * 60 * 1000; // 5 minutes (conservative minimum)
const DEFAULT_MAX_ACCEPTABLE_DRIFT_MS = 1000; // 1 second maximum acceptable drift

export class PiProxyState {
  constructor(
    minValidityWindow = DEFAULT_MIN_VALIDITY_WINDOW,
    minResyncInterval = DEFAULT_MIN_RESYNC_INTERVAL,
    maxAcceptableDriftMs = DEFAULT_MAX_ACCEPTABLE_DRIFT_MS,
  ) {
    // State tracking
    this.state = "none"; // 'none' | 'ap0-device' | 'wlan0-device'
    this.acquiredAt = null; // Date when state was acquired
    this.clientIP = null; // IP of sync source (if applicable)

    // Conservative defaults
    this.minValidityWindow = minValidityWindow;
    this.minResyncInterval = minResyncInterval;
    this.maxAcceptableDriftMs = maxAcceptableDriftMs;

    // Adaptive drift tracking
    this.syncHistory = []; // Array of {timestamp, driftMs, intervalMs, isInitialization}
    this.firstSyncAfterBoot = true; // Ignore first sync (power-down recovery)
    this.lastSyncTimestamp = null; // When last sync occurred
    this.driftRatePPM = null; // Calculated drift rate in parts per million
  }

  /**
   * Check if current state is valid (within validity window)
   * Uses adaptive validity window based on observed drift
   *
   * @returns {boolean} true if state is valid, false otherwise
   */
  isValid() {
    if (this.state === "none") return false;
    if (!this.acquiredAt) return false;

    const ageMs = Date.now() - this.acquiredAt.getTime();
    const validityWindow = this.getRecommendedStateValidity();
    return ageMs < validityWindow;
  }

  /**
   * Update state after sync
   *
   * @param {string} newState - 'none' | 'ap0-device' | 'wlan0-device'
   * @param {string|null} clientIP - IP address of sync source (null for 'none')
   */
  updateState(newState, clientIP) {
    this.state = newState;
    this.acquiredAt = new Date();
    this.clientIP = clientIP;
  }

  /**
   * Expire state if invalid (automatic after 10 minutes)
   *
   * This method checks if the state is expired and transitions to 'none' if so.
   * It does NOT auto-expire on every access - call this explicitly when needed.
   */
  expire() {
    if (this.state !== "none" && !this.isValid()) {
      this.state = "none";
      this.acquiredAt = null;
      this.clientIP = null;
    }
  }

  /**
   * Get current state info for monitoring/debugging
   *
   * @returns {Object} State information object
   * @returns {string} .state - Current state value
   * @returns {boolean} .valid - Whether state is currently valid
   * @returns {Date|null} .acquiredAt - When state was acquired
   * @returns {number|null} .ageSeconds - Age of state in seconds
   * @returns {string|null} .clientIP - IP of sync source
   */
  getInfo() {
    return {
      state: this.state,
      valid: this.isValid(),
      acquiredAt: this.acquiredAt,
      ageSeconds: this.acquiredAt
        ? Math.floor((Date.now() - this.acquiredAt.getTime()) / 1000)
        : null,
      clientIP: this.clientIP,
      // Adaptive drift tracking info
      driftRatePPM: this.driftRatePPM,
      recommendedStateValidityMs: this.getRecommendedStateValidity(),
      recommendedResyncIntervalMs: this.getRecommendedResyncInterval(),
      syncHistoryCount: this.syncHistory.filter((s) => !s.isInitialization)
        .length,
    };
  }

  /**
   * Record a time sync observation for drift tracking
   *
   * @param {number} driftMs - Observed drift in milliseconds (absolute value)
   */
  recordSync(driftMs) {
    const now = Date.now();
    const intervalMs = this.lastSyncTimestamp
      ? now - this.lastSyncTimestamp
      : null;

    // Ignore first sync after boot or long gap (>1 hour = likely power-down)
    const isLongGap = intervalMs && intervalMs > 3600000;
    const isInitialization = this.firstSyncAfterBoot || isLongGap;

    if (isInitialization) {
      this.firstSyncAfterBoot = false;
      this.syncHistory = [
        {
          timestamp: now,
          driftMs: driftMs,
          intervalMs: intervalMs,
          isInitialization: true,
        },
      ];
      this.lastSyncTimestamp = now;
      return;
    }

    // Record normal sync observation
    this.syncHistory.push({
      timestamp: now,
      driftMs: driftMs,
      intervalMs: intervalMs,
      isInitialization: false,
    });

    // Keep only last 20 observations (moving window)
    if (this.syncHistory.length > 20) {
      this.syncHistory = this.syncHistory.slice(-20);
    }

    this.lastSyncTimestamp = now;

    // Update calculated drift rate
    this.updateDriftRate();
  }

  /**
   * Calculate drift rate from recent sync observations
   * Uses weighted average of last 10 non-initialization syncs
   *
   * @private
   */
  updateDriftRate() {
    const recentSyncs = this.syncHistory
      .filter((s) => !s.isInitialization)
      .slice(-10);

    if (recentSyncs.length < 2) {
      this.driftRatePPM = null;
      return;
    }

    // Calculate average drift rate
    const totalDrift = recentSyncs.reduce((sum, s) => sum + s.driftMs, 0);
    const totalInterval = recentSyncs.reduce((sum, s) => sum + s.intervalMs, 0);

    // PPM = (drift_ms / interval_ms) * 1,000,000
    const newDriftRatePPM = (totalDrift / totalInterval) * 1000000;

    // Only log when drift rate changes significantly (>20% change or first calculation)
    const isSignificantChange =
      this.driftRatePPM === null ||
      Math.abs(newDriftRatePPM - this.driftRatePPM) / this.driftRatePPM > 0.2;

    if (isSignificantChange) {
      // Calculate recommended intervals before updating drift rate
      this.driftRatePPM = newDriftRatePPM; // Temporarily set for calculation
      const recommendedValidityMs = this.getRecommendedStateValidity();
      const recommendedResyncMs = this.getRecommendedResyncInterval();

      logger.info(`Adaptive drift tracking updated:`, {
        driftRatePPM: newDriftRatePPM.toFixed(2),
        observations: recentSyncs.length,
        recommendedStateValidityMinutes: (
          recommendedValidityMs / 60000
        ).toFixed(1),
        recommendedResyncMinutes: (recommendedResyncMs / 60000).toFixed(1),
      });
    }

    this.driftRatePPM = newDriftRatePPM;
  }

  /**
   * Get recommended state validity window based on observed drift
   * Returns conservative minimum if no drift data available
   *
   * @returns {number} Recommended state validity in milliseconds
   */
  getRecommendedStateValidity() {
    if (!this.driftRatePPM || this.driftRatePPM <= 0) {
      return this.minValidityWindow;
    }

    // Calculate how long until drift exceeds acceptable threshold
    // drift_ms = (driftRatePPM / 1,000,000) * interval_ms
    // interval_ms = (drift_ms * 1,000,000) / driftRatePPM
    const maxIntervalMs =
      (this.maxAcceptableDriftMs * 1000000) / this.driftRatePPM;

    // Use 80% of calculated max (safety margin)
    const recommendedMs = maxIntervalMs * 0.8;

    // Never go below conservative minimum
    return Math.max(this.minValidityWindow, recommendedMs);
  }

  /**
   * Get recommended resync interval based on observed drift
   * Returns half of state validity window (resync before expiry)
   *
   * @returns {number} Recommended resync interval in milliseconds
   */
  getRecommendedResyncInterval() {
    const stateValidity = this.getRecommendedStateValidity();

    // Resync at half the state validity interval
    const recommendedMs = stateValidity / 2;

    // Never go below conservative minimum
    return Math.max(this.minResyncInterval, recommendedMs);
  }
}
