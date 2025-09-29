import { exec } from "child_process";
import { promisify } from "util";
import { logger } from "../utils/logger.js";

const execAsync = promisify(exec);

export class PowerManager {
  constructor() {
    this.batteryInfo = null;
    this.thermalInfo = null;
    this.lastUpdate = null;
    this.updateInterval = null;
    this.isRaspberryPi = null;
  }

  async initialize() {
    logger.info("Initializing power manager...");

    // Detect if running on Raspberry Pi
    this.isRaspberryPi = await this.detectRaspberryPi();

    if (this.isRaspberryPi) {
      logger.info(
        "Raspberry Pi detected, enabling Pi-specific power monitoring",
      );
      this.startPowerMonitoring();
    } else {
      logger.info("Non-Pi environment detected, using basic power monitoring");
    }

    // Initial power status update
    await this.updatePowerStatus();
  }

  async detectRaspberryPi() {
    try {
      const { stdout } = await execAsync(
        'cat /proc/cpuinfo 2>/dev/null | grep -i "raspberry" || echo ""',
      );
      return stdout.trim().length > 0;
    } catch (error) {
      return false;
    }
  }

  startPowerMonitoring() {
    // Update power status every 30 seconds for battery optimization
    this.updateInterval = setInterval(async () => {
      await this.updatePowerStatus();
    }, 30000);
  }

  async updatePowerStatus() {
    try {
      this.lastUpdate = new Date().toISOString();

      if (this.isRaspberryPi) {
        await Promise.all([
          this.updateRaspberryPiBattery(),
          this.updateThermalInfo(),
        ]);
      } else {
        await this.updateGenericPowerInfo();
      }
    } catch (error) {
      logger.error("Failed to update power status:", error);
    }
  }

  async updateRaspberryPiBattery() {
    try {
      // Check for UPS HAT or battery monitoring
      const commands = [
        // Common UPS HAT commands
        'cat /sys/class/power_supply/BAT*/capacity 2>/dev/null || echo ""',
        'cat /sys/class/power_supply/BAT*/status 2>/dev/null || echo ""',
        // Pi power status
        'vcgencmd get_throttled 2>/dev/null || echo ""',
        'vcgencmd measure_volts core 2>/dev/null || echo ""',
        // System uptime
        'cat /proc/uptime 2>/dev/null || echo ""',
      ];

      const results = await Promise.allSettled(
        commands.map((cmd) => execAsync(cmd)),
      );

      this.batteryInfo = {
        capacity: this.parseCapacity(results[0]),
        status: this.parseStatus(results[1]),
        throttled: this.parseThrottled(results[2]),
        voltage: this.parseVoltage(results[3]),
        systemUptime: this.parseSystemUptime(results[4]),
        isPowerConnected: true, // Default assumption
      };

      // Check for low power warning
      if (this.batteryInfo.throttled && this.batteryInfo.throttled !== "0x0") {
        logger.warn("Power throttling detected:", this.batteryInfo.throttled);
      } else if (this.batteryInfo.throttled === "0x0") {
        logger.debug("No throttling detected:", this.batteryInfo.throttled);
      }
    } catch (error) {
      logger.debug("Error reading Pi battery info:", error.message);
      this.batteryInfo = { error: "Battery info not available" };
    }
  }

  async updateThermalInfo() {
    try {
      const { stdout } = await execAsync(
        'vcgencmd measure_temp 2>/dev/null || echo ""',
      );
      const tempMatch = stdout.match(/temp=([0-9.]+)/);

      this.thermalInfo = {
        temperature: tempMatch ? parseFloat(tempMatch[1]) : null,
        unit: "C",
        timestamp: new Date().toISOString(),
      };

      // Thermal warnings for field operation
      if (this.thermalInfo.temperature > 70) {
        logger.warn(
          `High CPU temperature detected: ${this.thermalInfo.temperature}°C`,
        );
      }
    } catch (error) {
      logger.debug("Error reading thermal info:", error.message);
      this.thermalInfo = { error: "Thermal info not available" };
    }
  }

  async updateGenericPowerInfo() {
    // For non-Pi systems, provide basic system info
    this.batteryInfo = {
      type: "system",
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      platform: process.platform,
    };
  }

  parseCapacity(result) {
    if (result.status === "fulfilled" && result.value.stdout.trim()) {
      return parseInt(result.value.stdout.trim());
    }
    return null;
  }

  parseStatus(result) {
    if (result.status === "fulfilled" && result.value.stdout.trim()) {
      return result.value.stdout.trim().toLowerCase();
    }
    return null;
  }

  parseThrottled(result) {
    if (result.status === "fulfilled" && result.value.stdout.trim()) {
      const output = result.value.stdout.trim();
      // Extract just the hex value from "throttled=0x0"
      const match = output.match(/throttled=(0x[0-9a-fA-F]+)/);
      return match ? match[1] : output;
    }
    return null;
  }

  parseVoltage(result) {
    if (result.status === "fulfilled") {
      const voltMatch = result.value.stdout.match(/([0-9.]+)V/);
      return voltMatch ? parseFloat(voltMatch[1]) : null;
    }
    return null;
  }

  parseSystemUptime(result) {
    if (result.status === "fulfilled" && result.value.stdout.trim()) {
      // /proc/uptime format: "uptime_seconds idle_seconds"
      const uptimeMatch = result.value.stdout.trim().split(" ")[0];
      return parseFloat(uptimeMatch);
    }
    return null;
  }

  getStatus() {
    return {
      isRaspberryPi: this.isRaspberryPi,
      battery: this.batteryInfo,
      thermal: this.thermalInfo,
      lastUpdate: this.lastUpdate,
      powerOptimized: true, // Always true for this implementation
      recommendations: this.getPowerRecommendations(),
    };
  }

  getPowerRecommendations() {
    const recommendations = [];

    if (this.thermalInfo?.temperature > 70) {
      recommendations.push(
        "High temperature detected - consider cooling or reducing workload",
      );
    }

    if (this.batteryInfo?.capacity && this.batteryInfo.capacity < 20) {
      recommendations.push(
        "Low battery - consider connecting power or reducing activity",
      );
    }

    if (this.batteryInfo?.throttled && this.batteryInfo.throttled !== "0x0") {
      recommendations.push(
        "Power throttling active - check power supply and connections",
      );
    }

    return recommendations;
  }

  async cleanup() {
    logger.info("Cleaning up power manager...");

    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }
}
