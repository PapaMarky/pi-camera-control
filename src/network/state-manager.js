import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';
import { NetworkServiceManager } from './service-manager.js';
import { NetworkConfigManager } from './config-manager.js';

/**
 * Centralized Network State Management
 * Similar to CameraStateManager but for network interfaces and services
 * Single source of truth for all network state and operations
 */
export class NetworkStateManager extends EventEmitter {
  constructor() {
    super();
    
    // Core managers
    this.serviceManager = new NetworkServiceManager();
    this.configManager = new NetworkConfigManager();
    
    // Current network state
    this.currentMode = null; // 'field', 'development', 'wifi-only'
    this.networkState = {
      interfaces: new Map(), // ap0, wlan0 states
      services: new Map(),   // hostapd, dnsmasq, wpa_supplicant states
      lastUpdate: null
    };
    
    // Network configuration cache
    this.configCache = {
      hostapd: null,
      dnsmasq: null,
      dhcpcd: null
    };
    
    // Monitoring intervals
    this.statusInterval = null;
    this.statusCheckInterval = 10000; // 10 seconds
    
    // Bind service manager events
    this.bindServiceEvents();
  }
  
  /**
   * Initialize the network state manager
   */
  async initialize() {
    try {
      logger.info('Initializing NetworkStateManager...');
      
      // Initialize sub-managers
      await this.serviceManager.initialize();
      await this.configManager.initialize();
      
      // Detect current network mode
      await this.detectCurrentMode();
      
      // Start status monitoring
      this.startStatusMonitoring();
      
      logger.info('NetworkStateManager initialized successfully', {
        mode: this.currentMode,
        interfaces: Object.fromEntries(this.networkState.interfaces),
        services: Object.fromEntries(this.networkState.services)
      });
      
      this.emit('initialized', { mode: this.currentMode });
      return true;
      
    } catch (error) {
      logger.error('NetworkStateManager initialization failed:', error);
      this.emit('initializationFailed', { error: error.message });
      return false;
    }
  }
  
  /**
   * Bind events from service manager
   */
  bindServiceEvents() {
    this.serviceManager.on('serviceStateChanged', (data) => {
      this.updateServiceState(data.service, data.state);
      this.emit('serviceStateChanged', data);
    });
    
    this.serviceManager.on('interfaceStateChanged', (data) => {
      this.updateInterfaceState(data.interface, data.state);
      this.emit('interfaceStateChanged', data);
    });
  }
  
  /**
   * Detect current network mode based on active services and interfaces
   */
  async detectCurrentMode() {
    try {
      // Update current state
      await this.updateNetworkState();
      
      const wlan0Active = this.networkState.interfaces.get('wlan0')?.active || false;
      const ap0Active = this.networkState.interfaces.get('ap0')?.active || false;
      const hostapdActive = this.networkState.services.get('hostapd')?.active || false;
      
      // Determine mode based on current state
      if (hostapdActive && ap0Active && wlan0Active) {
        this.currentMode = 'development';
      } else if (hostapdActive && ap0Active && !wlan0Active) {
        this.currentMode = 'field';
      } else if (!hostapdActive && !ap0Active && wlan0Active) {
        this.currentMode = 'wifi-only';
      } else {
        // Default to field mode if unclear
        this.currentMode = 'field';
        logger.warn('Network mode unclear from current state, defaulting to field mode');
      }
      
      logger.info(`Detected network mode: ${this.currentMode}`);
      this.emit('modeDetected', { mode: this.currentMode });
      
    } catch (error) {
      logger.error('Failed to detect network mode:', error);
      this.currentMode = 'field'; // Safe default
    }
  }
  
  /**
   * Switch network mode with atomic operations
   */
  async switchMode(targetMode) {
    if (!['field', 'development', 'wifi-only'].includes(targetMode)) {
      throw new Error(`Invalid network mode: ${targetMode}`);
    }
    
    if (this.currentMode === targetMode) {
      logger.info(`Already in ${targetMode} mode`);
      return { success: true, mode: targetMode };
    }
    
    try {
      logger.info(`Switching from ${this.currentMode} to ${targetMode} mode`);
      this.emit('modeChanging', { from: this.currentMode, to: targetMode });
      
      // Stop current mode services
      await this.stopCurrentModeServices();
      
      // Configure for new mode
      await this.configureForMode(targetMode);
      
      // Start new mode services
      await this.startModeServices(targetMode);
      
      // Update state
      this.currentMode = targetMode;
      await this.updateNetworkState();
      
      logger.info(`Successfully switched to ${targetMode} mode`);
      this.emit('modeChanged', { 
        mode: targetMode,
        state: {
          interfaces: Object.fromEntries(this.networkState.interfaces),
          services: Object.fromEntries(this.networkState.services)
        }
      });
      
      return { success: true, mode: targetMode };
      
    } catch (error) {
      logger.error(`Failed to switch to ${targetMode} mode:`, error);
      this.emit('modeChangeFailed', { 
        targetMode, 
        currentMode: this.currentMode,
        error: error.message 
      });
      throw error;
    }
  }
  
  /**
   * Stop services for current mode
   */
  async stopCurrentModeServices() {
    switch (this.currentMode) {
      case 'field':
        await this.serviceManager.stopAccessPoint();
        break;
      case 'development':
        await this.serviceManager.stopAccessPoint();
        await this.serviceManager.stopWiFiClient();
        break;
      case 'wifi-only':
        await this.serviceManager.stopWiFiClient();
        break;
    }
  }
  
  /**
   * Configure system for specific mode
   */
  async configureForMode(mode) {
    switch (mode) {
      case 'field':
        await this.configManager.ensureAccessPointConfig();
        break;
      case 'development':
        await this.configManager.ensureAccessPointConfig();
        await this.configManager.ensureWiFiClientConfig();
        break;
      case 'wifi-only':
        await this.configManager.ensureWiFiClientConfig();
        break;
    }
  }
  
  /**
   * Start services for specific mode
   */
  async startModeServices(mode) {
    switch (mode) {
      case 'field':
        await this.serviceManager.startAccessPoint();
        break;
      case 'development':
        await this.serviceManager.startAccessPoint();
        await this.serviceManager.startWiFiClient();
        break;
      case 'wifi-only':
        await this.serviceManager.startWiFiClient();
        break;
    }
  }
  
  /**
   * Update complete network state
   */
  async updateNetworkState() {
    try {
      // Update interface states
      await this.updateInterfaceStates();
      
      // Update service states
      await this.updateServiceStates();
      
      this.networkState.lastUpdate = new Date();
      
    } catch (error) {
      logger.warn('Failed to update network state:', error);
    }
  }
  
  /**
   * Update all interface states
   */
  async updateInterfaceStates() {
    const interfaces = ['wlan0', 'ap0'];
    
    for (const iface of interfaces) {
      try {
        const state = await this.serviceManager.getInterfaceState(iface);
        this.updateInterfaceState(iface, state);
      } catch (error) {
        logger.debug(`Failed to get state for interface ${iface}:`, error.message);
        this.updateInterfaceState(iface, { active: false, error: error.message });
      }
    }
  }
  
  /**
   * Update all service states
   */
  async updateServiceStates() {
    const services = ['hostapd', 'dnsmasq', 'wpa_supplicant@wlan0'];
    
    for (const service of services) {
      try {
        const state = await this.serviceManager.getServiceState(service);
        this.updateServiceState(service, state);
      } catch (error) {
        logger.debug(`Failed to get state for service ${service}:`, error.message);
        this.updateServiceState(service, { active: false, error: error.message });
      }
    }
  }
  
  /**
   * Update single interface state
   */
  updateInterfaceState(iface, state) {
    const currentState = this.networkState.interfaces.get(iface);
    const newState = { ...currentState, ...state, lastUpdate: new Date() };
    
    this.networkState.interfaces.set(iface, newState);
    
    // Emit change if state actually changed
    if (!currentState || currentState.active !== newState.active) {
      this.emit('interfaceStateChanged', { interface: iface, state: newState });
    }
  }
  
  /**
   * Update single service state
   */
  updateServiceState(service, state) {
    const currentState = this.networkState.services.get(service);
    const newState = { ...currentState, ...state, lastUpdate: new Date() };
    
    this.networkState.services.set(service, newState);
    
    // Emit change if state actually changed
    if (!currentState || currentState.active !== newState.active) {
      this.emit('serviceStateChanged', { service, state: newState });
    }
  }
  
  /**
   * Start status monitoring
   */
  startStatusMonitoring() {
    if (this.statusInterval) {
      clearInterval(this.statusInterval);
    }
    
    this.statusInterval = setInterval(async () => {
      await this.updateNetworkState();
    }, this.statusCheckInterval);
    
    logger.debug('Network status monitoring started');
  }
  
  /**
   * Stop status monitoring
   */
  stopStatusMonitoring() {
    if (this.statusInterval) {
      clearInterval(this.statusInterval);
      this.statusInterval = null;
    }
    
    logger.debug('Network status monitoring stopped');
  }
  
  /**
   * Get current network status
   */
  getNetworkStatus() {
    return {
      mode: this.currentMode,
      interfaces: Object.fromEntries(this.networkState.interfaces),
      services: Object.fromEntries(this.networkState.services),
      lastUpdate: this.networkState.lastUpdate
    };
  }
  
  /**
   * Get available WiFi networks
   */
  async scanWiFiNetworks(forceRefresh = false) {
    return await this.serviceManager.scanWiFiNetworks(forceRefresh);
  }
  
  /**
   * Connect to WiFi network
   */
  async connectToWiFi(ssid, password, priority = 1) {
    return await this.serviceManager.connectToWiFi(ssid, password, priority);
  }
  
  /**
   * Disconnect from WiFi
   */
  async disconnectWiFi() {
    return await this.serviceManager.disconnectWiFi();
  }
  
  /**
   * Configure access point settings
   */
  async configureAccessPoint(config) {
    try {
      // Update configuration
      await this.configManager.updateAccessPointConfig(config);
      
      // Restart AP services if they're currently running
      if (this.networkState.services.get('hostapd')?.active) {
        await this.serviceManager.restartAccessPoint();
      }
      
      await this.updateNetworkState();
      
      this.emit('accessPointConfigured', { config });
      return { success: true, config };
      
    } catch (error) {
      logger.error('Failed to configure access point:', error);
      throw error;
    }
  }
  
  /**
   * Cleanup resources
   */
  async cleanup() {
    logger.info('Cleaning up NetworkStateManager...');
    
    this.stopStatusMonitoring();
    
    if (this.serviceManager) {
      await this.serviceManager.cleanup();
    }
    
    if (this.configManager) {
      await this.configManager.cleanup();
    }
    
    this.removeAllListeners();
    
    logger.info('NetworkStateManager cleanup complete');
  }
}