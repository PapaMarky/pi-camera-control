/**
 * Playwright Test Helpers for Pi Camera Control
 */

/**
 * Wait for WebSocket connection to be established
 * @param {Page} page - Playwright page object
 * @param {number} timeout - Timeout in ms (default 10000)
 */
export async function waitForWebSocketConnection(page, timeout = 10000) {
  await page.waitForFunction(
    () => window.wsManager && window.wsManager.isConnected(),
    { timeout },
  );
}

/**
 * Wait for camera to be detected and connected
 * @param {Page} page - Playwright page object
 * @param {number} timeout - Timeout in ms (default 15000)
 */
export async function waitForCameraConnection(page, timeout = 15000) {
  await page.waitForFunction(
    () => {
      const statusText = document.querySelector(".camera-status-text");
      return statusText && statusText.textContent.includes("Connected");
    },
    { timeout },
  );
}

/**
 * Get the latest log entry from the activity log
 * @param {Page} page - Playwright page object
 * @returns {Promise<string>} Log message text
 */
export async function getLatestLogEntry(page) {
  return await page.evaluate(() => {
    const log = document.getElementById("activity-log");
    const latestEntry = log?.firstElementChild;
    return latestEntry?.querySelector(".log-message")?.textContent || "";
  });
}

/**
 * Get all log entries of a specific type
 * @param {Page} page - Playwright page object
 * @param {string} type - Log type (success, error, warning, info)
 * @returns {Promise<string[]>} Array of log messages
 */
export async function getLogEntriesByType(page, type) {
  return await page.evaluate((logType) => {
    const log = document.getElementById("activity-log");
    const entries = log?.querySelectorAll(`.log-entry.${logType}`) || [];
    return Array.from(entries).map(
      (entry) => entry.querySelector(".log-message")?.textContent || "",
    );
  }, type);
}

/**
 * Check if element is in progress state
 * @param {Page} page - Playwright page object
 * @param {string} elementId - Element ID to check
 * @returns {Promise<boolean>}
 */
export async function isElementInProgress(page, elementId) {
  return await page.evaluate((id) => {
    return window.uiStateManager?.isInProgress(id) || false;
  }, elementId);
}

/**
 * Mock API response
 * @param {Page} page - Playwright page object
 * @param {string} url - URL pattern to match
 * @param {object} response - Response to return
 */
export async function mockApiResponse(page, url, response) {
  await page.route(url, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(response),
    });
  });
}

/**
 * Mock API error
 * @param {Page} page - Playwright page object
 * @param {string} url - URL pattern to match
 * @param {number} status - HTTP status code
 * @param {object} error - Error response
 */
export async function mockApiError(page, url, status, error) {
  await page.route(url, (route) => {
    route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(error),
    });
  });
}

/**
 * Wait for loading overlay to disappear
 * @param {Page} page - Playwright page object
 * @param {number} timeout - Timeout in ms (default 10000)
 */
export async function waitForLoadingComplete(page, timeout = 10000) {
  await page.waitForSelector("#loading-overlay", { state: "hidden", timeout });
}

/**
 * Intercept WebSocket messages
 * @param {Page} page - Playwright page object
 * @returns {Promise<Array>} Array to collect WebSocket messages
 */
export async function interceptWebSocketMessages(page) {
  const messages = [];

  await page.addInitScript(() => {
    window.__wsMessages = [];
    const originalSend = WebSocket.prototype.send;
    WebSocket.prototype.send = function (data) {
      window.__wsMessages.push({ type: "sent", data: JSON.parse(data) });
      return originalSend.call(this, data);
    };
  });

  // Return function to get messages
  return async () => {
    return await page.evaluate(() => window.__wsMessages || []);
  };
}

/**
 * Simulate WebSocket message from server
 * @param {Page} page - Playwright page object
 * @param {object} message - Message to send
 */
export async function simulateWebSocketMessage(page, message) {
  await page.evaluate((msg) => {
    if (window.wsManager && window.wsManager.ws) {
      const event = new MessageEvent("message", {
        data: JSON.stringify(msg),
      });
      window.wsManager.ws.onmessage(event);
    }
  }, message);
}

/**
 * Get camera status from UI
 * @param {Page} page - Playwright page object
 * @returns {Promise<object>} Camera status object
 */
export async function getCameraStatus(page) {
  return await page.evaluate(() => {
    return {
      connected:
        document.querySelector(".camera-status-text")?.textContent || "",
      model: document.getElementById("camera-model")?.textContent || "",
      battery: document.getElementById("battery-level")?.textContent || "",
    };
  });
}

/**
 * Take a screenshot with a descriptive name
 * @param {Page} page - Playwright page object
 * @param {string} name - Screenshot name
 */
export async function takeDebugScreenshot(page, name) {
  await page.screenshot({
    path: `test-results/screenshots/${name}.png`,
    fullPage: true,
  });
}

/**
 * Clear activity log
 * @param {Page} page - Playwright page object
 */
export async function clearActivityLog(page) {
  await page.evaluate(() => {
    const log = document.getElementById("activity-log");
    if (log) log.innerHTML = "";
  });
}
