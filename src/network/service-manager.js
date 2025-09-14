import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';

const execAsync = promisify(exec);

/**
 * Network Service Management
 * Manages systemd services and network interfaces without external scripts
 * Replaces functionality from camera-network-mode script
 */
export class NetworkServiceManager extends EventEmitter {
  constructor() {
    super();
    
    // Service definitions
    this.services = {
      hostapd: {
        name: 'hostapd',
        required: ['hostapd.conf'],
        configPath: '/etc/hostapd/hostapd.conf'
      },
      dnsmasq: {
        name: 'dnsmasq', 
        required: ['dnsmasq.conf'],
        configPath: '/etc/dnsmasq.conf'
      },
      wpa_supplicant: {
        name: 'wpa_supplicant@wlan0',
        required: ['wpa_supplicant.conf'],
        configPath: '/etc/wpa_supplicant/wpa_supplicant.conf'
      },
      dhcpcd: {
        name: 'dhcpcd',
        required: ['dhcpcd.conf'],
        configPath: '/etc/dhcpcd.conf'
      }
    };
    
    // Interface definitions
    this.interfaces = {
      wlan0: { type: 'client', managed: false },
      ap0: { type: 'ap', managed: true }
    };
    
    // WiFi scan cache
    this.wifiScanCache = {
      networks: [],
      lastScan: null,
      cacheTimeout: 30000 // 30 seconds
    };
    
    // Operation timeouts
    this.operationTimeout = 30000; // 30 seconds for service operations
  }
  
  /**
   * Initialize service manager
   */
  async initialize() {
    try {
      logger.info('Initializing NetworkServiceManager...');
      
      // Check system capabilities
      await this.checkSystemCapabilities();
      
      logger.info('NetworkServiceManager initialized successfully');
      return true;
      
    } catch (error) {
      logger.error('NetworkServiceManager initialization failed:', error);
      throw error;
    }
  }
  
  /**
   * Check if system has required capabilities
   */
  async checkSystemCapabilities() {
    const criticalCommands = ['systemctl', 'ip'];
    const optionalCommands = ['iw', 'wpa_cli'];
    
    // Check critical commands
    for (const cmd of criticalCommands) {
      try {
        await execAsync(`which ${cmd}`);
      } catch (error) {
        throw new Error(`Critical command not found: ${cmd}`);
      }
    }
    
    // Check optional commands and warn if missing
    for (const cmd of optionalCommands) {
      try {
        await execAsync(`which ${cmd}`);
        logger.debug(`Found optional command: ${cmd}`);
      } catch (error) {
        logger.warn(`Optional command not found: ${cmd} - some features may be limited`);
      }
    }
    
    logger.debug('System capabilities verified');
  }
  
  /**
   * Start access point services
   */
  async startAccessPoint() {
    try {
      logger.info('Starting access point services...');
      
      // Ensure AP interface exists
      await this.ensureApInterface();
      
      // Configure AP interface
      await this.configureApInterface();
      
      // Start hostapd service
      await this.startService('hostapd');
      
      // Start dnsmasq service
      await this.startService('dnsmasq');
      
      // Enable IP forwarding
      await this.enableIpForwarding();
      
      logger.info('Access point services started successfully');
      this.emit('accessPointStarted');
      
    } catch (error) {
      logger.error('Failed to start access point:', error);
      this.emit('accessPointStartFailed', { error: error.message });
      throw error;
    }
  }
  
  /**
   * Stop access point services
   */
  async stopAccessPoint() {
    try {
      logger.info('Stopping access point services...');
      
      // Stop services in reverse order
      await this.stopService('dnsmasq');
      await this.stopService('hostapd');
      
      // Bring down AP interface if it exists
      await this.bringDownApInterface();
      
      logger.info('Access point services stopped');
      this.emit('accessPointStopped');
      
    } catch (error) {
      logger.error('Failed to stop access point:', error);
      throw error;
    }
  }
  
  /**
   * Restart access point services
   */
  async restartAccessPoint() {
    try {
      logger.info('Restarting access point services...');
      
      await this.stopAccessPoint();
      
      // Wait a moment for cleanup
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      await this.startAccessPoint();
      
      logger.info('Access point services restarted');
      this.emit('accessPointRestarted');
      
    } catch (error) {
      logger.error('Failed to restart access point:', error);
      throw error;
    }
  }
  
  /**
   * Start WiFi client services
   */
  async startWiFiClient() {
    try {
      logger.info('Starting WiFi client services...');
      
      // Start wpa_supplicant on wlan0
      await this.startService('wpa_supplicant');
      
      // Restart dhcpcd to get IP if connected
      await this.restartService('dhcpcd');
      
      logger.info('WiFi client services started');
      this.emit('wifiClientStarted');
      
    } catch (error) {
      logger.error('Failed to start WiFi client:', error);
      this.emit('wifiClientStartFailed', { error: error.message });
      throw error;
    }
  }
  
  /**
   * Stop WiFi client services
   */
  async stopWiFiClient() {
    try {
      logger.info('Stopping WiFi client services...');
      
      // Stop wpa_supplicant
      await this.stopService('wpa_supplicant');
      
      // Bring down wlan0 interface
      await this.bringDownInterface('wlan0');
      
      logger.info('WiFi client services stopped');
      this.emit('wifiClientStopped');
      
    } catch (error) {
      logger.error('Failed to stop WiFi client:', error);
      throw error;
    }
  }
  
  /**
   * Ensure AP interface exists
   */
  async ensureApInterface() {
    try {
      // Check if ap0 already exists
      await execAsync('ip link show ap0');
      logger.debug('AP interface ap0 already exists');
      return;
    } catch {
      // Interface doesn't exist, create it
      try {
        logger.info('Creating AP interface ap0...');
        await execAsync('iw phy phy0 interface add ap0 type __ap');
        logger.info('AP interface ap0 created successfully');
      } catch (error) {
        logger.warn('Failed to create ap0 interface:', error.message);
        // Some hardware doesn't support dual interface mode
        // We'll use wlan0 for AP mode instead
      }
    }
  }
  
  /**
   * Configure AP interface with IP address
   */
  async configureApInterface() {
    const iface = await this.getApInterface();
    const ipAddress = '192.168.4.1/24';
    
    try {
      // Flush any existing addresses
      await execAsync(`ip addr flush dev ${iface}`).catch(() => {});
      
      // Set IP address
      await execAsync(`ip addr add ${ipAddress} dev ${iface}`);
      
      // Bring interface up
      await execAsync(`ip link set ${iface} up`);
      
      logger.info(`Configured ${iface} with IP ${ipAddress}`);
      
    } catch (error) {
      logger.error(`Failed to configure ${iface}:`, error);
      throw error;
    }
  }
  
  /**
   * Get the interface to use for AP mode
   */
  async getApInterface() {
    // Check if ap0 exists
    try {
      await execAsync('ip link show ap0');
      return 'ap0';
    } catch {
      // Fall back to wlan0
      logger.debug('Using wlan0 for AP mode (ap0 not available)');
      return 'wlan0';
    }
  }
  
  /**
   * Bring down AP interface
   */
  async bringDownApInterface() {
    const iface = await this.getApInterface();
    
    try {
      await execAsync(`ip link set ${iface} down`);
      
      // Only remove ap0 if it's not wlan0
      if (iface === 'ap0') {
        await execAsync('iw dev ap0 del').catch(() => {});
      }
      
      logger.debug(`Brought down AP interface ${iface}`);
      
    } catch (error) {
      logger.debug(`Failed to bring down ${iface}:`, error.message);
      // Non-critical error
    }
  }
  
  /**
   * Bring down a network interface
   */
  async bringDownInterface(iface) {
    try {
      await execAsync(`ip link set ${iface} down`);
      logger.debug(`Brought down interface ${iface}`);
    } catch (error) {
      logger.debug(`Failed to bring down ${iface}:`, error.message);
    }
  }
  
  /**
   * Enable IP forwarding for internet sharing
   */
  async enableIpForwarding() {
    try {
      await execAsync('echo 1 > /proc/sys/net/ipv4/ip_forward');
      logger.debug('IP forwarding enabled');
    } catch (error) {
      logger.warn('Failed to enable IP forwarding:', error.message);
    }
  }
  
  /**
   * Start a systemd service
   */
  async startService(serviceName) {
    const service = this.services[serviceName];
    if (!service) {
      throw new Error(`Unknown service: ${serviceName}`);
    }
    
    try {
      // Check if already active
      const isActive = await this.isServiceActive(service.name);
      if (isActive) {
        logger.debug(`Service ${service.name} already active`);
        return;
      }
      
      logger.info(`Starting service ${service.name}...`);
      await execAsync(`systemctl start ${service.name}`, { timeout: this.operationTimeout });
      
      // Verify service started
      const startedOk = await this.isServiceActive(service.name);
      if (!startedOk) {
        throw new Error(`Service ${service.name} failed to start`);
      }
      
      logger.info(`Service ${service.name} started successfully`);
      this.emit('serviceStateChanged', { service: service.name, state: { active: true } });
      
    } catch (error) {
      logger.error(`Failed to start service ${service.name}:`, error);
      this.emit('serviceStateChanged', { service: service.name, state: { active: false, error: error.message } });
      throw error;
    }
  }
  
  /**
   * Stop a systemd service
   */
  async stopService(serviceName) {
    const service = this.services[serviceName];
    if (!service) {
      throw new Error(`Unknown service: ${serviceName}`);
    }
    
    try {
      // Check if already inactive
      const isActive = await this.isServiceActive(service.name);
      if (!isActive) {
        logger.debug(`Service ${service.name} already inactive`);
        return;
      }
      
      logger.info(`Stopping service ${service.name}...`);
      await execAsync(`systemctl stop ${service.name}`, { timeout: this.operationTimeout });
      
      logger.info(`Service ${service.name} stopped`);
      this.emit('serviceStateChanged', { service: service.name, state: { active: false } });
      
    } catch (error) {
      logger.error(`Failed to stop service ${service.name}:`, error);
      throw error;
    }
  }
  
  /**
   * Restart a systemd service
   */
  async restartService(serviceName) {
    const service = this.services[serviceName];
    if (!service) {
      throw new Error(`Unknown service: ${serviceName}`);
    }
    
    try {
      logger.info(`Restarting service ${service.name}...`);
      await execAsync(`systemctl restart ${service.name}`, { timeout: this.operationTimeout });
      
      logger.info(`Service ${service.name} restarted`);
      this.emit('serviceStateChanged', { service: service.name, state: { active: true } });
      
    } catch (error) {
      logger.error(`Failed to restart service ${service.name}:`, error);
      throw error;
    }
  }
  
  /**
   * Check if a systemd service is active
   */
  async isServiceActive(serviceName) {
    try {
      await execAsync(`systemctl is-active --quiet ${serviceName}`);
      return true;
    } catch {
      return false;
    }
  }
  
  /**
   * Get detailed service state
   */
  async getServiceState(serviceName) {
    try {
      const { stdout } = await execAsync(`systemctl show ${serviceName} --property=ActiveState,SubState,LoadState`);
      
      const props = {};
      stdout.trim().split('\n').forEach(line => {
        const [key, value] = line.split('=');
        props[key] = value;
      });
      
      return {
        active: props.ActiveState === 'active',
        loaded: props.LoadState === 'loaded',
        subState: props.SubState,
        lastUpdate: new Date()
      };
      
    } catch (error) {
      return {
        active: false,
        error: error.message,
        lastUpdate: new Date()
      };
    }
  }
  
  /**
   * Get network interface state
   */
  async getInterfaceState(iface) {
    try {
      const { stdout } = await execAsync(`ip addr show ${iface}`);

      const isUp = stdout.includes('state UP');
      const hasIp = /inet \d+\.\d+\.\d+\.\d+/.test(stdout);

      // Get IP address
      let ipAddress = null;
      const ipMatch = stdout.match(/inet (\d+\.\d+\.\d+\.\d+\/\d+)/);
      if (ipMatch) {
        ipAddress = ipMatch[1];
      }

      const baseState = {
        active: isUp,
        hasIp,
        ipAddress,
        lastUpdate: new Date()
      };

      // Add interface-specific information
      if (iface === 'wlan0') {
        // Add WiFi-specific information
        try {
          const wifiStatus = await this.getWiFiStatus();
          baseState.network = wifiStatus.ssid;
          baseState.ip = ipAddress;
        } catch (error) {
          logger.error(`Failed to get WiFi status for wlan0: ${error.message}`, error);
          baseState.network = null;
          baseState.ip = ipAddress;
        }
      } else if (iface === 'ap0') {
        // Add AP-specific information
        try {
          const ssid = await this.getAPSSID();
          const clients = await this.getAPClients();
          baseState.ssid = ssid;
          baseState.ip = ipAddress;
          baseState.clients = clients;
          logger.debug(`ap0 enhanced with ssid: ${ssid}, clients: ${clients.length}, ip: ${baseState.ip}`);
        } catch (error) {
          logger.debug(`Failed to get AP info for ap0: ${error.message}`);
          baseState.ssid = null;
          baseState.ip = ipAddress;
          baseState.clients = [];
        }
      }

      return baseState;

    } catch (error) {
      return {
        active: false,
        error: error.message,
        lastUpdate: new Date()
      };
    }
  }
  
  /**
   * Scan for available WiFi networks
   */
  async scanWiFiNetworks(forceRefresh = false) {
    const now = Date.now();
    
    // Use cache if recent and not forcing refresh
    if (!forceRefresh && 
        this.wifiScanCache.lastScan && 
        (now - this.wifiScanCache.lastScan) < this.wifiScanCache.cacheTimeout) {
      logger.debug('Using cached WiFi scan results');
      return this.wifiScanCache.networks;
    }
    
    try {
      logger.info('Scanning for WiFi networks...');
      
      // Try iw first (preferred)
      try {
        // Trigger scan
        await execAsync('iw dev wlan0 scan trigger').catch(() => {
          // May fail if scan already in progress, that's ok
        });
        
        // Wait for scan to complete
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Get scan results
        const { stdout } = await execAsync('iw dev wlan0 scan');
        
        // Parse scan results
        const networks = this.parseWiFiScan(stdout);
        
        // Update cache
        this.wifiScanCache.networks = networks;
        this.wifiScanCache.lastScan = now;
        
        logger.info(`Found ${networks.length} WiFi networks`);
        return networks;
        
      } catch (iwError) {
        logger.debug('iw scan failed, trying wpa_cli fallback:', iwError.message);
        
        // Fallback to wpa_cli scan
        await execAsync('wpa_cli -i wlan0 scan').catch(() => {
          // May fail if interface not available
        });
        
        // Wait for scan
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Get results via wpa_cli
        const { stdout } = await execAsync('wpa_cli -i wlan0 scan_results');
        const networks = this.parseWpaCliScan(stdout);
        
        // Update cache
        this.wifiScanCache.networks = networks;
        this.wifiScanCache.lastScan = now;
        
        logger.info(`Found ${networks.length} WiFi networks (via wpa_cli)`);
        return networks;
      }
      
    } catch (error) {
      logger.error('WiFi scan failed:', error);
      
      // Return cached results if available
      if (this.wifiScanCache.networks.length > 0) {
        logger.debug('Returning cached WiFi networks due to scan failure');
        return this.wifiScanCache.networks;
      }
      
      throw error;
    }
  }
  
  /**
   * Parse wpa_cli scan_results output into network list
   */
  parseWpaCliScan(scanOutput) {
    const networks = [];
    const lines = scanOutput.split('\n');
    
    for (const line of lines) {
      if (!line.trim() || line.includes('bssid')) continue;
      
      try {
        // wpa_cli format: bssid / frequency / signal level / flags / ssid
        const parts = line.trim().split('\t');
        if (parts.length >= 5) {
          const [bssid, frequency, signal, flags, ssid] = parts;
          
          if (ssid && ssid.length > 0) {
            const network = {
              ssid: ssid,
              bssid: bssid,
              frequency: parseInt(frequency),
              signal: parseInt(signal),
              band: frequency.startsWith('24') ? '2.4GHz' : '5GHz'
            };
            
            // Parse security
            network.security = [];
            if (flags.includes('WPA2')) network.security.push('WPA2');
            if (flags.includes('WPA3')) network.security.push('WPA3');
            if (flags.includes('WPA')) network.security.push('WPA');
            if (flags.includes('WEP')) network.security.push('WEP');
            if (network.security.length === 0) network.security.push('Open');
            
            networks.push(network);
          }
        }
      } catch (error) {
        logger.debug('Failed to parse wpa_cli scan line:', error.message);
      }
    }
    
    // Sort by signal strength (strongest first)
    return networks.sort((a, b) => (b.signal || -100) - (a.signal || -100));
  }
  
  /**
   * Parse iw scan output into network list
   */
  parseWiFiScan(scanOutput) {
    const networks = [];
    const blocks = scanOutput.split('BSS ');
    
    for (const block of blocks) {
      if (!block.trim()) continue;
      
      try {
        const network = {};
        
        // Extract SSID
        const ssidMatch = block.match(/SSID: (.+)/);
        if (ssidMatch && ssidMatch[1].trim()) {
          network.ssid = ssidMatch[1].trim();
        } else {
          continue; // Skip networks without SSID
        }
        
        // Extract signal strength
        const signalMatch = block.match(/signal: ([-\d.]+)/);
        if (signalMatch) {
          network.signal = parseInt(signalMatch[1]);
        }
        
        // Extract frequency
        const freqMatch = block.match(/freq: (\d+)/);
        if (freqMatch) {
          network.frequency = parseInt(freqMatch[1]);
          network.band = freqMatch[1].startsWith('24') ? '2.4GHz' : '5GHz';
        }
        
        // Extract security info
        network.security = [];
        if (block.includes('Privacy')) {
          network.security.push('WEP');
        }
        if (block.includes('WPA2')) {
          network.security.push('WPA2');
        }
        if (block.includes('WPA3')) {
          network.security.push('WPA3');
        }
        if (network.security.length === 0) {
          network.security.push('Open');
        }
        
        networks.push(network);
        
      } catch (error) {
        logger.debug('Failed to parse network block:', error.message);
        // Skip this network and continue
      }
    }
    
    // Sort by signal strength (strongest first)
    return networks.sort((a, b) => (b.signal || -100) - (a.signal || -100));
  }
  
  /**
   * Connect to WiFi network
   */
  async connectToWiFi(ssid, password, priority = 1) {
    try {
      logger.info(`Connecting to WiFi network: ${ssid}`);
      
      // Use wpa_cli to add network
      const addCmd = `wpa_cli -i wlan0 add_network`;
      const { stdout: networkId } = await execAsync(addCmd);
      const netId = networkId.trim();
      
      // Configure network
      await execAsync(`wpa_cli -i wlan0 set_network ${netId} ssid '"${ssid}"'`);
      await execAsync(`wpa_cli -i wlan0 set_network ${netId} psk '"${password}"'`);
      await execAsync(`wpa_cli -i wlan0 set_network ${netId} priority ${priority}`);
      
      // Enable network and select it for connection
      await execAsync(`wpa_cli -i wlan0 enable_network ${netId}`);

      // Force connection to the new network
      await execAsync(`wpa_cli -i wlan0 select_network ${netId}`);

      // Save configuration
      await execAsync(`wpa_cli -i wlan0 save_config`);

      // Trigger reassociation to force connection
      await execAsync(`wpa_cli -i wlan0 reassociate`);
      
      logger.info(`WiFi connection initiated for ${ssid}`);
      this.emit('wifiConnectionStarted', { ssid });
      
      return { success: true, networkId: netId };
      
    } catch (error) {
      logger.error(`Failed to connect to WiFi ${ssid}:`, error);
      this.emit('wifiConnectionFailed', { ssid, error: error.message });
      throw error;
    }
  }
  
  /**
   * Disconnect from current WiFi
   */
  async disconnectWiFi() {
    try {
      logger.info('Disconnecting from WiFi...');
      
      await execAsync('wpa_cli -i wlan0 disconnect');
      
      logger.info('WiFi disconnected');
      this.emit('wifiDisconnected');
      
      return { success: true };
      
    } catch (error) {
      logger.error('Failed to disconnect WiFi:', error);
      throw error;
    }
  }
  
  /**
   * Get current WiFi connection status
   */
  async getWiFiStatus() {
    try {
      // Try iw command first (more reliable on modern systems)
      const { stdout } = await execAsync('/sbin/iw dev wlan0 link');

      if (stdout.includes('Not connected')) {
        return {
          connected: false,
          ssid: null,
          state: 'DISCONNECTED'
        };
      }

      // Parse iw output for connection info
      const ssidMatch = stdout.match(/SSID: (.+)/);
      const freqMatch = stdout.match(/freq: (\d+)/);
      const signalMatch = stdout.match(/signal: ([-\d.]+) dBm/);

      return {
        connected: ssidMatch ? true : false,
        ssid: ssidMatch ? ssidMatch[1].trim() : null,
        frequency: freqMatch ? parseInt(freqMatch[1]) : null,
        signal: signalMatch ? parseFloat(signalMatch[1]) : null,
        state: ssidMatch ? 'CONNECTED' : 'UNKNOWN'
      };

    } catch (error) {
      // Fallback to wpa_cli if available
      try {
        const { stdout } = await execAsync('wpa_cli -i wlan0 status');

        const status = {};
        stdout.trim().split('\n').forEach(line => {
          const [key, value] = line.split('=');
          if (key && value) {
            status[key] = value;
          }
        });

        return {
          connected: status.wpa_state === 'COMPLETED',
          ssid: status.ssid || null,
          bssid: status.bssid || null,
          ipAddress: status.ip_address || null,
          state: status.wpa_state || 'UNKNOWN'
        };

      } catch (fallbackError) {
        // Final fallback to iwconfig
        try {
          const { stdout } = await execAsync('/sbin/iwconfig wlan0');
          const ssidMatch = stdout.match(/ESSID:"([^"]+)"/);
          const isConnected = !stdout.includes('ESSID:off');

          return {
            connected: isConnected && ssidMatch ? true : false,
            ssid: ssidMatch ? ssidMatch[1] : null,
            state: isConnected ? 'CONNECTED' : 'DISCONNECTED'
          };
        } catch (iwconfigError) {
          logger.error('Failed to get WiFi status via iw, wpa_cli, and iwconfig:', error.message, fallbackError.message, iwconfigError.message);
          return {
            connected: false,
            ssid: null,
            error: error.message
          };
        }
      }
    }
  }
  
  /**
   * Get Access Point SSID from config
   */
  async getAPSSID() {
    try {
      const { stdout } = await execAsync('grep -E "^ssid=" /etc/hostapd/hostapd.conf');
      const match = stdout.match(/ssid=(.+)/);
      return match ? match[1].trim() : 'PiCameraControl';
    } catch (error) {
      return 'PiCameraControl'; // Default fallback
    }
  }

  /**
   * Get connected AP clients
   */
  async getAPClients() {
    try {
      // Try to get clients from hostapd_cli
      const { stdout } = await execAsync('hostapd_cli list_sta 2>/dev/null');
      const clients = stdout.trim().split('\n').filter(line => line.length > 0);
      return clients.map(mac => ({ mac, connected: true }));
    } catch (error) {
      // Fallback: check ARP table for devices in AP subnet
      try {
        const { stdout } = await execAsync('arp -a | grep 192.168.4');
        const clients = stdout.trim().split('\n')
          .filter(line => line.includes('192.168.4'))
          .map(line => {
            const ipMatch = line.match(/\((\d+\.\d+\.\d+\.\d+)\)/);
            const macMatch = line.match(/([a-fA-F0-9:]{17})/);
            return {
              ip: ipMatch ? ipMatch[1] : null,
              mac: macMatch ? macMatch[1] : null,
              connected: true
            };
          })
          .filter(client => client.ip && client.mac);
        return clients;
      } catch (arpError) {
        return [];
      }
    }
  }

  /**
   * Get saved WiFi networks from wpa_supplicant config
   */
  async getSavedNetworks() {
    try {
      const { stdout } = await execAsync('wpa_cli -i wlan0 list_networks');
      const networks = [];
      const lines = stdout.trim().split('\n');

      for (let i = 1; i < lines.length; i++) { // Skip header line
        const line = lines[i];
        if (!line.trim()) continue;

        const parts = line.split('\t');
        if (parts.length >= 4) {
          const [id, ssid, bssid, flags] = parts;
          networks.push({
            id: parseInt(id),
            ssid: ssid.trim(),
            bssid: bssid === 'any' ? null : bssid,
            flags: flags.trim(),
            enabled: !flags.includes('DISABLED'),
            current: flags.includes('CURRENT')
          });
        }
      }

      return networks;
    } catch (error) {
      logger.warn('Failed to get saved networks:', error.message);
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
      logger.error(`Failed to remove saved network ${networkId}:`, error);
      throw error;
    }
  }

  /**
   * Set WiFi regulatory country
   */
  async setWiFiCountry(countryCode) {
    try {
      // Set country in wpa_supplicant
      await execAsync(`wpa_cli -i wlan0 set country ${countryCode}`);
      await execAsync('wpa_cli -i wlan0 save_config');

      // Also set in /etc/wpa_supplicant/wpa_supplicant.conf if file exists
      try {
        const configPath = '/etc/wpa_supplicant/wpa_supplicant.conf';
        const { stdout } = await execAsync(`cat ${configPath}`);

        let newConfig;
        if (stdout.includes('country=')) {
          // Replace existing country
          newConfig = stdout.replace(/country=\w+/g, `country=${countryCode}`);
        } else {
          // Add country line after ctrl_interface
          newConfig = stdout.replace(
            /(ctrl_interface=.*\n)/,
            `$1country=${countryCode}\n`
          );
        }

        await execAsync(`echo '${newConfig}' > ${configPath}`);
      } catch (configError) {
        logger.warn('Could not update wpa_supplicant.conf:', configError.message);
      }

      logger.info(`WiFi country set to ${countryCode}`);
      return { success: true, country: countryCode };

    } catch (error) {
      logger.error(`Failed to set WiFi country to ${countryCode}:`, error);
      throw error;
    }
  }

  /**
   * Get current WiFi country
   */
  async getWiFiCountry() {
    try {
      // Try to get from wpa_cli first
      try {
        const { stdout } = await execAsync('wpa_cli -i wlan0 get country');
        const country = stdout.trim();
        if (country && country !== 'FAIL' && country.length === 2) {
          return { country: country.toUpperCase() };
        }
      } catch (cliError) {
        logger.debug('wpa_cli get country failed:', cliError.message);
      }

      // Fallback: check wpa_supplicant.conf
      try {
        const { stdout } = await execAsync('grep -E "^country=" /etc/wpa_supplicant/wpa_supplicant.conf');
        const match = stdout.match(/country=(\w+)/);
        if (match) {
          return { country: match[1].toUpperCase() };
        }
      } catch (grepError) {
        logger.debug('Could not read country from wpa_supplicant.conf:', grepError.message);
      }

      // Default fallback
      return { country: 'US' };

    } catch (error) {
      logger.warn('Failed to get WiFi country:', error.message);
      return { country: 'US' };
    }
  }

  /**
   * Get available country codes
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
      { code: 'ES', name: 'Spain' },
      { code: 'FI', name: 'Finland' },
      { code: 'FR', name: 'France' },
      { code: 'GB', name: 'United Kingdom' },
      { code: 'GR', name: 'Greece' },
      { code: 'HU', name: 'Hungary' },
      { code: 'IE', name: 'Ireland' },
      { code: 'IT', name: 'Italy' },
      { code: 'JP', name: 'Japan' },
      { code: 'KR', name: 'South Korea' },
      { code: 'NL', name: 'Netherlands' },
      { code: 'NO', name: 'Norway' },
      { code: 'NZ', name: 'New Zealand' },
      { code: 'PL', name: 'Poland' },
      { code: 'PT', name: 'Portugal' },
      { code: 'RU', name: 'Russia' },
      { code: 'SE', name: 'Sweden' },
      { code: 'US', name: 'United States' }
    ];
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    logger.info('NetworkServiceManager cleanup complete');
  }
}