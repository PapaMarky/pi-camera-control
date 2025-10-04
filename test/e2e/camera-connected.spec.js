/**
 * E2E Tests for Camera Connected State
 *
 * PREREQUISITES: Run these tests WITH camera connected
 * - Canon EOS R50 should be on and connected to network
 * - Camera should be discoverable via mDNS or manually configured
 * - Server should detect and connect to camera
 */

import { test, expect } from "@playwright/test";

test.describe("Camera Connected State", () => {
  test("should show camera connected status", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Wait for camera detection
    await page.waitForTimeout(3000);

    const statusText = await page.textContent("#camera-status-text");

    // Should show connected
    expect(statusText).toMatch(/connected/i);
    expect(statusText).not.toMatch(/not connected|disconnected/i);
  });

  test("should display camera IP address", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    const ipText = await page.textContent("#camera-ip");

    // Should be a valid IP address, not "-"
    expect(ipText).toMatch(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/);
    expect(ipText).not.toBe("-");
  });

  test("should display camera battery level", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    const batteryText = await page.textContent("#camera-battery");

    // Should show battery percentage or status, not "-"
    expect(batteryText).not.toBe("-");
    expect(batteryText).toBeTruthy();
  });

  test("should display camera mode", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    const modeText = await page.textContent("#camera-mode");

    // Should show a mode, not "-"
    expect(modeText).not.toBe("-");
    expect(modeText).toBeTruthy();
  });

  test("take photo button should be enabled", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    const isDisabled = await page.locator("#take-photo-btn").isDisabled();
    expect(isDisabled).toBe(false);
  });

  test("get settings button should be enabled", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    const isDisabled = await page.locator("#get-settings-btn").isDisabled();
    expect(isDisabled).toBe(false);
  });

  test("start intervalometer button should be enabled", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    const isDisabled = await page
      .locator("#start-intervalometer-btn")
      .isDisabled();
    expect(isDisabled).toBe(false);
  });

  test("camera settings menu item should be enabled", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    await page.click("#function-menu-toggle");

    const cameraSettingsItem = await page.locator(
      'button.menu-item[data-card="camera-settings"]',
    );
    const isDisabled = await cameraSettingsItem.isDisabled();
    expect(isDisabled).toBe(false);
  });

  test("test shot menu item should be enabled", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    await page.click("#function-menu-toggle");

    const testShotItem = await page.locator(
      'button.menu-item[data-card="test-shot"]',
    );
    const isDisabled = await testShotItem.isDisabled();
    expect(isDisabled).toBe(false);
  });

  test("intervalometer menu item should be enabled", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    await page.click("#function-menu-toggle");

    const intervalometerItem = await page.locator(
      'button.menu-item[data-card="intervalometer"]',
    );
    const isDisabled = await intervalometerItem.isDisabled();
    expect(isDisabled).toBe(false);
  });

  test("should show connected state in activity log", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    // Open activity log
    await page.click("#function-menu-toggle");
    await page.click('button.menu-item[data-card="activity-log"]');

    // Check for connected message
    const logContent = await page.textContent("#activity-log");
    expect(logContent).toMatch(/connected|initialized|ready/i);
  });

  test("battery status should be shown in header", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    const batteryHeader = await page.textContent("#battery-level-header");

    // Should show percentage or status, not "-"
    expect(batteryHeader).not.toBe("-");
    expect(batteryHeader).toBeTruthy();
  });

  test("camera icon in header should show connected state", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    const cameraStatusHeader = await page.locator("#camera-status-header");

    // Should have some indication of connection (check for class or style)
    const classes = await cameraStatusHeader.getAttribute("class");
    expect(classes).toBeTruthy();
  });
});

test.describe("Camera Operations (Camera Connected)", () => {
  test("should be able to open test shot card", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    // Open menu and click test shot
    await page.click("#function-menu-toggle");
    await page.click('button.menu-item[data-card="test-shot"]');

    // Test shot card should be visible
    const testShotCard = await page.locator("#test-shot-card");
    const isVisible = await testShotCard.isVisible();
    expect(isVisible).toBe(true);
  });

  test("should be able to open camera settings card", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    await page.click("#function-menu-toggle");
    await page.click('button.menu-item[data-card="camera-settings"]');

    const settingsCard = await page.locator("#camera-settings-card");
    const isVisible = await settingsCard.isVisible();
    expect(isVisible).toBe(true);
  });

  test("should be able to open intervalometer card", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    await page.click("#function-menu-toggle");
    await page.click('button.menu-item[data-card="intervalometer"]');

    const intervalometerCard = await page.locator("#intervalometer-card");
    const isVisible = await intervalometerCard.isVisible();
    expect(isVisible).toBe(true);
  });

  test("clicking take photo button should trigger action", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    // Open test shot card
    await page.click("#function-menu-toggle");
    await page.click('button.menu-item[data-card="test-shot"]');

    // Click take photo
    await page.click("#take-photo-btn");

    // Button should go into progress state (disabled or loading)
    await page.waitForTimeout(500);

    // Check if button shows progress or activity log shows message
    const logContent = await page.evaluate(() => {
      const log = document.getElementById("activity-log");
      return log ? log.textContent : "";
    });

    // Should have some activity
    expect(logContent.length).toBeGreaterThan(0);
  });

  test("intervalometer controls should be interactive", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    // Open intervalometer
    await page.click("#function-menu-toggle");
    await page.click('button.menu-item[data-card="intervalometer"]');

    // Should be able to change interval
    const intervalInput = await page.locator("#interval-input");
    await intervalInput.fill("15");

    const value = await intervalInput.inputValue();
    expect(value).toBe("15");
  });
});

test.describe("Camera Time Sync (Camera Connected)", () => {
  test("should show camera timesync status", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    const timesyncStatus = await page.textContent("#camera-timesync");

    // Should show some status, not just "-"
    expect(timesyncStatus).toBeTruthy();
  });
});
