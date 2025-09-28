# Pi Camera Control Test Suite

## Overview
Comprehensive test suite to ensure system reliability and prevent regressions, especially around known issues with message schemas, error handling, and event consistency.

## Test Categories

### 1. Schema Validation Tests (`test/schemas/`)
- WebSocket message format validation
- API request/response validation
- Event payload validation
- Field name consistency checks

### 2. Error Handling Tests (`test/errors/`)
- Error response format consistency
- Error propagation through system
- Client error message handling
- Recovery mechanism tests

### 3. Event System Tests (`test/events/`)
- Event emission and listener pairing
- Event payload consistency
- Event propagation paths
- Missing event handler detection

### 4. API Tests (`test/api/`)
- Endpoint functionality
- Parameter validation
- Response format validation
- Duplicate endpoint detection

### 5. Integration Tests (`test/integration/`)
- Network transition scenarios
- Camera reconnection flows
- Session persistence/recovery
- Time synchronization workflows

### 6. Regression Tests (`test/regression/`)
- Specific bug reproduction tests
- Known issue validation
- Fix verification

## Running Tests

```bash
# Install test dependencies
npm install --save-dev jest supertest @jest/globals

# Run all tests
npm test

# Run specific test category
npm test -- test/schemas
npm test -- test/errors

# Run with coverage
npm test -- --coverage

# Watch mode for development
npm test -- --watch
```

## Test Structure Example

```javascript
// test/schemas/websocket-messages.test.js
describe('WebSocket Message Schemas', () => {
  describe('Client to Server Messages', () => {
    test('take_photo message has correct schema', () => {
      const message = {
        type: 'take_photo',
        data: {}
      };
      expect(validateSchema(message, 'take_photo')).toBe(true);
    });
  });

  describe('Server to Client Messages', () => {
    test('status_update has consistent field names', () => {
      const statusUpdate = buildStatusUpdate();
      expect(statusUpdate).toHaveProperty('type', 'status_update');
      expect(statusUpdate).toHaveProperty('timestamp');
      expect(statusUpdate).toHaveProperty('camera.connected');
      // etc...
    });
  });
});
```

## Coverage Goals

- **Schema Tests**: 100% of message types
- **Error Tests**: 100% of error handlers
- **Event Tests**: 100% of event emitters/listeners
- **API Tests**: 100% of endpoints
- **Integration**: Critical user flows

## CI/CD Integration

Tests should run on:
- Every commit (pre-commit hook)
- Every PR (GitHub Actions)
- Before deployment (build script)

## Known Issues Being Tested

1. **Multiple Error Response Patterns** - `test/errors/response-consistency.test.js`
2. **WebSocket Message Schema Mismatches** - `test/schemas/websocket-messages.test.js`
3. **Event Name Inconsistencies** - `test/events/event-consistency.test.js`
4. **Field Name Mismatches** - `test/schemas/field-names.test.js`
5. **Network Transition Failures** - `test/integration/network-transitions.test.js`

## Adding New Tests

When adding new features:
1. Write tests FIRST (TDD)
2. Document expected behavior
3. Ensure schemas are validated
4. Add regression tests for bugs
5. Update this README with new test categories