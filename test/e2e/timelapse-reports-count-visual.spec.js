/**
 * E2E Visual Tests for Timelapse Reports Count Display
 *
 * Tests the "Saved Reports (N)" count feature with visual verification
 */

import { test, expect } from "@playwright/test";
import {
  captureScreenshot,
  captureAndExtractValues,
} from "./helpers/visual-helpers.js";

test.describe("Timelapse Reports Count Display", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test("should display count in heading when no reports exist", async ({
    page,
  }) => {
    // Navigate to timelapse reports page
    await page.click("#function-menu-toggle");
    await page.click('button.menu-item[data-card="timelapse-reports"]');

    // Wait for reports to load
    await page.waitForTimeout(1000);

    // Capture screenshot and extract values
    const { screenshotPath, values } = await captureAndExtractValues(
      page,
      "reports-heading-empty",
      {
        heading: "#reports-list-heading",
        emptyState: "#reports-empty",
        reportsList: "#reports-list",
      },
    );

    console.log(`Screenshot: ${screenshotPath}`);

    // Assert heading exists and is visible
    expect(values.heading.exists).toBe(true);
    expect(values.heading.visible).toBe(true);

    // Assert heading shows count of 0
    expect(values.heading.text).toContain("Saved Reports");
    expect(values.heading.text).toContain("(0)");

    // Verify empty state is shown
    expect(values.emptyState.visible).toBe(true);
    expect(values.reportsList.visible).toBe(false);

    await captureScreenshot(page, "reports-empty-state-verified");
  });

  test("should update count when reports are deleted", async ({ page }) => {
    // This test assumes there are reports available
    // Navigate to timelapse reports page
    await page.click("#function-menu-toggle");
    await page.click('button.menu-item[data-card="timelapse-reports"]');

    // Wait for reports to load
    await page.waitForTimeout(1000);

    // Capture initial state
    const { screenshotPath: initialPath, values: initialValues } =
      await captureAndExtractValues(page, "reports-before-delete", {
        heading: "#reports-list-heading",
        reportsList: "#reports-list",
      });

    console.log(`Initial screenshot: ${initialPath}`);

    // Get initial count from heading
    const initialHeading = initialValues.heading.text;
    const initialCountMatch = initialHeading.match(/\((\d+)\)/);

    if (initialCountMatch) {
      const initialCount = parseInt(initialCountMatch[1]);
      console.log(`Initial count: ${initialCount}`);

      // If there are reports, try to delete one
      if (initialCount > 0) {
        // Click first delete button
        const deleteButton = page.locator(".delete-report-btn").first();
        const deleteExists = (await deleteButton.count()) > 0;

        if (deleteExists) {
          // Handle confirmation dialog
          page.on("dialog", (dialog) => dialog.accept());
          await deleteButton.click();

          // Wait for deletion to complete
          await page.waitForTimeout(1000);

          // Capture state after deletion
          const { screenshotPath: afterPath, values: afterValues } =
            await captureAndExtractValues(page, "reports-after-delete", {
              heading: "#reports-list-heading",
            });

          console.log(`After deletion screenshot: ${afterPath}`);

          // Verify count decreased by 1
          const afterHeading = afterValues.heading.text;
          const afterCountMatch = afterHeading.match(/\((\d+)\)/);

          expect(afterCountMatch).not.toBeNull();
          const afterCount = parseInt(afterCountMatch[1]);
          console.log(`After count: ${afterCount}`);
          expect(afterCount).toBe(initialCount - 1);

          await captureScreenshot(page, "reports-count-updated");
        }
      }
    }
  });

  test("should display correct count when multiple reports exist", async ({
    page,
  }) => {
    // Navigate to timelapse reports page
    await page.click("#function-menu-toggle");
    await page.click('button.menu-item[data-card="timelapse-reports"]');

    // Wait for reports to load
    await page.waitForTimeout(1000);

    // Capture screenshot and extract values
    const { screenshotPath, values } = await captureAndExtractValues(
      page,
      "reports-heading-with-reports",
      {
        heading: "#reports-list-heading",
        reportsList: "#reports-list",
      },
    );

    console.log(`Screenshot: ${screenshotPath}`);

    // Assert heading exists and is visible
    expect(values.heading.exists).toBe(true);
    expect(values.heading.visible).toBe(true);

    // Extract count from heading
    const headingText = values.heading.text;
    expect(headingText).toContain("Saved Reports");

    const countMatch = headingText.match(/\((\d+)\)/);
    expect(countMatch).not.toBeNull();

    const displayedCount = parseInt(countMatch[1]);
    console.log(`Displayed count: ${displayedCount}`);

    // Count actual report items in the list
    const reportItems = page.locator(".report-item");
    const actualCount = await reportItems.count();
    console.log(`Actual report items: ${actualCount}`);

    // Verify displayed count matches actual count
    expect(displayedCount).toBe(actualCount);

    // If reports exist, verify list is visible
    if (actualCount > 0) {
      expect(values.reportsList.visible).toBe(true);
    } else {
      expect(values.reportsList.visible).toBe(false);
    }

    await captureScreenshot(page, "reports-count-verified");
  });

  test("should update count after refresh button clicked", async ({ page }) => {
    // Navigate to timelapse reports page
    await page.click("#function-menu-toggle");
    await page.click('button.menu-item[data-card="timelapse-reports"]');

    // Wait for initial load
    await page.waitForTimeout(1000);

    // Capture initial count
    const { screenshotPath: beforePath, values: beforeValues } =
      await captureAndExtractValues(page, "reports-before-refresh", {
        heading: "#reports-list-heading",
      });

    console.log(`Before refresh screenshot: ${beforePath}`);

    const beforeHeading = beforeValues.heading.text;
    console.log(`Before refresh heading: ${beforeHeading}`);

    // Click refresh button
    await page.click("#refresh-reports-btn");

    // Wait for refresh to complete
    await page.waitForTimeout(1000);

    // Capture count after refresh
    const { screenshotPath: afterPath, values: afterValues } =
      await captureAndExtractValues(page, "reports-after-refresh", {
        heading: "#reports-list-heading",
      });

    console.log(`After refresh screenshot: ${afterPath}`);

    const afterHeading = afterValues.heading.text;
    console.log(`After refresh heading: ${afterHeading}`);

    // Verify heading still contains count
    expect(afterHeading).toContain("Saved Reports");
    expect(afterHeading).toMatch(/\(\d+\)/);

    await captureScreenshot(page, "reports-refresh-verified");
  });

  test("should have correct heading element ID for updates", async ({
    page,
  }) => {
    // Navigate to timelapse reports page
    await page.click("#function-menu-toggle");
    await page.click('button.menu-item[data-card="timelapse-reports"]');

    await page.waitForTimeout(500);

    // Verify the heading element has the correct ID
    const heading = page.locator("#reports-list-heading");
    const exists = (await heading.count()) > 0;

    expect(exists).toBe(true);

    // Verify it's an h4 element
    const tagName = await heading.evaluate((el) => el.tagName.toLowerCase());
    expect(tagName).toBe("h4");

    // Capture screenshot showing the heading
    const screenshotPath = await captureScreenshot(
      page,
      "reports-heading-element",
    );
    console.log(`Screenshot: ${screenshotPath}`);
  });
});
