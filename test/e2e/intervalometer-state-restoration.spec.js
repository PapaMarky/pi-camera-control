import { test, expect } from "@playwright/test";
import {
  captureScreenshot,
  captureAndExtractValues,
} from "./helpers/visual-helpers.js";

test.describe("Intervalometer State Restoration", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Mock a camera connection to enable intervalometer button
    await page.evaluate(() => {
      if (window.cameraManager) {
        window.cameraManager.status.connected = true;
        window.cameraManager.status.ip = "192.168.1.100";
        window.cameraManager.updateCameraStatusDisplay({
          connected: true,
          ip: "192.168.1.100",
        });
        window.cameraManager.updateHeaderStatusIndicators({ connected: true });
      }
    });

    await page.waitForTimeout(500);
  });

  test("should restore completion screen after navigating away and back", async ({
    page,
  }) => {
    // Step 1: Navigate to intervalometer and simulate a completed session
    console.log("Step 1: Navigate to intervalometer");

    const intervalometerMenuItem = page.locator('[data-card="intervalometer"]');
    await intervalometerMenuItem.click();
    await page.waitForTimeout(500);

    console.log("Step 2: Simulate completed session");

    // Simulate the TimelapseUI showing completion screen
    await page.evaluate(() => {
      // Create mock session completion data
      const mockCompletionData = {
        title: "Test Timelapse Session",
        reason: "Reached target number of shots",
        stats: {
          shotsTaken: 10,
          shotsSuccessful: 9,
          shotsFailed: 1,
          startTime: new Date(Date.now() - 600000).toISOString(),
          endTime: new Date().toISOString(),
        },
        options: {
          interval: 30,
          stopCondition: "stop-after",
          totalShots: 10,
        },
      };

      // Simulate session stopped event
      if (window.timelapseUI) {
        window.timelapseUI.handleSessionStopped(mockCompletionData);
      }
    });

    // Wait for completion screen to appear
    await page.waitForTimeout(500);

    // Capture completion screen state
    const { screenshotPath: completionScreenshot, values: completionValues } =
      await captureAndExtractValues(page, "completion-screen-initial", {
        completionCard: "#session-completion-card",
        completionTitle: "#session-completion-card h4",
        doneButton: "#completion-done-btn",
      });

    console.log(`Completion screen captured: ${completionScreenshot}`);

    // Verify completion screen is shown
    expect(completionValues.completionCard.visible).toBe(true);
    expect(completionValues.completionTitle.text).toContain(
      "Test Timelapse Session",
    );
    expect(completionValues.doneButton.visible).toBe(true);

    await captureScreenshot(page, "step1-completion-screen-visible");

    // Step 3: Navigate away to controller status page
    console.log("Step 3: Navigate to controller status");

    const statusMenuItem = page.locator('[data-card="controller-status"]');
    await statusMenuItem.click();
    await page.waitForTimeout(300);

    const { screenshotPath: statusScreenshot } = await captureAndExtractValues(
      page,
      "controller-status-page",
      {
        statusCard: "#controller-status-card",
      },
    );

    console.log(`Status page captured: ${statusScreenshot}`);
    await captureScreenshot(page, "step3-navigated-to-status");

    // Step 4: Navigate back to intervalometer
    console.log("Step 4: Navigate back to intervalometer");

    await intervalometerMenuItem.click();
    await page.waitForTimeout(300);

    // Step 5: Verify completion screen is restored
    console.log("Step 5: Verify completion screen restored");

    // Simulate status_update with completed session data
    await page.evaluate(() => {
      // Simulate what would happen on status_update with stopped session
      const mockStatusUpdate = {
        intervalometer: {
          state: "stopped",
          stats: {
            shotsTaken: 10,
            shotsSuccessful: 9,
            shotsFailed: 1,
            startTime: new Date(Date.now() - 600000).toISOString(),
            endTime: new Date().toISOString(),
          },
          options: {
            interval: 30,
            stopCondition: "stop-after",
            totalShots: 10,
          },
        },
      };

      // This should trigger the state restoration
      if (window.cameraManager) {
        window.cameraManager.handleStatusUpdate(mockStatusUpdate);
      }
    });

    await page.waitForTimeout(500);

    // Capture and verify the restored state
    const { screenshotPath: restoredScreenshot, values: restoredValues } =
      await captureAndExtractValues(page, "completion-screen-restored", {
        completionCard: "#session-completion-card",
        completionTitle: "#session-completion-card h4",
        doneButton: "#completion-done-btn",
        intervalometerSetup: "#intervalometer-setup",
        intervalometerProgress: "#intervalometer-progress",
      });

    console.log(`Restored state captured: ${restoredScreenshot}`);

    // THIS IS THE BUG: Currently completion screen is NOT visible
    // After fix, this should pass
    expect(restoredValues.completionCard.visible).toBe(true);
    expect(restoredValues.completionTitle.visible).toBe(true);
    expect(restoredValues.doneButton.visible).toBe(true);

    // Setup and progress should NOT be visible
    expect(restoredValues.intervalometerSetup.visible).toBe(false);
    expect(restoredValues.intervalometerProgress.visible).toBe(false);

    await captureScreenshot(page, "step4-completion-screen-should-be-visible");
  });

  test("should not show duplicate completion screens on multiple status updates", async ({
    page,
  }) => {
    console.log(
      "Test: Should not show duplicate completion screens on repeated status updates",
    );

    // Navigate to intervalometer first
    const intervalometerMenuItem = page.locator('[data-card="intervalometer"]');
    await intervalometerMenuItem.click();
    await page.waitForTimeout(500);

    // Simulate a completed session
    await page.evaluate(() => {
      const mockCompletionData = {
        title: "Test Session - No Duplicates",
        reason: "Manual stop",
        stats: {
          shotsTaken: 5,
          shotsSuccessful: 5,
          shotsFailed: 0,
          startTime: new Date(Date.now() - 300000).toISOString(),
          endTime: new Date().toISOString(),
        },
        options: {
          interval: 60,
          stopCondition: "unlimited",
        },
      };

      if (window.timelapseUI) {
        window.timelapseUI.handleSessionStopped(mockCompletionData);
      }
    });

    await page.waitForTimeout(500);

    // Capture initial completion screen
    const { screenshotPath: initial } = await captureAndExtractValues(
      page,
      "initial-completion",
      {
        completionCard: "#session-completion-card",
      },
    );

    console.log(`Initial completion: ${initial}`);

    // Now send multiple status updates with the same completed session
    for (let i = 0; i < 3; i++) {
      console.log(`Sending status update ${i + 1}`);

      await page.evaluate(() => {
        const mockStatusUpdate = {
          intervalometer: {
            state: "stopped",
            stats: {
              shotsTaken: 5,
              shotsSuccessful: 5,
              shotsFailed: 0,
              startTime: new Date(Date.now() - 300000).toISOString(),
              endTime: new Date().toISOString(),
            },
            options: {
              interval: 60,
              stopCondition: "unlimited",
            },
          },
        };

        if (window.cameraManager) {
          window.cameraManager.handleStatusUpdate(mockStatusUpdate);
        }
      });

      await page.waitForTimeout(200);
    }

    // Verify completion screen is STILL shown (not duplicated or hidden)
    const { screenshotPath: afterUpdates, values } =
      await captureAndExtractValues(page, "after-multiple-updates", {
        completionCard: "#session-completion-card",
        completionTitle: "#session-completion-card h4",
      });

    console.log(`After updates: ${afterUpdates}`);

    // Should still be visible, not duplicated
    expect(values.completionCard.visible).toBe(true);
    expect(values.completionTitle.text).toContain(
      "Test Session - No Duplicates",
    );

    await captureScreenshot(page, "no-duplicate-completion-screens");
  });

  test("should show setup screen when no completed session exists", async ({
    page,
  }) => {
    console.log("Test: Show setup screen when no active session");

    // Navigate to intervalometer (should show setup by default)
    const intervalometerMenuItem = page.locator('[data-card="intervalometer"]');
    await intervalometerMenuItem.click();
    await page.waitForTimeout(500);

    const { screenshotPath: setupScreenshot, values: setupValues } =
      await captureAndExtractValues(page, "setup-screen-no-session", {
        setupSection: "#intervalometer-setup",
        progressSection: "#intervalometer-progress",
        completionCard: "#session-completion-card",
      });

    console.log(`Setup screen: ${setupScreenshot}`);

    // Setup should be visible
    expect(setupValues.setupSection.visible).toBe(true);
    // Progress should NOT be visible
    expect(setupValues.progressSection.visible).toBe(false);
    // Completion card should NOT be visible
    expect(setupValues.completionCard.visible).toBe(false);

    await captureScreenshot(page, "setup-screen-visible-no-session");

    // Navigate away
    const statusMenuItem = page.locator('[data-card="controller-status"]');
    await statusMenuItem.click();
    await page.waitForTimeout(300);

    // Navigate back
    await intervalometerMenuItem.click();
    await page.waitForTimeout(300);

    // Verify setup is still shown (no session to restore)
    const { screenshotPath: restoredSetup, values: restoredValues } =
      await captureAndExtractValues(page, "setup-screen-restored", {
        setupSection: "#intervalometer-setup",
        progressSection: "#intervalometer-progress",
        completionCard: "#session-completion-card",
      });

    console.log(`Restored setup: ${restoredSetup}`);

    expect(restoredValues.setupSection.visible).toBe(true);
    expect(restoredValues.progressSection.visible).toBe(false);
    expect(restoredValues.completionCard.visible).toBe(false);

    await captureScreenshot(page, "setup-screen-still-visible");
  });
});
