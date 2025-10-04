/**
 * E2E Tests for WebSocket Connection
 */

import { test, expect } from "@playwright/test";
import {
  waitForWebSocketConnection,
  waitForLoadingComplete,
  getLatestLogEntry,
  simulateWebSocketMessage,
} from "./helpers/test-helpers.js";

test.describe("WebSocket Connection", () => {
  test("should establish WebSocket connection on page load", async ({
    page,
  }) => {
    await page.goto("/");

    // Wait for loading to complete
    await waitForLoadingComplete(page);

    // Check that WebSocket is connected
    const isConnected = await page.evaluate(() => {
      return window.wsManager?.isConnected() || false;
    });

    expect(isConnected).toBe(true);
  });

  test("should display connection status in UI", async ({ page }) => {
    await page.goto("/");
    await waitForWebSocketConnection(page);

    // The app should show connected state (no disconnection warnings)
    const hasErrorMessages = await page.evaluate(() => {
      const log = document.getElementById("activity-log");
      const errorEntries = log?.querySelectorAll(".log-entry.error") || [];
      return errorEntries.length > 0;
    });

    expect(hasErrorMessages).toBe(false);
  });

  test("should receive welcome message from server", async ({ page }) => {
    let welcomeReceived = false;

    // Listen for WebSocket messages
    await page.goto("/");

    welcomeReceived = await page.evaluate(() => {
      return new Promise((resolve) => {
        if (window.wsManager) {
          window.wsManager.on("welcome", () => {
            resolve(true);
          });
          // Timeout after 5 seconds
          setTimeout(() => resolve(false), 5000);
        } else {
          resolve(false);
        }
      });
    });

    expect(welcomeReceived).toBe(true);
  });

  test("should handle status_update messages", async ({ page }) => {
    await page.goto("/");
    await waitForWebSocketConnection(page);

    // Simulate a status update from server
    await simulateWebSocketMessage(page, {
      type: "status_update",
      camera: {
        connected: true,
        model: "Canon EOS R50",
        ipAddress: "192.168.1.100",
      },
      power: {
        battery: 85,
        charging: false,
      },
      timestamp: new Date().toISOString(),
    });

    // Wait a bit for UI to update
    await page.waitForTimeout(500);

    // Check that UI was updated
    const cameraStatus = await page.textContent(".camera-status-text");
    expect(cameraStatus).toContain("Connected");
  });

  test("should emit events to registered listeners", async ({ page }) => {
    await page.goto("/");
    await waitForWebSocketConnection(page);

    const eventReceived = await page.evaluate(() => {
      return new Promise((resolve) => {
        window.wsManager.on("test_event", (data) => {
          resolve(data.message === "test");
        });

        // Simulate receiving the event
        setTimeout(() => {
          window.wsManager.emit("test_event", { message: "test" });
        }, 100);

        setTimeout(() => resolve(false), 2000);
      });
    });

    expect(eventReceived).toBe(true);
  });

  test("should handle camera_connected event", async ({ page }) => {
    await page.goto("/");
    await waitForWebSocketConnection(page);

    // Simulate camera connection event
    await simulateWebSocketMessage(page, {
      type: "event",
      eventType: "camera_connected",
      data: {
        cameraIp: "192.168.1.100",
        cameraModel: "Canon EOS R50",
      },
    });

    // Wait for UI update
    await page.waitForTimeout(500);

    // Check activity log for connection message
    const logMessage = await getLatestLogEntry(page);
    expect(logMessage).toMatch(/camera|connected/i);
  });

  test("should handle camera_disconnected event", async ({ page }) => {
    await page.goto("/");
    await waitForWebSocketConnection(page);

    // First connect, then disconnect
    await simulateWebSocketMessage(page, {
      type: "event",
      eventType: "camera_connected",
      data: { cameraIp: "192.168.1.100" },
    });

    await page.waitForTimeout(200);

    await simulateWebSocketMessage(page, {
      type: "event",
      eventType: "camera_disconnected",
      data: { reason: "Connection lost" },
    });

    await page.waitForTimeout(500);

    // Check for disconnection message
    const logMessage = await getLatestLogEntry(page);
    expect(logMessage).toMatch(/disconnected|lost/i);
  });

  test("should handle error messages from server", async ({ page }) => {
    await page.goto("/");
    await waitForWebSocketConnection(page);

    // Simulate error from server
    await simulateWebSocketMessage(page, {
      type: "error",
      data: {
        message: "Camera communication failed",
        code: "CAMERA_ERROR",
      },
    });

    await page.waitForTimeout(500);

    // Check that error is logged
    const errorLogs = await page.evaluate(() => {
      const log = document.getElementById("activity-log");
      const errorEntries = log?.querySelectorAll(".log-entry.error") || [];
      return Array.from(errorEntries).map(
        (e) => e.querySelector(".log-message")?.textContent || "",
      );
    });

    expect(
      errorLogs.some((msg) => msg.includes("Camera communication failed")),
    ).toBe(true);
  });

  test("should send messages to server", async ({ page }) => {
    await page.goto("/");
    await waitForWebSocketConnection(page);

    const messageSent = await page.evaluate(() => {
      return window.wsManager.send("test_message", { data: "test" });
    });

    expect(messageSent).toBe(true);
  });

  test("should handle time-sync-request from server", async ({ page }) => {
    await page.goto("/");
    await waitForWebSocketConnection(page);

    // Track if response was sent
    const responseSent = await page.evaluate(() => {
      return new Promise((resolve) => {
        // Override send to capture response
        const originalSend = window.wsManager.send.bind(window.wsManager);
        window.wsManager.send = function (type, data) {
          if (type === "time-sync-response") {
            resolve(true);
          }
          return originalSend(type, data);
        };

        // Simulate time sync request
        window.wsManager.handleTimeSyncRequest({
          type: "time-sync-request",
          requestId: "test-123",
        });

        setTimeout(() => resolve(false), 2000);
      });
    });

    expect(responseSent).toBe(true);
  });
});

test.describe("WebSocket Reconnection", () => {
  test("should attempt to reconnect on connection loss", async ({ page }) => {
    await page.goto("/");
    await waitForWebSocketConnection(page);

    // Track reconnection attempts
    const reconnected = await page.evaluate(() => {
      return new Promise((resolve) => {
        let reconnectAttempted = false;

        window.wsManager.on("reconnecting", () => {
          reconnectAttempted = true;
        });

        window.wsManager.on("connected", () => {
          if (reconnectAttempted) {
            resolve(true);
          }
        });

        // Simulate connection loss
        if (window.wsManager.ws) {
          window.wsManager.ws.close(1006, "Connection lost");
        }

        setTimeout(() => resolve(false), 5000);
      });
    });

    expect(reconnected).toBe(true);
  });

  test("should not reconnect on clean shutdown", async ({ page }) => {
    await page.goto("/");
    await waitForWebSocketConnection(page);

    const reconnectAttempted = await page.evaluate(() => {
      return new Promise((resolve) => {
        let reconnectCalled = false;

        window.wsManager.on("reconnecting", () => {
          reconnectCalled = true;
        });

        // Clean shutdown
        window.wsManager.ws.close(1000, "Normal closure");

        setTimeout(() => resolve(reconnectCalled), 2000);
      });
    });

    expect(reconnectAttempted).toBe(false);
  });
});
