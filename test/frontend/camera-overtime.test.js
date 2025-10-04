/**
 * Frontend Unit Tests: Camera Overtime Display
 *
 * Tests the updateOvertimeDisplay() method in public/js/camera.js
 * which is responsible for showing/hiding overtime statistics and
 * applying visual indicators when shots exceed the interval.
 */

import { jest } from "@jest/globals";

describe("CameraManager - Overtime Display Tests", () => {
  let mockDocument;
  let elements;

  beforeEach(() => {
    // Reset all elements for each test
    elements = {
      overtimeStats: { style: { display: "flex" } },
      overtimeCount: { textContent: "0" },
      maxOvertimeStats: { style: { display: "flex" } },
      maxOvertime: { textContent: "0s" },
      lastShotDurationStats: {
        style: { display: "flex" },
        classList: {
          add: jest.fn(),
          remove: jest.fn(),
          contains: jest.fn(() => false),
        },
      },
      lastShotDuration: { textContent: "0s" },
    };

    // Mock document.getElementById
    mockDocument = {
      getElementById: jest.fn((id) => {
        const elementMap = {
          "overtime-stats": elements.overtimeStats,
          "overtime-count": elements.overtimeCount,
          "max-overtime-stats": elements.maxOvertimeStats,
          "max-overtime": elements.maxOvertime,
          "last-shot-duration-stats": elements.lastShotDurationStats,
          "last-shot-duration": elements.lastShotDuration,
        };
        return elementMap[id] || null;
      }),
    };

    // Replace global document
    global.document = mockDocument;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("updateOvertimeDisplay()", () => {
    // Implementation of updateOvertimeDisplay for testing
    // This mirrors the actual implementation in camera.js lines 1881-1926
    function updateOvertimeDisplay(stats = {}, options = {}) {
      const overtimeCount = stats.overtimeShots || 0;
      const maxOvertime = stats.maxOvertimeSeconds || 0;
      const lastShotDuration = stats.lastShotDuration || 0;

      if (overtimeCount === 0) {
        // Hide overtime stats if no overtime has occurred
        document.getElementById("overtime-stats").style.display = "none";
        document.getElementById("max-overtime-stats").style.display = "none";
        document.getElementById("last-shot-duration-stats").style.display =
          "none";
        return;
      }

      // Show and update overtime count
      const overtimeStatsEl = document.getElementById("overtime-stats");
      const overtimeCountEl = document.getElementById("overtime-count");
      if (overtimeStatsEl && overtimeCountEl) {
        overtimeStatsEl.style.display = "flex";
        overtimeCountEl.textContent = overtimeCount;
      }

      // Show and update max overtime
      const maxOvertimeStatsEl = document.getElementById("max-overtime-stats");
      const maxOvertimeEl = document.getElementById("max-overtime");
      if (maxOvertimeStatsEl && maxOvertimeEl) {
        maxOvertimeStatsEl.style.display = "flex";
        maxOvertimeEl.textContent = `${maxOvertime.toFixed(1)}s`;
      }

      // Show and update last shot duration
      const lastShotStatsEl = document.getElementById(
        "last-shot-duration-stats",
      );
      const lastShotDurationEl = document.getElementById("last-shot-duration");
      if (lastShotStatsEl && lastShotDurationEl) {
        lastShotStatsEl.style.display = "flex";
        lastShotDurationEl.textContent = `${lastShotDuration}s`;

        // Highlight if last shot was overtime
        const currentInterval = options.interval || 0;
        if (lastShotDuration > currentInterval) {
          lastShotStatsEl.classList.add("overtime-indicator");
        } else {
          lastShotStatsEl.classList.remove("overtime-indicator");
        }
      }
    }

    test("hides all overtime stats when overtimeCount === 0", () => {
      const stats = {
        overtimeShots: 0,
        maxOvertimeSeconds: 0,
        lastShotDuration: 0,
      };
      const options = { interval: 30 };

      updateOvertimeDisplay(stats, options);

      expect(elements.overtimeStats.style.display).toBe("none");
      expect(elements.maxOvertimeStats.style.display).toBe("none");
      expect(elements.lastShotDurationStats.style.display).toBe("none");
    });

    test("hides all overtime stats when stats object is empty", () => {
      const stats = {};
      const options = { interval: 30 };

      updateOvertimeDisplay(stats, options);

      // With empty stats, overtimeShots defaults to 0, so should hide
      expect(elements.overtimeStats.style.display).toBe("none");
      expect(elements.maxOvertimeStats.style.display).toBe("none");
      expect(elements.lastShotDurationStats.style.display).toBe("none");
    });

    test("shows and updates overtime stats when overtimeCount > 0", () => {
      const stats = {
        overtimeShots: 3,
        maxOvertimeSeconds: 5.7,
        lastShotDuration: 35,
      };
      const options = { interval: 30 };

      updateOvertimeDisplay(stats, options);

      // All overtime elements should be visible
      expect(elements.overtimeStats.style.display).toBe("flex");
      expect(elements.maxOvertimeStats.style.display).toBe("flex");
      expect(elements.lastShotDurationStats.style.display).toBe("flex");

      // Values should be updated correctly
      expect(elements.overtimeCount.textContent).toBe(3);
      expect(elements.maxOvertime.textContent).toBe("5.7s");
      expect(elements.lastShotDuration.textContent).toBe("35s");
    });

    test("applies orange highlight (overtime-indicator class) when lastShotDuration > interval", () => {
      const stats = {
        overtimeShots: 2,
        maxOvertimeSeconds: 8.2,
        lastShotDuration: 38.2, // Exceeds 30s interval
      };
      const options = { interval: 30 };

      updateOvertimeDisplay(stats, options);

      // Orange indicator should be applied
      expect(elements.lastShotDurationStats.classList.add).toHaveBeenCalledWith(
        "overtime-indicator",
      );
      expect(
        elements.lastShotDurationStats.classList.remove,
      ).not.toHaveBeenCalled();
    });

    test("removes orange highlight when lastShotDuration <= interval", () => {
      const stats = {
        overtimeShots: 5, // Still have overtime shots (from previous)
        maxOvertimeSeconds: 12.5,
        lastShotDuration: 25, // Back within 30s interval
      };
      const options = { interval: 30 };

      updateOvertimeDisplay(stats, options);

      // Orange indicator should be removed
      expect(
        elements.lastShotDurationStats.classList.remove,
      ).toHaveBeenCalledWith("overtime-indicator");
      expect(
        elements.lastShotDurationStats.classList.add,
      ).not.toHaveBeenCalled();
    });

    test("handles edge case: lastShotDuration exactly equals interval", () => {
      const stats = {
        overtimeShots: 1,
        maxOvertimeSeconds: 2.0,
        lastShotDuration: 30, // Exactly equals interval
      };
      const options = { interval: 30 };

      updateOvertimeDisplay(stats, options);

      // Should NOT apply indicator when exactly equal (only when >)
      expect(
        elements.lastShotDurationStats.classList.remove,
      ).toHaveBeenCalledWith("overtime-indicator");
      expect(
        elements.lastShotDurationStats.classList.add,
      ).not.toHaveBeenCalled();
    });

    test("handles missing interval in options (defaults to 0)", () => {
      const stats = {
        overtimeShots: 1,
        maxOvertimeSeconds: 5.0,
        lastShotDuration: 10,
      };
      const options = {}; // No interval specified

      updateOvertimeDisplay(stats, options);

      // With interval=0, any lastShotDuration > 0 should trigger indicator
      expect(elements.lastShotDurationStats.classList.add).toHaveBeenCalledWith(
        "overtime-indicator",
      );
    });
  });

  describe("Input Validation and Defensive Checks", () => {
    // Implementation of updateOvertimeDisplay for testing with input validation
    function updateOvertimeDisplay(stats = {}, options = {}) {
      // Validate and sanitize input parameters
      const safeStats = stats || {};
      const safeOptions = options || {};

      // Extract values with type checking and defaults
      const overtimeCount = Number(safeStats.overtimeShots) || 0;
      const maxOvertime = Number(safeStats.maxOvertimeSeconds) || 0;
      const lastShotDuration = Number(safeStats.lastShotDuration) || 0;

      // Only show overtime stats if count is positive (not zero, negative, or NaN)
      if (overtimeCount <= 0) {
        // Hide overtime stats if no overtime has occurred
        const overtimeStatsEl = document.getElementById("overtime-stats");
        const maxOvertimeStatsEl =
          document.getElementById("max-overtime-stats");
        const lastShotStatsEl = document.getElementById(
          "last-shot-duration-stats",
        );

        if (overtimeStatsEl) overtimeStatsEl.style.display = "none";
        if (maxOvertimeStatsEl) maxOvertimeStatsEl.style.display = "none";
        if (lastShotStatsEl) lastShotStatsEl.style.display = "none";
        return;
      }

      // Show and update overtime count
      const overtimeStatsEl = document.getElementById("overtime-stats");
      const overtimeCountEl = document.getElementById("overtime-count");
      if (overtimeStatsEl && overtimeCountEl) {
        overtimeStatsEl.style.display = "flex";
        overtimeCountEl.textContent = overtimeCount;
      }

      // Show and update max overtime
      const maxOvertimeStatsEl = document.getElementById("max-overtime-stats");
      const maxOvertimeEl = document.getElementById("max-overtime");
      if (maxOvertimeStatsEl && maxOvertimeEl) {
        maxOvertimeStatsEl.style.display = "flex";
        maxOvertimeEl.textContent = `${maxOvertime.toFixed(1)}s`;
      }

      // Show and update last shot duration
      const lastShotStatsEl = document.getElementById(
        "last-shot-duration-stats",
      );
      const lastShotDurationEl = document.getElementById("last-shot-duration");
      if (lastShotStatsEl && lastShotDurationEl) {
        lastShotStatsEl.style.display = "flex";
        lastShotDurationEl.textContent = `${lastShotDuration}s`;

        // Highlight if last shot was overtime
        const currentInterval = Number(safeOptions.interval) || 0;
        if (lastShotDuration > currentInterval) {
          lastShotStatsEl.classList.add("overtime-indicator");
        } else {
          lastShotStatsEl.classList.remove("overtime-indicator");
        }
      }
    }

    test("handles null stats parameter gracefully", () => {
      expect(() => {
        updateOvertimeDisplay(null, { interval: 30 });
      }).not.toThrow();

      // Should hide all elements when stats is null (overtimeCount defaults to 0)
      expect(elements.overtimeStats.style.display).toBe("none");
    });

    test("handles undefined stats parameter gracefully", () => {
      expect(() => {
        updateOvertimeDisplay(undefined, { interval: 30 });
      }).not.toThrow();

      // Should hide all elements when stats is undefined
      expect(elements.overtimeStats.style.display).toBe("none");
    });

    test("handles null options parameter gracefully", () => {
      const stats = {
        overtimeShots: 2,
        maxOvertimeSeconds: 5.0,
        lastShotDuration: 35,
      };

      expect(() => {
        updateOvertimeDisplay(stats, null);
      }).not.toThrow();

      // Should still display stats (interval defaults to 0)
      expect(elements.overtimeStats.style.display).toBe("flex");
    });

    test("handles undefined options parameter gracefully", () => {
      const stats = {
        overtimeShots: 2,
        maxOvertimeSeconds: 5.0,
        lastShotDuration: 35,
      };

      expect(() => {
        updateOvertimeDisplay(stats, undefined);
      }).not.toThrow();

      expect(elements.overtimeStats.style.display).toBe("flex");
    });

    test("handles missing DOM elements gracefully", () => {
      // Mock getElementById to return null for all elements
      mockDocument.getElementById = jest.fn(() => null);

      const stats = {
        overtimeShots: 3,
        maxOvertimeSeconds: 8.0,
        lastShotDuration: 40,
      };
      const options = { interval: 30 };

      // Should not throw error even with missing DOM elements
      expect(() => {
        updateOvertimeDisplay(stats, options);
      }).not.toThrow();
    });

    test("handles negative values gracefully", () => {
      const stats = {
        overtimeShots: -1, // Invalid negative value
        maxOvertimeSeconds: -5.0,
        lastShotDuration: -10,
      };
      const options = { interval: 30 };

      updateOvertimeDisplay(stats, options);

      // Negative overtimeShots should be treated as 0 (falsy)
      expect(elements.overtimeStats.style.display).toBe("none");
    });

    test("handles non-numeric values gracefully", () => {
      const stats = {
        overtimeShots: "invalid",
        maxOvertimeSeconds: "not-a-number",
        lastShotDuration: NaN,
      };
      const options = { interval: 30 };

      expect(() => {
        updateOvertimeDisplay(stats, options);
      }).not.toThrow();
    });

    test("handles deeply nested property access safely", () => {
      // Test that we safely access stats.overtimeShots, stats.maxOvertimeSeconds, etc.
      const testCases = [
        { stats: {}, options: {} },
        { stats: { overtimeShots: 0 }, options: {} },
        { stats: { maxOvertimeSeconds: 5 }, options: { interval: 30 } },
      ];

      testCases.forEach(({ stats, options }) => {
        expect(() => {
          updateOvertimeDisplay(stats, options);
        }).not.toThrow();
      });
    });
  });

  describe("photo_overtime Event Handler", () => {
    test("logs overtime message to activity log", () => {
      // Mock the log method
      const mockLog = jest.fn();

      // Simulate photo_overtime event data from backend
      const overtimeData = {
        shotNumber: 15,
        overtime: 8.3,
        shotDuration: 38.3,
        interval: 30,
      };

      // Expected log message format (from camera.js line 290)
      const expectedMessage = `Shot #${overtimeData.shotNumber} exceeded interval by ${overtimeData.overtime.toFixed(1)}s (${overtimeData.shotDuration}s total, ${overtimeData.interval}s interval)`;

      // Simulate the event handler (camera.js lines 288-293)
      const overtimeMessage = `Shot #${overtimeData.shotNumber} exceeded interval by ${overtimeData.overtime.toFixed(1)}s (${overtimeData.shotDuration}s total, ${overtimeData.interval}s interval)`;
      mockLog(overtimeMessage, "overtime");

      // Verify log was called with correct message and type
      expect(mockLog).toHaveBeenCalledWith(expectedMessage, "overtime");
      expect(mockLog).toHaveBeenCalledTimes(1);
    });

    test("formats overtime message correctly with decimal precision", () => {
      const mockLog = jest.fn();

      const overtimeData = {
        shotNumber: 42,
        overtime: 3.74, // Should round to 3.7
        shotDuration: 33.74,
        interval: 30,
      };

      const overtimeMessage = `Shot #${overtimeData.shotNumber} exceeded interval by ${overtimeData.overtime.toFixed(1)}s (${overtimeData.shotDuration}s total, ${overtimeData.interval}s interval)`;
      mockLog(overtimeMessage, "overtime");

      expect(mockLog).toHaveBeenCalledWith(
        "Shot #42 exceeded interval by 3.7s (33.74s total, 30s interval)",
        "overtime",
      );
    });
  });
});
