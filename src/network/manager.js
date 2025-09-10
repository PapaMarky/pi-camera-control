import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { readFile, writeFile, access, constants } from 'fs/promises';
import { logger } from '../utils/logger.js';

const execAsync = promisify(exec);

/**
 * Network Manager for WiFi and Access Point control
 * Handles dual-mode operation (field/development) and network configuration
 */
export class NetworkManager {
  constructor() {
    this.currentMode = null;
    this.connectionStatus = {
      ap0: { active: false, clients: [] },
      wlan0: { active: false, network: null, ip: null }
    };
    this.scanResults = [];
    this.lastScan = null;
  }

  async initialize() {
    try {
      await this.detectCurrentMode();
      
      // Ensure access point is always active on startup
      await this.ensureAccessPointActive();
      
      await this.updateConnectionStatus();
      logger.info('NetworkManager initialized', {
        mode: this.currentMode,
        status: this.connectionStatus
      });
      return true;
    } catch (error) {
      logger.error('NetworkManager initialization failed:', error);
      return false;
    }
  }

  /**
   * Detect current network mode (field/development)
   */
  async detectCurrentMode() {
    try {
      // Check if wlan0 has an active connection (more reliable than service status)
      const { stdout: wlanInfo } = await execAsync('ip addr show wlan0 2>/dev/null || echo ""');
      const hasWiFiConnection = wlanInfo.includes('inet ') && !wlanInfo.includes('inet 127.');
      
      // If WiFi is connected, assume development mode, otherwise field mode
      this.currentMode = hasWiFiConnection ? 'development' : 'field';
      logger.debug(`Detected network mode: ${this.currentMode} (WiFi connected: ${hasWiFiConnection})`);
      return this.currentMode;
    } catch (error) {
      logger.warn('Could not detect network mode, defaulting to field mode:', error.message);
      this.currentMode = 'field';
      return this.currentMode;
    }
  }

  /**
   * Switch between field and development modes
   */
  async switchNetworkMode(mode) {
    if (!['field', 'development'].includes(mode)) {
      throw new Error(`Invalid network mode: ${mode}`);
    }

    try {
      logger.info(`Switching to ${mode} mode`);
      
      // Use the network mode control script (deployed by service)
      const scriptPath = '/usr/local/bin/camera-network-mode';
      const { stdout, stderr } = await execAsync(`sudo ${scriptPath} ${mode}`);
      
      if (stderr && !stderr.includes('Warning')) {
        logger.warn('Mode switch warnings:', stderr);
      }
      
      this.currentMode = mode;
      
      // Wait for services to settle
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      await this.updateConnectionStatus();
      
      logger.info(`Successfully switched to ${mode} mode`, {
        stdout: stdout.trim(),
        status: this.connectionStatus
      });
      
      return { success: true, mode: this.currentMode, status: this.connectionStatus };
    } catch (error) {
      logger.error(`Failed to switch to ${mode} mode:`, error);
      throw new Error(`Mode switch failed: ${error.message}`);
    }
  }

  /**
   * Ensure access point is always active (critical for field mode)
   */
  async ensureAccessPointActive() {
    try {
      logger.info('Ensuring access point is active...');
      
      // Always switch to the detected mode to ensure AP is active
      const scriptPath = '/usr/local/bin/camera-network-mode';
      await execAsync(`sudo ${scriptPath} ${this.currentMode}`);
      
      logger.info(`Access point activation completed for ${this.currentMode} mode`);
    } catch (error) {
      logger.error('Failed to ensure access point is active:', error);
      // Don't throw error - allow initialization to continue
      logger.warn('Access point may not be active - network functionality may be limited');
    }
  }

  /**
   * Get current network status
   */
  async getNetworkStatus() {
    await this.updateConnectionStatus();
    return {
      mode: this.currentMode,
      interfaces: this.connectionStatus,
      services: await this.getServiceStatus()
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
   * Disconnect from current WiFi network
   */
  async disconnectWiFi() {
    try {
      logger.info('Disconnecting from WiFi');
      await execAsync('wpa_cli -i wlan0 disconnect');
      
      // Update status
      await this.updateClientStatus();
      
      return { success: true };
    } catch (error) {
      logger.error('WiFi disconnection failed:', error);
      throw new Error(`Disconnection failed: ${error.message}`);
    }
  }

  /**
   * Get saved WiFi networks
   */
  async getSavedNetworks() {
    try {
      const { stdout } = await execAsync('wpa_cli -i wlan0 list_networks 2>/dev/null || echo ""');
      const networks = [];
      
      const lines = stdout.split('\n');
      for (const line of lines) {
        const parts = line.trim().split('\t');
        if (parts.length >= 2 && !parts[0].includes('network')) {
          networks.push({
            id: parts[0],
            ssid: parts[1],
            bssid: parts[2] || null,
            flags: parts[3] || ''
          });
        }
      }
      
      return networks;
    } catch (error) {
      logger.error('Failed to get saved networks:', error);
      return [];
    }
  }

  /**
   * Remove saved WiFi network
   */
  async removeSavedNetwork(networkId) {
    try {
      await execAsync(`wpa_cli -i wlan0 remove_network ${networkId}`);
      await execAsync('wpa_cli -i wlan0 save_config');
      
      logger.info(`Removed saved network ${networkId}`);
      return { success: true };
    } catch (error) {
      logger.error(`Failed to remove network ${networkId}:`, error);
      throw new Error(`Remove network failed: ${error.message}`);
    }
  }

  /**
   * Configure access point settings
   */
  async configureAccessPoint(config) {
    try {
      const { ssid, passphrase, channel = 7, hidden = false } = config;
      
      logger.info('Configuring access point', { ssid, channel, hidden });
      
      // Validate inputs
      if (!ssid || ssid.trim().length === 0) {
        throw new Error('SSID cannot be empty');
      }
      if (!passphrase || passphrase.length < 8) {
        throw new Error('Passphrase must be at least 8 characters');
      }
      if (channel < 1 || channel > 13) {
        throw new Error('Channel must be between 1 and 13');
      }
      
      // Read current hostapd configuration
      let hostapdConfig = '';
      try {
        hostapdConfig = await readFile('/etc/hostapd/hostapd.conf', 'utf8');
        logger.debug('Read existing hostapd configuration');
      } catch (error) {
        logger.warn('Could not read hostapd config, using template');
        hostapdConfig = this.getDefaultHostapdConfig();
      }
      
      // Update configuration with new values
      hostapdConfig = hostapdConfig
        .replace(/^ssid=.*/m, `ssid=${ssid}`)
        .replace(/^channel=.*/m, `channel=${channel}`)
        .replace(/^ignore_broadcast_ssid=.*/m, `ignore_broadcast_ssid=${hidden ? '1' : '0'}`);
      
      // Handle WPA configuration - replace if exists, add if missing
      if (hostapdConfig.includes('wpa_passphrase=')) {
        hostapdConfig = hostapdConfig.replace(/^wpa_passphrase=.*/m, `wpa_passphrase=${passphrase}`);
      } else {
        // Add WPA configuration if missing
        if (!hostapdConfig.includes('wpa=2')) {
          hostapdConfig += `wpa=2\n`;
        }
        hostapdConfig += `wpa_passphrase=${passphrase}\n`;
        if (!hostapdConfig.includes('wpa_key_mgmt=')) {
          hostapdConfig += `wpa_key_mgmt=WPA-PSK\n`;
        }
        if (!hostapdConfig.includes('wpa_pairwise=')) {
          hostapdConfig += `wpa_pairwise=TKIP\n`;
        }
        if (!hostapdConfig.includes('rsn_pairwise=')) {
          hostapdConfig += `rsn_pairwise=CCMP\n`;
        }
      }
      
      // Write configuration file (we run as root via systemd service)
      const configPath = '/etc/hostapd/hostapd.conf';
      const tempConfigPath = `/tmp/hostapd.conf.${Date.now()}`;
      
      // Write to temp file first
      await writeFile(tempConfigPath, hostapdConfig, 'utf8');
      logger.debug('Wrote temporary configuration file');
      
      // Move to final location with sudo (even though we're root, use sudo for consistency)
      await execAsync(`sudo cp "${tempConfigPath}" "${configPath}"`);
      await execAsync(`sudo chmod 644 "${configPath}"`);
      await execAsync(`sudo rm -f "${tempConfigPath}"`);
      
      logger.info('Access point configuration file updated successfully');
      
      // Restart hostapd service to apply changes
      await this.restartAccessPointServices();
      
      // Update our connection status
      await this.updateConnectionStatus();
      
      logger.info('Access point configuration completed and applied', {
        ssid,
        channel,
        hidden,
        status: this.connectionStatus.ap0
      });
      
      return { 
        success: true, 
        config: { ssid, channel, hidden },
        status: this.connectionStatus.ap0
      };
      
    } catch (error) {
      logger.error('Access point configuration failed:', error);
      throw new Error(`AP configuration failed: ${error.message}`);
    }
  }

  /**
   * Restart access point services to apply configuration changes
   */
  async restartAccessPointServices() {
    try {
      logger.info('Restarting access point services...');
      
      // Stop services first
      await execAsync('sudo systemctl stop hostapd dnsmasq').catch(error => {
        logger.debug('Some services were already stopped:', error.message);
      });
      
      // Wait a moment for services to fully stop
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Restart services
      await execAsync('sudo systemctl start hostapd');
      await execAsync('sudo systemctl start dnsmasq');
      
      // Wait for services to be ready
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      logger.info('Access point services restarted successfully');
      
      // Verify services are running
      const services = await this.getServiceStatus();
      logger.debug('Service status after restart:', services);
      
      return true;
      
    } catch (error) {
      logger.error('Failed to restart access point services:', error);
      throw new Error(`Service restart failed: ${error.message}`);
    }
  }

  /**
   * Get default hostapd configuration template
   */
  getDefaultHostapdConfig() {
    return `interface=ap0
driver=nl80211
ssid=PiCameraController
hw_mode=g
channel=7
wmm_enabled=0
macaddr_acl=0
auth_algs=1
ignore_broadcast_ssid=0
wpa=2
wpa_passphrase=camera123
wpa_key_mgmt=WPA-PSK
wpa_pairwise=TKIP
rsn_pairwise=CCMP
`;
  }

  /**
   * Set WiFi regulatory country for international travel
   */
  async setWiFiCountry(countryCode) {
    try {
      // Validate country code (2-letter ISO code)
      if (!countryCode || !/^[A-Z]{2}$/.test(countryCode)) {
        throw new Error('Country code must be a 2-letter ISO code (e.g., US, GB, DE)');
      }
      
      logger.info(`Setting WiFi country to: ${countryCode}`);
      
      // Set country in wpa_supplicant configuration
      await execAsync(`sudo wpa_cli -i wlan0 set country ${countryCode}`);
      await execAsync(`sudo wpa_cli -i wlan0 save_config`);
      
      // Update regulatory domain via iw (if available)
      try {
        await execAsync(`sudo iw reg set ${countryCode}`);
        logger.debug('Regulatory domain updated via iw');
      } catch (error) {
        logger.debug('Could not set regulatory domain via iw:', error.message);
      }
      
      // Update /etc/wpa_supplicant/wpa_supplicant.conf if it exists
      try {
        const wpaConfigPath = '/etc/wpa_supplicant/wpa_supplicant.conf';
        let wpaConfig = await readFile(wpaConfigPath, 'utf8');
        
        // Check if country line exists
        if (wpaConfig.includes('country=')) {
          wpaConfig = wpaConfig.replace(/^country=.*/m, `country=${countryCode}`);
        } else {
          // Add country line after ctrl_interface if it exists, otherwise at the beginning
          if (wpaConfig.includes('ctrl_interface=')) {
            wpaConfig = wpaConfig.replace(
              /^(ctrl_interface=.*)/m, 
              `$1\ncountry=${countryCode}`
            );
          } else {
            wpaConfig = `country=${countryCode}\n${wpaConfig}`;
          }
        }
        
        // Write updated configuration
        const tempPath = `/tmp/wpa_supplicant.conf.${Date.now()}`;
        await writeFile(tempPath, wpaConfig, 'utf8');
        await execAsync(`sudo cp "${tempPath}" "${wpaConfigPath}"`);
        await execAsync(`sudo rm -f "${tempPath}"`);
        
        logger.debug('Updated wpa_supplicant configuration file');
        
      } catch (error) {
        logger.warn('Could not update wpa_supplicant.conf:', error.message);
      }
      
      // Restart wpa_supplicant to apply changes
      try {
        await execAsync('sudo systemctl restart wpa_supplicant@wlan0');
        logger.debug('Restarted wpa_supplicant service');
      } catch (error) {
        logger.warn('Could not restart wpa_supplicant service:', error.message);
      }
      
      logger.info(`WiFi country set to ${countryCode} successfully`);
      return { success: true, country: countryCode };
      
    } catch (error) {
      logger.error('Failed to set WiFi country:', error);
      throw new Error(`WiFi country setting failed: ${error.message}`);
    }
  }

  /**
   * Get current WiFi country setting
   */
  async getWiFiCountry() {
    try {
      // Try to get country from wpa_cli first
      const { stdout } = await execAsync('wpa_cli -i wlan0 get country 2>/dev/null || echo ""');
      const country = stdout.trim();
      
      if (country && country !== 'FAIL' && country.length === 2) {
        return { country: country.toUpperCase() };
      }
      
      // Fallback: check wpa_supplicant.conf
      try {
        const wpaConfig = await readFile('/etc/wpa_supplicant/wpa_supplicant.conf', 'utf8');
        const match = wpaConfig.match(/^country=([A-Z]{2})/m);
        if (match) {
          return { country: match[1] };
        }
      } catch (error) {
        logger.debug('Could not read wpa_supplicant.conf:', error.message);
      }
      
      // Default to US if no country is set
      return { country: 'US' };
      
    } catch (error) {
      logger.error('Failed to get WiFi country:', error);
      return { country: 'US' }; // Safe default
    }
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
   * Cleanup resources
   */
  async cleanup() {
    logger.info('NetworkManager cleanup complete');
  }
}