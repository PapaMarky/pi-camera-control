/**
 * Battery Display Smoke Tests
 *
 * Quick verification that CCAPI ver100 battery level mapping works correctly.
 * Tests key battery levels: half, quarter, low, and charging states.
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
    }
  }, batteryLevel);

  // Wait for UI update
  await page.waitForTimeout(500);
}

test.describe("Battery Display Smoke Tests", () => {
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
    // Give cameraManager time to initialize
    await page.waitForTimeout(500);
  });

  test('should display CCAPI "half" as 50%', async ({ page }) => {
    await setBatteryLevel(page, "half");

    const { screenshotPath, values } = await captureAndExtractValues(
      page,
      "battery-half-smoke",
      { battery: "#camera-battery" },
    );

    console.log(`Screenshot: ${screenshotPath}`);
    console.log(`Battery text: "${values.battery.text}"`);

    expect(values.battery.exists).toBe(true);
    expect(values.battery.visible).toBe(true);
    expect(values.battery.text).toContain("50%");
    expect(values.battery.text).not.toBe("-");

    await captureScreenshot(page, "battery-half-smoke-verified");
  });

  test('should display CCAPI "quarter" as 25%', async ({ page }) => {
    await setBatteryLevel(page, "quarter");

    const { screenshotPath, values } = await captureAndExtractValues(
      page,
      "battery-quarter-smoke",
      { battery: "#camera-battery" },
    );

    console.log(`Screenshot: ${screenshotPath}`);
    console.log(`Battery text: "${values.battery.text}"`);

    expect(values.battery.text).toContain("25%");
    expect(values.battery.text).not.toBe("-");
  });

  test('should display CCAPI "low" as 10%', async ({ page }) => {
    await setBatteryLevel(page, "low");

    const { screenshotPath, values } = await captureAndExtractValues(
      page,
      "battery-low-smoke",
      { battery: "#camera-battery" },
    );

    console.log(`Screenshot: ${screenshotPath}`);
    console.log(`Battery text: "${values.battery.text}"`);

    expect(values.battery.text).toContain("10%");
    expect(values.battery.text).not.toBe("-");
  });

  test('should display CCAPI "charge" as Charging', async ({ page }) => {
    await setBatteryLevel(page, "charge");

    const { screenshotPath, values } = await captureAndExtractValues(
      page,
      "battery-charging-smoke",
      { battery: "#camera-battery" },
    );

    console.log(`Screenshot: ${screenshotPath}`);
    console.log(`Battery text: "${values.battery.text}"`);

    expect(values.battery.text).toContain("Charging");
    expect(values.battery.text).not.toBe("-");
  });
});
