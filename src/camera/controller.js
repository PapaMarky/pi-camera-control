import axios from "axios";
import https from "https";
import { logger } from "../utils/logger.js";

// Disable SSL verification warnings for local camera connections
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

export class CameraController {
  constructor(ip, port = "443", onDisconnect = null) {
    this.ip = ip;
    this.port = port;
    this.baseUrl = `https://${ip}:${port}`;
    this.connected = false;
    this.lastError = null;
    this.shutterEndpoint = null;
    this.capabilities = null;
    // Removed automatic reconnection system
    this.pollingInterval = null;
    this.pollingPaused = false;
    this.monitoringPaused = false;
    this.onDisconnect = onDisconnect;

    // Connection monitoring tolerance
    this.consecutiveFailures = 0;
    this.maxConsecutiveFailures = 3; // Allow 3 consecutive failures before disconnecting

    // Create axios instance with connection pooling
    // Canon cameras have limited HTTPS connection capacity (1-3 concurrent)
    // Use keepAlive to reuse connections and maxSockets to prevent exhaustion
    this.client = axios.create({
      timeout: 10000,
      httpsAgent: new https.Agent({
        rejectUnauthorized: false,
        keepAlive: true, // Reuse TCP connections instead of creating new ones
        keepAliveMsecs: 30000, // Keep connections alive for 30 seconds
        maxSockets: 1, // Limit to 1 concurrent connection to prevent overwhelming camera
        maxFreeSockets: 1, // Keep 1 connection in the pool for reuse
      }),
    });
  }

  /**
   * Update camera IP and port configuration
   */
  async updateConfiguration(newIp, newPort = "443") {
    logger.info(
      `Updating camera configuration from ${this.baseUrl} to https://${newIp}:${newPort}`,
    );

    // Stop current connection monitoring
    this.stopConnectionMonitoring();

    // Update configuration
    this.ip = newIp;
    this.port = newPort;
    this.baseUrl = `https://${newIp}:${newPort}`;

    // Reset connection state
    this.connected = false;
    this.lastError = null;
    this.shutterEndpoint = null;
    this.capabilities = null;
    // Removed reconnectAttempts tracking

    // Attempt to connect with new configuration
    try {
      await this.connect();
      this.startConnectionMonitoring();
      logger.info(
        `Successfully updated camera configuration to ${this.baseUrl}`,
      );
      return true;
    } catch (error) {
      logger.error(
        `Failed to connect to new camera configuration ${this.baseUrl}:`,
        error,
      );
      return false;
    }
  }

  async initialize() {
    logger.info(`Initializing camera controller for ${this.baseUrl}`);

    try {
      await this.connect();
      this.startConnectionMonitoring();
      this.startInfoPolling();
      return true;
    } catch (error) {
      logger.error("Failed to initialize camera controller:", error);
      // Throw the actual error so caller gets specific error message
      throw error;
    }
  }

  /**
   * Connect to camera and discover available CCAPI endpoints
   *
   * CCAPI Reference: Root endpoint for capability discovery
   * Endpoint: GET /ccapi/
   * Response: Object with API versions as keys, each containing array of available endpoints
   *
   * Also verifies shooting settings endpoint availability (CCAPI 4.9.1)
   *
   * @param {number} retryAttempt - Current retry attempt (for 502 errors)
   * @param {number} maxRetries - Maximum retry attempts for 502 errors
   */
  async connect(retryAttempt = 0, maxRetries = 3) {
    try {
      logger.info("Discovering CCAPI endpoints...");
      const response = await this.client.get(`${this.baseUrl}/ccapi/`);

      this._capabilities = response.data;
      this.shutterEndpoint = this.findShutterEndpoint(this.capabilities);

      if (!this.shutterEndpoint) {
        throw new Error("No shutter control endpoint found");
      }

      // CCAPI 4.9.1: Test camera settings endpoint (bypass connection check during connection)
      try {
        await this.client.get(`${this.baseUrl}/ccapi/ver100/shooting/settings`);
        logger.debug("Camera settings endpoint verified");
      } catch (error) {
        logger.warn("Camera settings endpoint test failed:", error.message);
        // Continue anyway - some cameras may not support this endpoint
      }

      this.connected = true;
      this.lastError = null;
      this.consecutiveFailures = 0; // Reset failure counter on successful connection

      logger.info("Camera connected successfully", {
        shutterEndpoint: this.shutterEndpoint,
        capabilities: Object.keys(this.capabilities),
      });

      return true;
    } catch (error) {
      // Handle HTTP 502 (not a standard CCAPI response - camera HTTP service error)
      if (error.response?.status === 502) {
        logger.warn(
          `Camera returned HTTP 502 Gateway Error (attempt ${retryAttempt + 1}/${maxRetries})`,
        );
        logger.warn("Response body:", error.response?.data);
        logger.warn(
          "This is NOT a standard CCAPI response - camera HTTP service may be in error state",
        );

        if (retryAttempt < maxRetries - 1) {
          const delayMs = 5000; // Wait 5 seconds before retry
          logger.info(
            `Waiting ${delayMs}ms for camera to recover before retry...`,
          );
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          return this.connect(retryAttempt + 1, maxRetries);
        } else {
          logger.error(
            "Max retries reached for HTTP 502 error. Camera may need power cycle.",
          );
          const camera502Error = new Error(
            "Camera HTTP service returned 502 error. Camera may need to be power-cycled.",
          );
          camera502Error.code = "CAMERA_HTTP_502";
          camera502Error.status = 502;
          camera502Error.userMessage =
            "Camera needs restart - try power-cycling the camera";
          this.connected = false;
          this.lastError = camera502Error.message;
          throw camera502Error;
        }
      }

      this.connected = false;
      this.lastError = error.message;
      logger.error("Failed to connect to camera:", error);
      throw error;
    }
  }

  /**
   * Find best available shutter control endpoint from camera capabilities
   *
   * CCAPI Reference:
   * - 4.8.1: Still image shooting (regular) - /ccapi/ver100/shooting/control/shutterbutton
   * - 4.8.2: Still image shutter button control (manual) - /ccapi/ver100/shooting/control/shutterbutton/manual
   *
   * @param {Object} capabilities - Camera capabilities from /ccapi/ endpoint
   * @returns {string|null} Best available shutter endpoint path, or null if none found
   *
   * Priority: Regular endpoint (simpler, no release needed) > Manual endpoint
   */
  findShutterEndpoint(capabilities) {
    const endpoints = [];

    // Search through all API versions for shutter endpoints
    for (const [_version, endpointsList] of Object.entries(capabilities)) {
      // TODO: Consider using version for endpoint selection
      if (Array.isArray(endpointsList)) {
        for (const endpoint of endpointsList) {
          if (
            endpoint?.path &&
            endpoint.path.includes("shutterbutton") &&
            endpoint.post
          ) {
            endpoints.push(endpoint.path);
          }
        }
      }
    }

    // Prefer regular shutter endpoint over manual for better reliability
    const regularEndpoint = endpoints.find(
      (ep) => ep.includes("shutterbutton") && !ep.includes("manual"),
    );
    const manualEndpoint = endpoints.find((ep) => ep.includes("manual"));

    return regularEndpoint || manualEndpoint;
  }

  /**
   * Get all camera shooting parameters
   *
   * CCAPI Reference: 4.9.1 - Get all shooting parameters
   * Endpoint: GET /ccapi/ver100/shooting/settings
   * Response: Object containing all supported shooting parameters (av, tv, iso, wb, etc.)
   *
   * @returns {Promise<Object>} Camera shooting settings
   */
  async getCameraSettings() {
    if (!this.connected) {
      throw new Error("Camera not connected");
    }

    try {
      const response = await this.client.get(
        `${this.baseUrl}/ccapi/ver100/shooting/settings`,
      );
      return response.data;
    } catch (error) {
      // Extract Canon API error details
      const statusCode = error.response?.status || "unknown";
      const apiMessage = error.response?.data?.message || error.message;

      logger.error(
        `Failed to get camera settings - Status: ${statusCode}, API Message: "${apiMessage}"`,
      );

      // Log full response for Canon API errors (400, 503) for debugging
      if (error.response?.data && [400, 503].includes(error.response.status)) {
        logger.debug("Canon API error response:", error.response.data);
      }

      // If we get a network error or HTTP 502, handle disconnection
      if (
        error.code === "EHOSTUNREACH" ||
        error.code === "ECONNREFUSED" ||
        error.code === "ETIMEDOUT" ||
        error.response?.status === 502
      ) {
        if (error.response?.status === 502) {
          logger.warn(
            "HTTP 502: Camera HTTP service in error state (not standard CCAPI response)",
          );
        } else {
          logger.warn("Camera network error detected, handling disconnection");
        }
        this.handleDisconnection(error);
      }

      // Create a clean error with Canon's message
      const cleanError = new Error(
        apiMessage || "Failed to get camera settings",
      );
      cleanError.status = statusCode;
      cleanError.statusText = error.response?.statusText;
      cleanError.ccapiMessage = error.response?.data?.message;
      throw cleanError;
    }
  }

  /**
   * Update a specific camera setting
   *
   * CCAPI Reference: 4.9.1 - Update shooting parameter
   * Endpoint: PUT /ccapi/ver100/shooting/settings/{setting_name}
   * Request: { value: "setting_value" }
   *
   * @param {string} settingName - Name of the setting to update (e.g., 'iso', 'av', 'tv')
   * @param {string} value - New value for the setting
   * @returns {Promise<void>}
   * @throws {Error} If camera not connected or update fails
   */
  async updateCameraSetting(settingName, value) {
    if (!this.connected) {
      throw new Error("Camera not connected");
    }

    try {
      logger.debug(`Updating camera setting: ${settingName} = ${value}`);
      await this.client.put(
        `${this.baseUrl}/ccapi/ver100/shooting/settings/${settingName}`,
        { value },
      );
      logger.info(`Camera setting updated: ${settingName} = ${value}`);
    } catch (error) {
      // Extract Canon API error details
      const statusCode = error.response?.status || "unknown";
      const apiMessage = error.response?.data?.message || error.message;

      logger.error(
        `Failed to update camera setting ${settingName} - Status: ${statusCode}, API Message: "${apiMessage}"`,
      );

      // Log full response for Canon API errors (400, 503) for debugging
      if (error.response?.data && [400, 503].includes(error.response.status)) {
        logger.debug("Canon API error response:", error.response.data);
      }

      // If we get a network error or HTTP 502, handle disconnection
      if (
        error.code === "EHOSTUNREACH" ||
        error.code === "ECONNREFUSED" ||
        error.code === "ETIMEDOUT" ||
        error.response?.status === 502
      ) {
        if (error.response?.status === 502) {
          logger.warn(
            "HTTP 502: Camera HTTP service in error state (not standard CCAPI response)",
          );
        } else {
          logger.warn("Camera network error detected, handling disconnection");
        }
        this.handleDisconnection(error);
      }

      // Create a clean error with Canon's message
      const cleanError = new Error(
        apiMessage || `Failed to update setting ${settingName}`,
      );
      cleanError.status = statusCode;
      cleanError.statusText = error.response?.statusText;
      cleanError.settingName = settingName;
      cleanError.value = value;
      cleanError.ccapiMessage = error.response?.data?.message;
      throw cleanError;
    }
  }

  /**
   * Get camera fixed information (model, firmware, serial number, etc.)
   *
   * CCAPI Reference: 4.3.1 - Camera fixed information
   * Endpoint: GET /ccapi/ver100/deviceinformation
   * Response: { productname, firmwareversion, serialnumber, ... }
   *
   * @returns {Promise<Object>} Camera device information
   */
  async getDeviceInformation() {
    if (!this.connected) {
      throw new Error("Camera not connected");
    }

    try {
      const response = await this.client.get(
        `${this.baseUrl}/ccapi/ver100/deviceinformation`,
      );
      logger.debug("Retrieved device information", {
        productname: response.data.productname,
        serialnumber: response.data.serialnumber,
      });
      return response.data;
    } catch (error) {
      // Extract Canon API error details
      const statusCode = error.response?.status || "unknown";
      const apiMessage = error.response?.data?.message || error.message;

      logger.error(
        `Failed to get device information - Status: ${statusCode}, API Message: "${apiMessage}"`,
      );

      // Log full response for Canon API errors (400, 503) for debugging
      if (error.response?.data && [400, 503].includes(error.response.status)) {
        logger.debug("Canon API error response:", error.response.data);
      }

      // If we get a network error or HTTP 502, handle disconnection
      if (
        error.code === "EHOSTUNREACH" ||
        error.code === "ECONNREFUSED" ||
        error.code === "ETIMEDOUT" ||
        error.response?.status === 502
      ) {
        if (error.response?.status === 502) {
          logger.warn(
            "HTTP 502: Camera HTTP service in error state (not standard CCAPI response)",
          );
        } else {
          logger.warn("Camera network error detected, handling disconnection");
        }
        this.handleDisconnection(error);
      }

      // Create a clean error with Canon's message
      const cleanError = new Error(
        apiMessage || "Failed to get device information",
      );
      cleanError.status = statusCode;
      cleanError.statusText = error.response?.statusText;
      cleanError.ccapiMessage = error.response?.data?.message;
      throw cleanError;
    }
  }

  /**
   * Get camera battery information
   *
   * CCAPI Reference:
   * - 4.4.5: Battery information list (ver110) - Supports battery grip
   *   Endpoint: GET /ccapi/ver110/devicestatus/batterylist
   *   Response: { batterylist: [{ name, kind, level, quality }, ...] }
   * - 4.4.4: Battery information (ver100) - Single battery (fallback)
   *   Endpoint: GET /ccapi/ver100/devicestatus/battery
   *   Response: { name, kind, level, quality }
   *   Note: Cannot get detailed info when battery grip attached
   *
   * @returns {Promise<Object>} Battery info with batterylist array
   */
  async getCameraBattery() {
    if (!this.connected) {
      throw new Error("Camera not connected");
    }

    try {
      // CCAPI 4.4.4: Use ver100/battery for accurate battery level
      // Note: Canon EOS R50 returns incorrect percentage data from ver110/batterylist
      // but returns correct descriptive levels (half, full, etc.) from ver100/battery
      const response = await this.client.get(
        `${this.baseUrl}/ccapi/ver100/devicestatus/battery`,
      );
      logger.info(
        "Battery data from ver100/battery:",
        JSON.stringify(response.data),
      );

      // Wrap in batterylist array format for consistency with other endpoints
      return { batterylist: [response.data] };
    } catch (error) {
      // Extract Canon API error details
      const statusCode = error.response?.status || "unknown";
      const apiMessage = error.response?.data?.message || error.message;

      logger.error(
        `Failed to get camera battery - Status: ${statusCode}, API Message: "${apiMessage}"`,
      );

      // Log full response for Canon API errors (400, 503)
      if (error.response?.data && [400, 503].includes(statusCode)) {
        logger.debug("Canon API error response:", error.response.data);
      }

      // If we get a network error or HTTP 502, handle disconnection
      if (
        error.code === "EHOSTUNREACH" ||
        error.code === "ECONNREFUSED" ||
        error.code === "ETIMEDOUT" ||
        error.response?.status === 502
      ) {
        if (error.response?.status === 502) {
          logger.warn(
            "HTTP 502 during battery check: Camera HTTP service in error state (not standard CCAPI response)",
          );
        } else {
          logger.warn(
            "Camera network error detected during battery check, handling disconnection",
          );
        }
        this.handleDisconnection(error);
      }

      const cleanError = new Error(
        apiMessage || "Failed to get camera battery",
      );
      cleanError.status = statusCode;
      cleanError.statusText = error.response?.statusText;
      throw cleanError;
    }
  }

  /**
   * Get SD card storage information
   *
   * CCAPI Reference: 4.4.1 - Storage information
   * Endpoint: GET /ccapi/ver110/devicestatus/storage
   * Response: { storagelist: Array<StorageInfo> }
   *
   * StorageInfo fields:
   * - name: string (e.g., "card1")
   * - path: string (e.g., "/ccapi/ver110/contents/card1")
   * - accesscapability: "readwrite" | "readonly"
   * - maxsize: number (total capacity in bytes)
   * - spacesize: number (available free space in bytes)
   * - contentsnumber: number (total files on card)
   *
   * @returns {Promise<Object>} Storage information with calculated used space
   * @throws {Error} If camera not connected
   */
  async getStorageInfo() {
    if (!this.connected) {
      throw new Error("Camera not connected");
    }

    try {
      const response = await this.client.get(
        `${this.baseUrl}/ccapi/ver110/devicestatus/storage`,
      );

      if (!response.data || !response.data.storagelist) {
        throw new Error("Invalid storage response from camera");
      }

      const storageList = response.data.storagelist;

      // Handle no SD card case
      if (storageList.length === 0) {
        return {
          mounted: false,
          name: null,
          totalBytes: 0,
          freeBytes: 0,
          usedBytes: 0,
          totalMB: 0,
          freeMB: 0,
          usedMB: 0,
          percentUsed: 0,
          contentCount: 0,
          accessMode: null,
        };
      }

      // EOS R50 has single card slot, use first storage
      const storage = storageList[0];
      const usedBytes = storage.maxsize - storage.spacesize;
      const totalMB = Math.round(storage.maxsize / (1024 * 1024));
      const freeMB = Math.round(storage.spacesize / (1024 * 1024));
      const usedMB = Math.round(usedBytes / (1024 * 1024));
      const percentUsed = Math.round((usedBytes / storage.maxsize) * 100);

      return {
        mounted: true,
        name: storage.name,
        totalBytes: storage.maxsize,
        freeBytes: storage.spacesize,
        usedBytes: usedBytes,
        totalMB: totalMB,
        freeMB: freeMB,
        usedMB: usedMB,
        percentUsed: percentUsed,
        contentCount: storage.contentsnumber,
        accessMode: storage.accesscapability,
      };
    } catch (error) {
      // Extract Canon API error details
      const statusCode = error.response?.status || "unknown";
      const apiMessage = error.response?.data?.message || error.message;

      logger.error(
        `Failed to get storage info - Status: ${statusCode}, API Message: "${apiMessage}"`,
      );

      // Handle network errors or HTTP 502
      if (
        error.code === "EHOSTUNREACH" ||
        error.code === "ECONNREFUSED" ||
        error.code === "ETIMEDOUT" ||
        error.response?.status === 502
      ) {
        if (error.response?.status === 502) {
          logger.warn(
            "HTTP 502 during storage check: Camera HTTP service in error state (not standard CCAPI response)",
          );
        } else {
          logger.warn("Camera network error detected during storage check");
        }
        this.handleDisconnection(error);
      }

      const cleanError = new Error(
        apiMessage || "Failed to get storage information",
      );
      cleanError.status = statusCode;
      cleanError.statusText = error.response?.statusText;
      throw cleanError;
    }
  }

  /**
   * Take a photo using the camera's shutter control
   *
   * Uses discovered shutter endpoint (either regular or manual).
   * Automatically releases shutter first (manual endpoint only), then presses and releases.
   *
   * CCAPI Reference: 4.8.1 (regular) or 4.8.2 (manual) - See pressShutter() and releaseShutter()
   *
   * @returns {Promise<boolean>} True if photo taken successfully
   */
  async takePhoto() {
    if (!this.connected || !this.shutterEndpoint) {
      throw new Error("Camera not connected or no shutter endpoint available");
    }

    try {
      logger.debug("Taking photo...");

      // Note: Connection monitoring should be paused by intervalometer session

      // Release any stuck shutter first (manual endpoint only)
      await this.releaseShutter();

      // Press shutter with manual focus only (no AF for timelapses)
      const pressResult = await this.pressShutter(false); // Always manual focus

      if (!pressResult) {
        throw new Error("Failed to press shutter");
      }

      // Wait for camera processing (increased for stability)
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Release shutter
      const releaseResult = await this.releaseShutter();
      if (!releaseResult) {
        logger.warn("Shutter release may have failed but photo likely taken");
      }

      logger.info("Photo taken successfully");
      return true;
    } catch (error) {
      logger.error("Failed to take photo:", error);
      await this.releaseShutter(); // Attempt recovery
      throw error;
    } finally {
      // Note: Connection monitoring resume handled by intervalometer session
    }
  }

  /**
   * Press camera shutter button
   *
   * CCAPI Reference:
   * - 4.8.1: Still image shooting (regular endpoint)
   *   Endpoint: POST /ccapi/ver100/shooting/control/shutterbutton
   *   Request: { "af": boolean }
   *   Response 200: {} (empty object)
   *   Note: Automatically releases shutter, no explicit release needed
   *
   * - 4.8.2: Still image shutter button control (manual endpoint)
   *   Endpoint: POST /ccapi/ver100/shooting/control/shutterbutton/manual
   *   Request: { "action": "full_press", "af": boolean }
   *   Response 200: {} (empty object)
   *   Note: Requires explicit release() call
   *
   * Error responses (both): 400 (invalid parameter), 503 (device busy, out of focus, etc.)
   *
   * @param {boolean} useAutofocus - Enable autofocus (false for manual focus timelapses)
   * @returns {Promise<boolean>} True if press successful
   */
  async pressShutter(useAutofocus = false) {
    // Determine payload based on endpoint type
    let payload;
    const isManualEndpoint =
      this.shutterEndpoint && this.shutterEndpoint.includes("manual");

    if (isManualEndpoint) {
      // CCAPI 4.8.2: Manual endpoint requires action parameter
      payload = {
        af: useAutofocus,
        action: "full_press",
      };
    } else {
      // CCAPI 4.8.1: Regular shooting endpoint
      payload = {
        af: useAutofocus,
      };
    }

    try {
      // Use longer timeout for photo operations (30 seconds) to handle long exposures
      const response = await this.client.post(
        `${this.baseUrl}${this.shutterEndpoint}`,
        payload,
        {
          timeout: 30000,
        },
      );
      return response.status >= 200 && response.status < 300;
    } catch (error) {
      if (error.code === "ECONNABORTED") {
        logger.warn(
          "Shutter press timed out after 30 seconds - camera may be busy with long exposure",
        );
      } else {
        // Extract Canon API error details
        const statusCode = error.response?.status || "unknown";
        const apiMessage = error.response?.data?.message || error.message;
        const endpoint = this.shutterEndpoint;

        logger.error(
          `Shutter press failed - Status: ${statusCode}, API Message: "${apiMessage}", Endpoint: ${endpoint}, Manual: ${isManualEndpoint}`,
        );

        // Log full response data for debugging if available
        if (error.response?.data) {
          logger.debug("Full Canon API error response:", error.response.data);
        }
      }
      return false;
    }
  }

  /**
   * Release camera shutter button (manual endpoint only)
   *
   * CCAPI Reference: 4.8.2 - Still image shutter button control (manual)
   * Endpoint: POST /ccapi/ver100/shooting/control/shutterbutton/manual
   * Request: { "action": "release", "af": false }
   * Response 200: {} (empty object)
   *
   * Note: Regular endpoint (4.8.1) does not support release action - it releases automatically
   *
   * @returns {Promise<boolean>} True if release successful (or not needed for regular endpoint)
   */
  async releaseShutter() {
    const isManualEndpoint =
      this.shutterEndpoint && this.shutterEndpoint.includes("manual");

    // Only manual endpoint supports release action
    if (!isManualEndpoint) {
      logger.debug("Skipping shutter release - not using manual endpoint");
      return true; // Regular endpoint doesn't need explicit release
    }

    // CCAPI 4.8.2: Release shutter button
    const payload = {
      af: false,
      action: "release",
    };

    try {
      // Use longer timeout for release operation too
      const response = await this.client.post(
        `${this.baseUrl}${this.shutterEndpoint}`,
        payload,
        {
          timeout: 15000,
        },
      );
      return response.status >= 200 && response.status < 300;
    } catch (error) {
      // Extract Canon API error details for release too
      const statusCode = error.response?.status || "unknown";
      const apiMessage = error.response?.data?.message || error.message;
      const endpoint = this.shutterEndpoint;

      logger.debug(
        `Shutter release failed - Status: ${statusCode}, API Message: "${apiMessage}", Endpoint: ${endpoint}`,
      );

      // Log full response data for debugging if available
      if (error.response?.data) {
        logger.debug(
          "Full Canon API release error response:",
          error.response.data,
        );
      }

      return false;
    }
  }

  async validateInterval(intervalSeconds) {
    try {
      const settings = await this.getCameraSettings();
      const shutterSpeed = this.parseShutterSpeed(settings);

      if (!shutterSpeed) {
        logger.warn("Could not determine shutter speed - skipping validation");
        return {
          valid: true,
          warning: "Could not validate against shutter speed",
        };
      }

      if (intervalSeconds <= shutterSpeed) {
        return {
          valid: false,
          error: `Interval (${intervalSeconds}s) must be longer than shutter speed (${shutterSpeed}s)`,
        };
      }

      return { valid: true };
    } catch (error) {
      logger.error("Failed to validate interval:", error);
      return { valid: true, warning: "Could not validate interval" };
    }
  }

  parseShutterSpeed(settings) {
    const tvSetting = settings?.tv;
    if (!tvSetting?.value) return null;

    try {
      const tvValue = tvSetting.value;

      if (typeof tvValue === "string") {
        if (tvValue.includes("/")) {
          const [numerator, denominator] = tvValue.split("/");
          return parseFloat(numerator) / parseFloat(denominator);
        }
        return parseFloat(tvValue);
      }

      return parseFloat(tvValue);
    } catch (error) {
      logger.error("Error parsing shutter speed:", error);
      return null;
    }
  }

  startConnectionMonitoring() {
    // Monitor connection every 10 seconds for faster disconnection detection
    this.monitoringInterval = setInterval(async () => {
      if (!this.connected || this.monitoringPaused) return;

      try {
        await this.client.get(`${this.baseUrl}/ccapi/`, { timeout: 8000 });
        logger.debug("Connection monitoring: camera still reachable");
        // Reset failure counter on successful connection
        this.consecutiveFailures = 0;
      } catch (error) {
        this.consecutiveFailures++;
        logger.warn(
          `Camera connection check failed (${this.consecutiveFailures}/${this.maxConsecutiveFailures}): ${error.message}`,
        );

        // Only disconnect after multiple consecutive failures
        if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
          logger.warn(
            "Multiple consecutive connection failures detected, handling disconnection...",
          );
          this.handleDisconnection(error);
        }
      }
    }, 10000);
  }

  startInfoPolling() {
    // Poll camera info every 30 seconds to keep UI current and detect disconnections faster
    this.pollingInterval = setInterval(async () => {
      if (!this.connected || this.pollingPaused) return;

      try {
        // Try to get basic camera info - this will trigger disconnection detection if camera is gone
        logger.debug("Polling camera info...");
        await this.client.get(
          `${this.baseUrl}/ccapi/ver100/shooting/settings`,
          { timeout: 3000 },
        );
      } catch (error) {
        // Error handling is already done in getCameraSettings, just log here
        logger.debug("Info polling detected camera issue:", error.message);
      }
    }, 30000);
  }

  pauseInfoPolling() {
    logger.info("Pausing camera info polling during intervalometer session");
    this.pollingPaused = true;
  }

  resumeInfoPolling() {
    logger.info("Resuming camera info polling");
    this.pollingPaused = false;
  }

  pauseConnectionMonitoring() {
    logger.debug("Pausing camera connection monitoring during photo operation");
    this.monitoringPaused = true;
    // Reset failure counter since we're actively using the camera
    this.consecutiveFailures = 0;
  }

  resumeConnectionMonitoring() {
    logger.debug("Resuming camera connection monitoring");
    this.monitoringPaused = false;
  }

  handleDisconnection(error) {
    const wasConnected = this.connected;
    this.connected = false;
    this.lastError = error.message;

    // Notify immediately if we were previously connected
    if (wasConnected && this.onDisconnect) {
      logger.info("Notifying clients of camera disconnection");
      const status = this.getConnectionStatus();
      // Include error details for specific error handling (e.g., HTTP 502)
      status.errorCode = error.code;
      status.errorStatus = error.status;
      status.userMessage = error.userMessage;
      this.onDisconnect(status);
    }

    logger.warn("Camera disconnected, manual reconnection required");
  }

  // Removed automatic reconnection system - use manual connect instead

  // Removed manual reconnect - use discovery manager's manual connect instead

  getConnectionStatus() {
    return {
      connected: this.connected,
      ip: this.ip,
      port: this.port,
      lastError: this.lastError,
      shutterEndpoint: this.shutterEndpoint,
      hasCapabilities: !!this.capabilities,
    };
  }

  // Expose capabilities for debugging
  get capabilities() {
    return this._capabilities;
  }

  set capabilities(value) {
    this._capabilities = value;
  }

  /**
   * Get camera datetime
   *
   * CCAPI Reference: 4.5.5 - Date and time (GET)
   * Endpoint: GET /ccapi/ver100/functions/datetime
   * Response: { "datetime": string (RFC1123), "dst": boolean }
   * Example: { "datetime": "Tue, 01 Jan 2019 01:23:45 +0900", "dst": false }
   *
   * @returns {Promise<string>} Camera datetime in ISO format
   */
  async getCameraDateTime() {
    if (!this.connected) {
      throw new Error("Camera not connected");
    }

    try {
      const response = await this.client.get(
        `${this.baseUrl}/ccapi/ver100/functions/datetime`,
      );

      // Camera returns datetime in RFC1123 format: "Tue, 01 Jan 2019 01:23:45 +0900"
      if (response.data && response.data.datetime) {
        // Parse RFC1123 date string to Date object
        const date = new Date(response.data.datetime);
        if (isNaN(date.getTime())) {
          logger.error(
            "Invalid datetime format from camera:",
            response.data.datetime,
          );
          throw new Error("Invalid datetime format from camera");
        }
        // Return ISO string for consistency with rest of system
        return date.toISOString();
      }
      logger.error(
        "Invalid datetime response from camera - missing datetime field:",
        response.data,
      );
      throw new Error("Invalid datetime response from camera");
    } catch (error) {
      // Extract Canon API error details
      const statusCode = error.response?.status || "unknown";
      const apiMessage = error.response?.data?.message || error.message;

      logger.error(
        `Failed to get camera datetime - Status: ${statusCode}, API Message: "${apiMessage}"`,
      );

      // CCAPI 503: Camera temporarily unavailable
      if (error.response?.status === 503) {
        logger.warn(
          "Camera datetime endpoint temporarily unavailable (HTTP 503)",
        );
        logger.warn(`CCAPI Message: "${apiMessage}"`);
        logger.warn(
          "Possible causes: Device busy, shooting in progress, or mode not supported",
        );
        logger.warn(
          "Camera may be in playback mode - ensure camera is in shooting mode",
        );
      }

      // Log full response for Canon API errors (400, 503) for debugging
      if (error.response?.data && [400, 503].includes(error.response.status)) {
        logger.debug("Canon API error response:", error.response.data);
      }

      return null;
    }
  }

  /**
   * Get camera datetime with full details including DST flag
   *
   * CCAPI Reference: 4.5.5 - Date and time (GET)
   * Endpoint: GET /ccapi/ver100/functions/datetime
   * Response: { "datetime": string (RFC1123), "dst": boolean }
   *
   * @returns {Promise<Object>} Raw camera datetime response with DST flag
   */
  async getCameraDateTimeDetails() {
    if (!this.connected) {
      throw new Error("Camera not connected");
    }

    try {
      const response = await this.client.get(
        `${this.baseUrl}/ccapi/ver100/functions/datetime`,
      );
      logger.info(
        "Raw camera datetime response:",
        JSON.stringify(response.data),
      );

      return response.data;
    } catch (error) {
      // Extract Canon API error details
      const statusCode = error.response?.status || "unknown";
      const apiMessage = error.response?.data?.message || error.message;

      logger.error(
        `Failed to get camera datetime details - Status: ${statusCode}, API Message: "${apiMessage}"`,
      );

      // Log full response for Canon API errors (400, 503) for debugging
      if (error.response?.data && [400, 503].includes(error.response.status)) {
        logger.debug("Canon API error response:", error.response.data);
      }

      return null;
    }
  }

  /**
   * Get camera temperature status
   *
   * CCAPI Reference: 4.4.2 - Temperature status
   * Endpoint: GET /ccapi/ver100/devicestatus/temperature
   * Response: { "status": string }
   *
   * Possible status values:
   * - "normal" - Normal operating temperature
   * - "warning" - Temperature warning
   * - "frameratedown" - Reduced frame rate due to heat
   * - "disableliveview" - Live View disabled
   * - "disablerelease" - Shooting prohibited (CRITICAL for intervalometer)
   * - "stillqualitywarning" - Image quality degraded
   * - "restrictionmovierecording" - Movie recording restricted
   * - Plus combined states like "warning_and_restrictionmovierecording"
   *
   * @returns {Promise<Object>} Temperature status object { status: string }
   */
  async getCameraTemperature() {
    if (!this.connected) {
      throw new Error("Camera not connected");
    }

    try {
      const response = await this.client.get(
        `${this.baseUrl}/ccapi/ver100/devicestatus/temperature`,
      );
      logger.debug("Camera temperature status:", response.data);
      return response.data;
    } catch (error) {
      // Extract Canon API error details
      const statusCode = error.response?.status || "unknown";
      const apiMessage = error.response?.data?.message || error.message;

      logger.error(
        `Failed to get camera temperature - Status: ${statusCode}, API Message: "${apiMessage}"`,
      );

      // Log full response for Canon API errors (400, 503) for debugging
      if (error.response?.data && [400, 503].includes(error.response.status)) {
        logger.debug("Canon API error response:", error.response.data);
      }

      // If we get a network error or HTTP 502, handle disconnection
      if (
        error.code === "EHOSTUNREACH" ||
        error.code === "ECONNREFUSED" ||
        error.code === "ETIMEDOUT" ||
        error.response?.status === 502
      ) {
        if (error.response?.status === 502) {
          logger.warn(
            "HTTP 502 during temperature check: Camera HTTP service in error state (not standard CCAPI response)",
          );
        } else {
          logger.warn("Camera network error detected during temperature check");
        }
        this.handleDisconnection(error);
      }

      const cleanError = new Error(
        apiMessage || "Failed to get camera temperature",
      );
      cleanError.status = statusCode;
      cleanError.statusText = error.response?.statusText;
      throw cleanError;
    }
  }

  /**
   * Set camera datetime
   *
   * CCAPI Reference: 4.5.5 - Date and time (PUT)
   * Endpoint: PUT /ccapi/ver100/functions/datetime
   * Request: { "datetime": string (RFC1123), "dst": boolean }
   * Response 200: {} (empty object)
   *
   * Important: Per Canon spec, "datetime" should include DST offset if DST is active,
   * and "dst" flag should be set to true when DST is in effect.
   *
   * Example: For PST (UTC-8), send:
   *   { "datetime": "Tue, 01 Jan 2019 01:23:45 -0800", "dst": false }
   * For PDT (UTC-7 with DST), send:
   *   { "datetime": "Tue, 01 Jul 2019 01:23:45 -0800", "dst": true }
   *   (Note: offset stays -0800 for standard timezone, dst flag indicates DST active)
   *
   * @param {Date|string} datetime - Date to set on camera
   * @returns {Promise<boolean>} True if datetime set successfully
   */
  async setCameraDateTime(datetime) {
    if (!this.connected) {
      throw new Error("Camera not connected");
    }

    try {
      // Convert to Date object
      const date = datetime instanceof Date ? datetime : new Date(datetime);

      // Format as RFC1123 string for camera in local timezone
      // Example: "Tue, 01 Jan 2019 01:23:45 -0800"

      // Get current timezone offset and determine if we're in DST
      const currentOffset = date.getTimezoneOffset(); // minutes, positive for west of UTC
      const januaryOffset = new Date(
        date.getFullYear(),
        0,
        1,
      ).getTimezoneOffset(); // Standard time offset
      const isDST = currentOffset !== januaryOffset;

      // Use the standard timezone offset (not current DST-adjusted offset)
      // For Pacific timezone: PST = UTC-8 = +480 minutes
      const standardOffsetMinutes = Math.max(currentOffset, januaryOffset); // Pick the larger (more westward) offset
      const standardOffsetHours = Math.floor(standardOffsetMinutes / 60);
      const standardOffsetMins = standardOffsetMinutes % 60;
      const offsetSign = standardOffsetMinutes >= 0 ? "-" : "+"; // Flip sign for RFC1123 format
      const offsetString = `${offsetSign}${standardOffsetHours.toString().padStart(2, "0")}${standardOffsetMins.toString().padStart(2, "0")}`;

      // Format date in RFC1123 format with local timezone
      // Create a properly formatted RFC1123 date string for local time
      const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const monthNames = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
      ];

      const dayName = dayNames[date.getDay()];
      const day = date.getDate().toString().padStart(2, "0");
      const monthName = monthNames[date.getMonth()];
      const year = date.getFullYear();
      const hours = date.getHours().toString().padStart(2, "0");
      const minutes = date.getMinutes().toString().padStart(2, "0");
      const seconds = date.getSeconds().toString().padStart(2, "0");

      const localDateString = `${dayName}, ${day} ${monthName} ${year} ${hours}:${minutes}:${seconds}`;

      const rfc1123Date = `${localDateString} ${offsetString}`;

      logger.info(
        `Setting camera datetime to standard time: ${rfc1123Date}, DST: ${isDST}`,
      );

      const response = await this.client.put(
        `${this.baseUrl}/ccapi/ver100/functions/datetime`,
        {
          datetime: rfc1123Date,
          dst: isDST,
        },
      );

      if (response.status === 200 || response.status === 204) {
        logger.info("Camera datetime set successfully");
        return true;
      }

      throw new Error(`Failed to set camera datetime: ${response.status}`);
    } catch (error) {
      // Extract Canon API error details
      const statusCode = error.response?.status || "unknown";
      const apiMessage = error.response?.data?.message || error.message;

      logger.error(
        `Failed to set camera datetime - Status: ${statusCode}, API Message: "${apiMessage}"`,
      );

      // Log full response for Canon API errors (400, 503) for debugging
      if (error.response?.data && [400, 503].includes(error.response.status)) {
        logger.debug("Canon API error response:", error.response.data);
      }

      return false;
    }
  }

  async cleanup() {
    logger.info("Cleaning up camera controller...");

    // No automatic reconnection timers to clear

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }

    // Ensure shutter is released
    if (this.connected && this.shutterEndpoint) {
      try {
        await this.releaseShutter();
      } catch (error) {
        logger.debug("Error during cleanup shutter release:", error.message);
      }
    }

    this.connected = false;
  }
}
