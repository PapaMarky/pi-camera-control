# E2E Tests with Playwright

This directory contains end-to-end tests for the Pi Camera Control web UI using Playwright.

## Test Structure

```
test/e2e/
├── smoke.spec.js               # Basic functionality smoke tests
├── camera-disconnected.spec.js # Tests for NO camera connected
├── camera-connected.spec.js    # Tests for camera connected
├── camera-controls.spec.js     # General camera control UI tests
├── timelapse.spec.js          # Intervalometer/timelapse tests
└── helpers/
    └── test-helpers.js        # Shared test utilities
```

## Running Tests

### Prerequisites
Start the server in a separate terminal:
```bash
npm start
```

Then run tests:

### All Tests
```bash
npm run test:e2e
```

### With UI Mode (Recommended for Development)
```bash
npm run test:e2e:ui
```

### Debug Mode
```bash
npm run test:e2e:debug
```

### Headed Mode (See Browser)
```bash
npm run test:e2e:headed
```

### Run All Tests (Backend + Frontend)
```bash
npm run test:all
```

### Specific Test File
```bash
npx playwright test smoke.spec.js
```

### Camera State-Specific Tests

**IMPORTANT**: Many tests depend on whether a camera is connected. Run these test suites based on your hardware setup:

#### Camera Disconnected Tests
Run with NO camera connected or camera powered off:
```bash
npx playwright test camera-disconnected.spec.js
```

#### Camera Connected Tests
Run with Canon EOS R50 connected and powered on:
```bash
npx playwright test camera-connected.spec.js
```

#### Manual Testing Workflow
For comprehensive testing, run both suites sequentially:
```bash
# 1. Ensure camera is OFF or disconnected
npx playwright test camera-disconnected.spec.js

# 2. Power ON camera and wait for connection (check UI shows "Connected")
npx playwright test camera-connected.spec.js
```

### Specific Test
```bash
npx playwright test -g "should load the home page"
```

## Test Categories

### Smoke Tests
Basic application functionality verification:
- Page loads correctly
- UI elements are present
- JavaScript files load
- WebSocket connects
- API health checks

### Camera Disconnected Tests
Verifies correct UI behavior when NO camera is connected:
- Status displays "Not Connected" or "Disconnected"
- Camera info fields show "-" (IP, battery, mode)
- Camera-dependent buttons are disabled
- Menu items requiring camera are disabled
- Manual connection UI is available
- Activity log shows appropriate messages

**Prerequisites**: Camera must be OFF or disconnected from network

### Camera Connected Tests
Verifies correct UI behavior when camera IS connected:
- Status displays "Connected"
- Camera IP shows valid IP address
- Battery level and mode are displayed
- Camera-dependent buttons are enabled
- Menu items requiring camera are enabled
- Cards can be opened (Test Shot, Camera Settings, Intervalometer)
- Photo capture operations work
- Activity log shows connection messages

**Prerequisites**: Canon EOS R50 must be ON and connected to network

### Camera Control Tests
General camera control UI tests (agnostic to connection state):
- UI elements exist (buttons, inputs, displays)
- Function menu opens and contains expected items
- Camera configuration inputs are present
- Manual connection modal exists
- Header status indicators exist

### Timelapse Tests
Intervalometer UI structure and controls:
- Input fields exist (interval, session title, stop conditions)
- Start/stop buttons exist
- Progress display elements exist
- Session completion card exists
- Reports card and refresh functionality
- Menu access to intervalometer

## Test Helpers

The `helpers/test-helpers.js` file provides utilities:

- `waitForWebSocketConnection()` - Wait for WebSocket to connect
- `waitForCameraConnection()` - Wait for camera detection
- `getLatestLogEntry()` - Get most recent activity log entry
- `mockApiResponse()` - Mock API responses
- `simulateWebSocketMessage()` - Inject WebSocket messages
- `isElementInProgress()` - Check UI state
- `getCameraStatus()` - Extract camera status from UI

## Configuration

Tests are configured in `playwright.config.js`:

- **Base URL**: `http://localhost:3000`
- **Browser**: Chromium only (lightweight for Pi testing)
- **Workers**: 1 (sequential tests against single server)
- **Timeout**: 30s per test
- **Auto-start server**: Yes (runs `npm start` before tests)

## Debugging Tests

### Using Playwright Inspector
```bash
npm run test:e2e:debug
```

This opens the Playwright Inspector where you can:
- Step through tests
- Inspect the DOM
- View network requests
- See console logs

### Using UI Mode
```bash
npm run test:e2e:ui
```

UI mode provides:
- Visual test runner
- Watch mode
- Time travel debugging
- Trace viewer

### Screenshots and Videos

On failure, Playwright automatically captures:
- **Screenshots**: Saved to `test-results/`
- **Videos**: Retained on failure
- **Traces**: Available for debugging

### View Test Reports
```bash
npx playwright show-report
```

## Writing New Tests

### Test Template
```javascript
import { test, expect } from '@playwright/test';
import { waitForWebSocketConnection } from './helpers/test-helpers.js';

test.describe('Feature Name', () => {
  test('should do something', async ({ page }) => {
    await page.goto('/');
    await waitForWebSocketConnection(page);

    // Your test code
    await page.click('#some-button');

    // Assertions
    expect(await page.textContent('#result')).toBe('Expected');
  });
});
```

### Best Practices

1. **Use Test Helpers**: Reuse utilities from `test-helpers.js`
2. **Wait Appropriately**: Use `waitFor*` functions instead of fixed timeouts
3. **Test User Flows**: Focus on real user scenarios, not implementation details
4. **Mock External Dependencies**: Use `mockApiResponse()` for API calls
5. **Clean State**: Each test should be independent
6. **Descriptive Names**: Test names should clearly describe what they verify

## CI/CD Integration

Tests can run in CI with:
```bash
CI=true npm run test:e2e
```

This enables:
- Retries on failure (2 attempts)
- More restrictive test.only checks
- Headless execution

## Troubleshooting

### Server Won't Start
- Check port 3000 is available
- Verify `npm start` works manually
- Check server logs for errors

### WebSocket Connection Fails
- Ensure server WebSocket is configured correctly
- Check for CORS issues
- Verify WebSocket endpoint is correct

### Tests Timeout
- Increase timeout in `playwright.config.js`
- Check for infinite loading states
- Verify mocks are responding

### Flaky Tests
- Use proper wait conditions
- Avoid `page.waitForTimeout()`
- Check for race conditions

## Coverage

While Playwright doesn't directly measure code coverage, it tests:
- Real browser behavior
- User interactions
- WebSocket communication
- UI state management
- Error handling flows

For code coverage, run backend Jest tests:
```bash
npm test -- --coverage
```
