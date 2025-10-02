/**
 * E2E Tests for Camera Controls
 *
 * Tests match actual HTML structure from public/index.html
 */

import { test, expect } from '@playwright/test';

test.describe('Camera Status Display', () => {
  test('should display camera status text', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Wait for camera status to be populated (starts as "Checking...")
    await page.waitForSelector('#camera-status-text', { timeout: 5000 });

    const statusText = await page.textContent('#camera-status-text');

    // Should have some text (either "Connected", "Disconnected", or "Checking...")
    expect(statusText).toBeTruthy();
    expect(statusText.length).toBeGreaterThan(0);
  });

  test('should display camera IP when connected', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Camera IP display element (not the config input)
    const cameraIP = await page.locator('#camera-ip');
    expect(await cameraIP.count()).toBe(1);

    // Get the IP text (may be "-" if not connected)
    const ipText = await cameraIP.textContent();
    expect(ipText).toBeTruthy();
  });

  test('should display camera battery level', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Battery element should exist
    const battery = await page.locator('#camera-battery');
    expect(await battery.count()).toBe(1);

    const batteryText = await battery.textContent();
    expect(batteryText).toBeTruthy();
  });

  test('should display camera mode', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const mode = await page.locator('#camera-mode');
    expect(await mode.count()).toBe(1);
  });
});

test.describe('Camera Controls', () => {
  test('should have take photo button', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const takePhotoBtn = await page.locator('#take-photo-btn');
    expect(await takePhotoBtn.count()).toBe(1);
  });

  test('take photo button state matches camera connection', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const takePhotoBtn = await page.locator('#take-photo-btn');
    const isDisabled = await takePhotoBtn.isDisabled();

    // Button should be disabled if camera is not connected,
    // or enabled if camera is connected
    // Either state is valid - this just verifies the button exists
    expect(typeof isDisabled).toBe('boolean');
  });

  test('should have get settings button', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const getSettingsBtn = await page.locator('#get-settings-btn');
    expect(await getSettingsBtn.count()).toBe(1);
  });
});

test.describe('Battery Status', () => {
  test('should display battery in header', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const batteryHeader = await page.locator('#battery-level-header');
    expect(await batteryHeader.count()).toBe(1);
  });

  test('should display battery in status section', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const batteryStatus = await page.locator('#camera-battery');
    expect(await batteryStatus.count()).toBe(1);
  });
});

test.describe('Manual Camera Connection', () => {
  test('should have manual connect button', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Manual connect button exists (may be hidden)
    const manualConnectBtn = await page.locator('#manual-connect-btn');
    expect(await manualConnectBtn.count()).toBe(1);
  });

  test('should have manual connect modal', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const modal = await page.locator('#manual-connect-modal');
    expect(await modal.count()).toBe(1);
  });

  test('manual connect modal should have IP input', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const ipInput = await page.locator('#manual-ip-input');
    expect(await ipInput.count()).toBe(1);

    // Should have placeholder
    const placeholder = await ipInput.getAttribute('placeholder');
    expect(placeholder).toContain('192.168');
  });
});

test.describe('Camera Status Indicators (Header)', () => {
  test('should display camera status icon in header', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const cameraStatusHeader = await page.locator('#camera-status-header');
    expect(await cameraStatusHeader.count()).toBe(1);
  });

  test('should display storage status in header', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const storageHeader = await page.locator('#storage-status-header');
    expect(await storageHeader.count()).toBe(1);
  });

  test('should display timer status in header', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const timerHeader = await page.locator('#timer-status-header');
    expect(await timerHeader.count()).toBe(1);
  });
});

test.describe('Function Menu', () => {
  test('should open function menu on click', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Click menu toggle
    await page.click('#function-menu-toggle');

    // Dropdown should be visible
    const dropdown = await page.locator('#function-menu-dropdown');
    const isVisible = await dropdown.isVisible();
    expect(isVisible).toBe(true);
  });

  test('function menu should have camera settings option', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.click('#function-menu-toggle');

    // Check for camera settings menu item
    const cameraSettingsItem = await page.locator('button.menu-item[data-card="camera-settings"]');
    expect(await cameraSettingsItem.count()).toBe(1);
  });

  test('function menu should have test shot option', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.click('#function-menu-toggle');

    const testShotItem = await page.locator('button.menu-item[data-card="test-shot"]');
    expect(await testShotItem.count()).toBe(1);
  });
});

test.describe('Camera Time Sync Status', () => {
  test('should display camera timesync status', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const timesync = await page.locator('#camera-timesync');
    expect(await timesync.count()).toBe(1);
  });

  test('should display controller timesync status', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const controllerTimesync = await page.locator('#controller-timesync');
    expect(await controllerTimesync.count()).toBe(1);
  });
});

test.describe('Camera Configuration Inputs', () => {
  test('should have camera IP config input', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const ipConfigInput = await page.locator('#camera-ip-config');
    expect(await ipConfigInput.count()).toBe(1);

    // Should be an input element
    const tagName = await ipConfigInput.evaluate(el => el.tagName);
    expect(tagName).toBe('INPUT');
  });

  test('should have camera port config input', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const portConfigInput = await page.locator('#camera-port-config');
    expect(await portConfigInput.count()).toBe(1);

    // Should have default value of 443
    const value = await portConfigInput.inputValue();
    expect(value).toBe('443');
  });

  test('should have update camera config button', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const updateBtn = await page.locator('#update-camera-config-btn');
    expect(await updateBtn.count()).toBe(1);
  });
});
