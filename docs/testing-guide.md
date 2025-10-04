# Testing Guide

## Overview

This project uses a dual testing approach:

- **Jest** for backend/unit tests
- **Playwright** for frontend/E2E tests

## Backend Testing (Jest)

### Running Backend Tests

```bash
npm test                    # Run all Jest tests
npm test -- --coverage      # Run with coverage
npm test -- --watch         # Run in watch mode
npm test -- path/to/test    # Run specific test
```

### Test Categories

- **Unit Tests** (`test/unit/`): Component-level tests
- **Integration Tests** (`test/integration/`): Multi-component tests
- **Schema Tests** (`test/schemas/`): Message format validation
- **Utils Tests** (`test/utils/`): Utility function tests
- **Error Tests** (`test/errors/`): Error handling tests

### Coverage Goals

- Overall: >80% line coverage
- Schema validation: 100%
- Error handling: 100%
- Utilities: 100%

## Frontend Testing (Playwright)

### Running Frontend Tests

**Prerequisites**: Start the server first

```bash
# Terminal 1: Start server
npm start

# Terminal 2: Run tests
npm run test:e2e              # Run all E2E tests
npm run test:e2e:ui           # UI mode (recommended)
npm run test:e2e:debug        # Debug mode
npm run test:e2e:headed       # See browser
```

### Test Files

- `smoke.spec.js` - Basic functionality verification
- `websocket.spec.js` - WebSocket connection & messaging
- `camera-controls.spec.js` - Camera control UI
- `timesync.spec.js` - Time synchronization
- `timelapse.spec.js` - Intervalometer/timelapse

### What's Tested

✅ WebSocket connection and reconnection
✅ Real-time message handling
✅ Camera status display
✅ Photo capture UI
✅ Battery monitoring
✅ Time sync UI
✅ Intervalometer controls
✅ Session management
✅ Error handling flows
✅ UI state management

## Running All Tests

```bash
npm run test:all            # Backend + Frontend
```

## Test Development Workflow

### TDD Process (Required)

1. **Write failing test first**
2. **Implement minimal code to pass**
3. **Refactor while keeping tests green**
4. **Update documentation**

### Backend Test Example

```javascript
// test/unit/my-feature.test.js
import { myFunction } from "../../src/utils/my-feature.js";

describe("myFunction", () => {
  test("should do something", () => {
    const result = myFunction("input");
    expect(result).toBe("expected");
  });
});
```

### Frontend Test Example

```javascript
// test/e2e/my-feature.spec.js
import { test, expect } from "@playwright/test";

test("should display feature", async ({ page }) => {
  await page.goto("/");
  await page.click("#feature-button");
  expect(await page.textContent("#result")).toBe("Success");
});
```

## Debugging Tests

### Jest Debugging

```bash
# Run specific test with verbose output
npm test -- --verbose my-test.test.js

# Debug with Node inspector
node --inspect-brk node_modules/.bin/jest --runInBand
```

### Playwright Debugging

```bash
# Debug mode with inspector
npm run test:e2e:debug

# UI mode with time travel
npm run test:e2e:ui

# View test report
npx playwright show-report
```

### Common Issues

**Jest: Module not found**

- Ensure imports use `.js` extension
- Check `moduleNameMapper` in `jest.config.js`

**Playwright: Connection timeout**

- Verify server is running on port 3000
- Check WebSocket configuration
- Increase timeout in `playwright.config.js`

**Flaky tests**

- Use proper wait conditions
- Avoid fixed timeouts
- Ensure test independence

## Test Helpers

### Backend Helpers

- `validateSchema()` - Schema validation utility
- `mockWebSocket()` - Mock WebSocket for testing
- Error response validators

### Frontend Helpers

Located in `test/e2e/helpers/test-helpers.js`:

- `waitForWebSocketConnection()` - Wait for WS
- `mockApiResponse()` - Mock API calls
- `simulateWebSocketMessage()` - Inject messages
- `getCameraStatus()` - Extract UI state
- `getLatestLogEntry()` - Check activity log

## CI/CD Integration

Tests run automatically in CI:

```yaml
# Example GitHub Actions
- run: npm test -- --coverage
- run: npm run test:e2e
  env:
    CI: true
```

## Coverage Reports

### Backend Coverage

```bash
npm test -- --coverage
# View: coverage/lcov-report/index.html
```

### Frontend Coverage

Playwright tests verify:

- User interaction flows
- Real browser behavior
- WebSocket communication
- UI state management

For detailed frontend metrics, use browser DevTools or Lighthouse.

## Test Maintenance

### When to Update Tests

- ✅ After API changes
- ✅ When UI elements change
- ✅ After WebSocket message format changes
- ✅ When error handling changes
- ✅ Before major refactoring

### Test Cleanup

- Remove obsolete tests
- Update test data
- Keep mocks synchronized with real APIs
- Document test assumptions

## Resources

- [Jest Documentation](https://jestjs.io/)
- [Playwright Documentation](https://playwright.dev/)
- [Project Testing Requirements](../CLAUDE.md#test-driven-development-requirements)
- [E2E Test README](../test/e2e/README.md)
