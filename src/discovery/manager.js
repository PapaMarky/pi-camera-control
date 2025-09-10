import { EventEmitter } from 'events';
import { UPnPDiscovery } from './upnp.js';
import { CameraController } from '../camera/controller.js';
import { logger } from '../utils/logger.js';
import axios from 'axios';

/**
 * Camera Discovery Manager
 * Manages automatic discovery of Canon cameras and provides camera instances
 */
export class DiscoveryManager extends EventEmitter {
  constructor() {
    super();
    this.upnp = new UPnPDiscovery();
    this.cameras = new Map(); // uuid -> { info, controller, status }
    this.primaryCamera = null; // Currently active camera controller
    this.isDiscovering = false;

    // Bind UPnP events
    this.upnp.on('cameraDiscovered', (deviceInfo) => {
      this.handleCameraDiscovered(deviceInfo);
    });

    this.upnp.on('deviceOffline', (uuid) => {
      this.handleCameraOffline(uuid);
    });
  }

  /**
   * Start camera discovery
   */
  async startDiscovery() {
    if (this.isDiscovering) {
      logger.debug('Discovery already running');
      return true;
    }

    logger.info('Starting camera discovery...');
    
    try {
      const success = await this.upnp.startDiscovery();
      if (success) {
        this.isDiscovering = true;
        logger.info('Camera discovery started successfully');
        this.emit('discoveryStarted');
        
        // Start periodic status logging
        this.logDiscoveryStatus();
        
        // Start fallback IP scanning after initial UPnP discovery
        setTimeout(() => this.performFallbackScanning(), 5000);
      }
      return success;
    } catch (error) {
      logger.error('Failed to start camera discovery:', error);
      return false;
    }
  }

  /**
   * Log discovery status for debugging
   */
  logDiscoveryStatus() {
    setInterval(() => {
      const networkInterfaces = this.upnp.getAvailableInterfaces();
      logger.debug('Discovery status:', {
        isDiscovering: this.isDiscovering,
        cameras: this.cameras.size,
        networkInterfaces: networkInterfaces.map(i => `${i.name}:${i.address}`)
      });
      
      if (this.cameras.size > 0) {
        logger.debug('Discovered cameras:', Array.from(this.cameras.keys()));
      }
    }, 30000); // Log every 30 seconds
  }

  /**
   * Stop camera discovery
   */
  async stopDiscovery() {
    if (!this.isDiscovering) {
      logger.debug('Discovery not running');
      return;
    }

    logger.info('Stopping camera discovery...');
    
    try {
      await this.upnp.stopDiscovery();
      this.isDiscovering = false;
      
      // Cleanup all camera controllers
      for (const [uuid, cameraData] of this.cameras.entries()) {
        if (cameraData.controller) {
          await cameraData.controller.cleanup();
        }
      }
      this.cameras.clear();
      this.primaryCamera = null;
      
      logger.info('Camera discovery stopped');
      this.emit('discoveryStopped');
    } catch (error) {
      logger.error('Error stopping discovery:', error);
    }
  }

  /**
   * Handle newly discovered camera
   */
  handleCameraDiscovered(deviceInfo) {
    const uuid = deviceInfo.uuid;
    
    if (this.cameras.has(uuid)) {
      // Update existing camera info
      const existing = this.cameras.get(uuid);
      existing.info = deviceInfo;
      existing.status = 'discovered';
      logger.debug(`Updated camera info: ${deviceInfo.modelName}`);
    } else {
      // Add new camera
      this.cameras.set(uuid, {
        info: deviceInfo,
        controller: null,
        status: 'discovered', // discovered, connecting, connected, error
        lastError: null
      });
      
      logger.info(`New camera discovered: ${deviceInfo.modelName} at ${deviceInfo.ipAddress}`);
    }

    this.emit('cameraDiscovered', deviceInfo);
    
    // Auto-connect to first camera if no primary camera is set
    if (!this.primaryCamera) {
      this.connectToCamera(uuid);
    }
  }

  /**
   * Handle camera going offline
   */
  handleCameraOffline(uuid) {
    const cameraData = this.cameras.get(uuid);
    if (!cameraData) return;

    logger.info(`Camera going offline: ${cameraData.info.modelName}`);
    
    // Cleanup controller
    if (cameraData.controller) {
      cameraData.controller.cleanup();
      cameraData.controller = null;
    }

    // Update status
    cameraData.status = 'offline';
    
    // Clear primary camera if this was it
    if (this.primaryCamera && this.primaryCamera.uuid === uuid) {
      this.primaryCamera = null;
      this.emit('primaryCameraDisconnected');
    }

    this.emit('cameraOffline', uuid);
  }

  /**
   * Connect to a specific camera
   */
  async connectToCamera(uuid) {
    const cameraData = this.cameras.get(uuid);
    if (!cameraData) {
      throw new Error(`Camera with UUID ${uuid} not found`);
    }

    if (cameraData.status === 'connecting' || cameraData.status === 'connected') {
      logger.debug(`Camera ${uuid} already connecting/connected`);
      return cameraData.controller;
    }

    logger.info(`Connecting to camera: ${cameraData.info.modelName}`);
    cameraData.status = 'connecting';
    cameraData.lastError = null;

    try {
      // Extract IP and port from CCAPI URL
      const { ip, port } = this.parseBaseUrl(cameraData.info.ccapiUrl);
      
      // Create camera controller with discovery-provided endpoint
      const controller = new CameraController(
        ip, 
        port, 
        (status) => this.handleCameraConnectionChange(uuid, status)
      );

      // Initialize connection
      const success = await controller.initialize();
      
      if (success) {
        cameraData.controller = controller;
        cameraData.status = 'connected';
        
        logger.info(`Successfully connected to camera: ${cameraData.info.modelName}`);
        this.emit('cameraConnected', { uuid, info: cameraData.info, controller });
        
        return controller;
      } else {
        throw new Error('Failed to initialize camera controller');
      }
    } catch (error) {
      logger.error(`Failed to connect to camera ${uuid}:`, error);
      cameraData.status = 'error';
      cameraData.lastError = error.message;
      this.emit('cameraConnectionError', { uuid, error: error.message });
      throw error;
    }
  }

  /**
   * Parse base URL to extract IP and port
   */
  parseBaseUrl(ccapiUrl) {
    try {
      const url = new URL(ccapiUrl);
      return {
        ip: url.hostname,
        port: url.port || (url.protocol === 'https:' ? '443' : '80')
      };
    } catch (error) {
      logger.error('Failed to parse CCAPI URL:', ccapiUrl, error);
      // Fallback to default Canon camera port
      return {
        ip: ccapiUrl.replace(/https?:\\/\\//, '').split(':')[0],
        port: '443'
      };
    }
  }

  /**
   * Handle camera connection status changes
   */
  handleCameraConnectionChange(uuid, status) {
    const cameraData = this.cameras.get(uuid);
    if (!cameraData) return;

    logger.debug(`Camera ${uuid} connection status changed:`, status);
    
    if (status.connected) {
      cameraData.status = 'connected';
      cameraData.lastError = null;
    } else {
      cameraData.status = status.lastError ? 'error' : 'disconnected';
      cameraData.lastError = status.lastError;
    }

    this.emit('cameraStatusChanged', { uuid, status });
  }

  /**
   * Set primary camera (the one used by the application)
   */
  async setPrimaryCamera(uuid) {
    const cameraData = this.cameras.get(uuid);
    if (!cameraData) {
      throw new Error(`Camera with UUID ${uuid} not found`);
    }

    // Connect to camera if not already connected
    if (cameraData.status !== 'connected') {
      await this.connectToCamera(uuid);
    }

    // Set as primary
    this.primaryCamera = {
      uuid,
      controller: cameraData.controller,
      info: cameraData.info
    };

    logger.info(`Set primary camera: ${cameraData.info.modelName}`);
    this.emit('primaryCameraChanged', this.primaryCamera);
    
    return this.primaryCamera.controller;
  }

  /**
   * Get primary camera controller (backwards compatibility)
   */
  getPrimaryCamera() {
    return this.primaryCamera?.controller || null;
  }

  /**
   * Get all discovered cameras
   */
  getDiscoveredCameras() {
    return Array.from(this.cameras.entries()).map(([uuid, data]) => ({
      uuid,
      ...data.info,
      status: data.status,
      lastError: data.lastError,
      connected: data.status === 'connected'
    }));
  }

  /**
   * Get camera by UUID
   */
  getCamera(uuid) {
    const cameraData = this.cameras.get(uuid);
    return cameraData ? {
      uuid,
      ...cameraData.info,
      status: cameraData.status,
      lastError: cameraData.lastError,
      connected: cameraData.status === 'connected',
      controller: cameraData.controller
    } : null;
  }

  /**
   * Manually trigger camera search
   */
  async searchForCameras() {
    if (!this.isDiscovering) {
      throw new Error('Discovery service not running');
    }

    logger.info('Manually triggering camera search...');
    return await this.upnp.performMSearch();
  }

  /**
   * Connect to camera by IP (fallback method for manual configuration)
   */
  async connectToIp(ip, port = '443') {
    logger.info(`Manually connecting to camera at ${ip}:${port}`);
    
    const uuid = `manual-${ip}-${port}`;
    
    // Create synthetic device info for manual connection
    const deviceInfo = {
      uuid,
      ipAddress: ip,
      ccapiUrl: `https://${ip}:${port}/ccapi`,
      modelName: 'Manual Connection',
      friendlyName: `Camera at ${ip}`,
      manufacturer: 'Canon',
      discoveredAt: new Date(),
      isManual: true
    };

    // Add to cameras map
    this.cameras.set(uuid, {
      info: deviceInfo,
      controller: null,
      status: 'discovered',
      lastError: null
    });

    // Connect to it
    return await this.connectToCamera(uuid);
  }

  /**
   * Perform fallback IP scanning on known camera network ranges
   */
  async performFallbackScanning() {
    logger.debug('Starting fallback IP scanning for cameras...');
    
    const networkRanges = [
      '192.168.4', // Access point network
      '192.168.12', // Development network  
      '192.168.1',  // Common home network
      '192.168.0'   // Another common range
    ];

    for (const baseRange of networkRanges) {
      logger.debug(`Scanning network range ${baseRange}.x`);
      
      // Scan full DHCP range for access point, and common camera ranges for other networks
      const promises = [];
      if (baseRange === '192.168.4') {
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
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    logger.debug('Fallback IP scanning completed');
  }

  /**
   * Check if there's a Canon camera at a specific IP
   */
  async checkCameraAtIp(ip, port = '443') {
    try {
      // Quick timeout test to see if anything is listening
      const response = await axios.get(`https://${ip}:${port}/ccapi`, {
        timeout: 2000,
        httpsAgent: new (await import('https')).Agent({
          rejectUnauthorized: false // Canon cameras use self-signed certs
        })
      });

      if (response.status === 200 && response.data) {
        logger.info(`Found potential Canon camera at ${ip}:${port}`);
        
        // Create device info for discovered camera
        const uuid = `ip-scan-${ip}-${port}`;
        const deviceInfo = {
          uuid,
          ipAddress: ip,
          ccapiUrl: `https://${ip}:${port}/ccapi`,
          modelName: response.data.model || 'Canon Camera',
          friendlyName: `Camera at ${ip}`,
          manufacturer: 'Canon',
          discoveredAt: new Date(),
          isManual: true,
          discoveryMethod: 'ip-scan'
        };

        // Add to cameras if not already present
        if (!this.cameras.has(uuid)) {
          this.cameras.set(uuid, {
            info: deviceInfo,
            controller: null,
            status: 'discovered',
            lastError: null
          });

          logger.info(`Added camera found via IP scan: ${deviceInfo.friendlyName}`);
          this.emit('cameraDiscovered', deviceInfo);
        }
      }
    } catch (error) {
      // Expected for most IPs - they won't have cameras
      // Only log actual errors, not connection failures
      if (error.code !== 'ECONNREFUSED' && error.code !== 'ETIMEDOUT' && error.code !== 'ENOTFOUND') {
        logger.debug(`IP scan error for ${ip}:`, error.message);
      }
    }
  }

  /**
   * Get discovery status
   */
  getStatus() {
    return {
      isDiscovering: this.isDiscovering,
      cameraCount: this.cameras.size,
      connectedCameras: Array.from(this.cameras.values()).filter(c => c.status === 'connected').length,
      primaryCamera: this.primaryCamera ? {
        uuid: this.primaryCamera.uuid,
        modelName: this.primaryCamera.info.modelName,
        ipAddress: this.primaryCamera.info.ipAddress
      } : null
    };
  }
}