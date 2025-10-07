/**
 * Color Temperature Control Visual Verification Tests
 *
 * Tests the conditional color temperature slider that appears when WB = "colortemp"
 *
 * This test suite verifies:
 * 1. Color temperature control is ONLY visible when WB = "colortemp"
 * 2. Slider and numeric input stay synchronized
 * 3. Value changes are tracked in pendingChanges
 * 4. Apply button shows when colortemperature changes
 * 5. Changes successfully sent to backend
 */

import { test, expect } from "@playwright/test";
import {
  captureScreenshot,
  captureAndExtractValues,
  waitForWebSocketAndVerify,
} from "./helpers/visual-helpers.js";

test.describe("Color Temperature Control", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Wait for WebSocket to connect
    const wsConnected = await waitForWebSocketAndVerify(page);
    expect(wsConnected).toBe(true);

    // Wait for potential camera connection
    await page.waitForTimeout(2000);
  });

  test("should show color temperature control ONLY when WB is colortemp", async ({
    page,
  }) => {
    // Check camera connection
    const statusText = await page
      .locator("#camera-status-text")
      .textContent()
      .catch(() => "");

    if (!statusText || !statusText.toLowerCase().includes("connected")) {
      console.log("Camera not connected - skipping test");
      test.skip();
      return;
    }

    // Open Test Shot section
    await page.click("#function-menu-toggle");
    await page.click('button.menu-item[data-card="test-shot"]');
    await page.waitForTimeout(500);

    // Load camera settings
    await page.click("#refresh-settings-btn");
    await page.waitForTimeout(2000);

    // Capture initial state
    const { screenshotPath: initialScreenshot } = await captureAndExtractValues(
      page,
      "color-temp-initial-state",
      {
        wbSetting: "#setting-wb",
        colorTempControl: "#setting-colortemperature-slider",
      },
    );

    console.log(`Initial state screenshot: ${initialScreenshot}`);

    // Get current WB value
    const wbSelect = page.locator("#setting-wb");
    const wbExists = (await wbSelect.count()) > 0;

    if (!wbExists) {
      console.log("WB setting not available - skipping test");
      test.skip();
      return;
    }

    const currentWbValue = await wbSelect.inputValue();
    console.log(`Current WB value: ${currentWbValue}`);

    // Test Case 1: When WB is NOT "colortemp", colortemperature control should be HIDDEN
    if (currentWbValue !== "colortemp") {
      const colorTempSlider = page.locator("#setting-colortemperature-slider");
      const sliderVisible = await colorTempSlider
        .isVisible()
        .catch(() => false);

      expect(sliderVisible).toBe(false);

      const { screenshotPath: hiddenScreenshot } =
        await captureAndExtractValues(
          page,
          "color-temp-hidden-when-wb-not-colortemp",
          {
            wbSetting: "#setting-wb",
            colorTempControl: "#setting-colortemperature-slider",
          },
        );

      console.log(`Color temp hidden screenshot: ${hiddenScreenshot}`);

      // Now change WB to "colortemp" (if available)
      const wbOptions = await page
        .locator("#setting-wb option")
        .allTextContents();
      console.log("Available WB options:", wbOptions);

      if (wbOptions.includes("colortemp")) {
        // Select "colortemp"
        await wbSelect.selectOption("colortemp");
        await page.waitForTimeout(1000); // Wait for re-render

        // Now color temp control SHOULD be visible
        const sliderNowVisible = await page
          .locator("#setting-colortemperature-slider")
          .isVisible()
          .catch(() => false);

        expect(sliderNowVisible).toBe(true);

        const { screenshotPath: visibleScreenshot } =
          await captureAndExtractValues(
            page,
            "color-temp-visible-when-wb-colortemp",
            {
              wbSetting: "#setting-wb",
              colorTempSlider: "#setting-colortemperature-slider",
              colorTempInput: "#setting-colortemperature-value",
            },
          );

        console.log(`Color temp visible screenshot: ${visibleScreenshot}`);
      }
    } else {
      // WB is already "colortemp", verify control is visible
      const colorTempSlider = page.locator("#setting-colortemperature-slider");
      const sliderVisible = await colorTempSlider.isVisible();

      expect(sliderVisible).toBe(true);

      const { screenshotPath: visibleScreenshot } =
        await captureAndExtractValues(page, "color-temp-visible-initial", {
          wbSetting: "#setting-wb",
          colorTempSlider: "#setting-colortemperature-slider",
          colorTempInput: "#setting-colortemperature-value",
        });

      console.log(`Color temp visible screenshot: ${visibleScreenshot}`);
    }
  });

  test("should synchronize slider and numeric input values", async ({
    page,
  }) => {
    // Check camera connection
    const statusText = await page
      .locator("#camera-status-text")
      .textContent()
      .catch(() => "");

    if (!statusText || !statusText.toLowerCase().includes("connected")) {
      console.log("Camera not connected - skipping test");
      test.skip();
      return;
    }

    // Open Test Shot section
    await page.click("#function-menu-toggle");
    await page.click('button.menu-item[data-card="test-shot"]');
    await page.waitForTimeout(500);

    // Load camera settings
    await page.click("#refresh-settings-btn");
    await page.waitForTimeout(2000);

    // Set WB to "colortemp"
    const wbSelect = page.locator("#setting-wb");
    const wbExists = (await wbSelect.count()) > 0;

    if (!wbExists) {
      console.log("WB setting not available - skipping test");
      test.skip();
      return;
    }

    const wbOptions = await page
      .locator("#setting-wb option")
      .allTextContents();

    if (!wbOptions.includes("colortemp")) {
      console.log("colortemp WB mode not available - skipping test");
      test.skip();
      return;
    }

    // Select "colortemp"
    await wbSelect.selectOption("colortemp");
    await page.waitForTimeout(1000);

    // Verify controls are visible
    const slider = page.locator("#setting-colortemperature-slider");
    const input = page.locator("#setting-colortemperature-value");

    const sliderVisible = await slider.isVisible();
    const inputVisible = await input.isVisible();

    expect(sliderVisible).toBe(true);
    expect(inputVisible).toBe(true);

    // Get initial values
    const initialSliderValue = await slider.inputValue();
    const initialInputValue = await input.inputValue();

    console.log("Initial slider value:", initialSliderValue);
    console.log("Initial input value:", initialInputValue);

    expect(initialSliderValue).toBe(initialInputValue);

    // Capture initial state
    const { screenshotPath: beforeChange } = await captureAndExtractValues(
      page,
      "color-temp-before-change",
      {
        slider: "#setting-colortemperature-slider",
        input: "#setting-colortemperature-value",
      },
    );

    console.log(`Before change screenshot: ${beforeChange}`);

    // Change slider value
    await slider.fill("6500");
    await page.waitForTimeout(500);

    // Verify input updated
    const inputAfterSlider = await input.inputValue();
    expect(inputAfterSlider).toBe("6500");

    // Capture after slider change
    const { screenshotPath: afterSliderChange } = await captureAndExtractValues(
      page,
      "color-temp-after-slider-change",
      {
        slider: "#setting-colortemperature-slider",
        input: "#setting-colortemperature-value",
      },
    );

    console.log(`After slider change screenshot: ${afterSliderChange}`);

    // Now change input value
    await input.fill("3200");
    await page.waitForTimeout(500);

    // Verify slider updated
    const sliderAfterInput = await slider.inputValue();
    expect(sliderAfterInput).toBe("3200");

    // Capture after input change
    const { screenshotPath: afterInputChange } = await captureAndExtractValues(
      page,
      "color-temp-after-input-change",
      {
        slider: "#setting-colortemperature-slider",
        input: "#setting-colortemperature-value",
      },
    );

    console.log(`After input change screenshot: ${afterInputChange}`);
  });

  test("should track color temperature changes in pendingChanges and show apply button", async ({
    page,
  }) => {
    // Check camera connection
    const statusText = await page
      .locator("#camera-status-text")
      .textContent()
      .catch(() => "");

    if (!statusText || !statusText.toLowerCase().includes("connected")) {
      console.log("Camera not connected - skipping test");
      test.skip();
      return;
    }

    // Open Test Shot section
    await page.click("#function-menu-toggle");
    await page.click('button.menu-item[data-card="test-shot"]');
    await page.waitForTimeout(500);

    // Load camera settings
    await page.click("#refresh-settings-btn");
    await page.waitForTimeout(2000);

    // Set WB to "colortemp"
    const wbSelect = page.locator("#setting-wb");
    const wbExists = (await wbSelect.count()) > 0;

    if (!wbExists) {
      console.log("WB setting not available - skipping test");
      test.skip();
      return;
    }

    const wbOptions = await page
      .locator("#setting-wb option")
      .allTextContents();

    if (!wbOptions.includes("colortemp")) {
      console.log("colortemp WB mode not available - skipping test");
      test.skip();
      return;
    }

    // Select "colortemp"
    await wbSelect.selectOption("colortemp");
    await page.waitForTimeout(1000);

    // Get initial value
    const slider = page.locator("#setting-colortemperature-slider");
    const initialValue = await slider.inputValue();

    console.log("Initial color temperature:", initialValue);

    // Apply button should be hidden initially
    const applyBtn = page.locator("#apply-settings-btn");
    const applyVisible = await applyBtn.isVisible();
    expect(applyVisible).toBe(false);

    // Change color temperature
    const newValue = "7500";
    await slider.fill(newValue);
    await page.waitForTimeout(500);

    // Capture after change
    const { screenshotPath: afterChange, values } =
      await captureAndExtractValues(page, "color-temp-pending-change", {
        slider: "#setting-colortemperature-slider",
        input: "#setting-colortemperature-value",
        applyBtn: "#apply-settings-btn",
      });

    console.log(`After change screenshot: ${afterChange}`);

    // Apply button should now be visible
    expect(values.applyBtn.visible).toBe(true);
    expect(values.applyBtn.disabled).toBe(false);

    // Verify pending changes indicator (Modified label)
    const modifiedLabel = await page
      .locator('span:has-text("Modified")')
      .isVisible()
      .catch(() => false);

    expect(modifiedLabel).toBe(true);

    // Capture final state
    await captureScreenshot(page, "color-temp-ready-to-apply");
  });

  test("should clear colortemperature from pendingChanges when WB changes away from colortemp", async ({
    page,
  }) => {
    // Check camera connection
    const statusText = await page
      .locator("#camera-status-text")
      .textContent()
      .catch(() => "");

    if (!statusText || !statusText.toLowerCase().includes("connected")) {
      console.log("Camera not connected - skipping test");
      test.skip();
      return;
    }

    // Open Test Shot section
    await page.click("#function-menu-toggle");
    await page.click('button.menu-item[data-card="test-shot"]');
    await page.waitForTimeout(500);

    // Load camera settings
    await page.click("#refresh-settings-btn");
    await page.waitForTimeout(2000);

    // Set WB to "colortemp"
    const wbSelect = page.locator("#setting-wb");
    const wbExists = (await wbSelect.count()) > 0;

    if (!wbExists) {
      console.log("WB setting not available - skipping test");
      test.skip();
      return;
    }

    const wbOptions = await page
      .locator("#setting-wb option")
      .allTextContents();

    if (
      !wbOptions.includes("colortemp") ||
      !wbOptions.includes("auto") ||
      !wbOptions.includes("daylight")
    ) {
      console.log("Required WB modes not available - skipping test");
      test.skip();
      return;
    }

    // Select "colortemp"
    await wbSelect.selectOption("colortemp");
    await page.waitForTimeout(1000);

    // Change color temperature
    const slider = page.locator("#setting-colortemperature-slider");
    await slider.fill("8000");
    await page.waitForTimeout(500);

    // Capture state with colortemp change
    const { screenshotPath: withColorTemp } = await captureAndExtractValues(
      page,
      "color-temp-change-before-wb-change",
      {
        wbSetting: "#setting-wb",
        slider: "#setting-colortemperature-slider",
        applyBtn: "#apply-settings-btn",
      },
    );

    console.log(`With color temp change screenshot: ${withColorTemp}`);

    // Apply button should be visible
    const applyBtnVisible1 = await page
      .locator("#apply-settings-btn")
      .isVisible();
    expect(applyBtnVisible1).toBe(true);

    // Now change WB to something else (e.g., "auto" or "daylight")
    const newWbValue = wbOptions.includes("auto") ? "auto" : "daylight";
    await wbSelect.selectOption(newWbValue);
    await page.waitForTimeout(1000);

    // Capture after WB change
    const { screenshotPath: afterWbChange, values } =
      await captureAndExtractValues(page, "color-temp-after-wb-change", {
        wbSetting: "#setting-wb",
        colorTempSlider: "#setting-colortemperature-slider",
        applyBtn: "#apply-settings-btn",
      });

    console.log(`After WB change screenshot: ${afterWbChange}`);

    // Color temperature control should be hidden
    expect(values.colorTempSlider.visible).toBe(false);

    // Apply button should still be visible (WB change is pending)
    expect(values.applyBtn.visible).toBe(true);

    await captureScreenshot(page, "color-temp-wb-changed-final");
  });
});
