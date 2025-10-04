# Frontend Visual Testing Guide

## Overview

This guide describes the **visual testing workflow** that enables Claude Code to "see" UI bugs before code is committed. This solves the problem where Claude claims a feature works but the UI displays incorrect values or broken functionality.

## The Problem

Traditional E2E tests often only verify that **elements exist**, not that they display **correct values** or **function properly**:

```javascript
// ❌ BAD: Only checks existence
expect(await page.locator("#camera-status").count()).toBe(1);

// ✅ GOOD: Checks actual value
const statusText = await page.textContent("#camera-status");
expect(statusText).toBe("Connected");
```

## The Solution: Visual Testing Pattern

### Three-Part Approach

1. **Capture Screenshots** - Create visual artifacts Claude can read
2. **Assert Actual Values** - Verify displayed content, not just presence
3. **Test Functionality** - Click buttons and verify results

## Using the Visual Helpers

### Import the Helpers

```javascript
import {
  captureScreenshot,
  captureAndExtractValues,
  testButtonClick,
  getUIStateSnapshot,
  waitForWebSocketAndVerify,
} from "./helpers/visual-helpers.js";
```

### Pattern 1: Capture and Verify Values

```javascript
test("should display correct camera status", async ({ page }) => {
  // Navigate and wait for page to be ready
  await page.goto("/");
  await waitForWebSocketAndVerify(page);

  // Capture screenshot and extract values
  const { screenshotPath, values } = await captureAndExtractValues(
    page,
    "camera-status-check",
    {
      status: "#camera-status-text",
      ip: "#camera-ip",
      battery: "#camera-battery",
    },
  );

  // Claude can read this screenshot
  console.log(`Screenshot: ${screenshotPath}`);

  // Assert actual values
  expect(values.status.visible).toBe(true);
  expect(values.status.text).toContain("Connected");
  expect(values.ip.text).toMatch(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/);
  expect(values.battery.text).not.toBe("-");
});
```

### Pattern 2: Test Button Functionality

```javascript
test("should open menu when button clicked", async ({ page }) => {
  await page.goto("/");

  // Test button click with verification function
  const result = await testButtonClick(
    page,
    "#function-menu-toggle",
    async (page) => {
      // Verify expected result after click
      const dropdown = page.locator("#function-menu-dropdown");
      const visible = await dropdown.isVisible();
      expect(visible).toBe(true);
    },
  );

  // Verify the click worked
  expect(result.success).toBe(true);

  // Capture screenshot for visual verification
  await captureScreenshot(page, "menu-opened");
});
```

### Pattern 3: Get Complete UI State

```javascript
test("should have correct UI state", async ({ page }) => {
  await page.goto("/");

  // Get complete snapshot of UI state
  const uiState = await getUIStateSnapshot(page);

  // Log for debugging
  console.log("UI State:", JSON.stringify(uiState, null, 2));

  // Verify states
  expect(uiState.websocket.connected).toBe(true);
  expect(uiState.camera.status.visible).toBe(true);
  expect(uiState.buttons.takePhoto.disabled).toBe(false);

  // Capture screenshot
  await captureScreenshot(page, "ui-state-check");
});
```

## Frontend-Guardian Workflow

When making UI changes, `frontend-guardian` MUST follow this workflow:

### Step 1: Make Code Changes

```javascript
// Make UI changes as requested
```

### Step 2: Run Playwright Tests

```bash
# Start server (if not already running)
npm start &

# Run E2E tests
npm run test:e2e
```

### Step 3: Review Test Results

If tests fail:

1. **Read the test output** - See which assertions failed
2. **Read the screenshots** - Use Read tool to view captured images
3. **Analyze the difference** - Compare expected vs actual values
4. **Fix the code** - Make corrections based on visual evidence

### Step 4: Verify Screenshots

Before claiming a feature works, Claude MUST:

```bash
# List recent screenshots
ls -lt test-results/screenshots/ | head -10

# Read key screenshots to visually verify UI
# Claude can read PNG files with the Read tool
```

Example:

```javascript
// After test runs, review the visual evidence
const screenshotPath =
  "test-results/screenshots/camera-status-check-2025-01-15.png";
// Use Read tool to view this image
```

### Step 5: Confirm Success

Only after:

- ✅ All tests pass
- ✅ Screenshots reviewed and verified
- ✅ Actual values match expected values

Can the feature be considered complete.

## Converting Existing Tests

### Before (Element Existence Only)

```javascript
test("should display camera status", async ({ page }) => {
  await page.goto("/");

  const status = await page.locator("#camera-status");
  expect(await status.count()).toBe(1);
});
```

### After (Visual Verification)

```javascript
test("should display camera status", async ({ page }) => {
  await page.goto("/");
  await waitForWebSocketAndVerify(page);

  const { screenshotPath, values } = await captureAndExtractValues(
    page,
    "camera-status",
    { status: "#camera-status-text" },
  );

  console.log(`Screenshot: ${screenshotPath}`);

  expect(values.status.exists).toBe(true);
  expect(values.status.visible).toBe(true);
  expect(values.status.text).toBeTruthy();
  expect(values.status.text.length).toBeGreaterThan(0);
});
```

## Screenshot Organization

Screenshots are saved to `test-results/screenshots/` with naming pattern:

```
{test-name}-{timestamp}.png
```

Examples:

```
test-results/screenshots/
├── camera-status-check-2025-01-15t10-30-00.png
├── menu-opened-2025-01-15t10-30-01.png
└── ui-state-check-2025-01-15t10-30-02.png
```

## Reading Screenshots (For Claude)

When tests complete, Claude should:

```bash
# List screenshots from recent test run
ls -lt test-results/screenshots/ | head -5
```

Then use Read tool on each screenshot:

```javascript
// Claude uses Read tool internally
Read(
  "/Users/mark/git/pi-camera-control/test-results/screenshots/camera-status-check-2025-01-15.png",
);
```

This allows Claude to **visually verify** the UI looks correct.

## Common Assertions

### Verify Text Content

```javascript
expect(values.status.text).toBe("Connected");
expect(values.status.text).toContain("Camera");
expect(values.status.text).toMatch(/Connected|Ready/);
```

### Verify Element State

```javascript
expect(values.button.visible).toBe(true);
expect(values.button.disabled).toBe(false);
expect(values.input.value).toBe("expected-value");
```

### Verify Patterns

```javascript
// IP address
expect(ipText).toMatch(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/);

// Percentage
expect(batteryText).toMatch(/\d+%/);

// Time format
expect(timeText).toMatch(/\d{2}:\d{2}:\d{2}/);
```

## Best Practices

### DO

✅ **Capture screenshots** for every significant test
✅ **Assert on actual values**, not just existence
✅ **Test button functionality** by clicking and verifying
✅ **Log screenshot paths** so Claude can find them
✅ **Review screenshots** before marking tests as passing
✅ **Use descriptive test names** that match screenshot names

### DON'T

❌ **Don't skip screenshot capture**
❌ **Don't only check element existence**
❌ **Don't claim success without reading screenshots**
❌ **Don't use fixed timeouts** - use proper wait conditions
❌ **Don't ignore test failures**
❌ **Don't assume the UI is correct without visual verification**

## Example Test Flow

```javascript
import { test, expect } from "@playwright/test";
import {
  captureScreenshot,
  captureAndExtractValues,
  waitForWebSocketAndVerify,
} from "./helpers/visual-helpers.js";

test("complete example with visual verification", async ({ page }) => {
  // 1. Navigate
  await page.goto("/");

  // 2. Wait for ready state
  const wsConnected = await waitForWebSocketAndVerify(page);
  expect(wsConnected).toBe(true);

  // 3. Capture screenshot and values
  const { screenshotPath, values } = await captureAndExtractValues(
    page,
    "my-feature-test",
    {
      title: "#page-title",
      button: "#action-button",
      result: "#result-display",
    },
  );

  // 4. Log for Claude to read
  console.log(`Screenshot: ${screenshotPath}`);
  console.log("Values:", JSON.stringify(values, null, 2));

  // 5. Assert actual values
  expect(values.title.text).toBe("Expected Title");
  expect(values.button.visible).toBe(true);
  expect(values.button.disabled).toBe(false);

  // 6. Test functionality
  await page.click("#action-button");
  await page.waitForTimeout(500);

  // 7. Capture after-action screenshot
  const afterPath = await captureScreenshot(page, "after-button-click");
  console.log(`After-action screenshot: ${afterPath}`);

  // 8. Verify result
  const resultText = await page.textContent("#result-display");
  expect(resultText).toBe("Success");
});
```

## Integration with TDD Workflow

### Enhanced TDD Process

1. **Write failing test** with visual verification
2. **Run test** - it fails with screenshots showing broken state
3. **Implement feature**
4. **Run test** - it passes with screenshots showing correct state
5. **Review screenshots** to confirm visual correctness
6. **Commit** with confidence

## Troubleshooting

### Screenshots Not Captured

Check that directory exists:

```bash
mkdir -p test-results/screenshots
```

### Can't Read Screenshots

Use absolute path:

```bash
ls /Users/mark/git/pi-camera-control/test-results/screenshots/
```

### Tests Pass But UI Wrong

This means assertions are too weak. Add more specific value checks:

```javascript
// Too weak
expect(element.count()).toBe(1);

// Better
expect(element.text()).toBe("Expected Value");
```

## Summary

**The visual testing pattern ensures:**

1. 📸 **Screenshots captured** - Claude can "see" the UI
2. ✅ **Values verified** - Not just existence, actual content
3. 🖱️ **Functionality tested** - Buttons actually work
4. 🔍 **Visual review** - Claude reads screenshots before claiming success

**Result:** Catch UI bugs before the user sees them, not after.
