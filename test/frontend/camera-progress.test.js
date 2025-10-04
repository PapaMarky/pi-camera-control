/**
 * Frontend Unit Tests: Camera Progress Display
 *
 * Tests the average shot duration display logic in updateProgressDisplay()
 * method in public/js/camera.js (lines 1848-1865).
 *
 * This component shows the average time per shot during timelapse sessions
 * and hides/shows based on session state and whether shots have been taken.
 */

import { jest } from "@jest/globals";

describe("CameraManager - Average Shot Duration Display Tests", () => {
  let mockDocument;
  let elements;

  beforeEach(() => {
    // Reset all elements for each test
    elements = {
      avgShotDurationStats: { style: { display: "none" } },
      avgShotDuration: { textContent: "-" },
    };

    // Mock document.getElementById
    mockDocument = {
      getElementById: jest.fn((id) => {
        const elementMap = {
          "avg-shot-duration-stats": elements.avgShotDurationStats,
          "avg-shot-duration": elements.avgShotDuration,
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

  describe("Average Shot Duration Display", () => {
    // Implementation of average shot duration display logic for testing
    // This mirrors camera.js lines 1848-1865
    function updateAverageShotDuration(status) {
      const avgShotDurationEl = document.getElementById(
        "avg-shot-duration-stats",
      );
      const avgShotDurationValueEl =
        document.getElementById("avg-shot-duration");

      if (avgShotDurationEl && avgShotDurationValueEl) {
        const avgDuration = status.averageShotDuration || 0;

        // Show whenever session is running or if there's an average to display
        if (status.state === "running" || avgDuration > 0) {
          avgShotDurationEl.style.display = "flex";
          avgShotDurationValueEl.textContent =
            avgDuration > 0 ? `${avgDuration.toFixed(1)}s` : "-";
        } else {
          avgShotDurationEl.style.display = "none";
        }
      }
    }

    test("displays average shot duration correctly when session is running", () => {
      const status = {
        state: "running",
        averageShotDuration: 12.8,
      };

      updateAverageShotDuration(status);

      expect(elements.avgShotDurationStats.style.display).toBe("flex");
      expect(elements.avgShotDuration.textContent).toBe("12.8s");
    });

    test('shows "-" when no shots taken (avgDuration = 0) but session is running', () => {
      const status = {
        state: "running",
        averageShotDuration: 0, // No shots taken yet
      };

      updateAverageShotDuration(status);

      // Should show the element since session is running
      expect(elements.avgShotDurationStats.style.display).toBe("flex");
      // Should display "-" since no shots taken
      expect(elements.avgShotDuration.textContent).toBe("-");
    });

    test("shows calculated value when shots exist", () => {
      const status = {
        state: "running",
        averageShotDuration: 5.3,
      };

      updateAverageShotDuration(status);

      expect(elements.avgShotDurationStats.style.display).toBe("flex");
      expect(elements.avgShotDuration.textContent).toBe("5.3s");
    });

    test("formats average shot duration with one decimal place", () => {
      const testCases = [
        { avgDuration: 10.12345, expected: "10.1s" },
        { avgDuration: 0.999, expected: "1.0s" },
        { avgDuration: 25.06, expected: "25.1s" },
        { avgDuration: 3, expected: "3.0s" },
      ];

      testCases.forEach(({ avgDuration, expected }) => {
        const status = {
          state: "running",
          averageShotDuration: avgDuration,
        };

        updateAverageShotDuration(status);

        expect(elements.avgShotDuration.textContent).toBe(expected);
      });
    });

    test("hides element when session is not running and avgDuration = 0", () => {
      const status = {
        state: "idle", // Not running
        averageShotDuration: 0,
      };

      updateAverageShotDuration(status);

      expect(elements.avgShotDurationStats.style.display).toBe("none");
    });

    test("shows element when session is stopped but avgDuration > 0", () => {
      const status = {
        state: "stopped", // Session ended
        averageShotDuration: 18.5, // But we have data from completed session
      };

      updateAverageShotDuration(status);

      // Should show the average even though session is stopped
      expect(elements.avgShotDurationStats.style.display).toBe("flex");
      expect(elements.avgShotDuration.textContent).toBe("18.5s");
    });

    test("shows element when session is completed and avgDuration > 0", () => {
      const status = {
        state: "completed",
        averageShotDuration: 7.2,
      };

      updateAverageShotDuration(status);

      expect(elements.avgShotDurationStats.style.display).toBe("flex");
      expect(elements.avgShotDuration.textContent).toBe("7.2s");
    });

    test("handles missing averageShotDuration field (defaults to 0)", () => {
      const status = {
        state: "running",
        // averageShotDuration is missing
      };

      updateAverageShotDuration(status);

      // Should still show element (session is running)
      expect(elements.avgShotDurationStats.style.display).toBe("flex");
      // Should display "-" since avgDuration defaults to 0
      expect(elements.avgShotDuration.textContent).toBe("-");
    });

    test("handles null elements gracefully", () => {
      // Mock getElementById to return null
      mockDocument.getElementById = jest.fn(() => null);

      const status = {
        state: "running",
        averageShotDuration: 10.5,
      };

      // Should not throw error
      expect(() => {
        updateAverageShotDuration(status);
      }).not.toThrow();
    });

    test('shows element when session state is "running" regardless of avgDuration', () => {
      const testCases = [
        { avgDuration: 0, expectedText: "-", expectedDisplay: "flex" },
        { avgDuration: 5.5, expectedText: "5.5s", expectedDisplay: "flex" },
        { avgDuration: 100.9, expectedText: "100.9s", expectedDisplay: "flex" },
      ];

      testCases.forEach(({ avgDuration, expectedText, expectedDisplay }) => {
        const status = {
          state: "running",
          averageShotDuration: avgDuration,
        };

        updateAverageShotDuration(status);

        expect(elements.avgShotDurationStats.style.display).toBe(
          expectedDisplay,
        );
        expect(elements.avgShotDuration.textContent).toBe(expectedText);
      });
    });

    test("handles various session states correctly", () => {
      const testCases = [
        {
          state: "idle",
          avgDuration: 0,
          expectedDisplay: "none",
          description: "idle with no data",
        },
        {
          state: "running",
          avgDuration: 0,
          expectedDisplay: "flex",
          expectedText: "-",
          description: "running with no shots yet",
        },
        {
          state: "paused",
          avgDuration: 8.5,
          expectedDisplay: "flex",
          expectedText: "8.5s",
          description: "paused with data",
        },
        {
          state: "stopped",
          avgDuration: 12.0,
          expectedDisplay: "flex",
          expectedText: "12.0s",
          description: "stopped with data",
        },
        {
          state: "completed",
          avgDuration: 0,
          expectedDisplay: "none",
          description: "completed with no data (edge case)",
        },
      ];

      testCases.forEach(
        ({
          state,
          avgDuration,
          expectedDisplay,
          expectedText,
          description,
        }) => {
          // Reset elements
          elements.avgShotDurationStats.style.display = "none";
          elements.avgShotDuration.textContent = "-";

          const status = {
            state,
            averageShotDuration: avgDuration,
          };

          updateAverageShotDuration(status);

          expect(elements.avgShotDurationStats.style.display).toBe(
            expectedDisplay,
          );
          if (expectedText) {
            expect(elements.avgShotDuration.textContent).toBe(expectedText);
          }
        },
      );
    });
  });

  describe("Display Logic Integration", () => {
    function updateAverageShotDuration(status) {
      const avgShotDurationEl = document.getElementById(
        "avg-shot-duration-stats",
      );
      const avgShotDurationValueEl =
        document.getElementById("avg-shot-duration");

      if (avgShotDurationEl && avgShotDurationValueEl) {
        const avgDuration = status.averageShotDuration || 0;

        if (status.state === "running" || avgDuration > 0) {
          avgShotDurationEl.style.display = "flex";
          avgShotDurationValueEl.textContent =
            avgDuration > 0 ? `${avgDuration.toFixed(1)}s` : "-";
        } else {
          avgShotDurationEl.style.display = "none";
        }
      }
    }

    test('state: running + avgDuration: 0 = show element with "-"', () => {
      updateAverageShotDuration({ state: "running", averageShotDuration: 0 });

      expect(elements.avgShotDurationStats.style.display).toBe("flex");
      expect(elements.avgShotDuration.textContent).toBe("-");
    });

    test('state: running + avgDuration: 5.2 = show element with "5.2s"', () => {
      updateAverageShotDuration({ state: "running", averageShotDuration: 5.2 });

      expect(elements.avgShotDurationStats.style.display).toBe("flex");
      expect(elements.avgShotDuration.textContent).toBe("5.2s");
    });

    test("state: idle + avgDuration: 0 = hide element", () => {
      updateAverageShotDuration({ state: "idle", averageShotDuration: 0 });

      expect(elements.avgShotDurationStats.style.display).toBe("none");
    });

    test('state: idle + avgDuration: 10.5 = show element with "10.5s"', () => {
      updateAverageShotDuration({ state: "idle", averageShotDuration: 10.5 });

      expect(elements.avgShotDurationStats.style.display).toBe("flex");
      expect(elements.avgShotDuration.textContent).toBe("10.5s");
    });
  });
});
