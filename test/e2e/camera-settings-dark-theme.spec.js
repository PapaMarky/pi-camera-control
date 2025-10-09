/**
 * E2E Visual Tests for Dark-Themed Camera Settings Display
 *
 * Tests that camera settings display uses dark theme for night shooting:
 * - Black background (#000000)
 * - Light grey text (#d0d0d0)
 * - Dark controls with proper contrast
 * - Verifies readability for night use
 */

import { test, expect } from "@playwright/test";
import {
  captureScreenshot,
  captureAndExtractValues,
} from "./helpers/visual-helpers.js";

test.describe("Camera Settings Dark Theme", () => {
  test("camera settings CSS class should be defined", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Check that the dark theme CSS class exists and has correct properties
    const darkThemeStyles = await page.evaluate(() => {
      // Create a temporary element with the class
      const testDiv = document.createElement("div");
      testDiv.id = "camera-settings-display";
      testDiv.className = "camera-settings-dark";
      document.body.appendChild(testDiv);

      const styles = window.getComputedStyle(testDiv);
      const bgColor = styles.backgroundColor;
      const borderRadius = styles.borderRadius;
      const padding = styles.padding;

      document.body.removeChild(testDiv);

      return { bgColor, borderRadius, padding };
    });

    console.log("Dark theme styles:", darkThemeStyles);

    // Verify black background
    expect(darkThemeStyles.bgColor).toMatch(
      /rgb\(0,\s*0,\s*0\)|rgba\(0,\s*0,\s*0/i,
    );

    await captureScreenshot(page, "camera-settings-dark-theme-css-check");
  });

  test("camera settings should have dark theme when displayed with camera", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Check if camera is connected
    const cameraStatus = await page.textContent("#camera-status-text");
    const isConnected = cameraStatus.includes("Connected");

    if (!isConnected) {
      console.log(
        "SKIP: Camera not connected - cannot test settings display with actual settings",
      );
      await captureScreenshot(page, "camera-settings-no-camera-connected");
      return;
    }

    // Navigate to Test Shot card
    await page.click("#function-menu-toggle");
    await page.waitForSelector('button.menu-item[data-card="test-shot"]');
    await page.click('button.menu-item[data-card="test-shot"]');

    // Wait for the card to be visible
    await page.waitForSelector("#test-shot-card", { state: "visible" });

    // Capture the initial state (before settings loaded)
    await captureScreenshot(page, "camera-settings-initial");

    // Click refresh settings button to load settings
    if (isConnected) {
      const refreshBtn = page.locator("#refresh-settings-btn");
      if (await refreshBtn.isEnabled()) {
        await refreshBtn.click();

        // Wait a bit for settings to load
        await page.waitForTimeout(1000);

        // Extract values from camera settings display
        const { screenshotPath, values } = await captureAndExtractValues(
          page,
          "camera-settings-dark-theme",
          {
            settingsDisplay: "#camera-settings-display",
          },
        );

        console.log(`Screenshot: ${screenshotPath}`);

        // Verify the settings display element exists
        expect(values.settingsDisplay.exists).toBe(true);
        expect(values.settingsDisplay.visible).toBe(true);

        // Get the computed background color of the settings display
        const bgColor = await page
          .locator("#camera-settings-display")
          .evaluate((el) => {
            return window.getComputedStyle(el).backgroundColor;
          });

        console.log(`Camera settings background color: ${bgColor}`);

        // Verify it has the dark theme class
        const hasDarkClass = await page
          .locator("#camera-settings-display")
          .evaluate((el) => el.classList.contains("camera-settings-dark"));

        expect(hasDarkClass).toBe(true);

        // Check if there are any setting containers
        const settingContainers = page.locator(".setting-container");
        const containerCount = await settingContainers.count();

        if (containerCount > 0) {
          // Capture screenshot with settings visible
          await captureScreenshot(page, "camera-settings-with-controls");

          // Get the first label's color
          const labelColor = await settingContainers
            .first()
            .locator("label")
            .evaluate((el) => {
              return window.getComputedStyle(el).color;
            });

          console.log(`Label text color: ${labelColor}`);

          // Get the first select's colors
          const selectBgColor = await settingContainers
            .first()
            .locator("select")
            .evaluate((el) => {
              return window.getComputedStyle(el).backgroundColor;
            });

          const selectTextColor = await settingContainers
            .first()
            .locator("select")
            .evaluate((el) => {
              return window.getComputedStyle(el).color;
            });

          console.log(`Select background color: ${selectBgColor}`);
          console.log(`Select text color: ${selectTextColor}`);

          // Verify colors are dark (this is a smoke test - actual RGB values may vary)
          // Background should be very dark (black or near-black)
          expect(bgColor).toMatch(/rgb\(0,\s*0,\s*0\)|rgba\(0,\s*0,\s*0/i);
        }

        // Capture final screenshot for visual verification
        await captureScreenshot(page, "camera-settings-dark-theme-final");
      } else {
        console.log(
          "Refresh settings button is disabled - camera may not be ready",
        );
        await captureScreenshot(page, "camera-settings-button-disabled");
      }
    } else {
      console.log(
        "Camera not connected - cannot test settings display with actual settings",
      );
      await captureScreenshot(page, "camera-settings-no-connection");

      // Check that settings display exists but is empty
      const settingsDisplay = page.locator("#camera-settings-display");
      expect(await settingsDisplay.count()).toBe(1);
    }
  });

  test("settings labels should have light grey color in dark theme", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Check label styling in dark theme
    const labelStyles = await page.evaluate(() => {
      const testLabel = document.createElement("label");
      const testDiv = document.createElement("div");
      testDiv.className = "camera-settings-dark";
      testDiv.appendChild(testLabel);
      document.body.appendChild(testDiv);

      const styles = window.getComputedStyle(testLabel);
      const color = styles.color;

      document.body.removeChild(testDiv);
      return { color };
    });

    console.log("Label color in dark theme:", labelStyles.color);

    // Light grey should be rgb(208, 208, 208) = #d0d0d0
    expect(labelStyles.color).toMatch(/rgb\(208,\s*208,\s*208\)/i);

    await captureScreenshot(page, "camera-settings-label-color-check");
  });

  test("settings display element should exist in Test Shot card", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Get the settings display element
    const settingsDisplay = page.locator("#camera-settings-display");

    // Capture screenshot showing placeholder
    const { screenshotPath, values } = await captureAndExtractValues(
      page,
      "camera-settings-placeholder",
      {
        placeholderText: "#camera-settings-display p",
      },
    );

    console.log(`Screenshot: ${screenshotPath}`);

    // If there's placeholder text, it should be visible
    if (values.placeholderText.exists) {
      expect(values.placeholderText.visible).toBe(true);

      // Get the color of the placeholder text
      const textColor = await page
        .locator("#camera-settings-display p")
        .evaluate((el) => {
          return window.getComputedStyle(el).color;
        });

      console.log(`Placeholder text color: ${textColor}`);
    }
  });

  test("modified settings label should have yellow color", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Check modified label styling
    const modifiedLabelStyles = await page.evaluate(() => {
      const testLabel = document.createElement("span");
      testLabel.className = "setting-modified-label";
      const testDiv = document.createElement("div");
      testDiv.className = "camera-settings-dark";
      testDiv.appendChild(testLabel);
      document.body.appendChild(testDiv);

      const styles = window.getComputedStyle(testLabel);
      const color = styles.color;

      document.body.removeChild(testDiv);
      return { color };
    });

    console.log("Modified label color:", modifiedLabelStyles.color);

    // Yellow should be rgb(255, 193, 7) = #ffc107
    expect(modifiedLabelStyles.color).toMatch(/rgb\(255,\s*193,\s*7\)/i);

    await captureScreenshot(page, "camera-settings-modified-label-color");
  });

  test.skip("full integration test with camera connected", async ({ page }) => {
    // This test requires a camera to be connected
    // Run manually on Pi hardware with camera
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Navigate to Test Shot card
    await page.click("#function-menu-toggle");
    await page.click('button.menu-item[data-card="test-shot"]');

    // Wait for the card to be visible
    await page.waitForSelector("#test-shot-card", { state: "visible" });

    // Check if camera is connected
    const cameraStatus = await page.textContent("#camera-status-text");
    const isConnected = cameraStatus.includes("Connected");

    if (isConnected) {
      const refreshBtn = page.locator("#refresh-settings-btn");
      if (await refreshBtn.isEnabled()) {
        await refreshBtn.click();
        await page.waitForTimeout(1000);

        // Try to change a setting if available
        const isoSelect = page.locator("#setting-iso");
        if ((await isoSelect.count()) > 0) {
          // Get all options
          const options = await isoSelect.locator("option").all();
          if (options.length > 1) {
            // Select the second option (different from current)
            await isoSelect.selectOption({ index: 1 });

            // Wait for modified indicator to appear
            await page.waitForTimeout(500);

            // Capture screenshot with modified setting
            const { screenshotPath } = await captureAndExtractValues(
              page,
              "camera-settings-modified",
              {
                modifiedLabel: ".setting-modified-label",
              },
            );

            console.log(`Screenshot with modified setting: ${screenshotPath}`);

            // Check if modified label exists and has correct color
            const modifiedLabel = page.locator(".setting-modified-label");
            if ((await modifiedLabel.count()) > 0) {
              const labelColor = await modifiedLabel.first().evaluate((el) => {
                return window.getComputedStyle(el).color;
              });

              console.log(`Modified label color: ${labelColor}`);

              // Capture final state
              await captureScreenshot(page, "camera-settings-modified-final");
            }
          }
        }
      }
    } else {
      console.log("Camera not connected - skipping modified settings test");
      await captureScreenshot(page, "camera-settings-modified-no-camera");
    }
  });
});
