import { EventEmitter } from "events";
import { UPnPDiscovery } from "./upnp.js";
import { CameraStateManager } from "../camera/state-manager.js";
import { logger } from "../utils/logger.js";
import axios from "axios";

/**
 * Camera Discovery Manager
 * Manages automatic discovery of Canon cameras and delegates to CameraStateManager
 */
export class DiscoveryManager extends EventEmitter {
  constructor() {
    super();
    this.upnp = new UPnPDiscovery();
    this.cameraStateManager = new CameraStateManager();
    this.isDiscovering = false;

    // Bind UPnP events
    this.upnp.on("cameraDiscovered", (deviceInfo) => {
      this.handleCameraDiscovered(deviceInfo);
    });

    this.upnp.on("deviceOffline", (uuid) => {
      this.handleCameraOffline(uuid);
    });

    // Forward camera state manager events
    this.cameraStateManager.on("primaryCameraChanged", (data) => {
      this.emit("primaryCameraChanged", data);
    });

    this.cameraStateManager.on("primaryCameraDisconnected", (data) => {
      this.emit("primaryCameraDisconnected", data);
    });

    this.cameraStateManager.on("cameraRegistered", (data) => {
      this.emit("cameraDiscovered", data.info);
    });

    this.cameraStateManager.on("cameraConnectionFailed", (data) => {
      this.emit("cameraConnectionError", data);
    });

    this.cameraStateManager.on("cameraStatusChanged", (data) => {
      this.emit("cameraStatusChanged", data);
    });
  }

  /**
   * Initialize discovery manager
   */
  async initialize() {
    await this.cameraStateManager.initialize();
    logger.info("DiscoveryManager initialized");
  }

  /**
   * Start camera discovery
   */
  async startDiscovery() {
    if (this.isDiscovering) {
      logger.debug("Discovery already running");
      return true;
    }

    logger.info("Starting camera discovery...");

    try {
      const success = await this.upnp.startDiscovery();
      if (success) {
        this.isDiscovering = true;
        logger.info("Camera discovery started successfully");
        this.emit("discoveryStarted");

        // Perform initial fallback IP scanning to catch cameras that don't respond to UPnP
        logger.info("Performing initial fallback IP scanning...");
        try {
          await this.performFallbackScanning();
        } catch (scanError) {
          logger.warn("Fallback IP scanning failed:", scanError.message);
        }

        // Start periodic status logging
        this.logDiscoveryStatus();

        // Schedule periodic fallback scanning every 2 minutes
        this.schedulePeriodicFallbackScanning();
      }
      return success;
    } catch (error) {
      logger.error("Failed to start camera discovery:", error);
      return false;
    }
  }

  /**
   * Log discovery status for debugging
   */
  logDiscoveryStatus() {
    setInterval(() => {
      const networkInterfaces = this.upnp.getAvailableInterfaces();
      const cameras = this.cameraStateManager.getAllCameras();
      const cameraCount = Object.keys(cameras).length;

      logger.debug("Discovery status:", {
        isDiscovering: this.isDiscovering,
        cameras: cameraCount,
        networkInterfaces: networkInterfaces.map(
          (i) => `${i.name}:${i.address}`,
        ),
      });

      if (cameraCount > 0) {
        logger.debug("Discovered cameras:", Object.keys(cameras));
      }
    }, 30000); // Log every 30 seconds
  }

  /**
   * Stop camera discovery
   */
  async stopDiscovery() {
    if (!this.isDiscovering) {
      logger.debug("Discovery not running");
      return;
    }

    logger.info("Stopping camera discovery...");

    try {
      await this.upnp.stopDiscovery();
      this.isDiscovering = false;

      // Stop periodic fallback scanning
      if (this.fallbackScanInterval) {
        clearInterval(this.fallbackScanInterval);
        this.fallbackScanInterval = null;
      }

      // Cleanup camera state manager
      await this.cameraStateManager.cleanup();

      logger.info("Camera discovery stopped");
      this.emit("discoveryStopped");
    } catch (error) {
      logger.error("Error stopping discovery:", error);
    }
  }

  /**
   * Handle newly discovered camera
   */
  async handleCameraDiscovered(deviceInfo) {
    const uuid = deviceInfo.uuid;
    logger.info(
      `Camera discovered via UPnP: ${deviceInfo.modelName} at ${deviceInfo.ipAddress}`,
    );

    // Register with camera state manager
    await this.cameraStateManager.registerCamera(uuid, deviceInfo);
  }

  /**
   * Handle camera going offline
   */
  handleCameraOffline(uuid) {
    logger.info(`Camera going offline: ${uuid}`);
    this.cameraStateManager.removeCamera(uuid);
    this.emit("cameraOffline", uuid);
  }

  /**
   * Connect to a specific camera
   */
  async connectToCamera(uuid) {
    return await this.cameraStateManager.connectToCamera(uuid);
  }

  /**
   * Parse base URL to extract IP and port
   */
  parseBaseUrl(ccapiUrl) {
    try {
      // Ensure ccapiUrl is a string
      if (!ccapiUrl || typeof ccapiUrl !== "string") {
        logger.error("Invalid CCAPI URL - not a string:", ccapiUrl);
        throw new Error("CCAPI URL must be a string");
      }

      const url = new URL(ccapiUrl);
      return {
        ip: url.hostname,
        port: url.port || (url.protocol === "https:" ? "443" : "80"),
      };
    } catch (error) {
      logger.error("Failed to parse CCAPI URL:", ccapiUrl, error);
      // Fallback to default Canon camera port
      if (typeof ccapiUrl === "string") {
        return {
          ip: ccapiUrl.replace(/https?:\/\//, "").split(":")[0],
          port: "443",
        };
      } else {
        // Last resort - use the IP from remote address
        throw new Error("Cannot parse CCAPI URL - invalid format");
      }
    }
  }

  // Camera connection status changes are now handled by CameraStateManager

  /**
   * Set primary camera (the one used by the application)
   */
  async setPrimaryCamera(uuid) {
    return await this.cameraStateManager.connectToCamera(uuid);
  }

  /**
   * Get primary camera controller (backwards compatibility)
   */
  getPrimaryCamera() {
    return this.cameraStateManager.getPrimaryController();
  }

  /**
   * Get all discovered cameras
   */
  getDiscoveredCameras() {
    return Object.values(this.cameraStateManager.getAllCameras());
  }

  /**
   * Get camera by UUID
   */
  getCamera(uuid) {
    const cameras = this.cameraStateManager.getAllCameras();
    return cameras[uuid] || null;
  }

  /**
   * Schedule periodic fallback IP scanning
   */
  schedulePeriodicFallbackScanning() {
    if (this.fallbackScanInterval) {
      clearInterval(this.fallbackScanInterval);
    }

    this.fallbackScanInterval = setInterval(async () => {
      if (!this.isDiscovering) return;

      logger.debug("Performing periodic fallback IP scanning...");
      try {
        await this.performFallbackScanning();
      } catch (error) {
        logger.debug("Periodic fallback scanning failed:", error.message);
      }
    }, 120000); // Every 2 minutes

    logger.debug("Periodic fallback scanning scheduled");
  }

  /**
   * Manually trigger camera search
   */
  async searchForCameras() {
    if (!this.isDiscovering) {
      throw new Error("Discovery service not running");
    }

    logger.info("Manually triggering camera search...");

    // Trigger both UPnP search and fallback scanning
    const upnpPromise = this.upnp.performMSearch();
    const fallbackPromise = this.performFallbackScanning();

    await Promise.allSettled([upnpPromise, fallbackPromise]);
    return true;
  }

  /**
   * Connect to camera by IP (fallback method for manual configuration)
   */
  async connectToIp(ip, port = "443") {
    return await this.cameraStateManager.connectToIP(ip, port);
  }

  /**
   * Perform fallback IP scanning on known camera network ranges
   */
  async performFallbackScanning() {
    logger.debug("Starting fallback IP scanning for cameras...");

    const networkRanges = [
      "192.168.4", // Access point network
      "192.168.12", // Development network
      "192.168.1", // Common home network
      "192.168.0", // Another common range
    ];

    for (const baseRange of networkRanges) {
      logger.debug(`Scanning network range ${baseRange}.x`);

      // Scan full DHCP range for access point, and common camera ranges for other networks
      const promises = [];
      if (baseRange === "192.168.4") {
        // Access point network - scan full DHCP range (2-20)
        for (let i = 2; i <= 20; i++) {
          const ip = `${baseRange}.${i}`;
          promises.push(this.checkCameraAtIp(ip));
        }
      } else {
        // Other networks - scan common camera IP ranges (typically .90-99 for cameras)
        for (let i = 90; i <= 99; i++) {
          const ip = `${baseRange}.${i}`;
          promises.push(this.checkCameraAtIp(ip));
        }
      }

      // Wait for all scans in this range to complete
      await Promise.allSettled(promises);

      // Small delay between network ranges
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    logger.debug("Fallback IP scanning completed");
  }

  /**
   * Check if there's a Canon camera at a specific IP
   */
  async checkCameraAtIp(ip, port = "443") {
    try {
      logger.debug(`Checking for camera at ${ip}:${port}...`);

      // Quick timeout test to see if anything is listening
      const response = await axios.get(`https://${ip}:${port}/ccapi`, {
        timeout: 2000,
        httpsAgent: new (await import("https")).Agent({
          rejectUnauthorized: false, // Canon cameras use self-signed certs
        }),
      });

      if (response.status === 200 && response.data) {
        logger.info(`Found potential Canon camera at ${ip}:${port}`, {
          responseData: response.data,
          responseStatus: response.status,
        });

        // Create device info for discovered camera
        const uuid = `ip-scan-${ip}-${port}`;
        const deviceInfo = {
          uuid,
          ipAddress: ip,
          ccapiUrl: `https://${ip}:${port}/ccapi`,
          modelName: response.data.model || "Canon Camera",
          friendlyName: `Camera at ${ip}`,
          manufacturer: "Canon",
          discoveredAt: new Date(),
          isManual: true,
          discoveryMethod: "ip-scan",
        };

        logger.info(`Registering camera found via IP scan:`, deviceInfo);

        // Register with camera state manager
        await this.cameraStateManager.registerCamera(uuid, deviceInfo);
      } else {
        logger.debug(`Non-camera response from ${ip}:${port}`, {
          status: response.status,
          hasData: !!response.data,
        });
      }
    } catch (error) {
      // Expected for most IPs - they won't have cameras
      // Only log actual errors, not connection failures
      if (
        error.code !== "ECONNREFUSED" &&
        error.code !== "ETIMEDOUT" &&
        error.code !== "ENOTFOUND"
      ) {
        logger.debug(`IP scan error for ${ip}:`, error.message);
      } else {
        // Still log these but at trace level for debugging
        logger.debug(`Expected connection failure for ${ip}: ${error.code}`);
      }
    }
  }

  /**
   * Get discovery status
   */
  getStatus() {
    const stateStatus = this.cameraStateManager.getDiscoveryStatus();
    return {
      isDiscovering: this.isDiscovering,
      ...stateStatus,
    };
  }

  /**
   * Get the last successful camera IP for UI pre-population
   * @returns {string|null} The last successful IP or null if none recorded
   */
  getLastSuccessfulIP() {
    return this.cameraStateManager.getLastSuccessfulIP();
  }

  /**
   * Clear the camera connection history
   */
  async clearConnectionHistory() {
    return await this.cameraStateManager.clearConnectionHistory();
  }
}
