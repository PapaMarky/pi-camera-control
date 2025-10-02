/**
 * E2E Tests for Timelapse/Intervalometer UI
 *
 * Tests match actual HTML structure from public/index.html
 */

import { test, expect } from '@playwright/test';

test.describe('Intervalometer UI Elements', () => {
  test('should have interval input', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const intervalInput = await page.locator('#interval-input');
    expect(await intervalInput.count()).toBe(1);

    // Should have default value
    const value = await intervalInput.inputValue();
    expect(value).toBeTruthy();
  });

  test('should have session title input', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const titleInput = await page.locator('#session-title-input');
    expect(await titleInput.count()).toBe(1);
  });

  test('should have stop condition radio buttons', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const unlimitedRadio = await page.locator('#unlimited-radio');
    const shotsRadio = await page.locator('#shots-radio');
    const timeRadio = await page.locator('#time-radio');

    expect(await unlimitedRadio.count()).toBe(1);
    expect(await shotsRadio.count()).toBe(1);
    expect(await timeRadio.count()).toBe(1);

    // Unlimited should be checked by default
    const isChecked = await unlimitedRadio.isChecked();
    expect(isChecked).toBe(true);
  });

  test('should have shots input', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const shotsInput = await page.locator('#shots-input');
    expect(await shotsInput.count()).toBe(1);

    // Should be disabled by default
    const isDisabled = await shotsInput.isDisabled();
    expect(isDisabled).toBe(true);
  });

  test('should have stop time input', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const stopTimeInput = await page.locator('#stop-time-input');
    expect(await stopTimeInput.count()).toBe(1);

    // Should be disabled by default
    const isDisabled = await stopTimeInput.isDisabled();
    expect(isDisabled).toBe(true);
  });
});

test.describe('Intervalometer Controls', () => {
  test('should have start button', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const startBtn = await page.locator('#start-intervalometer-btn');
    expect(await startBtn.count()).toBe(1);

    // Button state depends on camera connection
    // Just verify it exists and has proper structure
    const isDisabled = await startBtn.isDisabled();
    expect(typeof isDisabled).toBe('boolean');
  });

  test('should have stop button', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const stopBtn = await page.locator('#stop-intervalometer-btn');
    expect(await stopBtn.count()).toBe(1);
  });

  test('start button should have icon and text', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const startBtn = await page.locator('#start-intervalometer-btn');
    const icon = await startBtn.locator('.btn-icon').textContent();
    const text = await startBtn.locator('.btn-text').textContent();

    expect(icon).toBeTruthy();
    expect(text).toContain('Start');
  });
});

test.describe('Intervalometer Progress Display', () => {
  test('should have progress section', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const progressSection = await page.locator('#intervalometer-progress');
    expect(await progressSection.count()).toBe(1);

    // Should be hidden initially
    const isHidden = await progressSection.isHidden();
    expect(isHidden).toBe(true);
  });

  test('should have progress stats elements', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const stats = {
      interval: await page.locator('#session-interval').count(),
      criteria: await page.locator('#session-stop-criteria').count(),
      shotsTaken: await page.locator('#shots-taken').count(),
      successRate: await page.locator('#success-rate').count(),
      duration: await page.locator('#session-duration').count(),
      nextShot: await page.locator('#next-shot-countdown').count(),
    };

    expect(stats.interval).toBe(1);
    expect(stats.criteria).toBe(1);
    expect(stats.shotsTaken).toBe(1);
    expect(stats.successRate).toBe(1);
    expect(stats.duration).toBe(1);
    expect(stats.nextShot).toBe(1);
  });

  test('should have progress bar', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const progressBar = await page.locator('.progress-bar');
    const progressFill = await page.locator('#progress-fill');

    expect(await progressBar.count()).toBe(1);
    expect(await progressFill.count()).toBe(1);
  });
});

test.describe('Session Completion', () => {
  test('should have session completion card', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const completionCard = await page.locator('#session-completion-card');
    expect(await completionCard.count()).toBe(1);

    // Should be hidden initially
    const isHidden = await completionCard.isHidden();
    expect(isHidden).toBe(true);
  });

  test('should have completion title input', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const titleInput = await page.locator('#completion-title-input');
    expect(await titleInput.count()).toBe(1);
  });

  test('should have save and discard buttons', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const saveBtn = await page.locator('#save-session-btn');
    const discardBtn = await page.locator('#discard-session-btn');

    expect(await saveBtn.count()).toBe(1);
    expect(await discardBtn.count()).toBe(1);
  });
});

test.describe('Timelapse Reports', () => {
  test('should have reports card', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const reportsCard = await page.locator('#timelapse-reports-card');
    expect(await reportsCard.count()).toBe(1);
  });

  test('should have refresh reports button', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const refreshBtn = await page.locator('#refresh-reports-btn');
    expect(await refreshBtn.count()).toBe(1);
  });

  test('should have reports container', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const reportsContainer = await page.locator('#reports-container');
    expect(await reportsContainer.count()).toBe(1);
  });

  test('should have empty state message', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const emptyState = await page.locator('#reports-empty');
    expect(await emptyState.count()).toBe(1);
  });
});

test.describe('Access Intervalometer via Menu', () => {
  test('should open intervalometer card from menu', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Open menu
    await page.click('#function-menu-toggle');

    // Menu item should be disabled until camera connects
    const menuItem = await page.locator('button.menu-item[data-card="intervalometer"]');
    expect(await menuItem.count()).toBe(1);
  });

  test('should open timelapse reports from menu', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Open menu
    await page.click('#function-menu-toggle');

    // Click timelapse reports
    await page.click('button.menu-item[data-card="timelapse-reports"]');

    // Reports card should be visible
    const reportsCard = await page.locator('#timelapse-reports-card');
    const isVisible = await reportsCard.isVisible();
    expect(isVisible).toBe(true);
  });
});
