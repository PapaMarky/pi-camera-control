/**
 * Visual E2E Test for Session Completion UI
 *
 * Tests the new auto-save session completion flow where reports are auto-saved
 * and users just click "Done" to return to intervalometer.
 */
import { test, expect } from "@playwright/test";
import {
  captureAndExtractValues,
  captureScreenshot,
  testButtonClick,
} from "./helpers/visual-helpers.js";

test.describe("Session Completion Visual Tests", () => {
  test("should display done button and completion elements", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Show the completion card for testing
    await page.evaluate(() => {
      document.getElementById("session-completion-card").style.display =
        "block";
    });

    // Capture and verify elements exist
    const { screenshotPath, values } = await captureAndExtractValues(
      page,
      "session-completion-elements",
      {
        doneButton: "#completion-done-btn",
        titleInput: "#completion-title-input",
        completionSummary: "#completion-summary",
      },
    );

    console.log(`Screenshot: ${screenshotPath}`);

    // Verify elements exist and are visible
    expect(values.doneButton.exists).toBe(true);
    expect(values.doneButton.visible).toBe(true);
    expect(values.titleInput.exists).toBe(true);
    expect(values.completionSummary.exists).toBe(true);

    // Verify done button has correct text
    expect(values.doneButton.text).toContain("Done");
  });

  test("should NOT have old save/discard buttons", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Verify old buttons don't exist
    const saveBtn = page.locator("#save-session-btn");
    const discardBtn = page.locator("#discard-session-btn");

    expect(await saveBtn.count()).toBe(0);
    expect(await discardBtn.count()).toBe(0);
  });

  test("done button should be full width primary button", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const doneBtn = page.locator("#completion-done-btn");

    // Check button styling
    const buttonClasses = await doneBtn.getAttribute("class");
    expect(buttonClasses).toContain("primary-btn");

    // Check width
    const buttonStyle = await doneBtn.getAttribute("style");
    expect(buttonStyle).toContain("width: 100%");
  });

  test("should simulate session completion and verify UI", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Manually show the completion card to simulate a completed session
    await page.evaluate(() => {
      // Hide all cards
      document.querySelectorAll(".function-card").forEach((card) => {
        card.style.display = "none";
      });

      // Show completion card
      const completionCard = document.getElementById("session-completion-card");
      completionCard.style.display = "block";

      // Populate with test data
      const summaryElement = document.getElementById("completion-summary");
      summaryElement.innerHTML = `
        <div class="completion-header">
          <div class="completion-status completed">
            <span class="status-icon">✓</span>
            <span class="status-text">Session Complete</span>
          </div>
          <h4>Test Timelapse Session</h4>
        </div>

        <div class="completion-stats">
          <div class="completion-stat">
            <span class="stat-label">Duration:</span>
            <span class="stat-value">5m 30s</span>
          </div>
          <div class="completion-stat">
            <span class="stat-label">Images Captured:</span>
            <span class="stat-value">33</span>
          </div>
          <div class="completion-stat">
            <span class="stat-label">Success Rate:</span>
            <span class="stat-value">100%</span>
          </div>
        </div>

        <div class="completion-stats">
          <div class="completion-stat">
            <span class="stat-label">Interval:</span>
            <span class="stat-value">10s</span>
          </div>
          <div class="completion-stat">
            <span class="stat-label">Stop Criteria:</span>
            <span class="stat-value">Manual stop</span>
          </div>
        </div>

        <div class="completion-reason">
          <strong>Reason:</strong> User stopped session
        </div>
      `;

      // Set title
      const titleInput = document.getElementById("completion-title-input");
      titleInput.value = "Test Timelapse Session";
    });

    // Capture the completion screen
    const { screenshotPath, values } = await captureAndExtractValues(
      page,
      "session-completion-visible",
      {
        statusText: ".completion-status .status-text",
        sessionTitle: ".completion-header h4",
        doneButton: "#completion-done-btn",
        titleInput: "#completion-title-input",
      },
    );

    console.log(`Completion screen screenshot: ${screenshotPath}`);

    // Verify all values are displayed correctly
    expect(values.statusText.visible).toBe(true);
    expect(values.statusText.text).toContain("Session Complete");

    expect(values.sessionTitle.visible).toBe(true);
    expect(values.sessionTitle.text).toBe("Test Timelapse Session");

    // Verify stats are present in the summary (don't need to check each individually)
    const summaryText = await page.locator("#completion-summary").textContent();
    expect(summaryText).toContain("5m 30s");
    expect(summaryText).toContain("33");
    expect(summaryText).toContain("100%");

    expect(values.doneButton.visible).toBe(true);
    expect(values.doneButton.disabled).toBe(false);

    expect(values.titleInput.visible).toBe(true);
    expect(values.titleInput.value).toBe("Test Timelapse Session");

    // Capture final screenshot
    await captureScreenshot(page, "session-completion-final-state");
  });

  test("done button should navigate to intervalometer", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Show completion card
    await page.evaluate(() => {
      document.querySelectorAll(".function-card").forEach((card) => {
        card.style.display = "none";
      });
      document.getElementById("session-completion-card").style.display =
        "block";
    });

    // Capture before click
    await captureScreenshot(page, "before-done-click");

    // Click done button and verify navigation
    const result = await testButtonClick(
      page,
      "#completion-done-btn",
      async (page) => {
        // Verify completion card is hidden
        const completionCard = page.locator("#session-completion-card");
        const isHidden = await completionCard.isHidden();
        expect(isHidden).toBe(true);

        // Verify intervalometer card is shown (or wait for it)
        const intervalometerCard = page.locator("#intervalometer-card");
        await page.waitForTimeout(500); // Give time for navigation
        const isVisible = await intervalometerCard.isVisible();
        expect(isVisible).toBe(true);
      },
    );

    expect(result.success).toBe(true);

    // Capture after navigation
    await captureScreenshot(page, "after-done-click-intervalometer");
  });

  test("title input should be editable", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Show completion card
    await page.evaluate(() => {
      document.getElementById("session-completion-card").style.display =
        "block";
    });

    const titleInput = page.locator("#completion-title-input");

    // Set a value
    await titleInput.fill("My Custom Title");

    // Verify the value was set
    const value = await titleInput.inputValue();
    expect(value).toBe("My Custom Title");

    // Capture screenshot showing edited title
    const screenshotPath = await captureScreenshot(
      page,
      "session-completion-edited-title",
    );
    console.log(`Edited title screenshot: ${screenshotPath}`);
  });
});
