import { logger } from '../utils/logger.js';
import { NetworkStateManager } from './state-manager.js';

/**
 * Network Manager - Legacy API Compatibility Layer
 * Uses centralized NetworkStateManager for all operations
 * Maintains existing API for backward compatibility
 */
export class NetworkManager {
  constructor() {
    this.stateManager = new NetworkStateManager();
    this.initialized = false;
    
    // Bind state manager events to maintain compatibility
    this.bindStateManagerEvents();
  }

  /**
   * Bind events from state manager for compatibility
   */
  bindStateManagerEvents() {
    this.stateManager.on('modeChanged', (data) => {
      logger.debug('Network mode changed:', data.mode);
    });
    
    this.stateManager.on('serviceStateChanged', (data) => {
      logger.debug('Service state changed:', data);
    });
    
    this.stateManager.on('interfaceStateChanged', (data) => {
      logger.debug('Interface state changed:', data);
    });
  }
  
  async initialize() {
    if (this.initialized) {
      return true;
    }
    
    try {
      logger.info('Initializing NetworkManager (using centralized state management)...');
      
      const success = await this.stateManager.initialize();
      if (!success) {
        throw new Error('NetworkStateManager initialization failed');
      }
      
      this.initialized = true;
      logger.info('NetworkManager initialized successfully');
      return true;
      
    } catch (error) {
      logger.error('NetworkManager initialization failed:', error);
      return false;
    }
  }

  /**
   * Get current network mode - delegated to state manager
   */
  getCurrentMode() {
    return this.stateManager.currentMode;
  }
  
  /**
   * Legacy compatibility - detect current mode
   */
  async detectCurrentMode() {
    // State manager handles mode detection during initialization
    return this.stateManager.currentMode || 'field';
  }

  /**
   * Switch between network modes - delegated to state manager
   */
  async switchNetworkMode(mode) {
    try {
      const result = await this.stateManager.switchMode(mode);
      
      // Convert to legacy format for backward compatibility
      const status = this.getConnectionStatus();
      
      return {
        success: result.success,
        mode: result.mode,
        status: status
      };
      
    } catch (error) {
      logger.error(`NetworkManager: Failed to switch to ${mode} mode:`, error);
      throw error;
    }
  }

  /**
   * Legacy compatibility - get connection status
   */
  getConnectionStatus() {
    if (!this.stateManager) {
      return {
        ap0: { active: false, clients: [], ip: null, ssid: 'Unknown' },
        wlan0: { active: false, network: null, ip: null }
      };
    }
    
    const networkStatus = this.stateManager.getNetworkStatus();
    
    // Handle null or undefined interfaces
    const interfaces = networkStatus.interfaces || {};
    const ap0State = interfaces.ap0 || { active: false };
    const wlan0State = interfaces.wlan0 || { active: false };
    
    return {
      ap0: {
        active: ap0State.active || false,
        clients: [], // TODO: Extract from hostapd if needed
        ip: ap0State.ipAddress || null,
        ssid: 'PiCameraController' // TODO: Get from config manager
      },
      wlan0: {
        active: wlan0State.active || false,
        network: null, // TODO: Get current SSID
        ip: wlan0State.ipAddress || null
      }
    };
  }

  /**
   * Get current network status - delegated to state manager
   */
  async getNetworkStatus() {
    if (!this.stateManager) {
      return { mode: 'unknown', interfaces: {}, services: {} };
    }
    
    const status = this.stateManager.getNetworkStatus();
    
    // Convert to legacy format for backward compatibility
    return {
      mode: status.mode,
      interfaces: this.getConnectionStatus(),
      services: status.services || {}
    };
  }

  /**
   * Update connection status for all interfaces
   */
  async updateConnectionStatus() {
    try {
      // Check AP interface (ap0)
      await this.updateAPStatus();
      
      // Check client interface (wlan0) 
      await this.updateClientStatus();
      
    } catch (error) {
      logger.warn('Error updating connection status:', error);
    }
  }

  /**
   * Update access point status
   */
  async updateAPStatus() {
    try {
      // Check if ap0 interface exists and has IP
      const { stdout: ipInfo } = await execAsync('ip addr show ap0 2>/dev/null || echo ""');
      const hasIP = ipInfo.includes('192.168.4.1');
      
      // Get connected clients from hostapd if available
      let clients = [];
      try {
        const { stdout: clientInfo } = await execAsync('hostapd_cli list_sta 2>/dev/null || echo ""');
        clients = clientInfo.split('\n').filter(line => line.trim() && line.match(/^[0-9a-f:]{17}$/i));
      } catch (error) {
        logger.debug('Could not get AP client list:', error.message);
      }

      // Get current SSID from hostapd config
      let currentSSID = 'Unknown';
      try {
        const hostapdConfig = await readFile('/etc/hostapd/hostapd.conf', 'utf8');
        const ssidMatch = hostapdConfig.match(/^ssid=(.+)$/m);
        if (ssidMatch) {
          currentSSID = ssidMatch[1].trim();
        }
      } catch (error) {
        logger.debug('Could not read current SSID from hostapd.conf:', error.message);
      }

      this.connectionStatus.ap0 = {
        active: hasIP,
        clients: clients,
        ip: hasIP ? '192.168.4.1' : null,
        ssid: currentSSID
      };

    } catch (error) {
      this.connectionStatus.ap0 = { active: false, clients: [], ip: null, ssid: 'Unknown' };
      logger.debug('AP status check failed:', error.message);
    }
  }

  /**
   * Update WiFi client status
   */
  async updateClientStatus() {
    try {
      // Check if wlan0 has IP address
      const { stdout: ipInfo } = await execAsync('ip addr show wlan0 2>/dev/null || echo ""');
      const ipMatch = ipInfo.match(/inet (\d+\.\d+\.\d+\.\d+)/);
      const hasIP = !!ipMatch;

      // Get current network name if connected
      let network = null;
      if (hasIP) {
        try {
          const { stdout: wpaInfo } = await execAsync('wpa_cli -i wlan0 status 2>/dev/null || echo ""');
          
          // Extract SSID from wpa_cli output
          const ssidMatch = wpaInfo.match(/^ssid=(.+)$/m);
          if (ssidMatch && ssidMatch[1]) {
            network = ssidMatch[1].trim();
            logger.debug(`Found WiFi network SSID: ${network}`);
          } else {
            logger.debug('Could not extract SSID from wpa_cli output:', wpaInfo);
          }
        } catch (error) {
          logger.debug('Could not get current WiFi network:', error.message);
        }
      }

      this.connectionStatus.wlan0 = {
        active: hasIP,
        network: network,
        ip: ipMatch ? ipMatch[1] : null
      };

      logger.debug('Client status updated:', this.connectionStatus.wlan0);

    } catch (error) {
      this.connectionStatus.wlan0 = { active: false, network: null, ip: null };
      logger.debug('Client status check failed:', error.message);
    }
  }

  /**
   * Get service status for hostapd, dnsmasq, and wpa_supplicant
   */
  async getServiceStatus() {
    const services = ['hostapd', 'dnsmasq', 'wpa_supplicant@wlan0'];
    const status = {};

    for (const service of services) {
      try {
        const { stdout } = await execAsync(`systemctl is-active ${service} 2>/dev/null || echo "inactive"`);
        status[service] = stdout.trim();
      } catch (error) {
        status[service] = 'unknown';
        logger.debug(`Could not get status for ${service}:`, error.message);
      }
    }

    return status;
  }

  /**
   * Scan for available WiFi networks
   */
  async scanWiFiNetworks(forceRefresh = false) {
    const scanCacheTimeout = 30000; // 30 seconds
    const now = Date.now();

    // Return cached results if recent scan available
    if (!forceRefresh && this.lastScan && (now - this.lastScan < scanCacheTimeout)) {
      logger.debug('Returning cached WiFi scan results');
      return this.scanResults;
    }

    try {
      logger.info('Scanning for WiFi networks...');
      
      // Trigger new scan
      await execAsync('wpa_cli -i wlan0 scan 2>/dev/null || iwlist wlan0 scan >/dev/null 2>&1 || true');
      
      // Wait for scan to complete
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Get scan results
      const { stdout } = await execAsync('wpa_cli -i wlan0 scan_results 2>/dev/null || echo ""');
      
      const networks = [];
      const lines = stdout.split('\n');
      
      for (const line of lines) {
        // Parse wpa_cli scan_results format: bssid / frequency / signal level / flags / ssid
        const parts = line.trim().split('\t');
        if (parts.length >= 5 && !parts[0].includes('bssid')) {
          const [bssid, frequency, signal, flags, ssid] = parts;
          
          if (ssid && ssid.length > 0) {
            networks.push({
              ssid: ssid,
              bssid: bssid,
              frequency: parseInt(frequency),
              signal: parseInt(signal),
              security: this.parseSecurityFlags(flags),
              quality: this.signalToQuality(parseInt(signal))
            });
          }
        }
      }

      // Remove duplicates and sort by signal strength
      const uniqueNetworks = networks
        .filter((network, index, self) => 
          index === self.findIndex(n => n.ssid === network.ssid)
        )
        .sort((a, b) => b.signal - a.signal);

      this.scanResults = uniqueNetworks;
      this.lastScan = now;
      
      logger.info(`Found ${uniqueNetworks.length} WiFi networks`);
      return this.scanResults;

    } catch (error) {
      logger.error('WiFi scan failed:', error);
      // Return cached results or empty array
      return this.scanResults || [];
    }
  }

  /**
   * Parse security flags from wpa_cli output
   */
  parseSecurityFlags(flags) {
    if (!flags) return 'Open';
    if (flags.includes('WPA2')) return 'WPA2';
    if (flags.includes('WPA')) return 'WPA';
    if (flags.includes('WEP')) return 'WEP';
    return flags.includes('[') ? 'Secured' : 'Open';
  }

  /**
   * Convert signal strength to quality percentage
   */
  signalToQuality(signal) {
    // Convert dBm to quality percentage
    // -50 dBm = 100%, -100 dBm = 0%
    const quality = Math.min(100, Math.max(0, (signal + 100) * 2));
    return Math.round(quality);
  }

  /**
   * Connect to a WiFi network
   */
  async connectToWiFi(ssid, password, priority = 1) {
    try {
      logger.info(`Connecting to WiFi network: ${ssid}`);

      // Add network to wpa_supplicant configuration
      const networkId = await this.addWiFiNetwork(ssid, password, priority);
      
      // Enable and select the network
      await execAsync(`wpa_cli -i wlan0 enable_network ${networkId}`);
      await execAsync(`wpa_cli -i wlan0 select_network ${networkId}`);
      
      // Wait for connection attempt
      await new Promise(resolve => setTimeout(resolve, 10000));
      
      // Check connection status
      await this.updateClientStatus();
      
      if (this.connectionStatus.wlan0.active && this.connectionStatus.wlan0.network === ssid) {
        logger.info(`Successfully connected to ${ssid}`);
        
        // Save configuration
        await execAsync('wpa_cli -i wlan0 save_config');
        
        return { success: true, network: ssid, ip: this.connectionStatus.wlan0.ip };
      } else {
        throw new Error('Connection failed - no IP address obtained');
      }

    } catch (error) {
      logger.error(`WiFi connection to ${ssid} failed:`, error);
      throw new Error(`Connection failed: ${error.message}`);
    }
  }

  /**
   * Add WiFi network to wpa_supplicant configuration
   */
  async addWiFiNetwork(ssid, password, priority = 1) {
    try {
      // Add network
      const { stdout: networkId } = await execAsync('wpa_cli -i wlan0 add_network');
      const id = networkId.trim();
      
      // Configure network
      await execAsync(`wpa_cli -i wlan0 set_network ${id} ssid '"${ssid}"'`);
      if (password) {
        await execAsync(`wpa_cli -i wlan0 set_network ${id} psk '"${password}"'`);
      } else {
        await execAsync(`wpa_cli -i wlan0 set_network ${id} key_mgmt NONE`);
      }
      await execAsync(`wpa_cli -i wlan0 set_network ${id} priority ${priority}`);
      
      return id;
    } catch (error) {
      logger.error('Failed to add WiFi network:', error);
      throw error;
    }
  }

  /**
   * Disconnect from current WiFi network - delegated to state manager
   */
  async disconnectWiFi() {
    try {
      return await this.stateManager.disconnectWiFi();
    } catch (error) {
      logger.error('NetworkManager: WiFi disconnection failed:', error);
      throw error;
    }
  }

  /**
   * Get saved WiFi networks - placeholder for future implementation
   */
  async getSavedNetworks() {
    // TODO: Implement in state manager service layer
    logger.debug('getSavedNetworks not yet implemented in centralized system');
    return [];
  }

  /**
   * Remove saved WiFi network - placeholder for future implementation
   */
  async removeSavedNetwork(networkId) {
    // TODO: Implement in state manager service layer
    logger.debug('removeSavedNetwork not yet implemented in centralized system');
    throw new Error('removeSavedNetwork not yet implemented');
  }

  /**
   * Configure access point settings - delegated to state manager
   */
  async configureAccessPoint(config) {
    try {
      return await this.stateManager.configureAccessPoint(config);
    } catch (error) {
      logger.error('NetworkManager: Access point configuration failed:', error);
      throw error;
    }
  }

  /**
   * Legacy method - access point restart now handled by state manager
   */
  async restartAccessPointServices() {
    // Delegated to state manager's restart functionality
    logger.debug('Access point restart handled by centralized state manager');
    return true;
  }

  /**
   * Legacy method - configuration templates now in NetworkConfigManager
   */
  getDefaultHostapdConfig() {
    // Delegated to NetworkConfigManager
    return this.stateManager.configManager.getDefaults().accessPoint;
  }

  /**
   * Set WiFi regulatory country - placeholder for future centralized implementation
   */
  async setWiFiCountry(countryCode) {
    // TODO: Implement in centralized NetworkConfigManager
    logger.debug('setWiFiCountry not yet implemented in centralized system');
    throw new Error('setWiFiCountry not yet implemented in centralized system');
  }

  /**
   * Get current WiFi country - placeholder for future implementation
   */
  async getWiFiCountry() {
    // TODO: Implement in centralized system
    logger.debug('getWiFiCountry not yet implemented in centralized system');
    return { country: 'US' }; // Safe default
  }

  /**
   * Get list of common country codes for international travel
   */
  getCountryCodes() {
    return [
      { code: 'AD', name: 'Andorra' },
      { code: 'AE', name: 'United Arab Emirates' },
      { code: 'AR', name: 'Argentina' },
      { code: 'AT', name: 'Austria' },
      { code: 'AU', name: 'Australia' },
      { code: 'BE', name: 'Belgium' },
      { code: 'BG', name: 'Bulgaria' },
      { code: 'BR', name: 'Brazil' },
      { code: 'CA', name: 'Canada' },
      { code: 'CH', name: 'Switzerland' },
      { code: 'CN', name: 'China' },
      { code: 'CZ', name: 'Czech Republic' },
      { code: 'DE', name: 'Germany' },
      { code: 'DK', name: 'Denmark' },
      { code: 'EE', name: 'Estonia' },
      { code: 'ES', name: 'Spain' },
      { code: 'FI', name: 'Finland' },
      { code: 'FR', name: 'France' },
      { code: 'GB', name: 'United Kingdom' },
      { code: 'GR', name: 'Greece' },
      { code: 'HK', name: 'Hong Kong' },
      { code: 'HR', name: 'Croatia' },
      { code: 'HU', name: 'Hungary' },
      { code: 'IE', name: 'Ireland' },
      { code: 'IL', name: 'Israel' },
      { code: 'IN', name: 'India' },
      { code: 'IS', name: 'Iceland' },
      { code: 'IT', name: 'Italy' },
      { code: 'JP', name: 'Japan' },
      { code: 'KR', name: 'South Korea' },
      { code: 'LT', name: 'Lithuania' },
      { code: 'LU', name: 'Luxembourg' },
      { code: 'LV', name: 'Latvia' },
      { code: 'MX', name: 'Mexico' },
      { code: 'NL', name: 'Netherlands' },
      { code: 'NO', name: 'Norway' },
      { code: 'NZ', name: 'New Zealand' },
      { code: 'PL', name: 'Poland' },
      { code: 'PT', name: 'Portugal' },
      { code: 'RO', name: 'Romania' },
      { code: 'RU', name: 'Russia' },
      { code: 'SE', name: 'Sweden' },
      { code: 'SG', name: 'Singapore' },
      { code: 'SI', name: 'Slovenia' },
      { code: 'SK', name: 'Slovakia' },
      { code: 'TR', name: 'Turkey' },
      { code: 'TW', name: 'Taiwan' },
      { code: 'US', name: 'United States' },
      { code: 'ZA', name: 'South Africa' }
    ];
  }

  /**
   * Cleanup resources - delegated to state manager
   */
  async cleanup() {
    if (this.stateManager) {
      await this.stateManager.cleanup();
    }
    logger.info('NetworkManager cleanup complete');
  }
}