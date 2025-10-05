/**
 * Intervalometer Auto-Save Tests
 *
 * Tests that session reports are automatically saved when sessions complete,
 * stop, or error - without requiring user action.
 *
 * This addresses the issue where overnight timelapse sessions complete but
 * reports are lost when the phone disconnects from the Pi's access point.
 */

import { jest } from "@jest/globals";
import { EventEmitter } from "events";
import { IntervalometerStateManager } from "../../src/intervalometer/state-manager.js";

// Mock dependencies
jest.unstable_mockModule("../../src/utils/logger.js", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.unstable_mockModule("../../src/intervalometer/report-manager.js", () => {
  return {
    TimelapseReportManager: jest.fn().mockImplementation(() => ({
      initialize: jest.fn(async () => true),
      saveReport: jest.fn(async (report) => ({
        ...report,
        saved: true,
        savedAt: new Date().toISOString(),
      })),
      loadUnsavedSession: jest.fn(async () => null),
      saveUnsavedSession: jest.fn(async () => true),
      clearUnsavedSession: jest.fn(async () => true),
      loadReports: jest.fn(async () => []),
      getReport: jest.fn(async () => null),
      updateReportTitle: jest.fn(async () => ({})),
      deleteReport: jest.fn(async () => true),
      cleanup: jest.fn(async () => {}),
    })),
  };
});

jest.unstable_mockModule(
  "../../src/intervalometer/timelapse-session.js",
  () => {
    return {
      TimelapseSession: jest
        .fn()
        .mockImplementation((getCameraController, options) => {
          const session = new EventEmitter();
          session.id = "test-session-id";
          session.title = options.title || "Test Session";
          session.state = "created";
          session.start = jest.fn(async () => {
            session.state = "running";
            session.emit("started", { sessionId: session.id });
          });
          session.stop = jest.fn(async () => {
            session.state = "stopped";
          });
          session.cleanup = jest.fn();
          session.getStatus = jest.fn(() => ({
            state: session.state,
            stats: {
              startTime: new Date(),
              endTime: new Date(),
              shotsTaken: 100,
              shotsSuccessful: 98,
              shotsFailed: 2,
              errors: [],
            },
            options: {
              interval: 30,
              totalShots: 100,
              stopCondition: "stop-after",
            },
            duration: "3000s",
          }));
          session.getMetadata = jest.fn(() => ({
            cameraInfo: { productname: "Canon EOS R50" },
            cameraSettings: { iso: "6400", tv: "30", av: "2.8" },
          }));
          return session;
        }),
    };
  },
);

describe("Intervalometer Auto-Save Behavior", () => {
  let stateManager;
  let mockSession;
  let getCameraController;
  let emittedEvents;

  beforeEach(async () => {
    // Reset all mocks
    jest.clearAllMocks();

    // Track emitted events
    emittedEvents = [];

    // Create state manager
    stateManager = new IntervalometerStateManager();

    // Spy on emit to track events
    const originalEmit = stateManager.emit.bind(stateManager);
    stateManager.emit = jest.fn((...args) => {
      emittedEvents.push({ event: args[0], data: args[1] });
      return originalEmit(...args);
    });

    // Initialize
    await stateManager.initialize();

    // Mock getCameraController
    getCameraController = jest.fn(() => ({
      getConnectionStatus: () => ({ connected: true }),
    }));

    // Create session
    mockSession = await stateManager.createSession(getCameraController, {
      title: "Test Timelapse",
      interval: 30,
      totalShots: 100,
      stopCondition: "stop-after",
    });

    // Clear events from initialization and session creation
    emittedEvents = [];
  });

  afterEach(async () => {
    if (stateManager) {
      await stateManager.cleanup();
    }
  });

  describe("Session Completed Auto-Save", () => {
    test("automatically saves report when session completes normally", async () => {
      // Spy on saveSessionReport
      const saveReportSpy = jest.spyOn(stateManager, "saveSessionReport");

      // Trigger session completion
      mockSession.emit("completed", {
        reason: "All shots completed successfully",
        stats: { shotsTaken: 100, shotsSuccessful: 100, shotsFailed: 0 },
      });

      // Wait for async operations
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should automatically save the report
      expect(saveReportSpy).toHaveBeenCalledWith(mockSession.id, null);

      // Should emit sessionCompleted event
      const completedEvent = emittedEvents.find(
        (e) => e.event === "sessionCompleted",
      );
      expect(completedEvent).toBeDefined();
      expect(completedEvent.data.sessionId).toBe(mockSession.id);

      // Should NOT have needsUserDecision flag
      expect(completedEvent.data.needsUserDecision).toBeUndefined();

      // Should emit reportSaved event
      const reportSavedEvent = emittedEvents.find(
        (e) => e.event === "reportSaved",
      );
      expect(reportSavedEvent).toBeDefined();
      expect(reportSavedEvent.data.sessionId).toBe(mockSession.id);
    });

    test("saves report with completion reason in metadata", async () => {
      // Spy on reportManager.saveReport to verify report content
      const saveReportSpy = jest.spyOn(
        stateManager.reportManager,
        "saveReport",
      );

      mockSession.emit("completed", {
        reason: "Session completed normally",
        stats: { shotsTaken: 100 },
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Check that report was saved via reportManager
      expect(saveReportSpy).toHaveBeenCalled();
      const savedReport = saveReportSpy.mock.calls[0][0];
      expect(savedReport.metadata.completionReason).toBe(
        "Session completed normally",
      );
      expect(savedReport.status).toBe("completed");
    });
  });

  describe("Session Stopped Auto-Save", () => {
    test("automatically saves report when user stops session", async () => {
      const saveReportSpy = jest.spyOn(stateManager, "saveSessionReport");

      // Trigger session stop
      mockSession.emit("stopped", {
        reason: "Stopped by user",
        stats: { shotsTaken: 50, shotsSuccessful: 50, shotsFailed: 0 },
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should automatically save the report
      expect(saveReportSpy).toHaveBeenCalledWith(mockSession.id, null);

      // Should emit sessionStopped event
      const stoppedEvent = emittedEvents.find(
        (e) => e.event === "sessionStopped",
      );
      expect(stoppedEvent).toBeDefined();
      expect(stoppedEvent.data.sessionId).toBe(mockSession.id);

      // Should NOT have needsUserDecision flag
      expect(stoppedEvent.data.needsUserDecision).toBeUndefined();

      // Should emit reportSaved event
      const reportSavedEvent = emittedEvents.find(
        (e) => e.event === "reportSaved",
      );
      expect(reportSavedEvent).toBeDefined();
    });

    test("saves report with stopped reason in metadata", async () => {
      // Spy on reportManager.saveReport to verify report content
      const saveReportSpy = jest.spyOn(
        stateManager.reportManager,
        "saveReport",
      );

      mockSession.emit("stopped", {
        reason: "Stopped by user",
        stats: { shotsTaken: 50 },
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(saveReportSpy).toHaveBeenCalled();
      const savedReport = saveReportSpy.mock.calls[0][0];
      expect(savedReport.metadata.completionReason).toBe("Stopped by user");
      expect(savedReport.status).toBe("stopped");
    });
  });

  describe("Session Error Auto-Save", () => {
    test("automatically saves report when session errors", async () => {
      const saveReportSpy = jest.spyOn(stateManager, "saveSessionReport");

      // Trigger session error
      mockSession.emit("error", {
        reason: "Camera disconnected during session",
        stats: { shotsTaken: 25, shotsSuccessful: 24, shotsFailed: 1 },
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should automatically save the report
      expect(saveReportSpy).toHaveBeenCalledWith(mockSession.id, null);

      // Should emit sessionError event
      const errorEvent = emittedEvents.find((e) => e.event === "sessionError");
      expect(errorEvent).toBeDefined();
      expect(errorEvent.data.sessionId).toBe(mockSession.id);

      // Should NOT have needsUserDecision flag
      expect(errorEvent.data.needsUserDecision).toBeUndefined();

      // Should emit reportSaved event
      const reportSavedEvent = emittedEvents.find(
        (e) => e.event === "reportSaved",
      );
      expect(reportSavedEvent).toBeDefined();
    });

    test("saves report with error reason in metadata", async () => {
      // Spy on reportManager.saveReport to verify report content
      const saveReportSpy = jest.spyOn(
        stateManager.reportManager,
        "saveReport",
      );

      mockSession.emit("error", {
        reason: "Camera disconnected during session",
        stats: { shotsTaken: 25 },
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(saveReportSpy).toHaveBeenCalled();
      const savedReport = saveReportSpy.mock.calls[0][0];
      expect(savedReport.metadata.completionReason).toBe(
        "Camera disconnected during session",
      );
      expect(savedReport.status).toBe("error");
    });
  });

  describe("Unsaved Session Recovery", () => {
    test("does not create unsaved session when auto-save succeeds", async () => {
      mockSession.emit("completed", {
        reason: "Session completed",
        stats: { shotsTaken: 100 },
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should NOT have unsaved session after successful auto-save
      expect(stateManager.unsavedSession).toBeNull();
    });

    test("creates unsaved session only if auto-save fails", async () => {
      // Spy on saveUnsavedSession to verify fallback behavior
      const saveUnsavedSpy = jest.spyOn(
        stateManager.reportManager,
        "saveUnsavedSession",
      );

      // Make saveReport fail by replacing it with a mock that rejects
      stateManager.reportManager.saveReport = jest
        .fn()
        .mockRejectedValueOnce(new Error("Disk full"));

      mockSession.emit("completed", {
        reason: "Session completed",
        stats: { shotsTaken: 100 },
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should create unsaved session as fallback
      // Note: This preserves the existing recovery mechanism for actual failures
      expect(saveUnsavedSpy).toHaveBeenCalled();
      expect(stateManager.unsavedSession).not.toBeNull();
      expect(stateManager.unsavedSession.needsUserDecision).toBe(true);
    });
  });

  describe("Frontend Notification", () => {
    test("emits completion event to notify frontend without requiring action", async () => {
      mockSession.emit("completed", {
        reason: "Session completed",
        stats: { shotsTaken: 100 },
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      const completedEvent = emittedEvents.find(
        (e) => e.event === "sessionCompleted",
      );

      // Event should still be emitted to update frontend UI
      expect(completedEvent).toBeDefined();

      // But should not require user decision
      expect(completedEvent.data.needsUserDecision).toBeUndefined();

      // Frontend can simply show "Session completed and saved" notification
      expect(completedEvent.data.sessionId).toBe(mockSession.id);
      expect(completedEvent.data.title).toBe("Test Timelapse");
    });

    test("includes auto-saved report info in completion event", async () => {
      mockSession.emit("completed", {
        reason: "Session completed",
        stats: { shotsTaken: 100 },
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      const reportSavedEvent = emittedEvents.find(
        (e) => e.event === "reportSaved",
      );

      // Report saved event includes full report details for frontend
      expect(reportSavedEvent).toBeDefined();
      expect(reportSavedEvent.data.report).toBeDefined();
      expect(reportSavedEvent.data.report.sessionId).toBe(mockSession.id);
    });
  });
});
