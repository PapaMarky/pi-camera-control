import axios from 'axios';
import https from 'https';
import { logger } from '../utils/logger.js';

// Disable SSL verification warnings for local camera connections
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

export class CameraController {
  constructor(ip, port = '443', onDisconnect = null) {
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
    
    // Create axios instance with optimized settings
    this.client = axios.create({
      timeout: 10000,
      httpsAgent: new https.Agent({
        rejectUnauthorized: false
      })
    });
  }

  /**
   * Update camera IP and port configuration
   */
  async updateConfiguration(newIp, newPort = '443') {
    logger.info(`Updating camera configuration from ${this.baseUrl} to https://${newIp}:${newPort}`);
    
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
      logger.info(`Successfully updated camera configuration to ${this.baseUrl}`);
      return true;
    } catch (error) {
      logger.error(`Failed to connect to new camera configuration ${this.baseUrl}:`, error);
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
      logger.error('Failed to initialize camera controller:', error);
      return false;
    }
  }

  async connect() {
    try {
      logger.info('Discovering CCAPI endpoints...');
      const response = await this.client.get(`${this.baseUrl}/ccapi/`);
      
      this._capabilities = response.data;
      this.shutterEndpoint = this.findShutterEndpoint(this.capabilities);
      
      if (!this.shutterEndpoint) {
        throw new Error('No shutter control endpoint found');
      }
      
      // Test camera settings endpoint (bypass connection check during connection)
      try {
        await this.client.get(`${this.baseUrl}/ccapi/ver100/shooting/settings`);
        logger.debug('Camera settings endpoint verified');
      } catch (error) {
        logger.warn('Camera settings endpoint test failed:', error.message);
        // Continue anyway - some cameras may not support this endpoint
      }
      
      this.connected = true;
      this.lastError = null;
      this.consecutiveFailures = 0; // Reset failure counter on successful connection
      
      logger.info('Camera connected successfully', {
        shutterEndpoint: this.shutterEndpoint,
        capabilities: Object.keys(this.capabilities)
      });
      
      return true;
      
    } catch (error) {
      this.connected = false;
      this.lastError = error.message;
      logger.error('Failed to connect to camera:', error);
      throw error;
    }
  }

  findShutterEndpoint(capabilities) {
    const endpoints = [];
    
    // Search through all API versions for shutter endpoints
    for (const [_version, endpointsList] of Object.entries(capabilities)) {
      if (Array.isArray(endpointsList)) {
        for (const endpoint of endpointsList) {
          if (endpoint?.path && endpoint.path.includes('shutterbutton') && endpoint.post) {
            endpoints.push(endpoint.path);
          }
        }
      }
    }
    
    // Prefer regular shutter endpoint over manual for better reliability
    const regularEndpoint = endpoints.find(ep => ep.includes('shutterbutton') && !ep.includes('manual'));
    const manualEndpoint = endpoints.find(ep => ep.includes('manual'));

    return regularEndpoint || manualEndpoint;
  }

  async getCameraSettings() {
    if (!this.connected) {
      throw new Error('Camera not connected');
    }

    try {
      const response = await this.client.get(`${this.baseUrl}/ccapi/ver100/shooting/settings`);
      return response.data;
    } catch (error) {
      logger.error('Failed to get camera settings:', error.message);

      // If we get a network error, handle disconnection
      if (error.code === 'EHOSTUNREACH' || error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
        logger.warn('Camera network error detected, handling disconnection');
        this.handleDisconnection(error);
      }

      // Create a clean error without circular references
      const cleanError = new Error(error.message || 'Failed to get camera settings');
      cleanError.status = error.response?.status;
      cleanError.statusText = error.response?.statusText;
      throw cleanError;
    }
  }

  async getDeviceInformation() {
    if (!this.connected) {
      throw new Error('Camera not connected');
    }

    try {
      const response = await this.client.get(`${this.baseUrl}/ccapi/ver100/deviceinformation`);
      logger.debug('Retrieved device information', {
        productname: response.data.productname,
        serialnumber: response.data.serialnumber
      });
      return response.data;
    } catch (error) {
      logger.error('Failed to get device information:', error.message);

      // If we get a network error, handle disconnection
      if (error.code === 'EHOSTUNREACH' || error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
        logger.warn('Camera network error detected, handling disconnection');
        this.handleDisconnection(error);
      }

      // Create a clean error without circular references
      const cleanError = new Error(error.message || 'Failed to get device information');
      cleanError.status = error.response?.status;
      cleanError.statusText = error.response?.statusText;
      throw cleanError;
    }
  }

  async getCameraBattery() {
    if (!this.connected) {
      throw new Error('Camera not connected');
    }

    try {
      // Try the more detailed battery list first
      const response = await this.client.get(`${this.baseUrl}/ccapi/ver110/devicestatus/batterylist`);
      return response.data;
    } catch (error) {
      try {
        // Fallback to basic battery info
        const response = await this.client.get(`${this.baseUrl}/ccapi/ver100/devicestatus/battery`);
        return { batterylist: [response.data] };
      } catch (fallbackError) {
        // Extract Canon API error details
        const statusCode = fallbackError.response?.status || 'unknown';
        const apiMessage = fallbackError.response?.data?.message || fallbackError.message;

        logger.error(`Failed to get camera battery - Status: ${statusCode}, API Message: "${apiMessage}"`);

        // Log full response for Canon API errors (400, 503)
        if (fallbackError.response?.data && [400, 503].includes(statusCode)) {
          logger.debug('Canon API error response:', fallbackError.response.data);
        }

        // If we get a network error, handle disconnection
        if (fallbackError.code === 'EHOSTUNREACH' || fallbackError.code === 'ECONNREFUSED' || fallbackError.code === 'ETIMEDOUT') {
          logger.warn('Camera network error detected during battery check, handling disconnection');
          this.handleDisconnection(fallbackError);
        }

        const cleanError = new Error(apiMessage || 'Failed to get camera battery');
        cleanError.status = statusCode;
        cleanError.statusText = fallbackError.response?.statusText;
        throw cleanError;
      }
    }
  }

  async takePhoto() {
    if (!this.connected || !this.shutterEndpoint) {
      throw new Error('Camera not connected or no shutter endpoint available');
    }

    try {
      logger.debug('Taking photo...');
      
      // Note: Connection monitoring should be paused by intervalometer session
      
      // Release any stuck shutter first
      await this.releaseShutter();
      
      // Press shutter with manual focus only (no AF for timelapses)
      const pressResult = await this.pressShutter(false); // Always manual focus

      if (!pressResult) {
        throw new Error('Failed to press shutter');
      }
      
      // Wait for camera processing (increased for stability)
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Release shutter
      const releaseResult = await this.releaseShutter();
      if (!releaseResult) {
        logger.warn('Shutter release may have failed but photo likely taken');
      }
      
      logger.info('Photo taken successfully');
      return true;
      
    } catch (error) {
      logger.error('Failed to take photo:', error);
      await this.releaseShutter(); // Attempt recovery
      throw error;
    } finally {
      // Note: Connection monitoring resume handled by intervalometer session
    }
  }

  async pressShutter(_useAutofocus = false) {
    // Determine payload based on endpoint type
    let payload;
    const isManualEndpoint = this.shutterEndpoint && this.shutterEndpoint.includes('manual');

    if (isManualEndpoint) {
      // Manual endpoint requires action parameter
      payload = {
        af: false, // Always false for timelapses as per documentation
        action: 'full_press'
      };
    } else {
      // Regular shooting endpoint
      payload = {
        af: false // Always false for timelapses
      };
    }

    try {
      // Use longer timeout for photo operations (30 seconds) to handle long exposures
      const response = await this.client.post(`${this.baseUrl}${this.shutterEndpoint}`, payload, {
        timeout: 30000
      });
      return response.status >= 200 && response.status < 300;
    } catch (error) {
      if (error.code === 'ECONNABORTED') {
        logger.warn('Shutter press timed out after 30 seconds - camera may be busy with long exposure');
      } else {
        // Extract Canon API error details
        const statusCode = error.response?.status || 'unknown';
        const apiMessage = error.response?.data?.message || error.message;
        const endpoint = this.shutterEndpoint;

        logger.error(`Shutter press failed - Status: ${statusCode}, API Message: "${apiMessage}", Endpoint: ${endpoint}, Manual: ${isManualEndpoint}`);

        // Log full response data for debugging if available
        if (error.response?.data) {
          logger.debug('Full Canon API error response:', error.response.data);
        }
      }
      return false;
    }
  }

  async releaseShutter() {
    const isManualEndpoint = this.shutterEndpoint && this.shutterEndpoint.includes('manual');

    // Only manual endpoint supports release action
    if (!isManualEndpoint) {
      logger.debug('Skipping shutter release - not using manual endpoint');
      return true; // Regular endpoint doesn't need explicit release
    }

    const payload = {
      af: false,
      action: 'release'
    };

    try {
      // Use longer timeout for release operation too
      const response = await this.client.post(`${this.baseUrl}${this.shutterEndpoint}`, payload, {
        timeout: 15000
      });
      return response.status >= 200 && response.status < 300;
    } catch (error) {
      // Extract Canon API error details for release too
      const statusCode = error.response?.status || 'unknown';
      const apiMessage = error.response?.data?.message || error.message;
      const endpoint = this.shutterEndpoint;

      logger.debug(`Shutter release failed - Status: ${statusCode}, API Message: "${apiMessage}", Endpoint: ${endpoint}`);

      // Log full response data for debugging if available
      if (error.response?.data) {
        logger.debug('Full Canon API release error response:', error.response.data);
      }

      return false;
    }
  }

  async validateInterval(intervalSeconds) {
    try {
      const settings = await this.getCameraSettings();
      const shutterSpeed = this.parseShutterSpeed(settings);
      
      if (!shutterSpeed) {
        logger.warn('Could not determine shutter speed - skipping validation');
        return { valid: true, warning: 'Could not validate against shutter speed' };
      }
      
      if (intervalSeconds <= shutterSpeed) {
        return {
          valid: false,
          error: `Interval (${intervalSeconds}s) must be longer than shutter speed (${shutterSpeed}s)`
        };
      }
      
      return { valid: true };
      
    } catch (error) {
      logger.error('Failed to validate interval:', error);
      return { valid: true, warning: 'Could not validate interval' };
    }
  }

  parseShutterSpeed(settings) {
    const tvSetting = settings?.tv;
    if (!tvSetting?.value) return null;
    
    try {
      const tvValue = tvSetting.value;
      
      if (typeof tvValue === 'string') {
        if (tvValue.includes('/')) {
          const [numerator, denominator] = tvValue.split('/');
          return parseFloat(numerator) / parseFloat(denominator);
        }
        return parseFloat(tvValue);
      }
      
      return parseFloat(tvValue);
    } catch (error) {
      logger.error('Error parsing shutter speed:', error);
      return null;
    }
  }

  startConnectionMonitoring() {
    // Monitor connection every 10 seconds for faster disconnection detection
    this.monitoringInterval = setInterval(async () => {
      if (!this.connected || this.monitoringPaused) return;
      
      try {
        await this.client.get(`${this.baseUrl}/ccapi/`, { timeout: 8000 });
        logger.debug('Connection monitoring: camera still reachable');
        // Reset failure counter on successful connection
        this.consecutiveFailures = 0;
      } catch (error) {
        this.consecutiveFailures++;
        logger.warn(`Camera connection check failed (${this.consecutiveFailures}/${this.maxConsecutiveFailures}): ${error.message}`);
        
        // Only disconnect after multiple consecutive failures
        if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
          logger.warn('Multiple consecutive connection failures detected, handling disconnection...');
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
        logger.debug('Polling camera info...');
        await this.client.get(`${this.baseUrl}/ccapi/ver100/shooting/settings`, { timeout: 3000 });
      } catch (error) {
        // Error handling is already done in getCameraSettings, just log here
        logger.debug('Info polling detected camera issue:', error.message);
      }
    }, 30000);
  }

  pauseInfoPolling() {
    logger.info('Pausing camera info polling during intervalometer session');
    this.pollingPaused = true;
  }

  resumeInfoPolling() {
    logger.info('Resuming camera info polling');
    this.pollingPaused = false;
  }

  pauseConnectionMonitoring() {
    logger.debug('Pausing camera connection monitoring during photo operation');
    this.monitoringPaused = true;
    // Reset failure counter since we're actively using the camera
    this.consecutiveFailures = 0;
  }

  resumeConnectionMonitoring() {
    logger.debug('Resuming camera connection monitoring');
    this.monitoringPaused = false;
  }

  handleDisconnection(error) {
    const wasConnected = this.connected;
    this.connected = false;
    this.lastError = error.message;
    
    // Notify immediately if we were previously connected
    if (wasConnected && this.onDisconnect) {
      logger.info('Notifying clients of camera disconnection');
      this.onDisconnect(this.getConnectionStatus());
    }
    
    logger.warn('Camera disconnected, manual reconnection required');
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
      hasCapabilities: !!this.capabilities
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
   */
  async getCameraDateTime() {
    if (!this.connected) {
      throw new Error('Camera not connected');
    }

    try {
      const response = await this.client.get(`${this.baseUrl}/ccapi/ver100/functions/datetime`);

      // Camera returns datetime in RFC1123 format: "Tue, 01 Jan 2019 01:23:45 +0900"
      if (response.data && response.data.datetime) {
        // Parse RFC1123 date string to Date object
        const date = new Date(response.data.datetime);
        if (isNaN(date.getTime())) {
          throw new Error('Invalid datetime format from camera');
        }
        // Return ISO string for consistency with rest of system
        return date.toISOString();
      }
      throw new Error('Invalid datetime response from camera');
    } catch (error) {
      logger.error('Failed to get camera datetime:', error.message);
      return null;
    }
  }

  /**
   * Get camera datetime with full details including DST
   */
  async getCameraDateTimeDetails() {
    if (!this.connected) {
      throw new Error('Camera not connected');
    }

    try {
      const response = await this.client.get(`${this.baseUrl}/ccapi/ver100/functions/datetime`);
      logger.info('Raw camera datetime response:', JSON.stringify(response.data));

      return response.data;
    } catch (error) {
      logger.error('Failed to get camera datetime details:', error.message);
      return null;
    }
  }

  /**
   * Set camera datetime
   */
  async setCameraDateTime(datetime) {
    if (!this.connected) {
      throw new Error('Camera not connected');
    }

    try {
      // Convert to Date object
      const date = datetime instanceof Date ? datetime : new Date(datetime);

      // Format as RFC1123 string for camera in local timezone
      // Example: "Tue, 01 Jan 2019 01:23:45 -0800"

      // Get current timezone offset and determine if we're in DST
      const currentOffset = date.getTimezoneOffset(); // minutes, positive for west of UTC
      const januaryOffset = new Date(date.getFullYear(), 0, 1).getTimezoneOffset(); // Standard time offset
      const isDST = currentOffset !== januaryOffset;

      // Use the standard timezone offset (not current DST-adjusted offset)
      // For Pacific timezone: PST = UTC-8 = +480 minutes
      const standardOffsetMinutes = Math.max(currentOffset, januaryOffset); // Pick the larger (more westward) offset
      const standardOffsetHours = Math.floor(standardOffsetMinutes / 60);
      const standardOffsetMins = standardOffsetMinutes % 60;
      const offsetSign = standardOffsetMinutes >= 0 ? '-' : '+'; // Flip sign for RFC1123 format
      const offsetString = `${offsetSign}${standardOffsetHours.toString().padStart(2, '0')}${standardOffsetMins.toString().padStart(2, '0')}`;

      // Format date in RFC1123 format with local timezone
      // Create a properly formatted RFC1123 date string for local time
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

      const dayName = dayNames[date.getDay()];
      const day = date.getDate().toString().padStart(2, '0');
      const monthName = monthNames[date.getMonth()];
      const year = date.getFullYear();
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      const seconds = date.getSeconds().toString().padStart(2, '0');

      const localDateString = `${dayName}, ${day} ${monthName} ${year} ${hours}:${minutes}:${seconds}`;

      const rfc1123Date = `${localDateString} ${offsetString}`;

      logger.info(`Setting camera datetime to standard time: ${rfc1123Date}, DST: ${isDST}`);

      const response = await this.client.put(`${this.baseUrl}/ccapi/ver100/functions/datetime`, {
        datetime: rfc1123Date,
        dst: isDST
      });

      if (response.status === 200 || response.status === 204) {
        logger.info('Camera datetime set successfully');
        return true;
      }

      throw new Error(`Failed to set camera datetime: ${response.status}`);
    } catch (error) {
      logger.error('Failed to set camera datetime:', error.message);
      return false;
    }
  }

  async cleanup() {
    logger.info('Cleaning up camera controller...');
    
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
        logger.debug('Error during cleanup shutter release:', error.message);
      }
    }
    
    this.connected = false;
  }
}