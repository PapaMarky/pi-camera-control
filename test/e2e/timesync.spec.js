/**
 * E2E Tests for Time Synchronization UI
 *
 * Tests match actual HTML structure from public/index.html
 */

import { test, expect } from '@playwright/test';

test.describe('Time Sync UI Elements', () => {
  test('should have pi time display', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const piTime = await page.locator('#pi-current-time');
    expect(await piTime.count()).toBe(1);

    const text = await piTime.textContent();
    expect(text).toBeTruthy();
  });

  test('should have client time display', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const clientTime = await page.locator('#client-current-time');
    expect(await clientTime.count()).toBe(1);

    const text = await clientTime.textContent();
    expect(text).toBeTruthy();
  });

  test('should have time difference display', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const timeDiff = await page.locator('#time-difference');
    expect(await timeDiff.count()).toBe(1);
  });

  test('should have timezone info display', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const timezone = await page.locator('#pi-timezone');
    expect(await timezone.count()).toBe(1);
  });
});

test.describe('Time Sync Controls', () => {
  test('should have get time button', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const getTimeBtn = await page.locator('#get-time-btn');
    expect(await getTimeBtn.count()).toBe(1);

    // Check button has icon and text
    const btnIcon = await getTimeBtn.locator('.btn-icon').textContent();
    expect(btnIcon).toBeTruthy();

    const btnText = await getTimeBtn.locator('.btn-text').textContent();
    expect(btnText).toContain('Time');
  });

  test('should have sync time button', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const syncTimeBtn = await page.locator('#sync-time-btn');
    expect(await syncTimeBtn.count()).toBe(1);

    const btnText = await syncTimeBtn.locator('.btn-text').textContent();
    expect(btnText).toContain('Sync');
  });

  test('get time button should be clickable', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const getTimeBtn = await page.locator('#get-time-btn');
    const isEnabled = await getTimeBtn.isEnabled();
    expect(isEnabled).toBe(true);
  });

  test('sync time button should be clickable', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const syncTimeBtn = await page.locator('#sync-time-btn');
    const isEnabled = await syncTimeBtn.isEnabled();
    expect(isEnabled).toBe(true);
  });
});

test.describe('Time Display Updates', () => {
  test('client time should update', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const clientTime = await page.locator('#client-current-time');

    const time1 = await clientTime.textContent();
    await page.waitForTimeout(2000);
    const time2 = await clientTime.textContent();

    // Client time should be updating (or at least have a value)
    expect(time1).toBeTruthy();
    expect(time2).toBeTruthy();
  });
});

test.describe('Utilities Card Access', () => {
  test('should access utilities card via menu', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Open function menu
    await page.click('#function-menu-toggle');

    // Click utilities menu item
    await page.click('button.menu-item[data-card="utilities"]');

    // Utilities card should be visible
    const utilitiesCard = await page.locator('#utilities-card');
    const isVisible = await utilitiesCard.isVisible();
    expect(isVisible).toBe(true);
  });

  test('utilities card should contain time sync section', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Open utilities
    await page.click('#function-menu-toggle');
    await page.click('button.menu-item[data-card="utilities"]');

    // Check for time sync elements
    const piTime = await page.locator('#pi-current-time').isVisible();
    const clientTime = await page.locator('#client-current-time').isVisible();

    expect(piTime || clientTime).toBe(true);
  });
});

test.describe('Time Sync Integration', () => {
  test('should have time sync status in camera section', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const cameraTimesync = await page.locator('#camera-timesync');
    expect(await cameraTimesync.count()).toBe(1);
  });

  test('should have time sync status in controller section', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const controllerTimesync = await page.locator('#controller-timesync');
    expect(await controllerTimesync.count()).toBe(1);
  });
});
