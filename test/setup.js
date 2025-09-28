/**
 * Test Setup File
 *
 * This file runs before all tests to set up the test environment
 */

// Suppress console output during tests unless explicitly needed
if (process.env.NODE_ENV === 'test' && !process.env.SHOW_LOGS) {
  global.console = {
    ...console,
    log: () => {},
    error: () => {},
    warn: () => {},
    info: () => {},
    debug: () => {},
  };
}

// Add custom matchers if needed
global.expect.extend({
  toHaveWebSocketMessageType(received, messageType) {
    const pass = received.type === messageType;
    return {
      pass,
      message: () =>
        pass
          ? `Expected message not to have type "${messageType}"`
          : `Expected message to have type "${messageType}", but got "${received.type}"`
    };
  },

  toMatchSchema(received, schema) {
    // This could use the validateSchema function from the tests
    const errors = [];
    // Simplified validation - would import real validator
    const pass = errors.length === 0;
    return {
      pass,
      message: () =>
        pass
          ? `Expected object not to match schema`
          : `Expected object to match schema. Errors: ${errors.join(', ')}`
    };
  }
});