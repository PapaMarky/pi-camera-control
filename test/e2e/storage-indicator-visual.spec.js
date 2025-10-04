/**
 * Storage Indicator Visual E2E Tests
 *
 * These tests verify that the storage indicator in the header displays
 * actual SD card storage information from the camera, not hardcoded values.
 *
 * Requirements:
 * - Storage indicator should show available space when camera connected
 * - Should show actual values, not "-" or "8GB" placeholder
 * - Should update when storage data changes
 */

import { test, expect } from "@playwright/test";
import {
  captureScreenshot,
  captureAndExtractValues,
  waitForWebSocketAndVerify,
} from "./helpers/visual-helpers.js";

test.describe("Storage Indicator Display", () => {
  test("should display actual storage data when camera is connected", async ({
    page,
  }) => {
    // Navigate to the app
    await page.goto("http://localhost:3000");

    // Wait for WebSocket connection
    await waitForWebSocketAndVerify(page);

    // Wait for status updates (camera should be connected)
    await page.waitForTimeout(2000);

    // Capture screenshot and extract storage indicator value
    const { screenshotPath, values } = await captureAndExtractValues(
      page,
      "storage-indicator-connected",
      {
        storageText: "#storage-level-header",
        cameraStatus: "#camera-status",
      },
    );

    console.log(`Screenshot: ${screenshotPath}`);
    console.log("Storage indicator text:", values.storageText.text);
    console.log("Camera status:", values.cameraStatus.text);

    // Verify storage indicator exists and is visible
    expect(values.storageText.exists).toBe(true);
    expect(values.storageText.visible).toBe(true);

    // CRITICAL: Storage should NOT be the placeholder values
    expect(values.storageText.text).not.toBe("-");
    expect(values.storageText.text).not.toBe("8GB");

    // Storage should show actual data (valid format)
    const validPatterns = [
      /^\d+G$/i, // e.g., "476G"
      /^No SD$/i, // No SD card
    ];

    const matchesPattern = validPatterns.some((pattern) =>
      pattern.test(values.storageText.text),
    );

    expect(matchesPattern).toBe(true);

    // Log what we actually got for debugging
    if (!matchesPattern) {
      console.error(
        "Storage text does not match expected patterns:",
        values.storageText.text,
      );
    }

    // Capture final state
    await captureScreenshot(page, "storage-indicator-final");
  });

  test.skip('should show "No SD" when no SD card is mounted', async ({
    page,
  }) => {
    // This test requires mocking the camera to return no SD card
    // Skipped until we have camera mocking infrastructure
    await page.goto("http://localhost:3000");
    await waitForWebSocketAndVerify(page);
    await page.waitForTimeout(2000);

    const { screenshotPath, values } = await captureAndExtractValues(
      page,
      "storage-no-sd-card",
      {
        storageText: "#storage-level-header",
      },
    );

    console.log(`Screenshot: ${screenshotPath}`);
    console.log("Storage text:", values.storageText.text);

    // Storage should be either a valid G value or "No SD"
    const isValid =
      /^\d+G$/i.test(values.storageText.text) ||
      values.storageText.text === "No SD";

    expect(isValid).toBe(true);
  });

  test.skip("storage indicator should not show placeholder after connection", async ({
    page,
  }) => {
    // This test is redundant with test 1 which already verifies storage shows actual data
    // Skipped to reduce test execution time
    await page.goto("http://localhost:3000");

    // Capture initial state
    await captureScreenshot(page, "storage-before-connection");

    // Wait for WebSocket connection and status updates
    await waitForWebSocketAndVerify(page);
    await page.waitForTimeout(3000); // Give time for status updates

    // Capture after connection
    const { screenshotPath, values } = await captureAndExtractValues(
      page,
      "storage-after-connection",
      {
        storageText: "#storage-level-header",
        cameraIp: "#camera-ip",
      },
    );

    console.log(`Screenshot: ${screenshotPath}`);
    console.log("Storage text after connection:", values.storageText.text);
    console.log("Camera IP:", values.cameraIp.text);

    // After connection, storage should not be "-"
    expect(values.storageText.text).not.toBe("-");

    // Should show actual data
    const showsActualData =
      /^\d+G$/i.test(values.storageText.text) ||
      values.storageText.text === "No SD";

    expect(showsActualData).toBe(true);
  });

  test("storage value format should be consistent", async ({ page }) => {
    await page.goto("http://localhost:3000");
    await waitForWebSocketAndVerify(page);
    await page.waitForTimeout(2000);

    const storageElement = await page.locator("#storage-level-header");
    const storageText = await storageElement.textContent();

    console.log("Storage format test - value:", storageText);

    // Verify format is one of the expected formats
    const expectedFormats = [
      /^\d+G$/i, // "476G"
      /^No SD$/i, // "No SD"
    ];

    const matchesFormat = expectedFormats.some((format) =>
      format.test(storageText),
    );

    expect(matchesFormat).toBe(true);

    // Capture for visual verification
    await captureScreenshot(page, "storage-format-verification");
  });
});
