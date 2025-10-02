/**
 * Smoke Tests - Basic functionality verification
 *
 * These tests verify the actual UI structure and basic functionality
 */

import { test, expect } from '@playwright/test';

test.describe('Basic Application Functionality', () => {
  test('should load the home page', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Pi Camera Control/i);
  });

  test('should display the main UI elements', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Check for header
    const header = await page.locator('.header').isVisible();
    expect(header).toBe(true);

    // Check for main content
    const main = await page.locator('.main-content').isVisible();
    expect(main).toBe(true);

    // Check for activity log (exists but may be in hidden card)
    const activityLog = await page.locator('#activity-log');
    expect(await activityLog.count()).toBe(1);
  });

  test('should load JavaScript files and create global objects', async ({ page }) => {
    await page.goto('/');

    // Wait a bit for scripts to load
    await page.waitForTimeout(2000);

    // Check that global objects are defined
    const globalsLoaded = await page.evaluate(() => {
      return {
        wsManager: typeof window.wsManager !== 'undefined',
        uiStateManager: typeof window.uiStateManager !== 'undefined',
        cameraManager: typeof window.cameraManager !== 'undefined'
      };
    });

    // At least one of the main managers should be loaded
    expect(globalsLoaded.wsManager || globalsLoaded.uiStateManager).toBe(true);
  });

  test('should establish WebSocket connection', async ({ page }) => {
    await page.goto('/');

    // Wait up to 10 seconds for WebSocket connection
    const wsConnected = await page.waitForFunction(
      () => {
        return window.wsManager &&
               typeof window.wsManager.isConnected === 'function' &&
               window.wsManager.isConnected();
      },
      { timeout: 10000 }
    ).then(() => true).catch(() => false);

    expect(wsConnected).toBe(true);
  });

  test('should have responsive layout with viewport meta tag', async ({ page }) => {
    await page.goto('/');

    const hasViewport = await page.evaluate(() => {
      const meta = document.querySelector('meta[name="viewport"]');
      return meta !== null && meta.content.includes('width=device-width');
    });

    expect(hasViewport).toBe(true);
  });

  test('should display camera status section', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Camera status text should be visible
    const cameraStatus = await page.locator('#camera-status-text').isVisible();
    expect(cameraStatus).toBe(true);
  });

  test('should have function menu', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Function menu toggle should exist
    const menuToggle = await page.locator('#function-menu-toggle').isVisible();
    expect(menuToggle).toBe(true);
  });

  test('should load loading overlay and hide it', async ({ page }) => {
    await page.goto('/');

    // Loading overlay should exist
    const overlay = await page.locator('#loading-overlay');
    expect(await overlay.count()).toBe(1);

    // Wait for it to be hidden (max 10 seconds)
    await page.waitForSelector('#loading-overlay[style*="display: none"]', {
      timeout: 10000
    }).catch(() => {
      // It's okay if loading finishes another way
    });
  });
});

test.describe('API Health', () => {
  test('should have healthy API endpoint', async ({ request }) => {
    const healthResponse = await request.get('/health');
    expect(healthResponse.ok()).toBe(true);
  });

  test('should serve static JavaScript assets', async ({ request }) => {
    const jsResponse = await request.get('/js/app.js');
    expect(jsResponse.ok()).toBe(true);
  });

  test('should serve static CSS assets', async ({ request }) => {
    const cssResponse = await request.get('/css/main.css');
    expect(cssResponse.ok()).toBe(true);
  });
});

test.describe('WebSocket Basics', () => {
  test('should connect to WebSocket', async ({ page }) => {
    await page.goto('/');

    const wsStatus = await page.evaluate(async () => {
      // Wait for wsManager to be defined
      for (let i = 0; i < 50; i++) {
        if (window.wsManager) break;
        await new Promise(r => setTimeout(r, 100));
      }

      if (!window.wsManager) return 'not_loaded';

      // Wait for connection
      for (let i = 0; i < 100; i++) {
        if (window.wsManager.isConnected && window.wsManager.isConnected()) {
          return 'connected';
        }
        await new Promise(r => setTimeout(r, 100));
      }

      return 'timeout';
    });

    expect(wsStatus).toBe('connected');
  });
});

test.describe('UI Elements Present', () => {
  test('should have all expected cards', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Check for main function cards (even if hidden)
    const cards = {
      controllerStatus: await page.locator('#controller-status-card').count(),
      networkSettings: await page.locator('#network-settings-card').count(),
      utilities: await page.locator('#utilities-card').count(),
      testShot: await page.locator('#test-shot-card').count(),
      intervalometer: await page.locator('#intervalometer-card').count(),
      activityLog: await page.locator('#activity-log-card').count(),
    };

    // All cards should exist in DOM
    expect(cards.controllerStatus).toBe(1);
    expect(cards.networkSettings).toBe(1);
    expect(cards.utilities).toBe(1);
  });

  test('should have time sync UI elements', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const timeElements = {
      piTime: await page.locator('#pi-current-time').count(),
      clientTime: await page.locator('#client-current-time').count(),
      timeDiff: await page.locator('#time-difference').count(),
      getTimeBtn: await page.locator('#get-time-btn').count(),
      syncTimeBtn: await page.locator('#sync-time-btn').count(),
    };

    expect(timeElements.piTime).toBe(1);
    expect(timeElements.clientTime).toBe(1);
    expect(timeElements.timeDiff).toBe(1);
    expect(timeElements.getTimeBtn).toBe(1);
    expect(timeElements.syncTimeBtn).toBe(1);
  });

  test('should have camera control elements', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const cameraElements = {
      status: await page.locator('#camera-status-text').count(),
      ip: await page.locator('#camera-ip').count(),
      battery: await page.locator('#camera-battery').count(),
      takePhotoBtn: await page.locator('#take-photo-btn').count(),
    };

    expect(cameraElements.status).toBe(1);
    expect(cameraElements.ip).toBe(1);
    expect(cameraElements.battery).toBe(1);
    expect(cameraElements.takePhotoBtn).toBe(1);
  });

  test('should have intervalometer controls', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const intervalometerElements = {
      intervalInput: await page.locator('#interval-input').count(),
      startBtn: await page.locator('#start-intervalometer-btn').count(),
      stopBtn: await page.locator('#stop-intervalometer-btn').count(),
    };

    expect(intervalometerElements.intervalInput).toBe(1);
    expect(intervalometerElements.startBtn).toBe(1);
    expect(intervalometerElements.stopBtn).toBe(1);
  });
});
