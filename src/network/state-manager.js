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

      // Ensure Access Point is always running (camera controller requirement)
      await this.ensureAccessPointRunning();

      // Start status monitoring
      this.startStatusMonitoring();

      logger.info('NetworkStateManager initialized successfully', {
        interfaces: Object.fromEntries(this.networkState.interfaces),
        services: Object.fromEntries(this.networkState.services)
      });

      this.emit('initialized');
      return true;

    } catch (error) {
      logger.error('NetworkStateManager initialization failed:', error);
      this.emit('initializationFailed', { error: error.message });
      return false;
    }
  }
  
  /**
   * Ensure Access Point is running (critical for camera controller connectivity)
   */
  async ensureAccessPointRunning() {
    try {
      logger.info('Ensuring Access Point is running...');

      // Update current state to check AP status
      await this.updateNetworkState();

      const ap0Active = this.networkState.interfaces.get('ap0')?.active || false;
      const hostapdActive = this.networkState.services.get('hostapd')?.active || false;

      if (hostapdActive && ap0Active) {
        logger.info('Access Point already running');
        return;
      }

      // Configure and start Access Point
      logger.info('Access Point not fully active, starting...');
      await this.configManager.ensureAccessPointConfig();
      await this.serviceManager.startAccessPoint();

      // Verify it started successfully
      await this.updateNetworkState();

      const verifyAp0Active = this.networkState.interfaces.get('ap0')?.active || false;
      const verifyHostapdActive = this.networkState.services.get('hostapd')?.active || false;

      if (verifyHostapdActive && verifyAp0Active) {
        logger.info('Access Point started successfully');
        this.emit('accessPointEnsured', { active: true });
      } else {
        logger.error('Failed to start Access Point - camera controller may be unreachable');
        this.emit('accessPointEnsured', { active: false, error: 'Failed to start' });
      }

    } catch (error) {
      logger.error('Failed to ensure Access Point is running:', error);
      this.emit('accessPointEnsured', { active: false, error: error.message });
      throw error;
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
    const status = {
      interfaces: Object.fromEntries(this.networkState.interfaces),
      services: Object.fromEntries(this.networkState.services),
      lastUpdate: this.networkState.lastUpdate
    };

    logger.debug('getNetworkStatus returning:', {
      interfaceKeys: Object.keys(status.interfaces),
      wlan0: status.interfaces.wlan0,
      ap0: status.interfaces.ap0
    });

    return status;
  }
  
  /**
   * Configure access point settings
   */
  async configureAccessPoint(config) {
    try {
      // Update configuration
      await this.configManager.updateAccessPointConfig(config);

      // Always restart hostapd to apply new configuration
      // Don't rely on state detection as it may be stale or unreliable
      logger.info('Restarting hostapd to apply new access point configuration...');
      await this.serviceManager.restartAccessPoint();

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