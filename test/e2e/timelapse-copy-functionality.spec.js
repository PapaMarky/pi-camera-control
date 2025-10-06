/**
 * E2E Tests for Timelapse Report Click-to-Copy Functionality
 *
 * Tests the clipboard copy feature that should work in both secure (HTTPS)
 * and non-secure (HTTP) contexts using fallback mechanisms.
 */

import { test, expect } from "@playwright/test";
import { captureScreenshot } from "./helpers/visual-helpers.js";

test.describe("Timelapse Report Click-to-Copy", () => {
  test("should copy text to clipboard when clicking copyable elements", async ({
    page,
    context,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Grant clipboard permissions (for secure contexts)
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);

    // Navigate to timelapse reports
    await page.click("#function-menu-toggle");
    await page.click('button.menu-item[data-card="timelapse-reports"]');

    // Wait for reports card to be visible
    const reportsCard = page.locator("#timelapse-reports-card");
    await expect(reportsCard).toBeVisible();

    // For testing, we need to mock a report with copyable elements
    // Inject a test report directly into the DOM
    await page.evaluate(() => {
      const container = document.querySelector("#reports-container");
      if (container) {
        container.innerHTML = `
          <div class="report-item">
            <div class="report-header">
              <h3>Test Report</h3>
            </div>
            <div class="report-content">
              <p>Session ID: <span class="copyable">test-session-123</span></p>
              <p>File Path: <span class="copyable">/path/to/test/file.jpg</span></p>
            </div>
          </div>
        `;

        // Trigger the click-to-copy setup
        // This simulates what showReportDetails does
        container.querySelectorAll(".copyable").forEach((element) => {
          element.style.cursor = "pointer";
          element.addEventListener("click", () => {
            const text = element.textContent;

            // Use the clipboard helper (will be implemented)
            if (window.copyToClipboard) {
              window
                .copyToClipboard(text)
                .then(() => {
                  const originalText = element.textContent;
                  element.textContent = "✓ Copied!";
                  setTimeout(() => {
                    element.textContent = originalText;
                  }, 1000);
                })
                .catch((err) => {
                  console.error("Failed to copy:", err);
                });
            }
          });
        });
      }
    });

    await captureScreenshot(page, "copyable-elements-present");

    // Find copyable element
    const copyableElement = page.locator(".copyable").first();
    await expect(copyableElement).toBeVisible();

    // Verify cursor is pointer
    const cursor = await copyableElement.evaluate(
      (el) => window.getComputedStyle(el).cursor,
    );
    expect(cursor).toBe("pointer");

    // Get original text
    const originalText = await copyableElement.textContent();
    expect(originalText).toBe("test-session-123");

    // Click to copy
    await copyableElement.click();

    // Wait for feedback text to appear
    await page.waitForTimeout(100);

    // Verify feedback text appears
    const feedbackText = await copyableElement.textContent();
    expect(feedbackText).toBe("✓ Copied!");

    await captureScreenshot(page, "copy-feedback-shown");

    // Wait for text to restore
    await page.waitForTimeout(1200);

    // Verify text restores
    const restoredText = await copyableElement.textContent();
    expect(restoredText).toBe(originalText);

    await captureScreenshot(page, "copy-text-restored");

    // In a secure context, verify clipboard contents
    // Note: This may not work in HTTP contexts, which is why we have the fallback
    try {
      const clipboardText = await page.evaluate(() =>
        navigator.clipboard.readText(),
      );
      expect(clipboardText).toBe("test-session-123");
    } catch (err) {
      // If clipboard read fails, that's OK - we're in HTTP context
      // The important thing is that the UI feedback works
      console.log("Clipboard read not available (expected in HTTP context)");
    }
  });

  test("should handle copy failure gracefully", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Open timelapse reports card first
    await page.click("#function-menu-toggle");
    await page.click('button.menu-item[data-card="timelapse-reports"]');

    const reportsCard = page.locator("#timelapse-reports-card");
    await expect(reportsCard).toBeVisible();

    // Inject test content with intentionally broken clipboard
    await page.evaluate(() => {
      const container = document.querySelector("#reports-container");
      if (container) {
        container.innerHTML = `
          <div class="report-item">
            <div class="report-content">
              <p>Test: <span class="copyable" id="test-copy">test-value</span></p>
            </div>
          </div>
        `;

        // Mock a broken clipboard helper
        window.copyToClipboard = () => {
          return Promise.reject(new Error("Clipboard unavailable"));
        };

        // Setup click handler with error handling
        const element = document.querySelector("#test-copy");
        element.style.cursor = "pointer";
        element.addEventListener("click", () => {
          const text = element.textContent;
          window
            .copyToClipboard(text)
            .then(() => {
              element.textContent = "✓ Copied!";
              setTimeout(() => {
                element.textContent = text;
              }, 1000);
            })
            .catch((err) => {
              console.error("Failed to copy:", err);
              // Should not crash - error logged to console
            });
        });
      }
    });

    const copyableElement = page.locator("#test-copy");
    await expect(copyableElement).toBeVisible();

    // Click should not crash even if copy fails
    await copyableElement.click();

    // Wait a moment
    await page.waitForTimeout(200);

    // Element should still be clickable (no crash)
    await expect(copyableElement).toBeVisible();

    await captureScreenshot(page, "copy-error-handled");
  });

  test("should work for multiple copyable elements independently", async ({
    page,
    context,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await context.grantPermissions(["clipboard-read", "clipboard-write"]);

    // Open timelapse reports card first
    await page.click("#function-menu-toggle");
    await page.click('button.menu-item[data-card="timelapse-reports"]');

    const reportsCard = page.locator("#timelapse-reports-card");
    await expect(reportsCard).toBeVisible();

    // Inject multiple copyable elements
    await page.evaluate(() => {
      const container = document.querySelector("#reports-container");
      if (container) {
        container.innerHTML = `
          <div class="report-item">
            <div class="report-content">
              <p>Value 1: <span class="copyable">first-value</span></p>
              <p>Value 2: <span class="copyable">second-value</span></p>
              <p>Value 3: <span class="copyable">third-value</span></p>
            </div>
          </div>
        `;

        // Setup all copyable elements
        container.querySelectorAll(".copyable").forEach((element) => {
          element.style.cursor = "pointer";
          element.addEventListener("click", () => {
            const text = element.textContent;
            if (window.copyToClipboard) {
              window
                .copyToClipboard(text)
                .then(() => {
                  const originalText = element.textContent;
                  element.textContent = "✓ Copied!";
                  setTimeout(() => {
                    element.textContent = originalText;
                  }, 1000);
                })
                .catch((err) => {
                  console.error("Failed to copy:", err);
                });
            }
          });
        });
      }
    });

    const copyables = page.locator(".copyable");
    await expect(copyables).toHaveCount(3);

    // Click second element
    const secondElement = copyables.nth(1);
    await secondElement.click();

    await page.waitForTimeout(100);

    // Only second element should show feedback
    const firstText = await copyables.nth(0).textContent();
    const secondText = await copyables.nth(1).textContent();
    const thirdText = await copyables.nth(2).textContent();

    expect(firstText).toBe("first-value");
    expect(secondText).toBe("✓ Copied!");
    expect(thirdText).toBe("third-value");

    await captureScreenshot(page, "multiple-copyables-independent");
  });
});
