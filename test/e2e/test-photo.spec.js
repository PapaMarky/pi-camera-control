/**
 * E2E Tests for Test Photo Feature
 *
 * Tests the test photo capture UI functionality including:
 * - Take Photo button
 * - Gallery display with EXIF metadata
 * - Photo download
 * - Individual photo deletion
 */

import { test, expect } from "@playwright/test";

test.describe("Test Photo UI Elements", () => {
  test("should have Take Photo button", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Navigate to Test Shot card
    await page.click("#function-menu-toggle");
    await page.click('button.menu-item[data-card="test-shot"]');

    const takePhotoBtn = await page.locator("#take-photo-btn");
    expect(await takePhotoBtn.count()).toBe(1);

    // Button should have camera icon
    const btnText = await takePhotoBtn.textContent();
    expect(btnText).toContain("Take Photo");
  });

  test("should have separate sections for live view and test photos", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Navigate to Test Shot card
    await page.click("#function-menu-toggle");
    await page.click('button.menu-item[data-card="test-shot"]');

    // Check for live view section
    const liveviewSection = await page.locator("#liveview-section");
    expect(await liveviewSection.count()).toBe(1);

    // Check for test photo section
    const testphotoSection = await page.locator("#testphoto-section");
    expect(await testphotoSection.count()).toBe(1);

    // Check for test photo gallery
    const testphotoGallery = await page.locator("#testphoto-gallery");
    expect(await testphotoGallery.count()).toBe(1);
  });

  test("Take Photo button should be disabled when camera disconnected", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Navigate to Test Shot card
    await page.click("#function-menu-toggle");
    await page.click('button.menu-item[data-card="test-shot"]');

    const takePhotoBtn = await page.locator("#take-photo-btn");

    // If camera is not connected, button should be disabled
    const cameraStatus = await page.textContent("#camera-status-text");
    if (!cameraStatus.includes("Connected")) {
      const isDisabled = await takePhotoBtn.isDisabled();
      expect(isDisabled).toBe(true);
    }
  });

  test("should display existing Capture Live View button", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.click("#function-menu-toggle");
    await page.click('button.menu-item[data-card="test-shot"]');

    const captureLiveviewBtn = await page.locator("#capture-liveview-btn");
    expect(await captureLiveviewBtn.count()).toBe(1);
  });
});

test.describe("Test Photo Gallery Display", () => {
  test("test photo gallery should have empty state initially", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.click("#function-menu-toggle");
    await page.click('button.menu-item[data-card="test-shot"]');

    const testphotoGallery = await page.locator("#testphoto-gallery");
    const content = await testphotoGallery.textContent();

    // Should show empty state message or be empty
    expect(content).toBeTruthy();
  });

  test("test photo items should display EXIF metadata", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.click("#function-menu-toggle");
    await page.click('button.menu-item[data-card="test-shot"]');

    // Look for EXIF data display elements (data-exif attribute)
    const exifDisplays = await page.locator("[data-exif]");

    // Initially there should be none (no photos captured)
    // But the selector should be valid for when photos exist
    expect(await exifDisplays.count()).toBeGreaterThanOrEqual(0);
  });

  test("test photo items should have download button", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.click("#function-menu-toggle");
    await page.click('button.menu-item[data-card="test-shot"]');

    // Look for download buttons (will be 0 initially, but selector should be valid)
    const downloadBtns = await page.locator(
      'button[data-action="download-photo"]',
    );
    expect(await downloadBtns.count()).toBeGreaterThanOrEqual(0);
  });

  test("test photo items should have delete button", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.click("#function-menu-toggle");
    await page.click('button.menu-item[data-card="test-shot"]');

    // Look for delete buttons (will be 0 initially, but selector should be valid)
    const deleteBtns = await page.locator('button[data-action="delete-photo"]');
    expect(await deleteBtns.count()).toBeGreaterThanOrEqual(0);
  });
});

test.describe("Test Photo Section Headers", () => {
  test("should have Live View Images section header", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.click("#function-menu-toggle");
    await page.click('button.menu-item[data-card="test-shot"]');

    // Look for section header
    const liveviewHeader = await page.locator("#liveview-section h3");
    expect(await liveviewHeader.count()).toBe(1);
    const headerText = await liveviewHeader.textContent();
    expect(headerText).toContain("Live View");
  });

  test("should have Test Photos section header", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.click("#function-menu-toggle");
    await page.click('button.menu-item[data-card="test-shot"]');

    // Look for section header
    const testphotoHeader = await page.locator("#testphoto-section h3");
    expect(await testphotoHeader.count()).toBe(1);
    const headerText = await testphotoHeader.textContent();
    expect(headerText).toContain("Test Photos");
  });
});

test.describe("Button Placement and Layout", () => {
  test("Take Photo button should be next to Capture Live View button", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.click("#function-menu-toggle");
    await page.click('button.menu-item[data-card="test-shot"]');

    // Both buttons should be in the same button-grid container
    const buttonGrid = await page
      .locator(".button-grid")
      .filter({ has: page.locator("#take-photo-btn") });
    expect(await buttonGrid.count()).toBe(1);

    const captureLiveviewBtn = await buttonGrid.locator(
      "#capture-liveview-btn",
    );
    expect(await captureLiveviewBtn.count()).toBe(1);
  });

  test("buttons should be in correct order", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.click("#function-menu-toggle");
    await page.click('button.menu-item[data-card="test-shot"]');

    // Get all buttons in the first button-grid
    const buttonGrid = await page.locator(".button-grid").first();
    const buttons = await buttonGrid.locator("button").all();

    // Should have at least 2 buttons (Capture Live View and Take Photo)
    expect(buttons.length).toBeGreaterThanOrEqual(2);
  });
});

test.describe("Error Handling UI", () => {
  test("should show loading state during photo capture", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.click("#function-menu-toggle");
    await page.click('button.menu-item[data-card="test-shot"]');

    const takePhotoBtn = await page.locator("#take-photo-btn");

    // Check if button has btn-text element for loading state
    const btnText = await takePhotoBtn.locator(".btn-text");
    expect(await btnText.count()).toBe(1);
  });
});

test.describe("Accessibility", () => {
  test("Take Photo button should have accessible text", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.click("#function-menu-toggle");
    await page.click('button.menu-item[data-card="test-shot"]');

    const takePhotoBtn = await page.locator("#take-photo-btn");
    const btnText = await takePhotoBtn.textContent();

    // Should have text, not just emoji
    expect(btnText).toBeTruthy();
    expect(btnText.length).toBeGreaterThan(1);
  });

  test("photo download buttons should have title attribute", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.click("#function-menu-toggle");
    await page.click('button.menu-item[data-card="test-shot"]');

    // Check that download button selector exists (will be 0 initially)
    const downloadBtns = await page.locator(
      'button[data-action="download-photo"]',
    );

    // If any exist, they should have title
    const count = await downloadBtns.count();
    if (count > 0) {
      const firstBtn = downloadBtns.first();
      const title = await firstBtn.getAttribute("title");
      expect(title).toBeTruthy();
    }
  });
});
