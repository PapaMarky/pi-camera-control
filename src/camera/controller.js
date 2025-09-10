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
    this.reconnectInterval = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 22; // 10 attempts at 1s + 12 attempts at 5s
    this.pollingInterval = null;
    this.pollingPaused = false;
    this.onDisconnect = onDisconnect;
    
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
    this.reconnectAttempts = 0;
    
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
      this.scheduleReconnect();
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
      this.reconnectAttempts = 0;
      
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
    for (const [version, endpointsList] of Object.entries(capabilities)) {
      if (Array.isArray(endpointsList)) {
        for (const endpoint of endpointsList) {
          if (endpoint?.path && endpoint.path.includes('shutterbutton') && endpoint.post) {
            endpoints.push(endpoint.path);
          }
        }
      }
    }
    
    // Prefer manual shutter endpoint
    const manualEndpoint = endpoints.find(ep => ep.includes('manual'));
    const regularEndpoint = endpoints.find(ep => ep.includes('shutterbutton'));
    
    return manualEndpoint || regularEndpoint;
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
        logger.error('Failed to get camera battery:', fallbackError.message);
        
        // If we get a network error, handle disconnection
        if (fallbackError.code === 'EHOSTUNREACH' || fallbackError.code === 'ECONNREFUSED' || fallbackError.code === 'ETIMEDOUT') {
          logger.warn('Camera network error detected during battery check, handling disconnection');
          this.handleDisconnection(fallbackError);
        }
        
        const cleanError = new Error(fallbackError.message || 'Failed to get camera battery');
        cleanError.status = fallbackError.response?.status;
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
      
      // Release any stuck shutter first
      await this.releaseShutter();
      
      // Press shutter (try manual focus first, then autofocus)
      let pressResult = await this.pressShutter(false); // Manual focus
      if (!pressResult) {
        logger.debug('Manual focus failed, trying autofocus');
        pressResult = await this.pressShutter(true); // Autofocus
      }
      
      if (!pressResult) {
        throw new Error('Failed to press shutter');
      }
      
      // Wait for camera processing
      await new Promise(resolve => setTimeout(resolve, 500));
      
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
    }
  }

  async pressShutter(useAutofocus = false) {
    const payload = {
      af: useAutofocus,
      action: 'full_press'
    };

    try {
      const response = await this.client.post(`${this.baseUrl}${this.shutterEndpoint}`, payload);
      return response.status >= 200 && response.status < 300;
    } catch (error) {
      logger.error('Shutter press failed:', error);
      return false;
    }
  }

  async releaseShutter() {
    const payload = {
      af: false,
      action: 'release'
    };

    try {
      const response = await this.client.post(`${this.baseUrl}${this.shutterEndpoint}`, payload);
      return response.status >= 200 && response.status < 300;
    } catch (error) {
      logger.debug('Shutter release failed (may be normal):', error.message);
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
      if (!this.connected) return;
      
      try {
        await this.client.get(`${this.baseUrl}/ccapi/`, { timeout: 5000 });
        logger.debug('Connection monitoring: camera still reachable');
      } catch (error) {
        logger.warn('Camera connection lost during monitoring, handling disconnection...', error.message);
        this.handleDisconnection(error);
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

  handleDisconnection(error) {
    const wasConnected = this.connected;
    this.connected = false;
    this.lastError = error.message;
    
    // Notify immediately if we were previously connected
    if (wasConnected && this.onDisconnect) {
      logger.info('Notifying clients of camera disconnection');
      this.onDisconnect(this.getConnectionStatus());
    }
    
    this.scheduleReconnect();
  }

  scheduleReconnect() {
    if (this.reconnectInterval) return; // Already scheduled
    
    this.reconnectAttempts++;
    
    if (this.reconnectAttempts > this.maxReconnectAttempts) {
      logger.error('Max reconnection attempts reached - camera connection failed');
      return;
    }
    
    // Timing strategy: 1s for first 10 attempts, then 5s for remaining attempts
    let delay;
    if (this.reconnectAttempts <= 10) {
      delay = 1000; // 1 second for first 10 attempts
    } else {
      delay = 5000; // 5 seconds for attempts 11-22
    }
    
    logger.info(`Scheduling reconnection attempt ${this.reconnectAttempts} in ${delay}ms`);
    
    this.reconnectInterval = setTimeout(async () => {
      this.reconnectInterval = null;
      
      try {
        await this.connect();
        // Notify clients of successful reconnection
        if (this.connected && this.onDisconnect) {
          logger.info('Notifying clients of camera reconnection');
          this.onDisconnect(this.getConnectionStatus());
        }
      } catch (error) {
        this.scheduleReconnect();
      }
    }, delay);
  }

  async manualReconnect() {
    logger.info('Manual reconnect triggered - resetting connection state');
    
    // Clear any existing reconnect interval
    if (this.reconnectInterval) {
      clearTimeout(this.reconnectInterval);
      this.reconnectInterval = null;
    }
    
    // Reset reconnection attempts to allow fresh start
    this.reconnectAttempts = 0;
    this.connected = false;
    this.lastError = null;
    
    try {
      // Attempt immediate connection
      await this.connect();
      logger.info('Manual reconnect successful');
      return true;
    } catch (error) {
      logger.warn('Manual reconnect failed, scheduling automatic retries');
      // If manual reconnect fails, start the automatic retry cycle
      this.scheduleReconnect();
      return false;
    }
  }

  getConnectionStatus() {
    return {
      connected: this.connected,
      ip: this.ip,
      port: this.port,
      lastError: this.lastError,
      reconnectAttempts: this.reconnectAttempts,
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

  async cleanup() {
    logger.info('Cleaning up camera controller...');
    
    if (this.reconnectInterval) {
      clearTimeout(this.reconnectInterval);
      this.reconnectInterval = null;
    }
    
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