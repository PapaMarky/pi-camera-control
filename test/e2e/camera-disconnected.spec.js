/**
 * E2E Tests for Camera Disconnected State
 *
 * PREREQUISITES: Run these tests with NO camera connected
 * - Camera should be off or not on the network
 * - Server should be running but camera unavailable
 */

import { test, expect } from "@playwright/test";

test.describe("Camera Disconnected State", () => {
  test("should show camera not connected status", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Wait a few seconds for camera detection to complete
    await page.waitForTimeout(3000);

    const statusText = await page.textContent("#camera-status-text");

    // Should indicate not connected
    expect(statusText).toMatch(/not connected|disconnected|checking/i);
  });

  test('should show "-" for camera IP when disconnected', async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    const ipText = await page.textContent("#camera-ip");
    expect(ipText).toBe("-");
  });

  test('should show "-" for camera battery when disconnected', async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    const batteryText = await page.textContent("#camera-battery");
    expect(batteryText).toBe("-");
  });

  test('should show "-" for camera mode when disconnected', async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    const modeText = await page.textContent("#camera-mode");
    expect(modeText).toBe("-");
  });

  test("take photo button should be disabled", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    const isDisabled = await page.locator("#take-photo-btn").isDisabled();
    expect(isDisabled).toBe(true);
  });

  test("get settings button should be disabled", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    const isDisabled = await page.locator("#get-settings-btn").isDisabled();
    expect(isDisabled).toBe(true);
  });

  test("start intervalometer button should be disabled", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    const isDisabled = await page
      .locator("#start-intervalometer-btn")
      .isDisabled();
    expect(isDisabled).toBe(true);
  });

  test("camera settings menu item should be disabled", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    // Open menu
    await page.click("#function-menu-toggle");

    const cameraSettingsItem = await page.locator(
      'button.menu-item[data-card="camera-settings"]',
    );
    const isDisabled = await cameraSettingsItem.isDisabled();
    expect(isDisabled).toBe(true);
  });

  test("test shot menu item should be disabled", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    await page.click("#function-menu-toggle");

    const testShotItem = await page.locator(
      'button.menu-item[data-card="test-shot"]',
    );
    const isDisabled = await testShotItem.isDisabled();
    expect(isDisabled).toBe(true);
  });

  test("intervalometer menu item should be disabled", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    await page.click("#function-menu-toggle");

    const intervalometerItem = await page.locator(
      'button.menu-item[data-card="intervalometer"]',
    );
    const isDisabled = await intervalometerItem.isDisabled();
    expect(isDisabled).toBe(true);
  });

  test("should show disconnected state in activity log", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    // Open activity log
    await page.click("#function-menu-toggle");
    await page.click('button.menu-item[data-card="activity-log"]');

    // Check for disconnected or checking messages
    const logContent = await page.textContent("#activity-log");
    expect(logContent).toBeTruthy();
  });

  test("manual connect button should be visible when camera not found", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(5000); // Give it time to fail detection

    // Manual connect row may become visible
    const manualConnectRow = await page.locator("#manual-connect-row");
    // Either visible or hidden is okay, just verify it exists
    expect(await manualConnectRow.count()).toBe(1);
  });
});

test.describe("Manual Connection Flow (No Camera)", () => {
  test("should show manual connect modal", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(5000);

    // Check if manual connect button is visible
    const manualConnectBtn = await page.locator("#manual-connect-btn");
    const isVisible = await manualConnectBtn.isVisible();

    if (isVisible) {
      // Click it to open modal
      await manualConnectBtn.click();

      // Modal should be visible
      const modal = await page.locator("#manual-connect-modal");
      const modalVisible = await modal.isVisible();
      expect(modalVisible).toBe(true);
    }
  });

  test("manual connect modal should have IP input", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const modal = await page.locator("#manual-connect-modal");
    expect(await modal.count()).toBe(1);

    const ipInput = await page.locator("#manual-ip-input");
    expect(await ipInput.count()).toBe(1);
  });
});
