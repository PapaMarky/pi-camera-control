# Testing Strategy

## Test Execution Environments

### Development Machine (MacBook)
**Run these tests locally for rapid development:**

```bash
# Run all unit and schema tests
npm test

# Run specific test suites
npm test -- test/schemas
npm test -- test/errors
npm test -- test/events

# Run with coverage
npm test -- --coverage

# Watch mode during development
npm test -- --watch
```

**Test Categories for Development:**
- ✅ Schema validation tests
- ✅ WebSocket message format tests
- ✅ Error response consistency tests
- ✅ Event name validation tests
- ✅ API endpoint contract tests
- ✅ Unit tests for pure functions
- ✅ Mock-based integration tests

### Raspberry Pi (picontrol-002)
**Run these tests on actual hardware:**

```bash
# SSH to Pi
ssh pi@picontrol-002.local

# Run integration tests only
npm test -- --testPathPattern=integration

# Run hardware-specific tests
npm test -- --testPathPattern=hardware

# Run full test suite before deployment
npm test
```

**Test Categories for Pi:**
- ✅ Network transition integration tests
- ✅ Camera discovery and connection tests
- ✅ NetworkManager interaction tests
- ✅ System service tests
- ✅ Power monitoring tests
- ✅ Full end-to-end scenarios

## Test Organization

```
test/
├── unit/              # Pure unit tests (run anywhere)
│   ├── schemas/       # Message & API schemas
│   ├── errors/        # Error handling
│   └── events/        # Event system
├── integration/       # Integration tests (prefer Pi)
│   ├── network/       # Network transitions
│   ├── camera/        # Camera operations
│   └── services/      # System services
├── e2e/              # End-to-end tests (Pi only)
├── mocks/            # Mock implementations
└── fixtures/         # Test data

```

## Continuous Testing Workflow

### 1. Local Development Loop
```bash
# Before starting work
npm test -- test/unit

# While developing (watch mode)
npm test -- --watch test/unit

# Before committing
npm test -- test/unit --coverage
```

### 2. Pre-Push Testing
```bash
# Run full local test suite
npm test

# Sync to Pi and test
rsync -av --exclude=node_modules . pi@picontrol-002.local:~/pi-camera-control/
ssh pi@picontrol-002.local "cd pi-camera-control && npm test -- test/integration"
```

### 3. CI/CD Pipeline (Future)
```yaml
# GitHub Actions workflow
- Run unit tests on every push
- Run integration tests on PR
- Run full suite before merge to main
```

## Mocking Strategy

### For Development Environment
```javascript
// Mock hardware-specific modules
jest.mock('../../src/system/power.js', () => ({
  getStatus: jest.fn(() => ({
    isRaspberryPi: false,
    battery: null,
    thermal: { temperature: 45 }
  }))
}));

// Mock NetworkManager commands
jest.mock('child_process', () => ({
  exec: jest.fn((cmd, callback) => {
    if (cmd.includes('nmcli')) {
      callback(null, mockNetworkResponse);
    }
  })
}));
```

### For Pi Environment
```javascript
// Use real implementations
// No mocks needed for hardware tests
```

## Test Data Management

### Fixtures
```javascript
// test/fixtures/messages.js
export const validStatusUpdate = {
  type: 'status_update',
  timestamp: '2024-01-01T12:00:00.000Z',
  // ... full valid message
};

// test/fixtures/camera.js
export const mockCameraResponse = {
  manufacturer: 'Canon',
  productname: 'EOS R50',
  // ... full CCAPI response
};
```

## Performance Considerations

### Development Machine
- Fast execution for rapid feedback
- Run thousands of tests in seconds
- Use --watch for instant feedback

### Raspberry Pi Zero
- Slower execution (limited CPU)
- Run critical integration tests only
- Cache dependencies to speed up

## Test Coverage Goals

### Phase 1: Critical Issues (Current)
- [ ] 100% WebSocket message schemas
- [ ] 100% Error response formats
- [ ] 100% Event emitter/listener pairs

### Phase 2: Core Functionality
- [ ] 80% Unit test coverage
- [ ] Key integration scenarios
- [ ] Network transition flows

### Phase 3: Comprehensive
- [ ] 90% Overall coverage
- [ ] Full E2E test suite
- [ ] Performance benchmarks

## Debugging Test Failures

### On Development Machine
```bash
# Run with detailed output
npm test -- --verbose

# Debug specific test
node --inspect-brk node_modules/.bin/jest test/schemas/websocket-messages.test.js

# Show console logs
SHOW_LOGS=true npm test
```

### On Raspberry Pi
```bash
# Check system state
sudo systemctl status pi-camera-control
sudo journalctl -u pi-camera-control -n 50

# Run with logs
NODE_ENV=development npm test

# Check network state
nmcli dev status
```