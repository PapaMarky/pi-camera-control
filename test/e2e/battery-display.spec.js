/**
 * Battery Display Visual Tests
 *
 * Tests battery level display in UI against CCAPI ver100 battery level values.
 * Validates correct mapping from CCAPI values to displayed percentages.
 *
 * CCAPI ver100 battery levels:
 * - "full" → 100%
 * - "high" → 75%
 * - "half" → 50%
 * - "quarter" → 25%
 * - "low" → 10%
 * - "unknown" → "Unknown"
 * - "charge" → "Charging"
 * - "chargestop" → "Charge Stopped"
 * - "chargecomp" → "Fully Charged"
 * - "none" → "No Battery"
 */

import { test, expect } from "@playwright/test";
import {
  captureAndExtractValues,
  captureScreenshot,
} from "./helpers/visual-helpers.js";

const TEST_URL = process.env.TEST_URL || "http://localhost:3000";

/**
 * Set battery level by directly calling UI update method
 */
async function setBatteryLevel(page, batteryLevel) {
  await page.evaluate((level) => {
    // Call updateCameraBatteryDisplay directly
    if (window.cameraManager) {
      const batteryData = {
        batterylist: [
          {
            position: "camera",
            name: "LP-E17",
            kind: "battery",
            level: level,
            quality: "good",
          },
        ],
      };
      window.cameraManager.updateCameraBatteryDisplay(batteryData);
    } else {
      console.error("window.cameraManager not available");
    }
  }, batteryLevel);

  // Wait for UI to update (uiStateManager might have async operations)
  await page.waitForTimeout(500);

  // Wait for battery element to not be "-"
  await page
    .waitForFunction(
      () => {
        const batteryEl = document.getElementById("camera-battery");
        return batteryEl && batteryEl.textContent.trim() !== "-";
      },
      { timeout: 5000 },
    )
    .catch(() => {
      // Timeout is OK - some tests might intentionally fail
      console.log('Battery display did not update from "-"');
    });
}

test.describe("Battery Display - CCAPI Standard Levels", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_URL);
    // Wait for WebSocket connection
    await page.waitForFunction(
      () =>
        window.wsManager &&
        window.wsManager.isConnected &&
        window.wsManager.isConnected(),
      { timeout: 10000 },
    );
  });

  test('should display "full" as 100%', async ({ page }) => {
    await setBatteryLevel(page, "full");

    const { screenshotPath, values } = await captureAndExtractValues(
      page,
      "battery-full",
      { battery: "#camera-battery" },
    );

    console.log(`Screenshot: ${screenshotPath}`);

    expect(values.battery.exists).toBe(true);
    expect(values.battery.visible).toBe(true);
    expect(values.battery.text).toContain("100%");
    expect(values.battery.text).not.toBe("-"); // Ensure not placeholder

    await captureScreenshot(page, "battery-full-verified");
  });

  test('should display "high" as 75%', async ({ page }) => {
    await setBatteryLevel(page, "high");

    const { screenshotPath, values } = await captureAndExtractValues(
      page,
      "battery-high",
      { battery: "#camera-battery" },
    );

    console.log(`Screenshot: ${screenshotPath}`);

    expect(values.battery.exists).toBe(true);
    expect(values.battery.visible).toBe(true);
    expect(values.battery.text).toContain("75%");

    await captureScreenshot(page, "battery-high-verified");
  });

  test('should display "half" as 50%', async ({ page }) => {
    await setBatteryLevel(page, "half");

    const { screenshotPath, values } = await captureAndExtractValues(
      page,
      "battery-half",
      { battery: "#camera-battery" },
    );

    console.log(`Screenshot: ${screenshotPath}`);

    expect(values.battery.exists).toBe(true);
    expect(values.battery.visible).toBe(true);
    expect(values.battery.text).toContain("50%");
    // Ensure it's not showing "medium" (old incorrect value)
    expect(values.battery.text).not.toContain("medium");

    await captureScreenshot(page, "battery-half-verified");
  });

  test('should display "quarter" as 25%', async ({ page }) => {
    await setBatteryLevel(page, "quarter");

    const { screenshotPath, values } = await captureAndExtractValues(
      page,
      "battery-quarter",
      { battery: "#camera-battery" },
    );

    console.log(`Screenshot: ${screenshotPath}`);

    expect(values.battery.exists).toBe(true);
    expect(values.battery.visible).toBe(true);
    expect(values.battery.text).toContain("25%");

    await captureScreenshot(page, "battery-quarter-verified");
  });

  test('should display "low" as 10%', async ({ page }) => {
    await setBatteryLevel(page, "low");

    const { screenshotPath, values } = await captureAndExtractValues(
      page,
      "battery-low",
      { battery: "#camera-battery" },
    );

    console.log(`Screenshot: ${screenshotPath}`);

    expect(values.battery.exists).toBe(true);
    expect(values.battery.visible).toBe(true);
    expect(values.battery.text).toContain("10%");

    await captureScreenshot(page, "battery-low-verified");
  });
});

test.describe("Battery Display - Charging States", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_URL);
    await page.waitForFunction(
      () =>
        window.wsManager &&
        window.wsManager.isConnected &&
        window.wsManager.isConnected(),
      { timeout: 10000 },
    );
  });

  test('should display "charge" as "Charging"', async ({ page }) => {
    await setBatteryLevel(page, "charge");

    const { screenshotPath, values } = await captureAndExtractValues(
      page,
      "battery-charging",
      { battery: "#camera-battery" },
    );

    console.log(`Screenshot: ${screenshotPath}`);

    expect(values.battery.exists).toBe(true);
    expect(values.battery.visible).toBe(true);
    expect(values.battery.text).toContain("Charging");

    await captureScreenshot(page, "battery-charging-verified");
  });

  test('should display "chargestop" as "Charge Stopped"', async ({ page }) => {
    await setBatteryLevel(page, "chargestop");

    const { screenshotPath, values } = await captureAndExtractValues(
      page,
      "battery-charge-stopped",
      { battery: "#camera-battery" },
    );

    console.log(`Screenshot: ${screenshotPath}`);

    expect(values.battery.exists).toBe(true);
    expect(values.battery.visible).toBe(true);
    expect(values.battery.text).toContain("Charge Stopped");

    await captureScreenshot(page, "battery-charge-stopped-verified");
  });

  test('should display "chargecomp" as "Fully Charged"', async ({ page }) => {
    await setBatteryLevel(page, "chargecomp");

    const { screenshotPath, values } = await captureAndExtractValues(
      page,
      "battery-fully-charged",
      { battery: "#camera-battery" },
    );

    console.log(`Screenshot: ${screenshotPath}`);

    expect(values.battery.exists).toBe(true);
    expect(values.battery.visible).toBe(true);
    expect(values.battery.text).toContain("Fully Charged");

    await captureScreenshot(page, "battery-fully-charged-verified");
  });
});

test.describe("Battery Display - Special States", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_URL);
    await page.waitForFunction(
      () =>
        window.wsManager &&
        window.wsManager.isConnected &&
        window.wsManager.isConnected(),
      { timeout: 10000 },
    );
  });

  test('should display "unknown" appropriately', async ({ page }) => {
    await setBatteryLevel(page, "unknown");

    const { screenshotPath, values } = await captureAndExtractValues(
      page,
      "battery-unknown",
      { battery: "#camera-battery" },
    );

    console.log(`Screenshot: ${screenshotPath}`);

    expect(values.battery.exists).toBe(true);
    expect(values.battery.visible).toBe(true);
    expect(values.battery.text).toContain("Unknown");

    await captureScreenshot(page, "battery-unknown-verified");
  });

  test('should display "none" as "No Battery"', async ({ page }) => {
    await setBatteryLevel(page, "none");

    const { screenshotPath, values } = await captureAndExtractValues(
      page,
      "battery-none",
      { battery: "#camera-battery" },
    );

    console.log(`Screenshot: ${screenshotPath}`);

    expect(values.battery.exists).toBe(true);
    expect(values.battery.visible).toBe(true);
    expect(values.battery.text).toContain("No Battery");

    await captureScreenshot(page, "battery-none-verified");
  });
});

test.describe("Battery Display - Numeric Values (Backward Compatibility)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_URL);
    await page.waitForFunction(
      () =>
        window.wsManager &&
        window.wsManager.isConnected &&
        window.wsManager.isConnected(),
      { timeout: 10000 },
    );
  });

  test('should handle numeric battery level "85"', async ({ page }) => {
    await setBatteryLevel(page, "85");

    const { screenshotPath, values } = await captureAndExtractValues(
      page,
      "battery-numeric-85",
      { battery: "#camera-battery" },
    );

    console.log(`Screenshot: ${screenshotPath}`);

    expect(values.battery.exists).toBe(true);
    expect(values.battery.visible).toBe(true);
    expect(values.battery.text).toContain("85%");

    await captureScreenshot(page, "battery-numeric-85-verified");
  });

  test('should handle numeric battery level "100"', async ({ page }) => {
    await setBatteryLevel(page, "100");

    const { screenshotPath, values } = await captureAndExtractValues(
      page,
      "battery-numeric-100",
      { battery: "#camera-battery" },
    );

    console.log(`Screenshot: ${screenshotPath}`);

    expect(values.battery.exists).toBe(true);
    expect(values.battery.visible).toBe(true);
    expect(values.battery.text).toContain("100%");

    await captureScreenshot(page, "battery-numeric-100-verified");
  });
});
