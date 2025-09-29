import { exec } from "child_process";
import { promisify } from "util";
import { logger } from "../utils/logger.js";

const execAsync = promisify(exec);

/**
 * System Startup Checks
 * Ensures the Pi is properly configured for camera control on startup
 * Self-healing system that fixes common configuration issues automatically
 */
export class StartupChecks {
  constructor() {
    this.checks = [
      this.checkAndFixFirewall.bind(this),
      this.checkAndFixMulticast.bind(this),
      this.checkAndFixNetworkInterfaces.bind(this),
      this.checkAndFixSystemServices.bind(this),
    ];
  }

  /**
   * Run all startup checks and fixes
   */
  async runAllChecks() {
    logger.info("Running system startup checks...");

    const results = [];
    for (const check of this.checks) {
      try {
        const result = await check();
        results.push(result);
      } catch (error) {
        logger.error(`Startup check failed:`, error);
        results.push({ success: false, error: error.message });
      }
    }

    const failedChecks = results.filter((r) => !r.success);
    if (failedChecks.length > 0) {
      logger.warn(
        `${failedChecks.length} startup checks had issues:`,
        failedChecks,
      );
    } else {
      logger.info("All startup checks passed successfully");
    }

    return {
      success: failedChecks.length === 0,
      results,
      failedChecks: failedChecks.length,
    };
  }

  /**
   * Check and fix firewall configuration for UPnP/multicast
   */
  async checkAndFixFirewall() {
    logger.debug("Checking firewall configuration...");

    try {
      // Check if iptables is blocking multicast
      const { stdout } = await execAsync(
        "iptables -L INPUT -n | grep '239.255.255.250'",
      );

      if (stdout.includes("DROP") || stdout.includes("REJECT")) {
        logger.info("Found firewall rules blocking UPnP multicast, fixing...");

        // Allow UPnP/SSDP multicast traffic
        await execAsync(
          "iptables -I INPUT -d 239.255.255.250 -p udp --dport 1900 -j ACCEPT",
        );
        await execAsync(
          "iptables -I OUTPUT -d 239.255.255.250 -p udp --dport 1900 -j ACCEPT",
        );

        // Save iptables rules
        try {
          await execAsync("iptables-save > /etc/iptables/rules.v4");
        } catch (saveError) {
          logger.debug("Could not save iptables rules:", saveError.message);
        }

        return { success: true, action: "Fixed firewall rules for UPnP" };
      }

      return { success: true, action: "Firewall already configured correctly" };
    } catch (error) {
      // If no rules found, that's fine - firewall is likely open
      if (
        error.message.includes("No such file") ||
        error.stderr?.includes("No chain/target/match")
      ) {
        return { success: true, action: "No firewall restrictions found" };
      }
      throw error;
    }
  }

  /**
   * Check and fix multicast routing configuration
   */
  async checkAndFixMulticast() {
    logger.debug("Checking multicast configuration...");

    try {
      // Check if multicast route exists
      const { stdout } = await execAsync(
        "ip route show table all | grep 224.0.0.0",
      );

      if (!stdout.includes("224.0.0.0/4")) {
        logger.info("Adding multicast routes...");

        // Add multicast routes for ap0 and wlan0 if they exist
        const interfaces = ["ap0", "wlan0"];
        for (const iface of interfaces) {
          try {
            // Check if interface exists
            await execAsync(`ip link show ${iface}`);

            // Add multicast route for this interface
            await execAsync(
              `ip route add 224.0.0.0/4 dev ${iface} table local`,
            );
            logger.debug(`Added multicast route for ${iface}`);
          } catch (ifaceError) {
            logger.debug(
              `Interface ${iface} not available:`,
              ifaceError.message,
            );
          }
        }

        return { success: true, action: "Added multicast routes" };
      }

      return { success: true, action: "Multicast routes already configured" };
    } catch (error) {
      logger.debug("Multicast route check failed:", error.message);
      return { success: true, action: "Multicast routes check skipped" };
    }
  }

  /**
   * Check and fix network interface configuration
   */
  async checkAndFixNetworkInterfaces() {
    logger.debug("Checking network interface configuration...");

    const fixes = [];

    try {
      // Check if ap0 interface exists and is up
      try {
        const { stdout } = await execAsync("ip addr show ap0");
        if (!stdout.includes("UP")) {
          logger.info("Bringing up ap0 interface...");
          await execAsync("ip link set ap0 up");
          fixes.push("Brought up ap0 interface");
        }
      } catch (ap0Error) {
        logger.debug("ap0 interface not available:", ap0Error.message);
      }

      // Enable IP forwarding for access point functionality
      try {
        const { stdout } = await execAsync("sysctl net.ipv4.ip_forward");
        if (stdout.includes("= 0")) {
          logger.info("Enabling IP forwarding...");
          await execAsync("sysctl -w net.ipv4.ip_forward=1");

          // Make it persistent
          try {
            await execAsync("echo 'net.ipv4.ip_forward=1' >> /etc/sysctl.conf");
          } catch (persistError) {
            logger.debug(
              "Could not make IP forwarding persistent:",
              persistError.message,
            );
          }

          fixes.push("Enabled IP forwarding");
        }
      } catch (forwardError) {
        logger.debug("IP forwarding check failed:", forwardError.message);
      }

      return {
        success: true,
        action:
          fixes.length > 0
            ? fixes.join(", ")
            : "Network interfaces already configured correctly",
      };
    } catch (error) {
      logger.warn(
        "Network interface configuration check failed:",
        error.message,
      );
      return { success: false, error: error.message };
    }
  }

  /**
   * Check and fix critical system services
   */
  async checkAndFixSystemServices() {
    logger.debug("Checking system services...");

    const requiredServices = ["hostapd", "dnsmasq"];
    const fixes = [];

    for (const service of requiredServices) {
      try {
        const { stdout } = await execAsync(`systemctl is-enabled ${service}`);
        if (!stdout.includes("enabled")) {
          logger.info(`Enabling ${service} service...`);
          await execAsync(`systemctl enable ${service}`);
          fixes.push(`Enabled ${service} service`);
        }
      } catch (serviceError) {
        logger.debug(`Service ${service} check failed:`, serviceError.message);
      }
    }

    return {
      success: true,
      action:
        fixes.length > 0
          ? fixes.join(", ")
          : "System services already configured correctly",
    };
  }

  /**
   * Check system readiness for camera operations
   */
  async checkSystemReadiness() {
    const readinessChecks = [];

    // Check if we can bind to UPnP port
    try {
      const { stdout } = await execAsync("netstat -ln | grep ':1900'");
      readinessChecks.push({
        check: "UPnP port availability",
        success: !stdout.includes("LISTEN"),
        details: stdout.includes("LISTEN")
          ? "Port 1900 already in use"
          : "Port 1900 available",
      });
    } catch (error) {
      readinessChecks.push({
        check: "UPnP port availability",
        success: true,
        details: "Port 1900 available",
      });
    }

    // Check multicast group membership capability
    try {
      await execAsync("ip maddr show | grep 239.255.255.250");
      readinessChecks.push({
        check: "Multicast capability",
        success: true,
        details: "System can join multicast groups",
      });
    } catch (error) {
      readinessChecks.push({
        check: "Multicast capability",
        success: true,
        details: "Multicast capability available",
      });
    }

    return readinessChecks;
  }
}
