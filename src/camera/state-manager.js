import { EventEmitter } from 'events';
import { CameraController } from './controller.js';
import { CameraConnectionHistory } from './connection-history.js';
import { logger } from '../utils/logger.js';

export class CameraStateManager extends EventEmitter {
  constructor() {
    super();

    // Camera state
    this.cameras = new Map(); // uuid -> camera data
    this.primaryCameraUuid = null;
    this.primaryController = null;

    // Connection tracking
    this.lastKnownIPs = new Map(); // uuid -> last known IP
    this.connectionHistory = new Map(); // uuid -> connection events

    // Camera connection history for UI pre-population
    this.cameraConnectionHistory = new CameraConnectionHistory();

    // State management
    this.isShuttingDown = false;

    logger.info('CameraStateManager initialized');
  }

  /**
   * Initialize the camera state manager
   */
  async initialize() {
    await this.cameraConnectionHistory.initialize();
    logger.info('CameraStateManager initialization complete');
  }

  /**
   * Register a discovered camera
   */
  async registerCamera(uuid, deviceInfo) {
    logger.info(`Registering camera ${uuid}:`, deviceInfo);
    
    // Check for duplicate cameras (same serial number or model at same IP)
    await this.deduplicateCamera(uuid, deviceInfo);
    
    const existingCamera = this.cameras.get(uuid);
    const ipChanged = existingCamera && existingCamera.info.ipAddress !== deviceInfo.ipAddress;
    
    // Store camera data
    const cameraData = {
      uuid,
      info: deviceInfo,
      status: 'discovered',
      controller: null,
      lastSeen: new Date(),
      connectionAttempts: 0,
      lastError: null
    };
    
    this.cameras.set(uuid, cameraData);
    
    // Track IP changes for network transition detection
    const lastIP = this.lastKnownIPs.get(uuid);
    if (lastIP && lastIP !== deviceInfo.ipAddress) {
      logger.info(`Camera ${uuid} IP changed: ${lastIP} -> ${deviceInfo.ipAddress}`);
      this.emit('cameraIPChanged', { uuid, oldIP: lastIP, newIP: deviceInfo.ipAddress });
      
      // If this is our primary camera, we need to reconnect
      if (uuid === this.primaryCameraUuid && this.primaryController) {
        logger.info(`Primary camera IP changed, reconnecting from ${lastIP} to ${deviceInfo.ipAddress}...`);
        try {
          await this.reconnectPrimaryCamera(deviceInfo.ipAddress, deviceInfo.port || '443');
          logger.info(`Primary camera successfully reconnected to ${deviceInfo.ipAddress}`);
        } catch (error) {
          logger.error(`Failed to reconnect primary camera to new IP ${deviceInfo.ipAddress}:`, error);
          // Emit disconnection event so UI can show manual connect option
          this.emit('primaryCameraDisconnected', { uuid, reason: 'ip_change_reconnect_failed' });
        }
      } else {
        logger.debug(`IP changed for non-primary camera ${uuid} or no primary controller available`);
        logger.debug(`primaryCameraUuid: ${this.primaryCameraUuid}, hasController: ${!!this.primaryController}`);
      }
    }
    
    this.lastKnownIPs.set(uuid, deviceInfo.ipAddress);
    
    // Auto-connect logic for network transitions and new cameras
    const shouldAutoConnect = this.shouldAutoConnect(uuid, deviceInfo);
    if (shouldAutoConnect) {
      logger.info(`Auto-connecting to camera ${uuid} (${deviceInfo.modelName}): ${shouldAutoConnect.reason}`);
      try {
        await this.connectToCamera(uuid);
      } catch (error) {
        logger.error(`Auto-connect failed for camera ${uuid}:`, error);
      }
    } else {
      logger.debug(`Not auto-connecting to camera ${uuid}: primary=${this.primaryCameraUuid}, connected=${deviceInfo.connected}`);
    }
    
    this.emit('cameraRegistered', { uuid, info: deviceInfo, ipChanged });
    return cameraData;
  }

  /**
   * Remove duplicate camera entries for the same physical device
   */
  async deduplicateCamera(newUuid, newDeviceInfo) {
    const duplicatesToRemove = [];
    
    for (const [existingUuid, existingCamera] of this.cameras) {
      if (existingUuid === newUuid) continue;
      
      const existingInfo = existingCamera.info;
      
      // Check for duplicates based on serial number (most reliable)
      if (newDeviceInfo.serialNumber && existingInfo.serialNumber && 
          newDeviceInfo.serialNumber === existingInfo.serialNumber) {
        logger.info(`Found duplicate camera by serial number: ${existingUuid} -> ${newUuid}`);
        duplicatesToRemove.push(existingUuid);
        continue;
      }
      
      // Check for duplicates based on IP address and model name
      if (newDeviceInfo.ipAddress === existingInfo.ipAddress &&
          newDeviceInfo.modelName && existingInfo.modelName &&
          newDeviceInfo.modelName.includes('Canon') && existingInfo.modelName.includes('Canon')) {
        
        // Prefer UPnP discovered cameras over manual/IP-scan entries
        const newIsUPnP = !newDeviceInfo.isManual && !newDeviceInfo.discoveryMethod;
        const existingIsUPnP = !existingInfo.isManual && !existingInfo.discoveryMethod;
        
        if (newIsUPnP && !existingIsUPnP) {
          logger.info(`Found duplicate camera, preferring UPnP entry: ${existingUuid} -> ${newUuid}`);
          duplicatesToRemove.push(existingUuid);
        } else if (!newIsUPnP && existingIsUPnP) {
          logger.info(`Skipping duplicate manual/scan entry, keeping UPnP: ${newUuid} (keeping ${existingUuid})`);
          return; // Don't register the new duplicate
        }
      }
    }
    
    // Remove duplicates
    for (const duplicateUuid of duplicatesToRemove) {
      logger.info(`Removing duplicate camera entry: ${duplicateUuid}`);
      
      // If the duplicate was our primary camera, transfer primary status
      if (duplicateUuid === this.primaryCameraUuid) {
        logger.info(`Transferring primary camera status from ${duplicateUuid} to ${newUuid}`);
        this.primaryCameraUuid = null; // Will be set when new camera connects
      }
      
      const duplicateCamera = this.cameras.get(duplicateUuid);
      if (duplicateCamera?.controller) {
        await duplicateCamera.controller.cleanup();
      }
      
      this.cameras.delete(duplicateUuid);
      this.emit('cameraRemoved', { uuid: duplicateUuid, reason: 'duplicate' });
    }
  }

  /**
   * Determine if a camera should auto-connect
   */
  shouldAutoConnect(uuid, deviceInfo) {
    // TODO: Consider deviceInfo (model, IP, capabilities) for auto-connect decisions
    // Always try to auto-connect if no primary camera is set
    if (!this.primaryCameraUuid) {
      return { reason: 'no primary camera set' };
    }
    
    // Auto-connect if this is a known camera that was previously connected
    // (handles network transitions where camera reconnects with new IP)
    const connectionHistory = this.getConnectionHistory(uuid);
    if (connectionHistory.length > 0) {
      const hadSuccessfulConnection = connectionHistory.some(event => 
        event.event === 'connected' || event.event === 'reconnected'
      );
      if (hadSuccessfulConnection) {
        return { reason: 'previously connected camera reconnected' };
      }
    }
    
    return false;
  }

  /**
   * Connect to a specific camera and make it primary
   */
  async connectToCamera(uuid) {
    const cameraData = this.cameras.get(uuid);
    if (!cameraData) {
      throw new Error(`Camera ${uuid} not found`);
    }

    logger.info(`Connecting to camera ${uuid} at ${cameraData.info.ipAddress}`);
    cameraData.status = 'connecting';
    cameraData.connectionAttempts++;
    
    try {
      // Disconnect existing primary if any
      if (this.primaryController) {
        await this.disconnectPrimaryCamera();
      }

      // Create new controller
      const controller = new CameraController(
        cameraData.info.ipAddress,
        cameraData.info.port || '443',
        (status) => this.handleControllerStatusChange(uuid, status)
      );

      // Initialize connection
      const success = await controller.initialize();
      
      if (success) {
        cameraData.controller = controller;
        cameraData.status = 'connected';
        cameraData.lastError = null;
        cameraData.connectionAttempts = 0;
        
        // Set as primary
        this.primaryCameraUuid = uuid;
        this.primaryController = controller;
        
        this.recordConnectionEvent(uuid, 'connected', cameraData.info.ipAddress);

        // Record successful connection in history for UI pre-population
        await this.cameraConnectionHistory.recordConnection(cameraData.info.ipAddress);

        logger.info(`Camera ${uuid} connected successfully and set as primary`);
        this.emit('primaryCameraChanged', {
          uuid,
          info: cameraData.info,
          controller
        });
        
        return controller;
      } else {
        cameraData.status = 'failed';
        cameraData.lastError = 'Connection initialization failed';
        throw new Error('Camera controller initialization failed');
      }
    } catch (error) {
      logger.error(`Failed to connect to camera ${uuid}:`, error);
      cameraData.status = 'failed';
      cameraData.lastError = error.message;
      
      this.recordConnectionEvent(uuid, 'failed', cameraData.info.ipAddress, error.message);
      this.emit('cameraConnectionFailed', { uuid, error: error.message });
      
      throw error;
    }
  }

  /**
   * Manually connect to camera by IP address
   */
  async connectToIP(ip, port = '443') {
    logger.info(`Manual connection to ${ip}:${port}`);
    
    // Check if we already know this camera
    let existingUuid = null;
    for (const [uuid, camera] of this.cameras) {
      if (camera.info.ipAddress === ip) {
        existingUuid = uuid;
        break;
      }
    }
    
    if (existingUuid) {
      logger.info(`IP ${ip} matches known camera ${existingUuid}, using existing entry`);
      return await this.connectToCamera(existingUuid);
    }
    
    // Create temporary camera entry for manual connection
    const manualUuid = `manual-${ip}-${Date.now()}`;
    const deviceInfo = {
      ipAddress: ip,
      port,
      modelName: 'Manual Connection',
      connected: true,
      ccapiUrl: `https://${ip}:${port}/ccapi/`
    };
    
    await this.registerCamera(manualUuid, deviceInfo);
    return await this.connectToCamera(manualUuid);
  }

  /**
   * Reconnect primary camera to new IP (for network transitions)
   */
  async reconnectPrimaryCamera(newIP, newPort = '443') {
    if (!this.primaryCameraUuid || !this.primaryController) {
      throw new Error('No primary camera to reconnect');
    }
    
    const uuid = this.primaryCameraUuid;
    const cameraData = this.cameras.get(uuid);
    
    logger.info(`Reconnecting primary camera ${uuid} to new IP ${newIP}:${newPort}`);
    
    // Clean up old controller
    await this.primaryController.cleanup();
    
    // Update camera info
    cameraData.info.ipAddress = newIP;
    cameraData.info.port = newPort;
    cameraData.info.ccapiUrl = `https://${newIP}:${newPort}/ccapi/`;
    cameraData.status = 'connecting';
    
    try {
      // Create new controller with new IP
      const controller = new CameraController(
        newIP,
        newPort,
        (status) => this.handleControllerStatusChange(uuid, status)
      );
      
      const success = await controller.initialize();
      
      if (success) {
        cameraData.controller = controller;
        cameraData.status = 'connected';
        cameraData.lastError = null;
        this.primaryController = controller;
        
        this.recordConnectionEvent(uuid, 'reconnected', newIP);
        
        logger.info(`Primary camera ${uuid} successfully reconnected to ${newIP}:${newPort}`);
        this.emit('primaryCameraReconnected', {
          uuid,
          info: cameraData.info,
          controller
        });
        
        return controller;
      } else {
        throw new Error('Reconnection failed');
      }
    } catch (error) {
      logger.error(`Failed to reconnect primary camera to ${newIP}:${newPort}:`, error);
      cameraData.status = 'failed';
      cameraData.lastError = error.message;
      
      // Clear primary camera since reconnection failed
      this.primaryCameraUuid = null;
      this.primaryController = null;
      
      this.recordConnectionEvent(uuid, 'reconnect_failed', newIP, error.message);
      this.emit('primaryCameraDisconnected', { uuid, reason: 'reconnection_failed' });
      
      throw error;
    }
  }

  /**
   * Handle controller status changes
   */
  handleControllerStatusChange(uuid, status) {
    const cameraData = this.cameras.get(uuid);
    if (!cameraData) return;
    
    logger.debug(`Controller status change for ${uuid}:`, status);
    
    if (status.connected) {
      cameraData.status = 'connected';
      cameraData.lastError = null;
    } else {
      cameraData.status = 'disconnected';
      cameraData.lastError = status.lastError;
      
      // If this is our primary camera, notify disconnection
      if (uuid === this.primaryCameraUuid) {
        logger.warn(`Primary camera ${uuid} disconnected`);
        this.primaryCameraUuid = null;
        this.primaryController = null;
        
        this.recordConnectionEvent(uuid, 'disconnected', cameraData.info.ipAddress, status.lastError);
        this.emit('primaryCameraDisconnected', { uuid, reason: 'connection_lost' });
      }
    }
    
    // Always emit status change
    this.emit('cameraStatusChanged', { uuid, status: cameraData.status, error: cameraData.lastError });
  }

  /**
   * Remove a camera (when it goes offline)
   */
  removeCamera(uuid) {
    const cameraData = this.cameras.get(uuid);
    if (!cameraData) return;
    
    logger.info(`Removing camera ${uuid}`);
    
    // If this is our primary camera, disconnect it
    if (uuid === this.primaryCameraUuid) {
      this.disconnectPrimaryCamera();
    }
    
    // Clean up controller if it exists
    if (cameraData.controller) {
      cameraData.controller.cleanup();
    }
    
    this.cameras.delete(uuid);
    this.emit('cameraRemoved', { uuid });
  }

  /**
   * Disconnect primary camera
   */
  async disconnectPrimaryCamera() {
    if (!this.primaryController) return;
    
    logger.info(`Disconnecting primary camera ${this.primaryCameraUuid}`);
    
    const uuid = this.primaryCameraUuid;
    await this.primaryController.cleanup();
    
    if (this.cameras.has(uuid)) {
      const cameraData = this.cameras.get(uuid);
      cameraData.status = 'disconnected';
      cameraData.controller = null;
    }
    
    this.primaryCameraUuid = null;
    this.primaryController = null;
    
    this.emit('primaryCameraDisconnected', { uuid, reason: 'manual_disconnect' });
  }

  /**
   * Get current primary camera controller
   */
  getPrimaryController() {
    return this.primaryController;
  }

  /**
   * Get primary camera info
   */
  getPrimaryCamera() {
    if (!this.primaryCameraUuid) return null;
    
    const cameraData = this.cameras.get(this.primaryCameraUuid);
    return cameraData ? {
      uuid: this.primaryCameraUuid,
      info: cameraData.info,
      status: cameraData.status,
      controller: cameraData.controller
    } : null;
  }

  /**
   * Get all camera status
   */
  getAllCameras() {
    const result = {};
    for (const [uuid, camera] of this.cameras) {
      result[uuid] = {
        uuid,
        info: camera.info,
        status: camera.status,
        lastSeen: camera.lastSeen,
        connectionAttempts: camera.connectionAttempts,
        lastError: camera.lastError,
        connected: camera.status === 'connected'
      };
    }
    return result;
  }

  /**
   * Get discovery status summary
   */
  getDiscoveryStatus() {
    const cameras = this.getAllCameras();
    const connectedCameras = Object.values(cameras).filter(c => c.connected);
    
    return {
      totalCameras: this.cameras.size,
      connectedCameras: connectedCameras.length,
      primaryCamera: this.getPrimaryCamera() ? {
        uuid: this.primaryCameraUuid,
        modelName: this.cameras.get(this.primaryCameraUuid).info.modelName,
        ipAddress: this.cameras.get(this.primaryCameraUuid).info.ipAddress
      } : null,
      cameras
    };
  }

  /**
   * Record connection event for debugging
   */
  recordConnectionEvent(uuid, event, ip, error = null) {
    if (!this.connectionHistory.has(uuid)) {
      this.connectionHistory.set(uuid, []);
    }
    
    const history = this.connectionHistory.get(uuid);
    history.push({
      timestamp: new Date(),
      event,
      ip,
      error
    });
    
    // Keep only last 10 events per camera
    if (history.length > 10) {
      history.shift();
    }
  }

  /**
   * Get connection history for debugging
   */
  getConnectionHistory(uuid = null) {
    if (uuid) {
      return this.connectionHistory.get(uuid) || [];
    }
    
    const result = {};
    for (const [cameraUuid, history] of this.connectionHistory) {
      result[cameraUuid] = history;
    }
    return result;
  }

  /**
   * Get the last successful camera IP for UI pre-population
   * @returns {string|null} The last successful IP or null if none recorded
   */
  getLastSuccessfulIP() {
    return this.cameraConnectionHistory.getLastIP();
  }

  /**
   * Clear the camera connection history
   */
  async clearConnectionHistory() {
    await this.cameraConnectionHistory.clearHistory();
  }

  /**
   * Cleanup all resources
   */
  async cleanup() {
    logger.info('Cleaning up camera state manager...');
    this.isShuttingDown = true;
    
    // Disconnect primary camera
    if (this.primaryController) {
      await this.disconnectPrimaryCamera();
    }
    
    // Clean up all controllers
    for (const [_uuid, camera] of this.cameras) {
      if (camera.controller) {
        await camera.controller.cleanup();
      }
    }
    
    this.cameras.clear();
    this.lastKnownIPs.clear();
    this.connectionHistory.clear();
    
    this.removeAllListeners();
    logger.info('Camera state manager cleanup complete');
  }
}