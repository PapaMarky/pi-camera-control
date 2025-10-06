import { EventEmitter } from "events";
import { randomUUID } from "crypto";
// import cron from 'node-cron'; // Unused import - TODO: implement scheduling features
import { logger } from "../utils/logger.js";
import { toFilenameFormat } from "../utils/datetime.js";
import { waitForPhotoComplete } from "../utils/event-polling.js";

/**
 * Enhanced Timelapse Session Class
 * Individual session with metadata support and title management
 * Based on original IntervalometerSession but with enhanced features
 */
export class TimelapseSession extends EventEmitter {
  constructor(getCameraController, options = {}) {
    super();

    // Session identity and metadata
    this.id = randomUUID();
    this.title = options.title || this.generateDefaultTitle();
    this.createdAt = new Date();

    // Camera controller
    this.getCameraController = getCameraController;

    // Session options with defaults
    this.options = {
      interval: 10, // seconds
      totalShots: null, // infinite if null
      stopTime: null, // Date object
      stopCondition: "unlimited", // 'unlimited', 'stop-after', 'stop-at'
      ...options,
    };

    // Camera data to be fetched at start
    this.cameraInfo = null;
    this.cameraSettings = null;

    // Calculate totalShots if we have stopTime but no explicit totalShots
    if (this.options.stopTime && !this.options.totalShots) {
      const now = new Date();
      const durationMs = this.options.stopTime.getTime() - now.getTime();
      const intervalMs = this.options.interval * 1000;
      if (durationMs > 0) {
        this.options.totalShots = Math.ceil(durationMs / intervalMs);
        logger.info(
          `Calculated totalShots: ${this.options.totalShots} based on stopTime and interval`,
          {
            sessionId: this.id,
            title: this.title,
          },
        );
      }
    }

    // Session state and statistics
    this.state = "created"; // created, running, paused, completed, stopped, error
    this.stats = {
      startTime: null,
      endTime: null,
      shotsTaken: 0,
      shotsSuccessful: 0,
      shotsFailed: 0,
      currentShot: 0,
      errors: [],
      overtimeShots: 0, // Count of shots exceeding interval
      totalOvertimeSeconds: 0, // Cumulative overtime
      maxOvertimeSeconds: 0, // Worst case overtime
      lastShotDuration: 0, // Duration of most recent shot in seconds
      totalShotDurationSeconds: 0, // Total time spent on all successful shots
      firstImageName: null, // Filename of first captured image
      lastImageName: null, // Filename of most recent captured image
    };

    // Session control
    this.intervalId = null;
    this.cronJob = null;
    this.shouldStop = false;
    this.nextShotTime = null;
  }

  /**
   * Generate default title based on creation timestamp
   * Uses local time for user-friendly naming
   */
  generateDefaultTitle() {
    return toFilenameFormat(new Date());
  }

  /**
   * Update session title
   */
  updateTitle(newTitle) {
    if (!newTitle || newTitle.trim() === "") {
      throw new Error("Title cannot be empty");
    }

    const oldTitle = this.title;
    this.title = newTitle.trim();

    logger.info(`Updated session title`, {
      sessionId: this.id,
      oldTitle,
      newTitle: this.title,
    });

    this.emit("titleUpdated", {
      sessionId: this.id,
      oldTitle,
      newTitle: this.title,
    });
  }

  /**
   * Get session metadata
   */
  getMetadata() {
    return {
      id: this.id,
      title: this.title,
      createdAt: this.createdAt,
      state: this.state,
      options: { ...this.options },
      stats: { ...this.stats },
      cameraInfo: this.cameraInfo,
      cameraSettings: this.cameraSettings,
    };
  }

  /**
   * Get current camera controller with retries
   */
  async getCurrentCameraController(retryCount = 3) {
    for (let attempt = 1; attempt <= retryCount; attempt++) {
      const controller = this.getCameraController();
      if (controller) {
        return controller;
      }

      logger.warn(
        `Camera controller not available (attempt ${attempt}/${retryCount})`,
        {
          sessionId: this.id,
          title: this.title,
        },
      );

      if (attempt < retryCount) {
        // Wait a bit before retrying
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    logger.error(
      "No camera controller available after retries during timelapse session",
      {
        sessionId: this.id,
        title: this.title,
      },
    );
    throw new Error("No camera controller available");
  }

  /**
   * Start the timelapse session
   */
  async start() {
    if (this.state === "running") {
      throw new Error("Session is already running");
    }

    logger.info("Starting timelapse session", {
      sessionId: this.id,
      title: this.title,
      options: this.options,
    });

    // Validate camera connection
    const cameraController = await this.getCurrentCameraController();
    const cameraStatus = cameraController.getConnectionStatus();
    if (!cameraStatus.connected) {
      throw new Error("Camera is not connected");
    }

    // Fetch camera information and settings at session start
    try {
      logger.info("Fetching camera information for timelapse session", {
        sessionId: this.id,
        title: this.title,
      });

      this.cameraInfo = await cameraController.getDeviceInformation();
      this.cameraSettings = await cameraController.getCameraSettings();

      logger.info("Camera data fetched successfully", {
        sessionId: this.id,
        cameraProduct: this.cameraInfo?.productname,
        cameraSerial: this.cameraInfo?.serialnumber,
      });
    } catch (error) {
      logger.warn(
        "Failed to fetch camera data for session, continuing without it",
        {
          sessionId: this.id,
          title: this.title,
          error: error.message,
        },
      );
      // Continue without camera data - don't fail the session
    }

    // Validate interval against camera settings
    const validation = await cameraController.validateInterval(
      this.options.interval,
    );
    if (!validation.valid) {
      throw new Error(validation.error || "Invalid interval settings");
    }

    // Reset state for new start
    this.shouldStop = false;
    this.state = "running";
    this.stats = {
      startTime: new Date(),
      endTime: null,
      shotsTaken: 0,
      shotsSuccessful: 0,
      shotsFailed: 0,
      currentShot: 0,
      errors: [],
      overtimeShots: 0,
      totalOvertimeSeconds: 0,
      maxOvertimeSeconds: 0,
      lastShotDuration: 0,
      totalShotDurationSeconds: 0,
      firstImageName: null,
      lastImageName: null,
    };

    // Recalculate totalShots based on actual start time if using stopTime
    if (this.options.stopTime && !this.options.totalShots) {
      const durationMs =
        this.options.stopTime.getTime() - this.stats.startTime.getTime();
      const intervalMs = this.options.interval * 1000;
      if (durationMs > 0) {
        this.options.totalShots = Math.ceil(durationMs / intervalMs);
        logger.info(
          `Recalculated totalShots: ${this.options.totalShots} based on actual startTime`,
          {
            sessionId: this.id,
            title: this.title,
          },
        );
      }
    }

    // Pause camera info polling during timelapse session to avoid interference
    cameraController.pauseInfoPolling();

    // COMPLETELY disable connection monitoring during timelapse session
    // Connection monitoring conflicts with long exposures and photo operations
    cameraController.pauseConnectionMonitoring();

    logger.info("Timelapse session started", {
      sessionId: this.id,
      title: this.title,
      interval: this.options.interval,
      totalShots: this.options.totalShots,
      stopTime: this.options.stopTime,
    });

    this.emit("started", {
      sessionId: this.id,
      title: this.title,
      options: this.options,
      stats: { ...this.stats },
    });

    // Start the shooting interval
    await this.scheduleNextShot();

    return true;
  }

  /**
   * Stop the timelapse session
   */
  async stop() {
    logger.info("Stopping timelapse session", {
      sessionId: this.id,
      title: this.title,
    });

    this.shouldStop = true;

    if (this.intervalId) {
      clearTimeout(this.intervalId);
      this.intervalId = null;
    }

    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
    }

    this.state = "stopped";
    this.stats.endTime = new Date();

    // Resume camera info polling and connection monitoring after session ends
    try {
      const cameraController = await this.getCurrentCameraController();
      cameraController.resumeInfoPolling();
      cameraController.resumeConnectionMonitoring();
    } catch (error) {
      logger.warn(
        "Could not resume camera monitoring, camera controller not available",
        {
          sessionId: this.id,
          title: this.title,
          error: error.message,
        },
      );
    }

    this.emit("stopped", {
      sessionId: this.id,
      title: this.title,
      reason: "Manually stopped by user",
      stats: { ...this.stats },
      options: { ...this.options },
    });

    return true;
  }

  /**
   * Pause the timelapse session
   */
  async pause() {
    if (this.state !== "running") {
      return false;
    }

    logger.info("Pausing timelapse session", {
      sessionId: this.id,
      title: this.title,
    });

    if (this.intervalId) {
      clearTimeout(this.intervalId);
      this.intervalId = null;
    }

    this.state = "paused";
    this.emit("paused", {
      sessionId: this.id,
      title: this.title,
      stats: { ...this.stats },
    });

    return true;
  }

  /**
   * Resume the timelapse session
   */
  async resume() {
    if (this.state !== "paused") {
      return false;
    }

    logger.info("Resuming timelapse session", {
      sessionId: this.id,
      title: this.title,
    });

    this.state = "running";
    this.emit("resumed", {
      sessionId: this.id,
      title: this.title,
      stats: { ...this.stats },
    });

    await this.scheduleNextShot();

    return true;
  }

  /**
   * Schedule the next shot
   */
  async scheduleNextShot() {
    if (this.shouldStop || this.state !== "running") {
      return;
    }

    // Check if we've reached the shot limit
    if (
      this.options.totalShots &&
      this.stats.shotsTaken >= this.options.totalShots
    ) {
      await this.complete("Shot limit reached");
      return;
    }

    // Check if we've reached the stop time
    if (this.options.stopTime && new Date() >= this.options.stopTime) {
      await this.complete("Stop time reached");
      return;
    }

    // Calculate the exact time for the next shot
    const now = new Date();
    if (!this.nextShotTime) {
      // First shot - take it immediately, then schedule the next
      this.nextShotTime = now;
    } else {
      // Subsequent shots - calculate based on interval from start time
      // After shot N is taken, shotsTaken = N, and we schedule shot N+1
      // Shot 1 at time 0, shot 2 at 1*interval, shot 3 at 2*interval, etc.
      // So for the next shot (N+1), we use shotsTaken as the multiplier since shot 1 was at 0
      this.nextShotTime = new Date(
        this.stats.startTime.getTime() +
          this.stats.shotsTaken * this.options.interval * 1000,
      );
    }

    // Calculate delay until next shot time
    const delayMs = Math.max(0, this.nextShotTime.getTime() - now.getTime());

    // Schedule the next shot
    this.intervalId = setTimeout(async () => {
      await this.takeShot();
      await this.scheduleNextShot();
    }, delayMs);
  }

  /**
   * Take a single shot with event polling integration
   */
  async takeShot() {
    if (this.shouldStop || this.state !== "running") {
      return;
    }

    this.stats.currentShot++;
    const shotNumber = this.stats.currentShot;

    logger.debug(`Taking shot ${shotNumber}`, {
      sessionId: this.id,
      title: this.title,
    });

    const shotStartTime = Date.now();

    try {
      const cameraController = await this.getCurrentCameraController();

      // Start event polling BEFORE pressing shutter (race condition prevention)
      // Calculate timeout: interval + 30s margin for long exposures
      const timeoutMs = (this.options.interval + 30) * 1000;

      // Start event polling and take photo concurrently
      // Event polling will wait for addedcontents event
      const [filePath] = await Promise.all([
        waitForPhotoComplete(cameraController, timeoutMs),
        cameraController.takePhoto(),
      ]);

      // Calculate shot duration
      const shotEndTime = Date.now();
      const shotDuration = (shotEndTime - shotStartTime) / 1000; // Convert to seconds

      // Extract filename from CCAPI path (e.g., "/ccapi/ver110/contents/sd/100CANON/IMG_0025.JPG" -> "IMG_0025.JPG")
      const filename = filePath ? filePath.split("/").pop() : null;

      // Update stats
      this.stats.shotsTaken++;
      this.stats.shotsSuccessful++;
      this.stats.lastShotDuration = shotDuration;
      this.stats.totalShotDurationSeconds += shotDuration;

      // Track first and last image filenames
      if (!this.stats.firstImageName && filename) {
        this.stats.firstImageName = filename;
        logger.debug(`First image captured: ${filename}`, {
          sessionId: this.id,
          title: this.title,
        });
      }
      if (filename) {
        this.stats.lastImageName = filename;
      }

      // Detect overtime
      if (shotDuration > this.options.interval) {
        const overtime = shotDuration - this.options.interval;
        this.stats.overtimeShots++;
        this.stats.totalOvertimeSeconds += overtime;

        // Update max overtime if this is the worst case
        if (overtime > this.stats.maxOvertimeSeconds) {
          this.stats.maxOvertimeSeconds = overtime;
        }

        // Log warning about overtime
        logger.warn(
          `Shot ${shotNumber} took ${shotDuration.toFixed(1)}s (${overtime.toFixed(1)}s over ${this.options.interval}s interval)`,
          {
            sessionId: this.id,
            title: this.title,
            shotNumber,
            interval: this.options.interval,
            shotDuration,
            overtime,
          },
        );

        // Emit photo_overtime event
        this.emit("photo_overtime", {
          sessionId: this.id,
          title: this.title,
          shotNumber,
          interval: this.options.interval,
          shotDuration,
          overtime,
          filePath,
          message: `Shot ${shotNumber} took ${shotDuration.toFixed(1)}s (${overtime.toFixed(1)}s over ${this.options.interval}s interval)`,
        });
      }

      // Immediately update nextShotTime for the UI
      // After shot N, the next shot (N+1) will be at startTime + (N * interval)
      this.nextShotTime = new Date(
        this.stats.startTime.getTime() +
          this.stats.shotsTaken * this.options.interval * 1000,
      );

      logger.info(`Shot ${shotNumber} completed successfully`, {
        sessionId: this.id,
        title: this.title,
        shotNumber,
        totalTaken: this.stats.shotsTaken,
        duration: shotDuration.toFixed(1),
      });

      const photoData = {
        sessionId: this.id,
        title: this.title,
        shotNumber,
        success: true,
        timestamp: new Date().toISOString(),
        filePath,
        duration: shotDuration,
        stats: { ...this.stats },
      };

      this.emit("photo_taken", photoData);
    } catch (error) {
      this.stats.shotsTaken++;
      this.stats.shotsFailed++;
      this.stats.errors.push({
        shotNumber,
        error: error.message,
        timestamp: new Date().toISOString(),
      });

      logger.error(`Shot ${shotNumber} failed`, {
        sessionId: this.id,
        title: this.title,
        shotNumber,
        error: error.message,
      });

      this.emit("photo_failed", {
        sessionId: this.id,
        title: this.title,
        shotNumber,
        error: error.message,
        timestamp: new Date().toISOString(),
        stats: { ...this.stats },
      });

      // Check if we should abort due to too many failures
      const failureRate = this.stats.shotsFailed / this.stats.shotsTaken;
      if (this.stats.shotsTaken > 5 && failureRate > 0.5) {
        logger.error("High failure rate detected, stopping session", {
          sessionId: this.id,
          title: this.title,
          failureRate,
          totalShots: this.stats.shotsTaken,
        });
        this.error("High failure rate detected");
        return;
      }
    }
  }

  /**
   * Complete the timelapse session
   */
  async complete(reason = "Session completed normally") {
    logger.info("Timelapse session completed", {
      sessionId: this.id,
      title: this.title,
      reason,
    });

    this.state = "completed";
    this.stats.endTime = new Date();

    if (this.intervalId) {
      clearTimeout(this.intervalId);
      this.intervalId = null;
    }

    // Resume camera info polling and connection monitoring after completion
    try {
      const cameraController = await this.getCurrentCameraController();
      cameraController.resumeInfoPolling();
      cameraController.resumeConnectionMonitoring();
    } catch (error) {
      logger.warn(
        "Could not resume camera monitoring on completion, camera controller not available",
        {
          sessionId: this.id,
          title: this.title,
          error: error.message,
        },
      );
    }

    this.emit("completed", {
      sessionId: this.id,
      title: this.title,
      reason,
      stats: { ...this.stats },
      options: { ...this.options },
    });
  }

  /**
   * Handle session error
   */
  error(reason) {
    logger.error("Timelapse session error", {
      sessionId: this.id,
      title: this.title,
      reason,
    });

    this.state = "error";
    this.stats.endTime = new Date();

    if (this.intervalId) {
      clearTimeout(this.intervalId);
      this.intervalId = null;
    }

    this.emit("error", {
      sessionId: this.id,
      title: this.title,
      reason,
      stats: { ...this.stats },
      options: { ...this.options },
    });
  }

  /**
   * Get comprehensive session status
   */
  getStatus() {
    const duration = this.stats.startTime
      ? (this.stats.endTime || new Date()) - this.stats.startTime
      : 0;

    const remainingShots = this.options.totalShots
      ? Math.max(0, this.options.totalShots - this.stats.shotsTaken)
      : null;

    const estimatedEndTime =
      this.options.totalShots && this.state === "running"
        ? new Date(
            this.stats.startTime.getTime() +
              this.options.totalShots * this.options.interval * 1000,
          )
        : null;

    const successRate =
      this.stats.shotsTaken > 0
        ? this.stats.shotsSuccessful / this.stats.shotsTaken
        : 1;

    const averageShotDuration =
      this.stats.shotsSuccessful > 0
        ? this.stats.totalShotDurationSeconds / this.stats.shotsSuccessful
        : 0;

    return {
      // Session identity
      sessionId: this.id,
      title: this.title,
      createdAt: this.createdAt,

      // Current state
      state: this.state,

      // Configuration
      options: { ...this.options },

      // Statistics
      stats: { ...this.stats },

      // Calculated fields
      duration,
      remainingShots,
      estimatedEndTime,
      nextShotTime: this.nextShotTime,
      successRate,
      averageShotDuration,
    };
  }

  /**
   * Cleanup session resources
   */
  cleanup() {
    if (this.state === "running") {
      this.stop();
    }

    // Clear any remaining timeouts
    if (this.intervalId) {
      clearTimeout(this.intervalId);
      this.intervalId = null;
    }

    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
    }

    logger.debug("Timelapse session cleanup completed", {
      sessionId: this.id,
      title: this.title,
    });
  }
}
