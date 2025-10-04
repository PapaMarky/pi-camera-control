/**
 * Visual Testing Helpers for Playwright
 *
 * These helpers enable Claude to "see" what's on screen through:
 * 1. Screenshots that Claude can read and analyze
 * 2. Value assertions that verify actual displayed content
 * 3. Functional tests that verify button clicks work
 */

/**
 * Capture a screenshot with a descriptive name
 * @param {Page} page - Playwright page object
 * @param {string} name - Descriptive name for the screenshot
 * @returns {Promise<string>} Path to the screenshot
 */
export async function captureScreenshot(page, name) {
  const sanitizedName = name.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = `test-results/screenshots/${sanitizedName}-${timestamp}.png`;

  await page.screenshot({
    path,
    fullPage: true,
  });

  return path;
}

/**
 * Capture screenshot and get element values for verification
 * @param {Page} page - Playwright page object
 * @param {string} testName - Name of the test
 * @param {Object} selectors - Object mapping names to CSS selectors
 * @returns {Promise<Object>} Screenshot path and element values
 */
export async function captureAndExtractValues(page, testName, selectors) {
  const screenshotPath = await captureScreenshot(page, testName);

  const values = {};
  for (const [name, selector] of Object.entries(selectors)) {
    const element = page.locator(selector);
    const count = await element.count();

    if (count > 0) {
      const isVisible = await element.isVisible().catch(() => false);
      values[name] = {
        exists: true,
        visible: isVisible,
        text: isVisible ? await element.textContent().catch(() => null) : null,
        value: isVisible ? await element.inputValue().catch(() => null) : null,
        disabled: await element.isDisabled().catch(() => null),
      };
    } else {
      values[name] = {
        exists: false,
        visible: false,
        text: null,
        value: null,
        disabled: null,
      };
    }
  }

  return { screenshotPath, values };
}

/**
 * Test button functionality by clicking and verifying result
 * @param {Page} page - Playwright page object
 * @param {string} buttonSelector - CSS selector for button
 * @param {Function} verifyFn - Async function to verify the result
 * @returns {Promise<Object>} Result of the test
 */
export async function testButtonClick(page, buttonSelector, verifyFn) {
  const button = page.locator(buttonSelector);

  // Verify button exists
  const exists = (await button.count()) > 0;
  if (!exists) {
    return { success: false, error: "Button not found" };
  }

  // Verify button is visible
  const visible = await button.isVisible();
  if (!visible) {
    return { success: false, error: "Button not visible" };
  }

  // Verify button is enabled
  const disabled = await button.isDisabled();
  if (disabled) {
    return { success: false, error: "Button is disabled" };
  }

  // Click the button
  await button.click();

  // Wait a moment for UI to update
  await page.waitForTimeout(500);

  // Verify the result
  try {
    await verifyFn(page);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Compare actual values against expected values
 * @param {Object} actual - Actual values from page
 * @param {Object} expected - Expected values
 * @returns {Object} Comparison result with differences
 */
export function compareValues(actual, expected) {
  const differences = [];

  for (const [key, expectedValue] of Object.entries(expected)) {
    const actualValue = actual[key];

    if (actualValue === undefined) {
      differences.push({
        field: key,
        expected: expectedValue,
        actual: "undefined",
        type: "missing",
      });
    } else if (typeof expectedValue === "object") {
      // Deep comparison for objects
      for (const [prop, expVal] of Object.entries(expectedValue)) {
        if (actualValue[prop] !== expVal) {
          differences.push({
            field: `${key}.${prop}`,
            expected: expVal,
            actual: actualValue[prop],
            type: "mismatch",
          });
        }
      }
    } else if (actualValue !== expectedValue) {
      differences.push({
        field: key,
        expected: expectedValue,
        actual: actualValue,
        type: "mismatch",
      });
    }
  }

  return {
    match: differences.length === 0,
    differences,
  };
}

/**
 * Wait for WebSocket connection and verify state
 * @param {Page} page - Playwright page object
 * @param {number} timeout - Max wait time in ms
 * @returns {Promise<boolean>} True if connected
 */
export async function waitForWebSocketAndVerify(page, timeout = 10000) {
  const connected = await page
    .waitForFunction(
      () => {
        return (
          window.wsManager &&
          typeof window.wsManager.isConnected === "function" &&
          window.wsManager.isConnected()
        );
      },
      { timeout },
    )
    .then(() => true)
    .catch(() => false);

  return connected;
}

/**
 * Get comprehensive UI state snapshot
 * @param {Page} page - Playwright page object
 * @returns {Promise<Object>} Complete UI state
 */
export async function getUIStateSnapshot(page) {
  return await page.evaluate(() => {
    const getElementInfo = (selector) => {
      const el = document.querySelector(selector);
      if (!el) return { exists: false };

      return {
        exists: true,
        visible: el.offsetParent !== null,
        text: el.textContent?.trim(),
        value: el.value,
        disabled: el.disabled,
        classList: Array.from(el.classList),
      };
    };

    return {
      camera: {
        status: getElementInfo("#camera-status-text"),
        ip: getElementInfo("#camera-ip"),
        battery: getElementInfo("#camera-battery"),
        mode: getElementInfo("#camera-mode"),
      },
      websocket: {
        connected: window.wsManager?.isConnected?.() || false,
      },
      buttons: {
        takePhoto: getElementInfo("#take-photo-btn"),
        startIntervalometer: getElementInfo("#start-intervalometer-btn"),
        stopIntervalometer: getElementInfo("#stop-intervalometer-btn"),
      },
      timestamp: new Date().toISOString(),
    };
  });
}
