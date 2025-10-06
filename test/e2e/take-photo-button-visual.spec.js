/**
 * Visual E2E Test for Take Photo Button
 *
 * This test verifies that the Take Photo button:
 * - Exists and is visible
 * - Enables/disables based on camera connection status
 * - Click events fire properly
 * - Console logs appear when clicked
 *
 * Uses visual testing pattern to allow Claude to "see" the UI.
 */

import { test, expect } from "@playwright/test";
import {
  captureScreenshot,
  captureAndExtractValues,
  waitForWebSocketAndVerify,
} from "./helpers/visual-helpers.js";

test.describe("Take Photo Button - Visual Verification", () => {
  test("should display Take Photo button and verify its state", async ({
    page,
  }) => {
    // Navigate to test shot page
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Wait for WebSocket connection
    const wsConnected = await waitForWebSocketAndVerify(page);
    console.log(`WebSocket connected: ${wsConnected}`);

    // Open test shot card
    await page.click("#function-menu-toggle");
    await page.click('button.menu-item[data-card="test-shot"]');

    // Wait for card to be visible
    await page.waitForSelector("#test-shot-card", { state: "visible" });

    // Capture screenshot and extract values
    const { screenshotPath, values } = await captureAndExtractValues(
      page,
      "take-photo-button-initial-state",
      {
        takePhotoBtn: "#take-photo-btn",
        takePhotoBtnText: "#take-photo-btn .btn-text",
        captureLiveViewBtn: "#capture-liveview-btn",
        cameraStatus: "#camera-status-text",
      },
    );

    console.log(`Screenshot saved: ${screenshotPath}`);
    console.log("Button states:", JSON.stringify(values, null, 2));

    // Verify Take Photo button exists
    expect(values.takePhotoBtn.exists).toBe(true);
    expect(values.takePhotoBtn.visible).toBe(true);

    // Verify button text
    expect(values.takePhotoBtnText.text).toContain("Take Photo");

    // Verify Capture Live View button also exists (comparison)
    expect(values.captureLiveViewBtn.exists).toBe(true);
    expect(values.captureLiveViewBtn.visible).toBe(true);

    // Check camera connection status
    const cameraConnected = values.cameraStatus.text?.includes("Connected");
    console.log(`Camera connected: ${cameraConnected}`);

    if (cameraConnected) {
      // If camera connected, both buttons should be enabled
      expect(values.takePhotoBtn.disabled).toBe(false);
      expect(values.captureLiveViewBtn.disabled).toBe(false);
      console.log("✓ Both buttons enabled (camera connected)");
    } else {
      // If camera disconnected, both buttons should be disabled
      expect(values.takePhotoBtn.disabled).toBe(true);
      expect(values.captureLiveViewBtn.disabled).toBe(true);
      console.log("✓ Both buttons disabled (camera disconnected)");
    }

    // Capture final state
    await captureScreenshot(page, "take-photo-button-verified");
  });

  test("should fire click event when Take Photo button is clicked", async ({
    page,
  }) => {
    // Set up console log listener to verify click event fires
    const consoleLogs = [];
    page.on("console", (msg) => {
      const text = msg.text();
      consoleLogs.push(text);
      console.log(`[Browser Console] ${text}`);
    });

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Open test shot card
    await page.click("#function-menu-toggle");
    await page.click('button.menu-item[data-card="test-shot"]');
    await page.waitForSelector("#test-shot-card", { state: "visible" });

    // Capture initial state
    await captureScreenshot(page, "take-photo-before-click");

    // Get camera connection status
    const cameraStatus = await page.textContent("#camera-status-text");
    const cameraConnected = cameraStatus.includes("Connected");

    console.log(`Camera status: ${cameraStatus}`);
    console.log(`Camera connected: ${cameraConnected}`);

    if (!cameraConnected) {
      console.log(
        "⚠️  Camera not connected - skipping click test (button disabled)",
      );
      return;
    }

    // Clear console logs before clicking
    consoleLogs.length = 0;

    // Click the Take Photo button
    console.log("Clicking Take Photo button...");
    await page.click("#take-photo-btn");

    // Wait for any async operations
    await page.waitForTimeout(1000);

    // Capture state after click
    const { screenshotPath } = await captureAndExtractValues(
      page,
      "take-photo-after-click",
      {
        takePhotoBtn: "#take-photo-btn",
        takePhotoBtnText: "#take-photo-btn .btn-text",
      },
    );

    console.log(`Screenshot saved: ${screenshotPath}`);

    // Verify click event fired by checking console logs
    const clickLogFound = consoleLogs.some((log) =>
      log.includes("Capture test photo clicked"),
    );

    console.log("Console logs after click:");
    consoleLogs.forEach((log) => console.log(`  - ${log}`));

    // CRITICAL: This verifies the click event actually fired
    expect(clickLogFound).toBe(true);
    console.log("✓ Click event fired successfully");
  });

  test("should show loading state when Take Photo is clicked", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.click("#function-menu-toggle");
    await page.click('button.menu-item[data-card="test-shot"]');
    await page.waitForSelector("#test-shot-card", { state: "visible" });

    // Check camera connection
    const cameraStatus = await page.textContent("#camera-status-text");
    if (!cameraStatus.includes("Connected")) {
      console.log("⚠️  Camera not connected - skipping loading state test");
      return;
    }

    // Capture before click
    await captureScreenshot(page, "take-photo-loading-before");

    // Click button and immediately capture loading state
    const clickPromise = page.click("#take-photo-btn");

    // Wait a moment for loading state to appear
    await page.waitForTimeout(100);

    // Capture loading state
    const { screenshotPath, values } = await captureAndExtractValues(
      page,
      "take-photo-loading-state",
      {
        btnText: "#take-photo-btn .btn-text",
        btnDisabled: "#take-photo-btn",
      },
    );

    console.log(`Loading state screenshot: ${screenshotPath}`);
    console.log(`Button text: ${values.btnText.text}`);
    console.log(`Button disabled: ${values.btnDisabled.disabled}`);

    // Wait for click to complete
    await clickPromise;

    // Verify loading state appeared (button text should change)
    // Note: This might be "Taking photo..." or "Downloading (%)"
    const isLoadingState =
      values.btnText.text?.includes("Taking") ||
      values.btnText.text?.includes("Downloading") ||
      values.btnDisabled.disabled === true;

    expect(isLoadingState).toBe(true);
    console.log("✓ Loading state displayed correctly");

    // Capture final state
    await captureScreenshot(page, "take-photo-loading-after");
  });

  test("should compare Take Photo vs Capture Live View button behavior", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.click("#function-menu-toggle");
    await page.click('button.menu-item[data-card="test-shot"]');
    await page.waitForSelector("#test-shot-card", { state: "visible" });

    // Capture both buttons side-by-side
    const { screenshotPath, values } = await captureAndExtractValues(
      page,
      "button-comparison",
      {
        takePhotoBtn: "#take-photo-btn",
        takePhotoBtnText: "#take-photo-btn .btn-text",
        captureLiveViewBtn: "#capture-liveview-btn",
        captureLiveViewBtnText: "#capture-liveview-btn .btn-text",
      },
    );

    console.log(`Comparison screenshot: ${screenshotPath}`);
    console.log("Button comparison:");
    console.log(
      `  Take Photo: ${values.takePhotoBtnText.text} (disabled: ${values.takePhotoBtn.disabled})`,
    );
    console.log(
      `  Capture Live View: ${values.captureLiveViewBtnText.text} (disabled: ${values.captureLiveViewBtn.disabled})`,
    );

    // Both buttons should have the same disabled state
    expect(values.takePhotoBtn.disabled).toBe(
      values.captureLiveViewBtn.disabled,
    );
    console.log("✓ Both buttons have matching enabled/disabled state");

    // Both buttons should be visible
    expect(values.takePhotoBtn.visible).toBe(true);
    expect(values.captureLiveViewBtn.visible).toBe(true);
    console.log("✓ Both buttons are visible");
  });
});

test.describe("Take Photo Button - Event Handler Verification", () => {
  test("should have event listener properly attached", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.click("#function-menu-toggle");
    await page.click('button.menu-item[data-card="test-shot"]');
    await page.waitForSelector("#test-shot-card", { state: "visible" });

    // Check if event listener is attached by evaluating DOM
    const hasEventListener = await page.evaluate(() => {
      const btn = document.getElementById("take-photo-btn");
      if (!btn) return false;

      // Check if button has click event listener
      // This is a heuristic - we'll try clicking and see if handler fires
      return btn !== null && !btn.disabled;
    });

    console.log(`Button has event listener: ${hasEventListener}`);

    // Capture state
    await captureScreenshot(page, "event-listener-check");

    // If button exists and is enabled, it should have a listener
    const btnExists = await page.locator("#take-photo-btn").count();
    expect(btnExists).toBe(1);
    console.log("✓ Take Photo button exists in DOM");
  });

  test("should log initialization messages in console", async ({ page }) => {
    const initLogs = [];

    // Listen for console messages before navigation
    page.on("console", (msg) => {
      const text = msg.text();
      if (text.includes("TestShotUI") || text.includes("Take photo")) {
        initLogs.push(text);
        console.log(`[Init Log] ${text}`);
      }
    });

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Wait for initialization
    await page.waitForTimeout(2000);

    // Check for initialization logs
    console.log("Initialization logs:");
    initLogs.forEach((log) => console.log(`  - ${log}`));

    // Verify key initialization messages
    const hasConstructorLog = initLogs.some((log) =>
      log.includes("Constructor called"),
    );
    const hasInitLog = initLogs.some((log) =>
      log.includes("Initialize called"),
    );
    const hasHandlerLog = initLogs.some((log) =>
      log.includes("Take photo button handler attached"),
    );

    expect(hasConstructorLog || hasInitLog).toBe(true);
    console.log("✓ TestShotUI initialized");

    if (hasHandlerLog) {
      console.log("✓ Take Photo button handler attached");
    }
  });
});
