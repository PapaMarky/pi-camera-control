/**
 * E2E Visual Tests for Timelapse Report Deletion Navigation
 *
 * Tests that verify navigation works correctly after deleting a report:
 * - User clicks delete on report detail page
 * - Report is deleted successfully
 * - App navigates back to reports list page
 *
 * This test uses visual helpers to capture screenshots for verification.
 */

import { test, expect } from "@playwright/test";
import {
  captureScreenshot,
  captureAndExtractValues,
  waitForWebSocketAndVerify,
} from "./helpers/visual-helpers.js";
import {
  createMockTimelapseReport,
  cleanupTestReports,
} from "./helpers/test-data-helpers.js";

test.describe("Timelapse Report Delete Navigation", () => {
  // Setup: Create test reports before tests
  test.beforeEach(async () => {
    // Clean up any existing test reports
    await cleanupTestReports();

    // Create two test reports
    await createMockTimelapseReport({
      id: "test-report-1",
      title: "Test Report for Deletion",
      imagesSuccessful: 98,
      imagesCaptured: 100,
    });

    await createMockTimelapseReport({
      id: "test-report-2",
      title: "Another Test Report",
      imagesSuccessful: 45,
      imagesCaptured: 50,
    });
  });

  // Cleanup: Remove test reports after tests
  test.afterEach(async () => {
    await cleanupTestReports();
  });

  test("should navigate back to reports list after deleting a report", async ({
    page,
  }) => {
    // Navigate to the app
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Wait for WebSocket connection
    const wsConnected = await waitForWebSocketAndVerify(page);
    console.log(`WebSocket connected: ${wsConnected}`);

    // Open menu and navigate to timelapse reports
    await page.click("#function-menu-toggle");
    await page.click('button.menu-item[data-card="timelapse-reports"]');

    // Wait for reports to load
    await page.waitForTimeout(1000);

    // Capture initial reports list state
    const { screenshotPath: listScreenshot, values: listValues } =
      await captureAndExtractValues(page, "reports-list-initial", {
        listSection: "#reports-list-section",
        detailsSection: "#report-details-section",
        reportsList: "#reports-list",
        reportsEmpty: "#reports-empty",
      });

    console.log(`Initial list screenshot: ${listScreenshot}`);
    console.log(
      `List section visible: ${listValues.listSection.visible}, Details section visible: ${listValues.detailsSection.visible}`,
    );

    // Verify we're on the reports list page
    expect(listValues.listSection.visible).toBe(true);
    expect(listValues.detailsSection.visible).toBe(false);

    // Verify reports are visible (we created test reports in beforeEach)
    expect(listValues.reportsList.visible).toBe(true);
    expect(listValues.reportsEmpty.visible).toBe(false);

    // Find the first report's view button and click it
    const viewButton = page.locator(".view-report-btn").first();
    await expect(viewButton).toBeVisible();

    // Click to view the first report
    await viewButton.click();
    await page.waitForTimeout(1000);

    // Capture report details state
    const { screenshotPath: detailsScreenshot, values: detailsValues } =
      await captureAndExtractValues(page, "report-details-before-delete", {
        listSection: "#reports-list-section",
        detailsSection: "#report-details-section",
        reportTitle: "#report-title",
        deleteButton: "#delete-report-btn",
        reportContent: "#report-content",
      });

    console.log(`Details screenshot: ${detailsScreenshot}`);
    console.log(`Report title: ${detailsValues.reportTitle.text}`);

    // Verify we're on the details page
    expect(detailsValues.listSection.visible).toBe(false);
    expect(detailsValues.detailsSection.visible).toBe(true);
    expect(detailsValues.reportTitle.text).toBeTruthy();
    expect(detailsValues.reportTitle.text).not.toBe("Report Details");
    expect(detailsValues.deleteButton.visible).toBe(true);

    // Set up dialog handler for confirmation
    page.on("dialog", async (dialog) => {
      console.log(`Dialog message: ${dialog.message()}`);
      expect(dialog.type()).toBe("confirm");
      expect(dialog.message()).toContain("delete");
      await dialog.accept();
    });

    // Click the delete button
    console.log("Clicking delete button...");
    await page.click("#delete-report-btn");

    // Wait for deletion to complete and navigation to happen
    // The app should navigate back to the reports list
    await page.waitForTimeout(2000);

    // Capture final state after deletion
    const { screenshotPath: afterDeleteScreenshot, values: afterDeleteValues } =
      await captureAndExtractValues(page, "after-delete-navigation", {
        listSection: "#reports-list-section",
        detailsSection: "#report-details-section",
        reportsList: "#reports-list",
        reportsEmpty: "#reports-empty",
        reportTitle: "#report-title",
      });

    console.log(`After delete screenshot: ${afterDeleteScreenshot}`);
    console.log(
      `After delete - List visible: ${afterDeleteValues.listSection.visible}, Details visible: ${afterDeleteValues.detailsSection.visible}`,
    );

    // CRITICAL ASSERTION: After deletion, we should be back on the reports list page
    expect(afterDeleteValues.listSection.visible).toBe(true);
    expect(afterDeleteValues.detailsSection.visible).toBe(false);

    // The reports list or empty state should be visible
    const backOnList =
      afterDeleteValues.reportsList.visible ||
      afterDeleteValues.reportsEmpty.visible;
    expect(backOnList).toBe(true);

    // Capture final confirmation screenshot
    await captureScreenshot(page, "delete-navigation-complete");

    console.log("Delete navigation test completed successfully");
  });

  test("should navigate back to reports list after deleting from list view", async ({
    page,
  }) => {
    // Navigate to the app
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Wait for WebSocket connection
    await waitForWebSocketAndVerify(page);

    // Open menu and navigate to timelapse reports
    await page.click("#function-menu-toggle");
    await page.click('button.menu-item[data-card="timelapse-reports"]');

    // Wait for reports to load
    await page.waitForTimeout(1000);

    // Capture initial state
    const { screenshotPath: initialScreenshot, values: initialValues } =
      await captureAndExtractValues(page, "list-delete-initial", {
        reportsList: "#reports-list",
        reportsEmpty: "#reports-empty",
      });

    console.log(`Initial screenshot: ${initialScreenshot}`);

    // Verify reports are visible (we created test reports in beforeEach)
    expect(initialValues.reportsList.visible).toBe(true);
    expect(initialValues.reportsEmpty.visible).toBe(false);

    // Find the first report's delete button (on the list view)
    const deleteButton = page.locator(".delete-report-btn").first();
    await expect(deleteButton).toBeVisible();

    // Set up dialog handler for confirmation
    page.on("dialog", async (dialog) => {
      console.log(`Dialog: ${dialog.message()}`);
      await dialog.accept();
    });

    // Click delete button from list view
    await deleteButton.click();
    await page.waitForTimeout(2000);

    // Capture final state
    const { screenshotPath: afterScreenshot, values: afterValues } =
      await captureAndExtractValues(page, "list-delete-complete", {
        listSection: "#reports-list-section",
        detailsSection: "#report-details-section",
        reportsList: "#reports-list",
        reportsEmpty: "#reports-empty",
      });

    console.log(`After delete screenshot: ${afterScreenshot}`);

    // Should still be on the list page
    expect(afterValues.listSection.visible).toBe(true);
    expect(afterValues.detailsSection.visible).toBe(false);

    // Either reports list or empty state should be visible
    const onListView =
      afterValues.reportsList.visible || afterValues.reportsEmpty.visible;
    expect(onListView).toBe(true);

    console.log("List delete test completed successfully");
  });
});
