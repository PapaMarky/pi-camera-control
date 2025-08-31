import axios from 'axios';
import { logger } from '../utils/logger.js';

// Disable SSL verification warnings for local camera connections
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

export class CameraController {
  constructor(ip, port = '443') {
    this.ip = ip;
    this.port = port;
    this.baseUrl = `https://${ip}:${port}`;
    this.connected = false;
    this.lastError = null;
    this.shutterEndpoint = null;
    this.capabilities = null;
    this.reconnectInterval = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    
    // Create axios instance with optimized settings
    this.client = axios.create({
      timeout: 10000,
      httpsAgent: new (await import('https')).Agent({
        rejectUnauthorized: false
      })
    });
  }

  async initialize() {
    logger.info(`Initializing camera controller for ${this.baseUrl}`);
    
    try {
      await this.connect();
      this.startConnectionMonitoring();
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
      
      this.capabilities = response.data;
      this.shutterEndpoint = this.findShutterEndpoint(this.capabilities);
      
      if (!this.shutterEndpoint) {
        throw new Error('No shutter control endpoint found');
      }
      
      // Test camera settings endpoint
      await this.getCameraSettings();
      
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
      const response = await this.client.get(`${this.baseUrl}/ccapi/v100/shooting/settings`);
      return response.data;
    } catch (error) {
      logger.error('Failed to get camera settings:', error);
      throw error;
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
    // Monitor connection every 30 seconds
    setInterval(async () => {
      if (!this.connected) return;
      
      try {
        await this.client.get(`${this.baseUrl}/ccapi/`, { timeout: 5000 });
      } catch (error) {
        logger.warn('Camera connection lost, attempting reconnect...');
        this.connected = false;
        this.scheduleReconnect();
      }
    }, 30000);
  }

  scheduleReconnect() {
    if (this.reconnectInterval) return; // Already scheduled
    
    const delay = Math.min(5000 * Math.pow(2, this.reconnectAttempts), 60000);
    this.reconnectAttempts++;
    
    if (this.reconnectAttempts > this.maxReconnectAttempts) {
      logger.error('Max reconnection attempts reached');
      return;
    }
    
    logger.info(`Scheduling reconnection attempt ${this.reconnectAttempts} in ${delay}ms`);
    
    this.reconnectInterval = setTimeout(async () => {
      this.reconnectInterval = null;
      
      try {
        await this.connect();
      } catch (error) {
        this.scheduleReconnect();
      }
    }, delay);
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

  async cleanup() {
    logger.info('Cleaning up camera controller...');
    
    if (this.reconnectInterval) {
      clearTimeout(this.reconnectInterval);
      this.reconnectInterval = null;
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