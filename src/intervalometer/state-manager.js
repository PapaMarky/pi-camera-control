import { EventEmitter } from "events";
import { logger } from "../utils/logger.js";
import { TimelapseReportManager } from "./report-manager.js";
import { toFilenameFormat, toReportFormat } from "../utils/datetime.js";

/**
 * Centralized Intervalometer State Management
 * Follows the same pattern as CameraStateManager and NetworkStateManager
 * Single source of truth for all intervalometer sessions and reporting
 */
export class IntervalometerStateManager extends EventEmitter {
  constructor() {
    super();

    // Core managers
    this.reportManager = new TimelapseReportManager();

    // Current session state
    this.currentSession = null;
    this.sessionHistory = new Map(); // id -> session data
    this.sessionState = {
      hasActiveSession: false,
      currentSessionId: null,
      lastSessionId: null,
      lastUpdate: null,
    };

    // Unsaved session for cross-reboot recovery
    this.unsavedSession = null;
    this.recoveryCheckInterval = null;

    // Status monitoring
    this.statusInterval = null;
    this.statusCheckInterval = 5000; // 5 seconds
  }

  /**
   * Initialize the intervalometer state manager
   */
  async initialize() {
    try {
      logger.info("Initializing IntervalometerStateManager...");

      // Initialize report manager
      await this.reportManager.initialize();

      // Check for unsaved session from previous run
      await this.checkForUnsavedSession();

      // Start status monitoring
      this.startStatusMonitoring();

      logger.info("IntervalometerStateManager initialized successfully", {
        hasUnsavedSession: !!this.unsavedSession,
        sessionCount: this.sessionHistory.size,
      });

      this.emit("initialized", {
        hasUnsavedSession: !!this.unsavedSession,
        sessionCount: this.sessionHistory.size,
      });

      return true;
    } catch (error) {
      logger.error("IntervalometerStateManager initialization failed:", error);
      this.emit("initializationFailed", { error: error.message });
      return false;
    }
  }

  /**
   * Create a new timelapse session
   */
  async createSession(getCameraController, options = {}) {
    try {
      // Import here to avoid circular dependency
      const { TimelapseSession } = await import("./timelapse-session.js");

      if (this.currentSession && this.currentSession.state === "running") {
        throw new Error("Cannot create new session while another is running");
      }

      // Generate session options with defaults
      const sessionOptions = {
        title: options.title || this.generateDefaultTitle(),
        ...options,
      };

      // Create new session
      const session = new TimelapseSession(getCameraController, sessionOptions);

      // Store session
      this.currentSession = session;
      this.sessionState.hasActiveSession = true;
      this.sessionState.currentSessionId = session.id;
      this.sessionState.lastUpdate = new Date();

      // Store in history
      this.sessionHistory.set(session.id, {
        id: session.id,
        title: session.title,
        createdAt: new Date(),
        state: "created",
        session: session,
      });

      // Bind session events
      this.bindSessionEvents(session);

      logger.info("Created new timelapse session", {
        id: session.id,
        title: session.title,
        options: sessionOptions,
      });

      this.emit("sessionCreated", {
        sessionId: session.id,
        title: session.title,
        options: sessionOptions,
      });

      return session;
    } catch (error) {
      logger.error("Failed to create timelapse session:", error);
      this.emit("sessionCreateFailed", { error: error.message });
      throw error;
    }
  }

  /**
   * Get the current active session
   */
  getCurrentSession() {
    return this.currentSession;
  }

  /**
   * Get session by ID
   */
  getSessionById(sessionId) {
    const sessionData = this.sessionHistory.get(sessionId);
    return sessionData ? sessionData.session : null;
  }

  /**
   * Get current state
   */
  getState() {
    return {
      ...this.sessionState,
      currentSession: this.currentSession
        ? {
            id: this.currentSession.id,
            title: this.currentSession.title,
            status: this.currentSession.getStatus(),
          }
        : null,
      sessionHistoryCount: this.sessionHistory.size,
      hasUnsavedSession: !!this.unsavedSession,
    };
  }

  /**
   * Get session status (for backward compatibility)
   */
  getSessionStatus() {
    if (!this.currentSession) {
      return {
        state: "stopped",
        message: "No active intervalometer session",
      };
    }

    return this.currentSession.getStatus();
  }

  /**
   * Generate default title based on current timestamp
   */
  generateDefaultTitle() {
    return toFilenameFormat(new Date());
  }

  /**
   * Bind events from timelapse session
   */
  bindSessionEvents(session) {
    // Forward session events with additional context
    session.on("started", (data) => {
      this.updateSessionState("running");
      this.emit("sessionStarted", { sessionId: session.id, ...data });
    });

    session.on("stopped", (data) => {
      this.handleSessionStopped(session, data);
    });

    session.on("completed", (data) => {
      this.handleSessionCompleted(session, data);
    });

    session.on("error", (data) => {
      this.handleSessionError(session, data);
    });

    session.on("paused", (data) => {
      this.updateSessionState("paused");
      this.emit("sessionPaused", { sessionId: session.id, ...data });
    });

    session.on("resumed", (data) => {
      this.updateSessionState("running");
      this.emit("sessionResumed", { sessionId: session.id, ...data });
    });

    // Photo events
    session.on("photo_taken", (data) => {
      this.emit("photoTaken", { sessionId: session.id, ...data });
    });

    session.on("photo_failed", (data) => {
      this.emit("photoFailed", { sessionId: session.id, ...data });
    });
  }

  /**
   * Handle session stopped
   */
  async handleSessionStopped(session, data) {
    this.updateSessionState("stopped");

    // Auto-save the session report
    try {
      const completionData = {
        ...data,
        reason: "Stopped by user",
        completedAt: new Date(),
      };

      // Store completion data temporarily for report generation
      this.unsavedSession = {
        sessionId: session.id,
        title: session.title,
        completionData,
      };

      // Automatically save the report
      await this.saveSessionReport(session.id, null);

      logger.info("Session stopped, report auto-saved", {
        sessionId: session.id,
        title: session.title,
      });

      this.emit("sessionStopped", {
        sessionId: session.id,
        title: session.title,
        ...data,
      });
    } catch (error) {
      // If auto-save fails, fall back to unsaved session recovery
      logger.error("Auto-save failed, marking as unsaved", {
        sessionId: session.id,
        error: error.message,
      });

      this.unsavedSession = {
        sessionId: session.id,
        title: session.title,
        completionData: {
          ...data,
          reason: "Stopped by user",
          completedAt: new Date(),
        },
        needsUserDecision: true,
      };

      await this.saveUnsavedSession();

      this.emit("sessionStopped", {
        sessionId: session.id,
        title: session.title,
        needsUserDecision: true,
        error: error.message,
        ...data,
      });
    }
  }

  /**
   * Handle session completed
   */
  async handleSessionCompleted(session, data) {
    this.updateSessionState("completed");

    // Auto-save the session report
    try {
      const completionData = {
        ...data,
        reason: data.reason || "Session completed normally",
        completedAt: new Date(),
      };

      // Store completion data temporarily for report generation
      this.unsavedSession = {
        sessionId: session.id,
        title: session.title,
        completionData,
      };

      // Automatically save the report
      await this.saveSessionReport(session.id, null);

      logger.info("Session completed, report auto-saved", {
        sessionId: session.id,
        title: session.title,
        reason: data.reason,
      });

      this.emit("sessionCompleted", {
        sessionId: session.id,
        title: session.title,
        ...data,
      });
    } catch (error) {
      // If auto-save fails, fall back to unsaved session recovery
      logger.error("Auto-save failed, marking as unsaved", {
        sessionId: session.id,
        error: error.message,
      });

      this.unsavedSession = {
        sessionId: session.id,
        title: session.title,
        completionData: {
          ...data,
          reason: data.reason || "Session completed normally",
          completedAt: new Date(),
        },
        needsUserDecision: true,
      };

      await this.saveUnsavedSession();

      this.emit("sessionCompleted", {
        sessionId: session.id,
        title: session.title,
        needsUserDecision: true,
        error: error.message,
        ...data,
      });
    }
  }

  /**
   * Handle session error
   */
  async handleSessionError(session, data) {
    this.updateSessionState("error");

    // Auto-save the session report
    try {
      const completionData = {
        ...data,
        reason: data.reason || "Session error",
        completedAt: new Date(),
      };

      // Store completion data temporarily for report generation
      this.unsavedSession = {
        sessionId: session.id,
        title: session.title,
        completionData,
      };

      // Automatically save the report
      await this.saveSessionReport(session.id, null);

      logger.info("Session error, report auto-saved", {
        sessionId: session.id,
        title: session.title,
        error: data.reason,
      });

      this.emit("sessionError", {
        sessionId: session.id,
        title: session.title,
        ...data,
      });
    } catch (error) {
      // If auto-save fails, fall back to unsaved session recovery
      logger.error("Auto-save failed, marking as unsaved", {
        sessionId: session.id,
        error: error.message,
      });

      this.unsavedSession = {
        sessionId: session.id,
        title: session.title,
        completionData: {
          ...data,
          reason: data.reason || "Session error",
          completedAt: new Date(),
        },
        needsUserDecision: true,
      };

      await this.saveUnsavedSession();

      this.emit("sessionError", {
        sessionId: session.id,
        title: session.title,
        needsUserDecision: true,
        error: error.message,
        ...data,
      });
    }
  }

  /**
   * Update session state
   */
  updateSessionState(state) {
    if (this.currentSession) {
      const sessionData = this.sessionHistory.get(this.currentSession.id);
      if (sessionData) {
        sessionData.state = state;
      }
    }

    this.sessionState.hasActiveSession =
      state === "running" || state === "paused";
    this.sessionState.lastUpdate = new Date();

    this.emit("stateChanged", {
      state,
      timestamp: this.sessionState.lastUpdate,
    });
  }

  /**
   * Save session report
   */
  async saveSessionReport(sessionId, customTitle = null) {
    try {
      const sessionData = this.sessionHistory.get(sessionId);
      if (!sessionData) {
        throw new Error(`Session ${sessionId} not found`);
      }

      const session = sessionData.session;
      let title = customTitle || session.title;

      // Update title if changed
      if (customTitle && customTitle !== session.title) {
        session.title = title;
        sessionData.title = title;
      }

      // Generate report
      const report = this.generateSessionReport(
        session,
        this.unsavedSession?.completionData,
      );

      // Save report
      const savedReport = await this.reportManager.saveReport(report);

      // Clear unsaved session
      if (this.unsavedSession && this.unsavedSession.sessionId === sessionId) {
        this.unsavedSession = null;
        await this.clearUnsavedSession();
      }

      logger.info("Session report saved", {
        sessionId,
        title,
        reportId: savedReport.id,
      });

      this.emit("reportSaved", {
        sessionId,
        title,
        reportId: savedReport.id,
        report: savedReport,
      });

      return savedReport;
    } catch (error) {
      logger.error("Failed to save session report:", error);
      this.emit("reportSaveFailed", { sessionId, error: error.message });
      throw error;
    }
  }

  /**
   * Discard session (don't save report)
   */
  async discardSession(sessionId) {
    try {
      logger.info("Discarding session", { sessionId });

      // Clear unsaved session
      if (this.unsavedSession && this.unsavedSession.sessionId === sessionId) {
        this.unsavedSession = null;
        await this.clearUnsavedSession();
      }

      // Remove from history if desired (optional - we could keep for debugging)
      // this.sessionHistory.delete(sessionId);

      this.emit("sessionDiscarded", { sessionId });

      return true;
    } catch (error) {
      logger.error("Failed to discard session:", error);
      throw error;
    }
  }

  /**
   * Generate session report
   */
  generateSessionReport(session, completionData = null) {
    const status = session.getStatus();
    const metadata = session.getMetadata();
    const now = new Date();

    // Determine report status from sessionData.state (set by updateSessionState)
    const sessionData = this.sessionHistory.get(session.id);
    const reportStatus = sessionData ? sessionData.state : status.state;

    return {
      id: `report-${session.id}`,
      sessionId: session.id,
      title: session.title,
      startTime: toReportFormat(status.stats.startTime),
      endTime: toReportFormat(status.stats.endTime || now),
      duration: status.duration,
      status: reportStatus,
      intervalometer: {
        interval: status.options.interval,
        stopCondition: status.options.stopCondition || "unlimited",
        numberOfShots: status.options.totalShots,
        stopAt: status.options.stopTime
          ? toReportFormat(status.options.stopTime)
          : null,
      },
      cameraInfo: metadata.cameraInfo || null,
      cameraSettings: metadata.cameraSettings || null,
      results: {
        imagesCaptured: status.stats.shotsTaken,
        imagesSuccessful: status.stats.shotsSuccessful,
        imagesFailed: status.stats.shotsFailed,
        errors: status.stats.errors || [],
      },
      metadata: {
        completionReason: completionData?.reason || "Unknown",
        savedAt: toReportFormat(now),
        version: "2.0.0",
        cameraModel: metadata.cameraInfo?.productname || "Unknown",
      },
    };
  }

  /**
   * Check for unsaved session from previous run
   */
  async checkForUnsavedSession() {
    try {
      this.unsavedSession = await this.reportManager.loadUnsavedSession();

      if (this.unsavedSession) {
        logger.info("Found unsaved session from previous run", {
          sessionId: this.unsavedSession.sessionId,
          title: this.unsavedSession.title,
        });

        this.emit("unsavedSessionFound", {
          sessionId: this.unsavedSession.sessionId,
          title: this.unsavedSession.title,
          completionData: this.unsavedSession.completionData,
        });
      }
    } catch (error) {
      logger.debug("No unsaved session found (this is normal):", error.message);
    }
  }

  /**
   * Save unsaved session to disk for cross-reboot recovery
   */
  async saveUnsavedSession() {
    if (!this.unsavedSession) return;

    try {
      await this.reportManager.saveUnsavedSession(this.unsavedSession);
      logger.debug("Saved unsaved session data for recovery");
    } catch (error) {
      logger.error("Failed to save unsaved session data:", error);
    }
  }

  /**
   * Clear unsaved session from disk
   */
  async clearUnsavedSession() {
    try {
      await this.reportManager.clearUnsavedSession();
      logger.debug("Cleared unsaved session data");
    } catch (error) {
      logger.error("Failed to clear unsaved session data:", error);
    }
  }

  /**
   * Get all saved reports
   */
  async getReports() {
    return await this.reportManager.loadReports();
  }

  /**
   * Get report by ID
   */
  async getReport(reportId) {
    return await this.reportManager.getReport(reportId);
  }

  /**
   * Update report title
   */
  async updateReportTitle(reportId, newTitle) {
    return await this.reportManager.updateReportTitle(reportId, newTitle);
  }

  /**
   * Delete report
   */
  async deleteReport(reportId) {
    return await this.reportManager.deleteReport(reportId);
  }

  /**
   * Start status monitoring
   */
  startStatusMonitoring() {
    if (this.statusInterval) {
      clearInterval(this.statusInterval);
    }

    this.statusInterval = setInterval(() => {
      if (this.currentSession) {
        const status = this.currentSession.getStatus();
        this.emit("statusUpdate", {
          sessionId: this.currentSession.id,
          status,
        });
      }
    }, this.statusCheckInterval);

    logger.debug("Intervalometer status monitoring started");
  }

  /**
   * Stop status monitoring
   */
  stopStatusMonitoring() {
    if (this.statusInterval) {
      clearInterval(this.statusInterval);
      this.statusInterval = null;
    }

    logger.debug("Intervalometer status monitoring stopped");
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    logger.info("Cleaning up IntervalometerStateManager...");

    this.stopStatusMonitoring();

    // Cleanup current session
    if (
      this.currentSession &&
      typeof this.currentSession.cleanup === "function"
    ) {
      this.currentSession.cleanup();
    }

    // Cleanup report manager
    if (this.reportManager) {
      await this.reportManager.cleanup();
    }

    this.removeAllListeners();

    logger.info("IntervalometerStateManager cleanup complete");
  }
}
