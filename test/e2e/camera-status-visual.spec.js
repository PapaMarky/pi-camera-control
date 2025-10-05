/**
 * Visual Verification Tests for Camera Status
 *
 * These tests demonstrate the enhanced testing pattern where:
 * 1. Screenshots are captured for Claude to "see"
 * 2. Actual values are asserted, not just element existence
 * 3. Button functionality is verified by clicking and checking results
 *
 * This is the pattern ALL E2E tests should follow to catch UI bugs early.
 */

import { test, expect } from "@playwright/test";
import {
  captureScreenshot,
  captureAndExtractValues,
  testButtonClick,
  getUIStateSnapshot,
  waitForWebSocketAndVerify,
} from "./helpers/visual-helpers.js";

test.describe("Camera Status Visual Verification", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test("should display correct camera status values (disconnected)", async ({
    page,
  }) => {
    // Wait for WebSocket to connect
    const wsConnected = await waitForWebSocketAndVerify(page);
    expect(wsConnected).toBe(true);

    // Wait a moment for initial status update
    await page.waitForTimeout(2000);

    // Capture screenshot and extract values
    const { screenshotPath, values } = await captureAndExtractValues(
      page,
      "camera-status-disconnected",
      {
        status: "#camera-status-text",
        ip: "#camera-ip",
        battery: "#camera-battery",
        mode: "#camera-mode",
      },
    );

    // Log screenshot path so Claude can read it
    console.log(`Screenshot saved: ${screenshotPath}`);

    // Verify actual values, not just existence
    expect(values.status.exists).toBe(true);
    expect(values.status.visible).toBe(true);

    const statusText = values.status.text?.toLowerCase() || "";

    // This test is for disconnected camera state
    // Skip if camera is actually connected
    if (
      statusText.includes("connected") &&
      !statusText.includes("disconnected")
    ) {
      console.log("Camera is connected - skipping disconnected state test");
      test.skip();
      return;
    }

    // Status should indicate no camera (checking, disconnected, or not connected)
    const validDisconnectedStates = [
      "checking",
      "disconnected",
      "not connected",
      "searching",
    ];
    const isValidDisconnectedState = validDisconnectedStates.some((state) =>
      statusText.includes(state),
    );

    expect(isValidDisconnectedState).toBe(true);

    // IP should show "-" or similar placeholder when not connected
    expect(values.ip.exists).toBe(true);
    expect(values.ip.text).toBeTruthy(); // Should have some text

    // Battery should show "-" or placeholder when not connected
    expect(values.battery.exists).toBe(true);
    expect(values.battery.text).toBeTruthy();

    // Take final screenshot for verification
    await captureScreenshot(page, "camera-status-final");
  });

  test("should display camera connection UI elements with correct states", async ({
    page,
  }) => {
    // Get complete UI state
    const uiState = await getUIStateSnapshot(page);

    // Log state for debugging
    console.log("UI State:", JSON.stringify(uiState, null, 2));

    // Verify WebSocket is connected
    expect(uiState.websocket.connected).toBe(true);

    // Verify camera status elements exist and are visible
    expect(uiState.camera.status.exists).toBe(true);
    expect(uiState.camera.status.visible).toBe(true);

    // Verify button states
    expect(uiState.buttons.takePhoto.exists).toBe(true);

    // When camera is disconnected, take photo should be disabled
    // (This will fail if the UI doesn't properly disable the button)
    const statusText = uiState.camera.status.text?.toLowerCase() || "";
    if (
      statusText.includes("disconnected") ||
      statusText.includes("not connected")
    ) {
      expect(uiState.buttons.takePhoto.disabled).toBe(true);
    }

    // Capture screenshot
    await captureScreenshot(page, "camera-ui-elements-state");
  });

  test("should verify function menu opens and displays correct options", async ({
    page,
  }) => {
    // Click function menu toggle
    const result = await testButtonClick(
      page,
      "#function-menu-toggle",
      async (page) => {
        // Verify dropdown is visible after click
        const dropdown = page.locator("#function-menu-dropdown");
        const visible = await dropdown.isVisible();
        expect(visible).toBe(true);
      },
    );

    expect(result.success).toBe(true);

    // Capture screenshot of open menu
    const screenshotPath = await captureScreenshot(page, "function-menu-open");
    console.log(`Menu screenshot: ${screenshotPath}`);

    // Extract menu item states
    const { values: menuItems } = await captureAndExtractValues(
      page,
      "function-menu-items",
      {
        cameraSettings: 'button.menu-item[data-card="camera-settings"]',
        testShot: 'button.menu-item[data-card="test-shot"]',
        intervalometer: 'button.menu-item[data-card="intervalometer"]',
        networkSettings: 'button.menu-item[data-card="network-settings"]',
      },
    );

    // Verify menu items exist and get their states
    expect(menuItems.cameraSettings.exists).toBe(true);
    expect(menuItems.testShot.exists).toBe(true);
    expect(menuItems.intervalometer.exists).toBe(true);
    expect(menuItems.networkSettings.exists).toBe(true);

    // Log which items are disabled (camera-dependent items should be disabled when camera is disconnected)
    console.log("Camera Settings disabled:", menuItems.cameraSettings.disabled);
    console.log("Test Shot disabled:", menuItems.testShot.disabled);
    console.log("Intervalometer disabled:", menuItems.intervalometer.disabled);
    console.log(
      "Network Settings disabled:",
      menuItems.networkSettings.disabled,
    );
  });

  test("should verify header status indicators display correct values", async ({
    page,
  }) => {
    const { screenshotPath, values } = await captureAndExtractValues(
      page,
      "header-status-indicators",
      {
        cameraStatus: "#camera-status-header",
        battery: "#battery-level-header",
        storage: "#storage-status-header",
        timer: "#timer-status-header",
      },
    );

    console.log(`Header screenshot: ${screenshotPath}`);

    // Verify all header indicators exist and are visible
    expect(values.cameraStatus.exists).toBe(true);
    expect(values.cameraStatus.visible).toBe(true);

    expect(values.battery.exists).toBe(true);
    expect(values.battery.visible).toBe(true);

    expect(values.storage.exists).toBe(true);
    expect(values.storage.visible).toBe(true);

    // Timer header exists but is only visible during timelapse
    expect(values.timer.exists).toBe(true);
    // Note: timer.visible is conditional - only visible when timelapse is running
    console.log(
      "Timer visible (should be false when no timelapse):",
      values.timer.visible,
    );

    // Log actual values for verification
    console.log("Camera Status Header:", values.cameraStatus.text);
    console.log("Battery Header:", values.battery.text);
    console.log("Storage Header:", values.storage.text);
    console.log("Timer Header:", values.timer.text);

    // Verify always-visible headers contain content
    expect(values.cameraStatus.text?.length).toBeGreaterThan(0);
    expect(values.battery.text?.length).toBeGreaterThan(0);
  });

  test("should verify activity log displays messages", async ({ page }) => {
    // Wait for some activity log messages
    await page.waitForTimeout(3000);

    const { screenshotPath, values } = await captureAndExtractValues(
      page,
      "activity-log",
      {
        activityLog: "#activity-log",
        activityLogCard: "#activity-log-card",
      },
    );

    console.log(`Activity log screenshot: ${screenshotPath}`);

    expect(values.activityLog.exists).toBe(true);

    // Get log entries
    const logEntries = await page.locator("#activity-log .log-entry").all();
    console.log(`Activity log has ${logEntries.length} entries`);

    // There should be at least one log entry (connection attempt, etc.)
    expect(logEntries.length).toBeGreaterThan(0);

    // Get text of first few entries
    for (let i = 0; i < Math.min(3, logEntries.length); i++) {
      const text = await logEntries[i].textContent();
      console.log(`Log entry ${i + 1}:`, text?.trim());
    }
  });
});

test.describe("Camera Status Visual Verification (Camera Connected)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Wait for WebSocket
    await waitForWebSocketAndVerify(page);

    // Wait for potential camera connection
    await page.waitForTimeout(3000);
  });

  test("should display valid IP address when camera is connected", async ({
    page,
  }) => {
    const { screenshotPath, values } = await captureAndExtractValues(
      page,
      "camera-connected-status",
      {
        status: "#camera-status-text",
        ip: "#camera-ip",
        battery: "#camera-battery",
      },
    );

    console.log(`Connected camera screenshot: ${screenshotPath}`);

    const statusText = values.status.text?.toLowerCase() || "";

    // Only run these assertions if camera is actually connected
    if (
      statusText.includes("connected") &&
      !statusText.includes("disconnected")
    ) {
      // IP should be a valid IP address, not "-"
      const ipText = values.ip.text || "";
      const ipPattern = /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/;

      expect(ipText).toMatch(ipPattern);
      console.log("Camera IP:", ipText);

      // Battery should show a percentage or level, not "-"
      const batteryText = values.battery.text || "";
      expect(batteryText).not.toBe("-");
      console.log("Battery:", batteryText);

      // Take photo button should be enabled
      const takePhotoBtn = page.locator("#take-photo-btn");
      const isDisabled = await takePhotoBtn.isDisabled();
      expect(isDisabled).toBe(false);
    } else {
      console.log("Camera not connected - skipping connected-state assertions");
      test.skip();
    }
  });
});
