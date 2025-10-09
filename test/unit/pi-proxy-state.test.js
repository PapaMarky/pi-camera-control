/**
 * Unit Tests for PiProxyState Class
 *
 * Tests the Pi Proxy State management for time synchronization.
 * The PiProxyState tracks which time source (if any) the Pi is currently
 * acting as a proxy for.
 *
 * State values:
 * - 'none': Pi is not a proxy (no recent client sync)
 * - 'ap0-device': Pi is proxy for ap0 client (within last 10 minutes)
 * - 'wlan0-device': Pi is proxy for wlan0 client (within last 10 minutes)
 */

import { PiProxyState } from "../../src/timesync/pi-proxy-state.js";

describe("PiProxyState", () => {
  let state;

  beforeEach(() => {
    state = new PiProxyState();
  });

  describe("initialization", () => {
    test("should initialize with state 'none'", () => {
      expect(state.state).toBe("none");
    });

    test("should initialize with null acquiredAt", () => {
      expect(state.acquiredAt).toBeNull();
    });

    test("should initialize with null clientIP", () => {
      expect(state.clientIP).toBeNull();
    });

    test("should be invalid when initialized", () => {
      expect(state.isValid()).toBe(false);
    });
  });

  describe("isValid()", () => {
    test("should return false when state is 'none'", () => {
      state.updateState("none", null);
      expect(state.isValid()).toBe(false);
    });

    test("should return false when acquiredAt is null", () => {
      state.state = "ap0-device";
      state.acquiredAt = null;
      expect(state.isValid()).toBe(false);
    });

    test("should return true for ap0-device within 10 minutes", () => {
      state.updateState("ap0-device", "192.168.12.100");
      expect(state.isValid()).toBe(true);
    });

    test("should return true for wlan0-device within 10 minutes", () => {
      state.updateState("wlan0-device", "192.168.1.50");
      expect(state.isValid()).toBe(true);
    });

    test("should return false when state is older than 10 minutes", () => {
      state.updateState("ap0-device", "192.168.12.100");

      // Manually set acquiredAt to 11 minutes ago
      const elevenMinutesAgo = new Date(Date.now() - 11 * 60 * 1000);
      state.acquiredAt = elevenMinutesAgo;

      expect(state.isValid()).toBe(false);
    });

    test("should return true when state is exactly 9 minutes 59 seconds old", () => {
      state.updateState("ap0-device", "192.168.12.100");

      // Set acquiredAt to 9:59 ago (just under 10 minutes)
      const almostTenMinutesAgo = new Date(Date.now() - 9 * 60 * 1000 - 59000);
      state.acquiredAt = almostTenMinutesAgo;

      expect(state.isValid()).toBe(true);
    });

    test("should return false when state is exactly 10 minutes old", () => {
      state.updateState("ap0-device", "192.168.12.100");

      // Set acquiredAt to exactly 10 minutes ago
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
      state.acquiredAt = tenMinutesAgo;

      expect(state.isValid()).toBe(false);
    });
  });

  describe("updateState()", () => {
    test("should update state to ap0-device", () => {
      state.updateState("ap0-device", "192.168.12.100");
      expect(state.state).toBe("ap0-device");
    });

    test("should update state to wlan0-device", () => {
      state.updateState("wlan0-device", "192.168.1.50");
      expect(state.state).toBe("wlan0-device");
    });

    test("should update state to none", () => {
      state.updateState("ap0-device", "192.168.12.100");
      state.updateState("none", null);
      expect(state.state).toBe("none");
    });

    test("should set acquiredAt to current time", () => {
      const before = Date.now();
      state.updateState("ap0-device", "192.168.12.100");
      const after = Date.now();

      expect(state.acquiredAt).toBeInstanceOf(Date);
      expect(state.acquiredAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(state.acquiredAt.getTime()).toBeLessThanOrEqual(after);
    });

    test("should update clientIP", () => {
      state.updateState("ap0-device", "192.168.12.100");
      expect(state.clientIP).toBe("192.168.12.100");
    });

    test("should update acquiredAt on subsequent updates", () => {
      state.updateState("ap0-device", "192.168.12.100");
      const firstAcquiredAt = state.acquiredAt;

      // Wait 10ms to ensure time difference
      setTimeout(() => {
        state.updateState("ap0-device", "192.168.12.100");
        expect(state.acquiredAt.getTime()).toBeGreaterThan(
          firstAcquiredAt.getTime(),
        );
      }, 10);
    });

    test("should allow transition from ap0-device to wlan0-device", () => {
      state.updateState("ap0-device", "192.168.12.100");
      state.updateState("wlan0-device", "192.168.1.50");

      expect(state.state).toBe("wlan0-device");
      expect(state.clientIP).toBe("192.168.1.50");
    });

    test("should allow transition from wlan0-device to ap0-device", () => {
      state.updateState("wlan0-device", "192.168.1.50");
      state.updateState("ap0-device", "192.168.12.100");

      expect(state.state).toBe("ap0-device");
      expect(state.clientIP).toBe("192.168.12.100");
    });

    test("should set clientIP to null when transitioning to none", () => {
      state.updateState("ap0-device", "192.168.12.100");
      state.updateState("none", null);

      expect(state.clientIP).toBeNull();
    });
  });

  describe("expire()", () => {
    test("should not change state when state is 'none'", () => {
      state.updateState("none", null);
      state.expire();
      expect(state.state).toBe("none");
    });

    test("should not expire when state is valid", () => {
      state.updateState("ap0-device", "192.168.12.100");
      state.expire();

      expect(state.state).toBe("ap0-device");
      expect(state.clientIP).toBe("192.168.12.100");
      expect(state.acquiredAt).not.toBeNull();
    });

    test("should expire state when older than 10 minutes", () => {
      state.updateState("ap0-device", "192.168.12.100");

      // Set acquiredAt to 11 minutes ago
      const elevenMinutesAgo = new Date(Date.now() - 11 * 60 * 1000);
      state.acquiredAt = elevenMinutesAgo;

      state.expire();

      expect(state.state).toBe("none");
      expect(state.acquiredAt).toBeNull();
      expect(state.clientIP).toBeNull();
    });

    test("should expire ap0-device state", () => {
      state.updateState("ap0-device", "192.168.12.100");

      // Make state expired
      state.acquiredAt = new Date(Date.now() - 11 * 60 * 1000);
      state.expire();

      expect(state.state).toBe("none");
    });

    test("should expire wlan0-device state", () => {
      state.updateState("wlan0-device", "192.168.1.50");

      // Make state expired
      state.acquiredAt = new Date(Date.now() - 11 * 60 * 1000);
      state.expire();

      expect(state.state).toBe("none");
    });

    test("should not expire when exactly 9 minutes 59 seconds old", () => {
      state.updateState("ap0-device", "192.168.12.100");

      // Set to 9:59 ago
      state.acquiredAt = new Date(Date.now() - 9 * 60 * 1000 - 59000);
      state.expire();

      expect(state.state).toBe("ap0-device");
      expect(state.acquiredAt).not.toBeNull();
    });
  });

  describe("getInfo()", () => {
    test("should return correct info for 'none' state", () => {
      const info = state.getInfo();

      expect(info.state).toBe("none");
      expect(info.valid).toBe(false);
      expect(info.acquiredAt).toBeNull();
      expect(info.ageSeconds).toBeNull();
      expect(info.clientIP).toBeNull();
    });

    test("should return correct info for ap0-device state", () => {
      state.updateState("ap0-device", "192.168.12.100");
      const info = state.getInfo();

      expect(info.state).toBe("ap0-device");
      expect(info.valid).toBe(true);
      expect(info.acquiredAt).toBeInstanceOf(Date);
      expect(info.ageSeconds).toBe(0); // Just created
      expect(info.clientIP).toBe("192.168.12.100");
    });

    test("should return correct info for wlan0-device state", () => {
      state.updateState("wlan0-device", "192.168.1.50");
      const info = state.getInfo();

      expect(info.state).toBe("wlan0-device");
      expect(info.valid).toBe(true);
      expect(info.clientIP).toBe("192.168.1.50");
    });

    test("should calculate ageSeconds correctly", () => {
      state.updateState("ap0-device", "192.168.12.100");

      // Set acquiredAt to 5 minutes ago
      state.acquiredAt = new Date(Date.now() - 5 * 60 * 1000);

      const info = state.getInfo();
      expect(info.ageSeconds).toBeGreaterThanOrEqual(299); // 4:59
      expect(info.ageSeconds).toBeLessThanOrEqual(301); // 5:01
    });

    test("should show valid=false when state is expired", () => {
      state.updateState("ap0-device", "192.168.12.100");

      // Make state expired
      state.acquiredAt = new Date(Date.now() - 11 * 60 * 1000);

      const info = state.getInfo();
      expect(info.valid).toBe(false);
      expect(info.state).toBe("ap0-device"); // State not auto-expired by getInfo
    });

    test("should return new object each call (not reference)", () => {
      const info1 = state.getInfo();
      const info2 = state.getInfo();

      expect(info1).not.toBe(info2); // Different objects
      expect(info1).toEqual(info2); // But same content
    });
  });

  describe("state validity window", () => {
    test("should use 10-minute validity window", () => {
      state.updateState("ap0-device", "192.168.12.100");

      // Test at 9:59
      state.acquiredAt = new Date(Date.now() - 9 * 60 * 1000 - 59000);
      expect(state.isValid()).toBe(true);

      // Test at 10:00
      state.acquiredAt = new Date(Date.now() - 10 * 60 * 1000);
      expect(state.isValid()).toBe(false);

      // Test at 10:01
      state.acquiredAt = new Date(Date.now() - 10 * 60 * 1000 - 1000);
      expect(state.isValid()).toBe(false);
    });
  });

  describe("state transitions", () => {
    test("should support none → ap0-device transition", () => {
      expect(state.state).toBe("none");
      state.updateState("ap0-device", "192.168.12.100");
      expect(state.state).toBe("ap0-device");
      expect(state.isValid()).toBe(true);
    });

    test("should support none → wlan0-device transition", () => {
      expect(state.state).toBe("none");
      state.updateState("wlan0-device", "192.168.1.50");
      expect(state.state).toBe("wlan0-device");
      expect(state.isValid()).toBe(true);
    });

    test("should support ap0-device → none transition on expiry", () => {
      state.updateState("ap0-device", "192.168.12.100");
      state.acquiredAt = new Date(Date.now() - 11 * 60 * 1000);
      state.expire();

      expect(state.state).toBe("none");
      expect(state.isValid()).toBe(false);
    });

    test("should support wlan0-device → ap0-device transition", () => {
      state.updateState("wlan0-device", "192.168.1.50");
      expect(state.state).toBe("wlan0-device");

      state.updateState("ap0-device", "192.168.12.100");
      expect(state.state).toBe("ap0-device");
      expect(state.clientIP).toBe("192.168.12.100");
    });

    test("should support ap0-device → wlan0-device transition", () => {
      state.updateState("ap0-device", "192.168.12.100");
      expect(state.state).toBe("ap0-device");

      state.updateState("wlan0-device", "192.168.1.50");
      expect(state.state).toBe("wlan0-device");
      expect(state.clientIP).toBe("192.168.1.50");
    });
  });

  describe("edge cases", () => {
    test("should handle rapid updateState calls", () => {
      state.updateState("ap0-device", "192.168.12.100");
      state.updateState("wlan0-device", "192.168.1.50");
      state.updateState("ap0-device", "192.168.12.101");

      expect(state.state).toBe("ap0-device");
      expect(state.clientIP).toBe("192.168.12.101");
      expect(state.isValid()).toBe(true);
    });

    test("should handle multiple expire calls", () => {
      state.updateState("ap0-device", "192.168.12.100");
      state.acquiredAt = new Date(Date.now() - 11 * 60 * 1000);

      state.expire();
      state.expire();
      state.expire();

      expect(state.state).toBe("none");
    });

    test("should handle updateState with same parameters", () => {
      state.updateState("ap0-device", "192.168.12.100");
      const firstAcquiredAt = state.acquiredAt;

      // Small delay to ensure time difference
      const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      return delay(10).then(() => {
        state.updateState("ap0-device", "192.168.12.100");

        expect(state.state).toBe("ap0-device");
        expect(state.clientIP).toBe("192.168.12.100");
        expect(state.acquiredAt.getTime()).toBeGreaterThan(
          firstAcquiredAt.getTime(),
        );
      });
    });

    test("should handle getInfo on expired state without auto-expiring", () => {
      state.updateState("ap0-device", "192.168.12.100");
      state.acquiredAt = new Date(Date.now() - 11 * 60 * 1000);

      const info = state.getInfo();

      // getInfo should report invalid, but not auto-expire the state
      expect(info.valid).toBe(false);
      expect(info.state).toBe("ap0-device"); // Still ap0-device
      expect(state.state).toBe("ap0-device"); // State unchanged
    });
  });
});
