import { exec } from "child_process";
import { promisify } from "util";
import { logger } from "../utils/logger.js";
import { EventEmitter } from "events";

const execAsync = promisify(exec);

/**
 * Network Health Monitor
 * Detects and recovers from network interface failures
 */
export class NetworkHealthMonitor extends EventEmitter {
  constructor(checkInterval = 60000, connectionHistoryGetter = null) {
    super();
    this.checkInterval = checkInterval;
    this.monitorInterval = null;
    this.isRecovering = false;
    this.lastKnownCameraIP = null;
    this.lastKnownInterface = null;
    this.connectionHistoryGetter = connectionHistoryGetter;
  }

  /**
   * Start health monitoring
   */
  start() {
    if (this.monitorInterval) {
      logger.debug("Network health monitor already running");
      return;
    }

    logger.info(
      `Starting network health monitor (interval: ${this.checkInterval}ms)`,
    );

    // Run initial check after 1 second (immediately on startup)
    // This detects and fixes stale ARP state after reboot BEFORE auto-reconnect attempts
    setTimeout(() => {
      logger.info("Running initial network health check (startup)");
      this.checkHealth();
    }, 1000);

    // Then run regular checks
    this.monitorInterval = setInterval(
      () => this.checkHealth(),
      this.checkInterval,
    );
  }

  /**
   * Stop health monitoring
   */
  stop() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
      logger.info("Network health monitor stopped");
    }
  }

  /**
   * Set the camera IP to monitor
   */
  setCameraIP(ip) {
    this.lastKnownCameraIP = ip;
    this.lastKnownInterface = this.detectInterface(ip);
    logger.debug(
      `Camera IP ${ip} detected on interface ${this.lastKnownInterface}`,
    );
  }

  /**
   * Detect which interface the camera IP is on
   * @param {string} ip - Camera IP address
   * @returns {string} - Interface name (wlan0 or ap0)
   */
  detectInterface(ip) {
    // Access point network is 192.168.4.x
    if (ip.startsWith("192.168.4.")) {
      return "ap0";
    }
    // Everything else is on wlan0 (WiFi client)
    return "wlan0";
  }

  /**
   * Check network health
   */
  async checkHealth() {
    if (this.isRecovering) {
      logger.debug("Recovery in progress, skipping health check");
      return;
    }

    try {
      // Try to get camera IP from history if not already set
      if (!this.lastKnownCameraIP && this.connectionHistoryGetter) {
        const historyIP = this.connectionHistoryGetter();
        if (historyIP) {
          logger.info(
            `Health monitor loaded camera IP from history: ${historyIP}`,
          );
          this.setCameraIP(historyIP);
        }
      }

      // Check if camera IP is set
      if (!this.lastKnownCameraIP || !this.lastKnownInterface) {
        logger.debug("No camera IP to monitor");
        return;
      }

      // Check ARP/neighbor table for camera
      const { stdout } = await execAsync(
        `ip neigh show ${this.lastKnownCameraIP}`,
      );

      if (stdout.includes("FAILED") || stdout.includes("INCOMPLETE")) {
        logger.warn(
          `Network health check failed: Camera ${this.lastKnownCameraIP} has FAILED/INCOMPLETE ARP entry on ${this.lastKnownInterface}`,
        );
        await this.recoverInterface();
      }
    } catch (error) {
      logger.error("Network health check error:", error.message);
    }
  }

  /**
   * Recover network interface
   */
  async recoverInterface() {
    if (this.isRecovering) {
      logger.debug("Recovery already in progress");
      return;
    }

    if (!this.lastKnownInterface) {
      logger.error("Cannot recover interface: no interface detected");
      return;
    }

    this.isRecovering = true;
    logger.warn(
      `Attempting to recover ${this.lastKnownInterface} interface (stale ARP state detected)`,
    );

    try {
      // Restart interface
      await execAsync(`sudo ip link set ${this.lastKnownInterface} down`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await execAsync(`sudo ip link set ${this.lastKnownInterface} up`);
      await new Promise((resolve) => setTimeout(resolve, 3000));

      logger.info(
        `Interface ${this.lastKnownInterface} restarted successfully`,
      );

      // Emit recovery event
      this.emit("interface-recovered", {
        interface: this.lastKnownInterface,
        cameraIP: this.lastKnownCameraIP,
      });
    } catch (error) {
      logger.error("Failed to recover network interface:", error.message);
      this.emit("recovery-failed", {
        interface: this.lastKnownInterface,
        error: error.message,
      });
    } finally {
      this.isRecovering = false;
    }
  }

  /**
   * Manual trigger for recovery (for testing)
   */
  async triggerRecovery() {
    return await this.recoverInterface();
  }
}
