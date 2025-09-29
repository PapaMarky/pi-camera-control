import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { logger } from "../utils/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Simple camera connection history tracker
 * Stores the last successful camera IP address for pre-population
 */
class CameraConnectionHistory {
  constructor() {
    this.historyFile = path.join(
      __dirname,
      "../../data/camera-connection-history.json",
    );
    this.lastSuccessfulIP = null;
    this.initialized = false;
  }

  /**
   * Initialize and load existing history
   */
  async initialize() {
    if (this.initialized) return;

    try {
      // Ensure data directory exists
      const dataDir = path.dirname(this.historyFile);
      await fs.mkdir(dataDir, { recursive: true });

      // Load existing history if it exists
      await this.load();
      this.initialized = true;
      logger.info("Camera connection history initialized");
    } catch (error) {
      logger.error("Failed to initialize camera connection history:", error);
      this.initialized = true; // Continue without history
    }
  }

  /**
   * Load history from file
   */
  async load() {
    try {
      const data = await fs.readFile(this.historyFile, "utf8");
      const parsed = JSON.parse(data);
      this.lastSuccessfulIP = parsed.lastSuccessfulIP || null;

      if (this.lastSuccessfulIP) {
        logger.debug(
          `Loaded last successful camera IP: ${this.lastSuccessfulIP}`,
        );
      }
    } catch (error) {
      if (error.code !== "ENOENT") {
        logger.warn("Failed to load camera connection history:", error);
      }
      // If file doesn't exist or is invalid, start fresh
      this.lastSuccessfulIP = null;
    }
  }

  /**
   * Save history to file
   */
  async save() {
    if (!this.initialized) return;

    try {
      const data = {
        lastSuccessfulIP: this.lastSuccessfulIP,
      };

      await fs.writeFile(
        this.historyFile,
        JSON.stringify(data, null, 2),
        "utf8",
      );
      logger.debug(`Saved camera connection history: ${this.lastSuccessfulIP}`);
    } catch (error) {
      logger.error("Failed to save camera connection history:", error);
    }
  }

  /**
   * Record a successful camera connection
   * @param {string} ip - The IP address of the successful connection
   */
  async recordConnection(ip) {
    if (!ip || typeof ip !== "string") {
      logger.warn("Invalid IP address provided to recordConnection:", ip);
      return;
    }

    // Basic IP validation
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipRegex.test(ip)) {
      logger.warn("Invalid IP address format:", ip);
      return;
    }

    const previousIP = this.lastSuccessfulIP;
    this.lastSuccessfulIP = ip;

    if (previousIP !== ip) {
      logger.info(`Updated last successful camera IP: ${ip}`);
      await this.save();
    }
  }

  /**
   * Get the last successful IP address for pre-population
   * @returns {string|null} The last successful IP or null if none recorded
   */
  getLastIP() {
    return this.lastSuccessfulIP;
  }

  /**
   * Clear the connection history
   */
  async clearHistory() {
    this.lastSuccessfulIP = null;
    await this.save();
    logger.info("Camera connection history cleared");
  }

  /**
   * Get status information for debugging
   */
  getStatus() {
    return {
      initialized: this.initialized,
      lastSuccessfulIP: this.lastSuccessfulIP,
      historyFile: this.historyFile,
    };
  }
}

export { CameraConnectionHistory };
