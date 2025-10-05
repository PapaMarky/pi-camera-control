/**
 * System Time Utilities
 *
 * Utilities for synchronizing system time on Linux
 */

import { spawn } from "child_process";
import { logger } from "./logger.js";

/**
 * Set system time using promisified spawn
 * @param {Date} clientTime - The time to set
 * @param {string} timezone - Optional timezone to set
 * @returns {Promise<{success: boolean, newTime: string, timezone: string, timezoneSync: object}>}
 */
export async function syncSystemTime(clientTime, timezone = null) {
  // Skip on non-Linux systems
  if (process.platform !== "linux") {
    logger.warn("Time sync only supported on Linux");
    throw new Error("Time synchronization only supported on Linux systems");
  }

  // Format time for date command (YYYY-MM-DD HH:MM:SS UTC)
  const formattedTime = clientTime.toISOString().slice(0, 19).replace("T", " ");

  logger.info(
    `Setting system time to: ${formattedTime} UTC (from: ${new Date().toISOString()})`,
  );

  // Set system time in UTC - wrap spawn in promise
  await new Promise((resolve, reject) => {
    const setTime = spawn("sudo", ["date", "-u", "-s", formattedTime], {
      stdio: "pipe",
    });

    setTime.on("close", (code) => {
      if (code === 0) {
        logger.info(
          `System time synchronized successfully to UTC: ${formattedTime}`,
        );
        resolve();
      } else {
        const error = new Error(
          `Failed to set system time, exit code: ${code}`,
        );
        logger.error(error.message);
        reject(error);
      }
    });

    setTime.on("error", (error) => {
      logger.error("Error setting system time:", error);
      reject(error);
    });
  });

  // Set timezone if provided
  let timezoneSetResult = null;
  if (timezone) {
    try {
      await setSystemTimezone(timezone);
      timezoneSetResult = { success: true, timezone };
    } catch (error) {
      logger.warn(`Failed to set timezone: ${error.message}`);
      timezoneSetResult = { success: false, error: error.message };
    }
  }

  // Get current time and timezone
  const newTime = new Date().toISOString();
  const newTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return {
    success: true,
    newTime,
    timezone: newTimezone,
    timezoneSync: timezoneSetResult,
  };
}

/**
 * Set system timezone using timedatectl
 * @param {string} timezone - Timezone to set (e.g., 'America/Los_Angeles')
 * @returns {Promise<void>}
 */
export async function setSystemTimezone(timezone) {
  return new Promise((resolve, reject) => {
    const setTz = spawn("sudo", ["timedatectl", "set-timezone", timezone], {
      stdio: "pipe",
    });

    setTz.on("close", (code) => {
      if (code === 0) {
        logger.info(`System timezone set to: ${timezone}`);
        resolve();
      } else {
        reject(new Error(`Failed to set timezone, exit code: ${code}`));
      }
    });

    setTz.on("error", (error) => {
      logger.error("Error setting timezone:", error);
      reject(error);
    });
  });
}
