/**
 * Pi Proxy State Management for Time Synchronization
 *
 * Tracks which time source (if any) the Pi is currently acting as a proxy for.
 * The Pi can only be considered reliable when synced to a client recently.
 *
 * State values:
 * - 'none': Pi is not a proxy (no recent client sync OR sync >10 min ago)
 * - 'ap0-device': Pi is proxy for ap0 client (synced within last 10 minutes)
 * - 'wlan0-device': Pi is proxy for wlan0 client (synced within last 10 minutes)
 *
 * Key principle: "The Pi should never be considered reliable because its RTC
 * does not have a battery." The Pi can only be reliable as a proxy.
 */

const DEFAULT_VALIDITY_WINDOW = 10 * 60 * 1000; // 10 minutes in milliseconds

export class PiProxyState {
  constructor(validityWindow = DEFAULT_VALIDITY_WINDOW) {
    this.state = "none"; // 'none' | 'ap0-device' | 'wlan0-device'
    this.acquiredAt = null; // Date when state was acquired
    this.clientIP = null; // IP of sync source (if applicable)
    this.validityWindow = validityWindow; // Configurable for testing
  }

  /**
   * Check if current state is valid (within validity window)
   *
   * @returns {boolean} true if state is valid, false otherwise
   */
  isValid() {
    if (this.state === "none") return false;
    if (!this.acquiredAt) return false;

    const ageMs = Date.now() - this.acquiredAt.getTime();
    return ageMs < this.validityWindow;
  }

  /**
   * Update state after sync
   *
   * @param {string} newState - 'none' | 'ap0-device' | 'wlan0-device'
   * @param {string|null} clientIP - IP address of sync source (null for 'none')
   */
  updateState(newState, clientIP) {
    this.state = newState;
    this.acquiredAt = new Date();
    this.clientIP = clientIP;
  }

  /**
   * Expire state if invalid (automatic after 10 minutes)
   *
   * This method checks if the state is expired and transitions to 'none' if so.
   * It does NOT auto-expire on every access - call this explicitly when needed.
   */
  expire() {
    if (this.state !== "none" && !this.isValid()) {
      this.state = "none";
      this.acquiredAt = null;
      this.clientIP = null;
    }
  }

  /**
   * Get current state info for monitoring/debugging
   *
   * @returns {Object} State information object
   * @returns {string} .state - Current state value
   * @returns {boolean} .valid - Whether state is currently valid
   * @returns {Date|null} .acquiredAt - When state was acquired
   * @returns {number|null} .ageSeconds - Age of state in seconds
   * @returns {string|null} .clientIP - IP of sync source
   */
  getInfo() {
    return {
      state: this.state,
      valid: this.isValid(),
      acquiredAt: this.acquiredAt,
      ageSeconds: this.acquiredAt
        ? Math.floor((Date.now() - this.acquiredAt.getTime()) / 1000)
        : null,
      clientIP: this.clientIP,
    };
  }
}
