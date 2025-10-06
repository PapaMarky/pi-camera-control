/**
 * Visual E2E Tests for Stop Criteria Time Format
 *
 * These tests verify that time-based stop criteria displays in simplified format:
 * - No "Stop at" prefix
 * - No seconds (show "5:13 PM" instead of "5:13:00 PM")
 */

import { test, expect } from "@playwright/test";
import {
  captureScreenshot,
  captureAndExtractValues,
  waitForWebSocketAndVerify,
} from "./helpers/visual-helpers.js";

test.describe("Stop Criteria Time Format", () => {
  test("should display time-based stop criteria without 'Stop at' prefix and without seconds", async ({
    page,
  }) => {
    // Navigate to the application
    await page.goto("http://localhost:3000");

    // Wait for WebSocket connection
    const connected = await waitForWebSocketAndVerify(page);
    expect(connected).toBe(true);

    // Wait for initial page load
    await page.waitForLoadState("networkidle");

    // Show the intervalometer card directly
    await page.evaluate(() => {
      const cards = document.querySelectorAll(".function-card");
      cards.forEach((card) => (card.style.display = "none"));
      const intervalometerCard = document.getElementById("intervalometer-card");
      if (intervalometerCard) {
        intervalometerCard.style.display = "block";
      }
    });

    // Wait for the intervalometer card to be visible
    await page.waitForSelector("#intervalometer-card", { state: "visible" });

    // Simulate a running session with time-based stop criteria
    await page.evaluate(() => {
      // Show the progress section
      const setupSection = document.getElementById("intervalometer-setup");
      const progressSection = document.getElementById(
        "intervalometer-progress",
      );

      if (setupSection) setupSection.style.display = "none";
      if (progressSection) progressSection.style.display = "block";

      // Simulate intervalometer state with time-based stop
      // Create a test date: 5:13 PM (17:13:00)
      const stopTime = new Date();
      stopTime.setHours(17, 13, 0, 0);

      // Update the camera manager state
      if (window.cameraManager) {
        window.cameraManager.intervalometerState = {
          running: true,
          paused: false,
          stats: {
            shotsTaken: 10,
            shotsSuccessful: 10,
            startTime: new Date(Date.now() - 600000).toISOString(),
          },
          options: {
            interval: 30,
            stopCondition: "stop-at",
            stopTime: stopTime.toISOString(),
            totalShots: null,
          },
        };

        // Trigger the UI update by calling the method that formats stop criteria
        const stopCriteriaEl = document.getElementById("session-stop-criteria");
        if (stopCriteriaEl && window.cameraManager.formatStopCriteria) {
          stopCriteriaEl.textContent = window.cameraManager.formatStopCriteria(
            window.cameraManager.intervalometerState.options,
          );
        }
      }
    });

    // Wait for DOM to update
    await page.waitForTimeout(500);

    // Capture screenshot and extract values
    const { screenshotPath, values } = await captureAndExtractValues(
      page,
      "stop-criteria-time-format",
      {
        stopCriteria: "#session-stop-criteria",
        interval: "#session-interval",
        shotsTaken: "#shots-taken",
      },
    );

    console.log(`Screenshot captured: ${screenshotPath}`);
    console.log(`Stop Criteria Text: "${values.stopCriteria.text}"`);

    // Verify element exists and is visible
    expect(values.stopCriteria.exists).toBe(true);
    expect(values.stopCriteria.visible).toBe(true);

    // CRITICAL: Verify the format is simplified
    const stopCriteriaText = values.stopCriteria.text;

    // Should NOT contain "Stop at" prefix
    expect(stopCriteriaText).not.toContain("Stop at");

    // Should NOT contain seconds (format should not have three colon-separated parts like 5:13:00)
    expect(stopCriteriaText).not.toMatch(/\d{1,2}:\d{2}:\d{2}/);

    // Should match the pattern for time without seconds: "5:13 PM" or "5:13 AM"
    expect(stopCriteriaText).toMatch(/^\d{1,2}:\d{2}\s*(AM|PM)$/i);

    // Specific test: Should be exactly "5:13 PM" (no seconds, no prefix)
    expect(stopCriteriaText).toBe("5:13 PM");

    // Capture final verification screenshot
    await captureScreenshot(page, "stop-criteria-time-verified");
  });

  test("should display photo count criteria unchanged (with 'shots' suffix)", async ({
    page,
  }) => {
    // Navigate to the application
    await page.goto("http://localhost:3000");

    // Wait for WebSocket connection
    const connected = await waitForWebSocketAndVerify(page);
    expect(connected).toBe(true);

    // Wait for initial page load
    await page.waitForLoadState("networkidle");

    // Show the intervalometer card and set up the progress section
    await page.evaluate(() => {
      // Hide all cards
      const cards = document.querySelectorAll(".function-card");
      cards.forEach((card) => (card.style.display = "none"));

      // Show intervalometer card
      const intervalometerCard = document.getElementById("intervalometer-card");
      if (intervalometerCard) {
        intervalometerCard.style.display = "block";
      }

      // Show progress section
      const setupSection = document.getElementById("intervalometer-setup");
      const progressSection = document.getElementById(
        "intervalometer-progress",
      );

      if (setupSection) setupSection.style.display = "none";
      if (progressSection) progressSection.style.display = "block";

      // Update state with photo count stop condition
      if (window.cameraManager) {
        window.cameraManager.intervalometerState = {
          running: true,
          paused: false,
          stats: {
            shotsTaken: 10,
            shotsSuccessful: 10,
            startTime: new Date(Date.now() - 600000).toISOString(),
          },
          options: {
            interval: 30,
            stopCondition: "stop-after",
            stopTime: null,
            totalShots: 100,
          },
        };

        const stopCriteriaEl = document.getElementById("session-stop-criteria");
        if (stopCriteriaEl && window.cameraManager.formatStopCriteria) {
          stopCriteriaEl.textContent = window.cameraManager.formatStopCriteria(
            window.cameraManager.intervalometerState.options,
          );
        }
      }
    });

    // Wait for progress section to be visible
    await page.waitForSelector("#intervalometer-progress", {
      state: "visible",
    });

    await page.waitForTimeout(500);

    // Capture screenshot and extract values
    const { screenshotPath, values } = await captureAndExtractValues(
      page,
      "stop-criteria-count-format",
      {
        stopCriteria: "#session-stop-criteria",
      },
    );

    console.log(`Screenshot captured: ${screenshotPath}`);
    console.log(`Stop Criteria Text: "${values.stopCriteria.text}"`);

    // Verify photo count format is unchanged
    expect(values.stopCriteria.exists).toBe(true);
    expect(values.stopCriteria.visible).toBe(true);

    // Should display as "100 shots" (count + "shots")
    expect(values.stopCriteria.text).toBe("100 shots");

    await captureScreenshot(page, "stop-criteria-count-verified");
  });

  test("should display unlimited criteria unchanged", async ({ page }) => {
    // Navigate to the application
    await page.goto("http://localhost:3000");

    // Wait for WebSocket connection
    const connected = await waitForWebSocketAndVerify(page);
    expect(connected).toBe(true);

    // Wait for initial page load
    await page.waitForLoadState("networkidle");

    // Show the intervalometer card and set up the progress section
    await page.evaluate(() => {
      // Hide all cards
      const cards = document.querySelectorAll(".function-card");
      cards.forEach((card) => (card.style.display = "none"));

      // Show intervalometer card
      const intervalometerCard = document.getElementById("intervalometer-card");
      if (intervalometerCard) {
        intervalometerCard.style.display = "block";
      }

      // Show progress section
      const setupSection = document.getElementById("intervalometer-setup");
      const progressSection = document.getElementById(
        "intervalometer-progress",
      );

      if (setupSection) setupSection.style.display = "none";
      if (progressSection) progressSection.style.display = "block";

      // Update state with unlimited stop condition
      if (window.cameraManager) {
        window.cameraManager.intervalometerState = {
          running: true,
          paused: false,
          stats: {
            shotsTaken: 10,
            shotsSuccessful: 10,
            startTime: new Date(Date.now() - 600000).toISOString(),
          },
          options: {
            interval: 30,
            stopCondition: "unlimited",
            stopTime: null,
            totalShots: null,
          },
        };

        const stopCriteriaEl = document.getElementById("session-stop-criteria");
        if (stopCriteriaEl && window.cameraManager.formatStopCriteria) {
          stopCriteriaEl.textContent = window.cameraManager.formatStopCriteria(
            window.cameraManager.intervalometerState.options,
          );
        }
      }
    });

    // Wait for progress section to be visible
    await page.waitForSelector("#intervalometer-progress", {
      state: "visible",
    });

    await page.waitForTimeout(500);

    // Capture screenshot and extract values
    const { screenshotPath, values } = await captureAndExtractValues(
      page,
      "stop-criteria-unlimited-format",
      {
        stopCriteria: "#session-stop-criteria",
      },
    );

    console.log(`Screenshot captured: ${screenshotPath}`);
    console.log(`Stop Criteria Text: "${values.stopCriteria.text}"`);

    // Verify unlimited format is unchanged
    expect(values.stopCriteria.exists).toBe(true);
    expect(values.stopCriteria.visible).toBe(true);
    expect(values.stopCriteria.text).toBe("Unlimited (manual stop)");

    await captureScreenshot(page, "stop-criteria-unlimited-verified");
  });
});
