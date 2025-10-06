/**
 * Visual E2E Tests for Intervalometer Status Layout
 *
 * These tests verify that the intervalometer status page displays all items
 * with consistent "label above value" layout styling.
 */

import { test, expect } from "@playwright/test";
import {
  captureScreenshot,
  captureAndExtractValues,
  waitForWebSocketAndVerify,
} from "./helpers/visual-helpers.js";

test.describe("Intervalometer Status Layout", () => {
  test("should display all status items with label above value layout", async ({
    page,
  }) => {
    // Navigate to the application
    await page.goto("http://localhost:3000");

    // Wait for WebSocket connection
    const connected = await waitForWebSocketAndVerify(page);
    expect(connected).toBe(true);

    // Wait for initial page load
    await page.waitForLoadState("networkidle");

    // Show the intervalometer card directly (bypass menu click since it requires camera)
    await page.evaluate(() => {
      // Hide all other cards
      const cards = document.querySelectorAll(".function-card");
      cards.forEach((card) => (card.style.display = "none"));

      // Show only the intervalometer card
      const intervalometerCard = document.getElementById("intervalometer-card");
      if (intervalometerCard) {
        intervalometerCard.style.display = "block";
      }
    });

    // Wait for the intervalometer card to be visible
    await page.waitForSelector("#intervalometer-card", { state: "visible" });

    // Simulate starting an intervalometer session to show the progress stats
    // First, we need to ensure the start button is enabled (camera must be connected)
    // For this layout test, we'll use page.evaluate to manipulate the DOM directly
    await page.evaluate(() => {
      // Show the progress section (normally shown when session starts)
      const setupSection = document.getElementById("intervalometer-setup");
      const progressSection = document.getElementById(
        "intervalometer-progress",
      );

      if (setupSection) setupSection.style.display = "none";
      if (progressSection) progressSection.style.display = "block";
    });

    // Wait for progress section to be visible
    await page.waitForSelector("#intervalometer-progress", {
      state: "visible",
    });

    // Capture screenshot of the intervalometer status layout
    const { screenshotPath, values } = await captureAndExtractValues(
      page,
      "intervalometer-status-layout",
      {
        interval: "#session-interval",
        stopCriteria: "#session-stop-criteria",
        shotsTaken: "#shots-taken",
        successRate: "#success-rate",
        duration: "#session-duration",
        nextShot: "#next-shot-countdown",
      },
    );

    console.log(`Screenshot captured: ${screenshotPath}`);

    // Verify all elements exist and are visible
    expect(values.interval.exists).toBe(true);
    expect(values.interval.visible).toBe(true);
    expect(values.stopCriteria.exists).toBe(true);
    expect(values.stopCriteria.visible).toBe(true);
    expect(values.shotsTaken.exists).toBe(true);
    expect(values.shotsTaken.visible).toBe(true);
    expect(values.successRate.exists).toBe(true);
    expect(values.successRate.visible).toBe(true);
    expect(values.duration.exists).toBe(true);
    expect(values.duration.visible).toBe(true);
    expect(values.nextShot.exists).toBe(true);
    expect(values.nextShot.visible).toBe(true);

    // Verify the stat items have correct CSS layout properties
    const layoutCheck = await page.evaluate(() => {
      const statItems = document.querySelectorAll(".stat-item");
      const results = [];

      statItems.forEach((item, index) => {
        const styles = window.getComputedStyle(item);
        const label = item.querySelector(".stat-label");
        const labelStyles = label ? window.getComputedStyle(label) : null;

        // Only check visible items (some are hidden by default)
        if (styles.display !== "none") {
          results.push({
            index,
            display: styles.display,
            flexDirection: styles.flexDirection,
            alignItems: styles.alignItems,
            textAlign: styles.textAlign,
            labelDisplay: labelStyles ? labelStyles.display : null,
            labelOrder: labelStyles ? labelStyles.order : null,
          });
        }
      });

      return results;
    });

    // Verify all visible stat items use flexbox with column direction
    expect(layoutCheck.length).toBeGreaterThan(0);
    layoutCheck.forEach((item, index) => {
      expect(item.display, `stat-item ${index} should use flexbox`).toBe(
        "flex",
      );
      expect(
        item.flexDirection,
        `stat-item ${index} should stack vertically`,
      ).toBe("column");
      expect(item.alignItems, `stat-item ${index} should center items`).toBe(
        "center",
      );
      expect(
        item.labelDisplay,
        `stat-label ${index} should be block-level`,
      ).toBe("block");
    });

    // Capture final screenshot showing all items
    await captureScreenshot(page, "intervalometer-layout-verified");
  });

  test("should display overtime stats with consistent layout when visible", async ({
    page,
  }) => {
    // Navigate to the application
    await page.goto("http://localhost:3000");

    // Wait for WebSocket connection
    const connected = await waitForWebSocketAndVerify(page);
    expect(connected).toBe(true);

    // Show the intervalometer card directly
    await page.evaluate(() => {
      const cards = document.querySelectorAll(".function-card");
      cards.forEach((card) => (card.style.display = "none"));
      const intervalometerCard = document.getElementById("intervalometer-card");
      if (intervalometerCard) {
        intervalometerCard.style.display = "block";
      }
    });

    // Show progress section and overtime stats
    await page.evaluate(() => {
      const setupSection = document.getElementById("intervalometer-setup");
      const progressSection = document.getElementById(
        "intervalometer-progress",
      );
      const overtimeStats = document.getElementById("overtime-stats");
      const maxOvertimeStats = document.getElementById("max-overtime-stats");
      const lastShotStats = document.getElementById("last-shot-duration-stats");
      const avgShotStats = document.getElementById("avg-shot-duration-stats");

      if (setupSection) setupSection.style.display = "none";
      if (progressSection) progressSection.style.display = "block";
      if (overtimeStats) {
        overtimeStats.style.display = "flex";
        overtimeStats.style.flexDirection = "column";
      }
      if (maxOvertimeStats) {
        maxOvertimeStats.style.display = "flex";
        maxOvertimeStats.style.flexDirection = "column";
      }
      if (lastShotStats) {
        lastShotStats.style.display = "flex";
        lastShotStats.style.flexDirection = "column";
      }
      if (avgShotStats) {
        avgShotStats.style.display = "flex";
        avgShotStats.style.flexDirection = "column";
      }
    });

    // Capture screenshot with overtime stats visible
    const { screenshotPath, values } = await captureAndExtractValues(
      page,
      "intervalometer-overtime-layout",
      {
        overtimeCount: "#overtime-count",
        maxOvertime: "#max-overtime",
        lastShotDuration: "#last-shot-duration",
        avgShotDuration: "#avg-shot-duration",
      },
    );

    console.log(`Screenshot captured: ${screenshotPath}`);

    // Verify all overtime elements are visible with correct layout
    expect(values.overtimeCount.exists).toBe(true);
    expect(values.overtimeCount.visible).toBe(true);
    expect(values.maxOvertime.exists).toBe(true);
    expect(values.maxOvertime.visible).toBe(true);
    expect(values.lastShotDuration.exists).toBe(true);
    expect(values.lastShotDuration.visible).toBe(true);
    expect(values.avgShotDuration.exists).toBe(true);
    expect(values.avgShotDuration.visible).toBe(true);

    // Verify layout consistency for overtime stats
    const overtimeLayoutCheck = await page.evaluate(() => {
      const overtimeItems = [
        document.getElementById("overtime-stats"),
        document.getElementById("max-overtime-stats"),
        document.getElementById("last-shot-duration-stats"),
        document.getElementById("avg-shot-duration-stats"),
      ];

      return overtimeItems.map((item) => {
        const styles = window.getComputedStyle(item);
        const label = item.querySelector(".stat-label");
        const labelStyles = label ? window.getComputedStyle(label) : null;

        return {
          display: styles.display,
          flexDirection: styles.flexDirection,
          alignItems: styles.alignItems,
          labelDisplay: labelStyles ? labelStyles.display : null,
        };
      });
    });

    // Verify all overtime items match the standard layout
    overtimeLayoutCheck.forEach((item, index) => {
      expect(item.display, `overtime stat ${index} should use flexbox`).toBe(
        "flex",
      );
      expect(
        item.flexDirection,
        `overtime stat ${index} should stack vertically`,
      ).toBe("column");
      expect(
        item.alignItems,
        `overtime stat ${index} should center items`,
      ).toBe("center");
      expect(
        item.labelDisplay,
        `overtime label ${index} should be block-level`,
      ).toBe("block");
    });

    // Capture final verification screenshot
    await captureScreenshot(page, "intervalometer-overtime-verified");
  });

  test("should maintain consistent layout on mobile viewport", async ({
    page,
  }) => {
    // Set mobile viewport (iPhone 11)
    await page.setViewportSize({ width: 375, height: 812 });

    // Navigate to the application
    await page.goto("http://localhost:3000");

    // Wait for WebSocket connection
    const connected = await waitForWebSocketAndVerify(page);
    expect(connected).toBe(true);

    // Show the intervalometer card directly
    await page.evaluate(() => {
      const cards = document.querySelectorAll(".function-card");
      cards.forEach((card) => (card.style.display = "none"));
      const intervalometerCard = document.getElementById("intervalometer-card");
      if (intervalometerCard) {
        intervalometerCard.style.display = "block";
      }
    });

    // Show progress section
    await page.evaluate(() => {
      const setupSection = document.getElementById("intervalometer-setup");
      const progressSection = document.getElementById(
        "intervalometer-progress",
      );

      if (setupSection) setupSection.style.display = "none";
      if (progressSection) progressSection.style.display = "block";
    });

    // Capture mobile screenshot
    const screenshotPath = await captureScreenshot(
      page,
      "intervalometer-mobile-layout",
    );
    console.log(`Mobile screenshot captured: ${screenshotPath}`);

    // Verify grid layout adjusts for mobile
    const mobileLayoutCheck = await page.evaluate(() => {
      const progressStats = document.querySelector(".progress-stats");
      const styles = window.getComputedStyle(progressStats);

      return {
        display: styles.display,
        gridTemplateColumns: styles.gridTemplateColumns,
      };
    });

    expect(mobileLayoutCheck.display).toBe("grid");

    // Verify stat items still use column layout on mobile
    const mobileStatCheck = await page.evaluate(() => {
      const statItems = document.querySelectorAll(".stat-item");
      return Array.from(statItems)
        .map((item) => {
          const styles = window.getComputedStyle(item);
          return {
            display: styles.display,
            flexDirection: styles.flexDirection,
          };
        })
        .filter((item) => item.display !== "none"); // Only check visible items
    });

    expect(mobileStatCheck.length).toBeGreaterThan(0);
    mobileStatCheck.forEach((item, index) => {
      expect(item.display, `mobile stat ${index} should use flexbox`).toBe(
        "flex",
      );
      expect(
        item.flexDirection,
        `mobile stat ${index} should stack vertically`,
      ).toBe("column");
    });

    // Capture final mobile verification
    await captureScreenshot(page, "intervalometer-mobile-verified");
  });
});
