import { exec } from 'child_process';
// import { spawn } from 'child_process'; // Unused import
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
    const optionalCommands = ['iw', 'nmcli'];
    
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
          logger.info(`getWiFiStatus() returned:`, wifiStatus);
          if (wifiStatus && wifiStatus.connected) {
            baseState.network = wifiStatus.ssid;
            baseState.connected = wifiStatus.connected;
            baseState.signal = wifiStatus.signal;
            baseState.connectionName = wifiStatus.connectionName;
            logger.info(`Updated wlan0 state with SSID: ${wifiStatus.ssid}`);
          } else {
            baseState.network = null;
            baseState.connected = false;
            logger.debug('wlan0 not connected to any WiFi network');
          }
          baseState.ip = ipAddress;
        } catch (error) {
          logger.error(`Failed to get WiFi status for wlan0: ${error.message}`, error);
          // Don't fail the entire state update if WiFi status fails
          baseState.network = null;
          baseState.connected = false;
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
          baseState.status = baseState.active ? 'Active' : 'Inactive';
          logger.debug(`ap0 enhanced with ssid: ${ssid}, clients: ${clients.length}, ip: ${baseState.ip}, status: ${baseState.status}`);
        } catch (error) {
          logger.debug(`Failed to get AP info for ap0: ${error.message}`);
          baseState.ssid = null;
          baseState.ip = ipAddress;
          baseState.clients = [];
          baseState.status = 'Error';
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
   * Scan for available WiFi networks using NetworkManager
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
      logger.info('Scanning for WiFi networks using NetworkManager...');

      // Force a fresh scan
      if (forceRefresh) {
        try {
          await execAsync('nmcli dev wifi rescan');
          // Wait for scan to complete
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error) {
          logger.debug('nmcli rescan failed, proceeding with existing scan data:', error.message);
        }
      }

      // Get scan results
      const { stdout } = await execAsync('nmcli -t -f IN-USE,SSID,MODE,CHAN,RATE,SIGNAL,BARS,SECURITY dev wifi list');

      // Parse NetworkManager scan results
      const networks = this.parseNMWiFiScan(stdout);

      // Update cache
      this.wifiScanCache.networks = networks;
      this.wifiScanCache.lastScan = now;

      logger.info(`Found ${networks.length} WiFi networks via NetworkManager`);
      return networks;

    } catch (error) {
      logger.error('NetworkManager WiFi scan failed:', error);

      // Return cached results if available
      if (this.wifiScanCache.networks.length > 0) {
        logger.debug('Returning cached WiFi networks due to scan failure');
        return this.wifiScanCache.networks;
      }

      throw error;
    }
  }
  
  /**
   * Parse NetworkManager WiFi scan output into network list
   */
  parseNMWiFiScan(output) {
    const networks = [];
    const lines = output.split('\n');

    for (const line of lines) {
      if (!line.trim()) continue;

      // Format: IN-USE:SSID:MODE:CHAN:RATE:SIGNAL:BARS:SECURITY
      const parts = line.split(':');
      if (parts.length >= 7) {
        const inUse = parts[0] === '*';
        const ssid = parts[1];
        const mode = parts[2];
        const channel = parseInt(parts[3]) || 0;
        const rate = parts[4];
        const signal = parseInt(parts[5]) || 0;
        const bars = parts[6];
        const security = parts[7] || '';

        // Skip empty SSIDs (hidden networks)
        if (!ssid || ssid.trim() === '') continue;

        networks.push({
          ssid: ssid,
          signal: signal,
          channel: channel,
          security: security,
          bars: bars,
          rate: rate,
          mode: mode,
          inUse: inUse,
          method: 'NetworkManager'
        });
      }
    }

    // Sort by signal strength (descending)
    return networks.sort((a, b) => b.signal - a.signal);
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
   * Get saved WiFi connections from NetworkManager
   */
  async getSavedWiFiConnections() {
    try {
      const { stdout: connections } = await execAsync('nmcli -t -f NAME,TYPE con show');
      const wifiConnections = connections.split('\n')
        .filter(line => line.includes('802-11-wireless'))
        .map(line => line.split(':')[0]);

      return wifiConnections;
    } catch (error) {
      logger.error('Failed to get saved WiFi connections:', error);
      return [];
    }
  }

  /**
   * Connect to WiFi network
   */
  async connectToWiFi(ssid, password, _priority = 1) {
    try {
      logger.info(`Connecting to WiFi network: ${ssid} using NetworkManager`);

      // Check if NetworkManager is available
      try {
        await execAsync('which nmcli');
      } catch (error) {
        throw new Error('NetworkManager (nmcli) not available on this system');
      }

      // Remove any existing connections with the same SSID to avoid conflicts
      try {
        const { stdout: connections } = await execAsync('nmcli -t -f NAME,TYPE con show');
        const lines = connections.split('\n');
        for (const line of lines) {
          if (line.includes('wifi') || line.includes('wireless')) {
            const connectionName = line.split(':')[0];
            if (connectionName === ssid) {
              logger.info(`Removing existing NetworkManager connection: ${connectionName}`);
              await execAsync(`nmcli con delete "${connectionName}"`);
            }
          }
        }
      } catch (error) {
        logger.debug('Could not check/remove existing connections:', error.message);
      }

      // Create new WiFi connection
      let connectCmd;
      if (password && password.length > 0) {
        // Secured network
        connectCmd = `nmcli dev wifi connect "${ssid}" password "${password}"`;
      } else {
        // Open network
        connectCmd = `nmcli dev wifi connect "${ssid}"`;
      }

      logger.debug(`Executing: ${connectCmd.replace(/password "[^"]*"/, 'password "***"')}`);
      await execAsync(connectCmd);

      logger.info(`WiFi connection initiated for ${ssid} via NetworkManager`);
      this.emit('wifiConnectionStarted', { ssid });

      // Wait a moment and verify connection
      setTimeout(async () => {
        try {
          const status = await this.verifyWiFiConnectionNM(ssid);
          if (status.connected) {
            logger.info(`WiFi connection to ${ssid} verified successfully`);
            this.emit('wifiConnectionVerified', { ssid, status });
          } else {
            logger.warn(`WiFi connection to ${ssid} could not be verified`);
            this.emit('wifiConnectionUnverified', { ssid, status });
          }
        } catch (error) {
          logger.debug('WiFi connection verification failed:', error.message);
        }
      }, 5000); // Check after 5 seconds

      return { success: true, method: 'NetworkManager' };

    } catch (error) {
      logger.error(`Failed to connect to WiFi ${ssid}:`, error);
      this.emit('wifiConnectionFailed', { ssid, error: error.message });
      throw error;
    }
  }
  
  /**
   * NetworkManager-based WiFi connection verification
   */
  async verifyWiFiConnectionNM(expectedSSID) {
    try {
      // Get current active connection
      const { stdout } = await execAsync('nmcli -t -f NAME,TYPE,DEVICE con show --active');
      const lines = stdout.split('\n');

      for (const line of lines) {
        if (line.includes('wifi') || line.includes('wireless')) {
          const parts = line.split(':');
          const connectionName = parts[0];
          const device = parts[2];

          if (device === 'wlan0' && connectionName === expectedSSID) {
            // Get signal strength
            try {
              const { stdout: signalInfo } = await execAsync(`nmcli -t -f IN-USE,SIGNAL,SSID dev wifi list`);
              const wifiLines = signalInfo.split('\n');
              let signal = null;

              for (const wifiLine of wifiLines) {
                if (wifiLine.startsWith('*')) {
                  const wifiParts = wifiLine.split(':');
                  if (wifiParts[2] === expectedSSID) {
                    signal = parseInt(wifiParts[1]) || null;
                    break;
                  }
                }
              }

              return {
                connected: true,
                currentSSID: connectionName,
                expectedSSID,
                signal,
                method: 'NetworkManager'
              };
            } catch (error) {
              return {
                connected: true,
                currentSSID: connectionName,
                expectedSSID,
                method: 'NetworkManager'
              };
            }
          }
        }
      }

      return {
        connected: false,
        currentSSID: null,
        expectedSSID,
        method: 'NetworkManager'
      };

    } catch (error) {
      return {
        connected: false,
        currentSSID: null,
        expectedSSID,
        error: error.message,
        method: 'NetworkManager'
      };
    }
  }

  /**
   * Get all saved WiFi networks and their priorities (NetworkManager version)
   */
  async getSavedNetworks() {
    try {
      const { stdout } = await execAsync('nmcli -t -f NAME,TYPE con show');
      const lines = stdout.split('\n');
      const networks = [];

      for (const line of lines) {
        if (line.trim() && (line.includes('wifi') || line.includes('wireless'))) {
          const parts = line.split(':');
          if (parts.length >= 2) {
            const connectionName = parts[0];

            // Get the actual SSID this connection targets
            try {
              const { stdout: ssidOutput } = await execAsync(`nmcli con show "${connectionName}" | grep "802-11-wireless.ssid"`);
              const ssidMatch = ssidOutput.match(/802-11-wireless\.ssid:\s*(.+)/);
              const targetSSID = ssidMatch ? ssidMatch[1].trim() : connectionName;

              networks.push({
                name: targetSSID, // Use target SSID for matching, not connection name
                type: parts[1],
                method: 'NetworkManager'
              });
            } catch (ssidError) {
              // Fallback to connection name if we can't get SSID
              logger.debug(`Failed to get SSID for connection ${connectionName}:`, ssidError.message);
              networks.push({
                name: connectionName,
                type: parts[1],
                method: 'NetworkManager'
              });
            }
          }
        }
      }

      return networks;
    } catch (error) {
      logger.error('Failed to get saved networks:', error);
      return [];
    }
  }


  /**
   * Verify WiFi connection to specific SSID
   */
  async verifyWiFiConnection(expectedSSID) {
    try {
      // Check using iw command for most reliable status
      try {
        const { stdout } = await execAsync('iw dev wlan0 link');
        const match = stdout.match(/SSID:\s*(.+)/);
        if (match) {
          const currentSSID = match[1].trim();
          const connected = currentSSID === expectedSSID;

          // Get additional connection details
          const signalMatch = stdout.match(/signal:\s*(-?\d+)\s*dBm/);
          const freqMatch = stdout.match(/freq:\s*(\d+)/);

          return {
            connected,
            currentSSID,
            expectedSSID,
            signal: signalMatch ? parseInt(signalMatch[1]) : null,
            frequency: freqMatch ? parseInt(freqMatch[1]) : null,
            method: 'iw'
          };
        }
      } catch (error) {
        logger.debug('iw link check failed:', error.message);
      }

      // Fallback to NetworkManager
      try {
        return await this.verifyWiFiConnectionNM(expectedSSID);
      } catch (error) {
        logger.debug('NetworkManager status check failed:', error.message);
      }

      return {
        connected: false,
        currentSSID: null,
        expectedSSID,
        error: 'Unable to verify connection',
        method: 'none'
      };

    } catch (error) {
      return {
        connected: false,
        currentSSID: null,
        expectedSSID,
        error: error.message,
        method: 'error'
      };
    }
  }

  /**
   * Disconnect from current WiFi
   */
  async disconnectWiFi() {
    try {
      logger.info('Disconnecting from WiFi...');

      // Use NetworkManager to disconnect from current WiFi network
      await execAsync('nmcli device disconnect wlan0');

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
      // Use NetworkManager to get WiFi status
      const { stdout } = await execAsync('nmcli -t -f NAME,TYPE,DEVICE con show --active');
      const lines = stdout.split('\n');

      // Find active WiFi connection
      for (const line of lines) {
        if (line.includes('wifi') || line.includes('wireless')) {
          const parts = line.split(':');
          const connectionName = parts[0];
          const device = parts[2];

          if (device === 'wlan0') {
            // Get the actual SSID from the active WiFi connection
            try {
              const { stdout: detailsOutput } = await execAsync(`nmcli -t -f IN-USE,SIGNAL,SSID dev wifi list`);
              const wifiLines = detailsOutput.split('\n');
              let signal = null;
              let actualSSID = null;

              // Find the currently connected network (marked with *)
              for (const wifiLine of wifiLines) {
                if (wifiLine.startsWith('*')) {
                  const wifiParts = wifiLine.split(':');
                  actualSSID = wifiParts[2]; // The actual SSID
                  signal = parseInt(wifiParts[1]) || null;
                  break;
                }
              }

              // Use the actual SSID if found, otherwise fall back to connection name
              const displaySSID = actualSSID || connectionName;

              return {
                connected: true,
                ssid: displaySSID,
                signal: signal,
                state: 'CONNECTED',
                method: 'NetworkManager',
                connectionName: connectionName
              };
            } catch (detailError) {
              // If we can't get details, at least show the connection name
              return {
                connected: true,
                ssid: connectionName,
                state: 'CONNECTED',
                method: 'NetworkManager'
              };
            }
          }
        }
      }

      // No active WiFi connection found
      return {
        connected: false,
        ssid: null,
        state: 'DISCONNECTED',
        method: 'NetworkManager'
      };

    } catch (error) {
      logger.debug('NetworkManager status check failed, trying fallback methods:', error.message);

      // Fallback to ip command for basic connectivity check
      try {
        const { stdout } = await execAsync('ip addr show wlan0');
        const hasIP = stdout.includes('inet ') && !stdout.includes('inet 127.');

        return {
          connected: hasIP,
          ssid: null,
          state: hasIP ? 'CONNECTED' : 'DISCONNECTED',
          method: 'fallback'
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
          logger.error('Failed to get WiFi status via iw, NetworkManager, and iwconfig:', error.message, fallbackError.message, iwconfigError.message);
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
   * Set WiFi regulatory country
   */
  async setWiFiCountry(countryCode) {
    try {
      // Validate country code format (2-letter ISO codes)
      if (!countryCode || !/^[A-Z]{2}$/.test(countryCode)) {
        throw new Error(`Invalid country code format: ${countryCode}. Must be 2-letter ISO code (e.g., US, JP)`);
      }

      logger.info(`Setting WiFi country to ${countryCode} for ALL wireless interfaces...`);

      // First, let's check the current regulatory domain before making changes
      let initialCountry;
      try {
        const { stdout: regBefore } = await execAsync(`/usr/sbin/iw reg get | head -5`);
        logger.info(`Current regulatory domain before change:\n${regBefore}`);
        initialCountry = await this.getWiFiCountry();
        logger.info(`Current country before change: ${JSON.stringify(initialCountry)}`);
      } catch (error) {
        logger.warn('Failed to get initial regulatory domain:', error.message);
      }

      // Check which wireless interfaces exist
      const wirelessInterfaces = [];
      try {
        const { stdout } = await execAsync(`/usr/sbin/iw dev | grep Interface | awk '{print $2}'`);
        const interfaces = stdout.trim().split('\n').filter(iface => iface.trim());
        wirelessInterfaces.push(...interfaces);
        logger.info(`Found wireless interfaces: ${JSON.stringify(wirelessInterfaces)}`);
      } catch (error) {
        logger.warn('Failed to detect wireless interfaces:', error.message);
        // Assume standard interfaces if detection fails
        wirelessInterfaces.push('wlan0', 'ap0');
      }

      // Method 1: Set global regulatory domain via iw reg set
      logger.info(`Setting global regulatory domain to ${countryCode} via iw...`);
      try {
        const { stdout, stderr } = await execAsync(`/usr/sbin/iw reg set ${countryCode} 2>&1`);
        if (stdout) logger.info(`iw reg set output: ${stdout}`);
        if (stderr) logger.warn(`iw reg set stderr: ${stderr}`);

        // Give it time to apply
        await new Promise(resolve => setTimeout(resolve, 2000));

        const { stdout: regAfter } = await execAsync(`/usr/sbin/iw reg get | head -5`);
        logger.info(`Regulatory domain after global change:\n${regAfter}`);
      } catch (iwError) {
        logger.error('Failed to set global regulatory domain with iw:', iwError.message);
      }

      // Method 2: Set country for each interface individually
      for (const iface of wirelessInterfaces) {
        try {
          logger.info(`Setting country ${countryCode} for interface ${iface}...`);

          // Check if interface exists and is up
          try {
            const { stdout } = await execAsync(`ip link show ${iface}`);
            if (!stdout.includes('UP')) {
              logger.info(`Interface ${iface} is down, bringing it up...`);
              await execAsync(`ip link set ${iface} up`);
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          } catch (linkError) {
            logger.warn(`Interface ${iface} does not exist or cannot be brought up: ${linkError.message}`);
            continue;
          }

          // Set regulatory domain for this specific interface
          try {
            await execAsync(`/usr/sbin/iw dev ${iface} set reg ${countryCode}`);
            logger.info(`Set regulatory domain for ${iface} to ${countryCode}`);
          } catch (regError) {
            logger.warn(`Failed to set regulatory domain for ${iface}: ${regError.message}`);
          }

          // Force interface regulatory update
          try {
            await execAsync(`/usr/sbin/iw dev ${iface} scan trigger`);
            logger.debug(`Triggered scan on ${iface} to refresh regulatory`);
          } catch (scanError) {
            logger.debug(`Could not trigger scan on ${iface}: ${scanError.message}`);
          }

        } catch (ifaceError) {
          logger.error(`Failed to process interface ${iface}: ${ifaceError.message}`);
        }
      }

      // Method 3: Try raspi-config for persistent configuration
      try {
        logger.info(`Setting persistent WiFi country via raspi-config...`);
        const { stdout, stderr } = await execAsync(`raspi-config nonint do_wifi_country ${countryCode} 2>&1`);
        if (stdout) logger.info(`raspi-config output: ${stdout}`);
        if (stderr) logger.warn(`raspi-config stderr: ${stderr}`);
        logger.info(`Set persistent WiFi country to ${countryCode} via raspi-config`);
      } catch (raspiError) {
        logger.error('Failed to set country via raspi-config:', raspiError);
      }

      // Method 4: Update hostapd configuration for access point
      try {
        const hostapdPath = '/etc/hostapd/hostapd.conf';
        logger.info(`Updating hostapd configuration with country ${countryCode}...`);

        const { stdout: hostapdConfig } = await execAsync(`cat ${hostapdPath}`);
        let newHostapdConfig;

        if (hostapdConfig.includes('country_code=')) {
          newHostapdConfig = hostapdConfig.replace(/country_code=\w+/g, `country_code=${countryCode}`);
          logger.info('Replacing existing country_code in hostapd.conf');
        } else {
          // Add country_code after interface line
          newHostapdConfig = hostapdConfig.replace(
            /(interface=.*\n)/,
            `$1country_code=${countryCode}\n`
          );
          logger.info('Adding country_code to hostapd.conf');
        }

        await execAsync(`echo '${newHostapdConfig}' | sudo tee ${hostapdPath} > /dev/null`);
        logger.info(`Updated hostapd.conf with country_code=${countryCode}`);

        // Restart hostapd if it's running
        try {
          const hostapdActive = await this.isServiceActive('hostapd');
          if (hostapdActive) {
            logger.info('Restarting hostapd to apply country changes...');
            await execAsync('systemctl restart hostapd');
            await new Promise(resolve => setTimeout(resolve, 3000));
            logger.info('hostapd restarted');
          }
        } catch (hostapdError) {
          logger.warn('Failed to restart hostapd:', hostapdError.message);
        }

      } catch (hostapdError) {
        logger.warn('Failed to update hostapd configuration:', hostapdError.message);
      }

      // Method 5: Update wpa_supplicant.conf if it exists
      try {
        const configPath = '/etc/wpa_supplicant/wpa_supplicant.conf';
        logger.info(`Checking if ${configPath} exists...`);

        try {
          await execAsync(`test -f ${configPath}`);
          logger.info(`${configPath} exists, updating it...`);

          const { stdout } = await execAsync(`cat ${configPath}`);
          let newConfig;

          if (stdout.includes('country=')) {
            newConfig = stdout.replace(/country=\w+/g, `country=${countryCode}`);
            logger.info('Replacing existing country setting in wpa_supplicant.conf');
          } else {
            newConfig = stdout.replace(
              /(ctrl_interface=.*\n)/,
              `$1country=${countryCode}\n`
            );
            logger.info('Adding country setting to wpa_supplicant.conf');
          }

          await execAsync(`echo '${newConfig}' | sudo tee ${configPath} > /dev/null`);
          logger.info(`Updated wpa_supplicant.conf with country ${countryCode}`);
        } catch (fileError) {
          logger.info(`${configPath} does not exist or cannot be read: ${fileError.message}`);
        }
      } catch (configError) {
        logger.error('Failed to update wpa_supplicant.conf:', configError.message);
      }

      // Restart network services to ensure all changes take effect
      try {
        logger.info('Restarting network services to apply country changes...');

        // Turn WiFi off and on via nmcli to refresh all interfaces
        await execAsync('nmcli radio wifi off');
        await new Promise(resolve => setTimeout(resolve, 2000));
        await execAsync('nmcli radio wifi on');
        await new Promise(resolve => setTimeout(resolve, 3000));

        logger.info('Network services restarted');
      } catch (error) {
        logger.warn('Failed to restart network services:', error.message);
      }

      // Verify the change was applied to both interfaces
      try {
        await new Promise(resolve => setTimeout(resolve, 3000)); // Give time for changes to apply

        const verification = await this.getWiFiCountry();
        logger.info(`Country verification result: ${JSON.stringify(verification)}`);

        // Check each interface individually
        for (const iface of wirelessInterfaces) {
          try {
            const { stdout } = await execAsync(`/usr/sbin/iw dev ${iface} info | grep country || echo "No country info"`);
            logger.info(`Interface ${iface} country info: ${stdout.trim()}`);
          } catch (ifaceCheckError) {
            logger.debug(`Could not check country for ${iface}: ${ifaceCheckError.message}`);
          }
        }

        if (verification.country === countryCode) {
          logger.info(`WiFi country successfully changed to ${countryCode} for all interfaces`);
          return { success: true, country: countryCode, message: `WiFi country changed to ${countryCode} for all interfaces` };
        } else {
          logger.warn(`Country change verification failed. Expected: ${countryCode}, Got: ${verification.country}`);
          return { success: true, country: countryCode, message: `Country set to ${countryCode} for all interfaces (verification pending)` };
        }
      } catch (verifyError) {
        logger.warn('Failed to verify country change:', verifyError.message);
        return { success: true, country: countryCode, message: `Country set to ${countryCode} for all interfaces (verification failed)` };
      }

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
      // Try to get from iw regulatory domain first
      try {
        const { stdout } = await execAsync('/usr/sbin/iw reg get');
        const match = stdout.match(/country\s+(\w+):/);
        if (match) {
          return { country: match[1].toUpperCase() };
        }
      } catch (iwError) {
        logger.debug('iw reg get failed:', iwError.message);
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
   * Enable WiFi (wlan0) while keeping Access Point (ap0) active
   * Uses NetworkManager approach for selective interface management
   */
  async enableWiFi() {
    try {
      logger.info('Enabling WiFi interface (wlan0)...');

      // Ensure wlan0 is managed by NetworkManager
      await execAsync('nmcli device set wlan0 managed yes');

      // Bring up the wlan0 interface
      await execAsync('ip link set wlan0 up');

      // Start NetworkManager WiFi services if not already running
      const nmStatus = await this.getServiceState('NetworkManager');
      if (!nmStatus.active) {
        await this.startService('NetworkManager');
      }

      logger.info('WiFi interface enabled successfully');
      this.emit('wifiEnabled');
      return { success: true, message: 'WiFi enabled successfully' };

    } catch (error) {
      logger.error('Failed to enable WiFi:', error);
      this.emit('wifiEnableFailed', { error: error.message });
      throw error;
    }
  }

  /**
   * Disable WiFi (wlan0) while keeping Access Point (ap0) active
   * Uses NetworkManager approach for selective interface management
   */
  async disableWiFi() {
    try {
      logger.info('Disabling WiFi interface (wlan0)...');

      // First disconnect any active WiFi connections
      try {
        await this.disconnectWiFi();
      } catch (error) {
        logger.debug('No WiFi connection to disconnect:', error.message);
      }

      // Remove wlan0 from NetworkManager management
      await execAsync('nmcli device set wlan0 managed no');

      // Bring down the wlan0 interface
      await execAsync('ip link set wlan0 down');

      logger.info('WiFi interface disabled successfully');
      this.emit('wifiDisabled');
      return { success: true, message: 'WiFi disabled successfully' };

    } catch (error) {
      logger.error('Failed to disable WiFi:', error);
      this.emit('wifiDisableFailed', { error: error.message });
      throw error;
    }
  }

  /**
   * Check if WiFi (wlan0) is enabled
   */
  async isWiFiEnabled() {
    try {
      // Check if wlan0 is up (check for UP flag, not state)
      const { stdout: linkStatus } = await execAsync('ip link show wlan0');
      const isInterfaceUp = linkStatus.includes(',UP') || linkStatus.includes('<UP') || linkStatus.includes('UP>') || linkStatus.includes('UP,');

      // Check if wlan0 is managed by NetworkManager (not unmanaged)
      const { stdout: nmStatus } = await execAsync('nmcli device status');
      const wlan0Line = nmStatus.split('\n').find(line => line.trim().startsWith('wlan0'));
      const isManaged = wlan0Line && !wlan0Line.includes('unmanaged');

      return {
        enabled: isInterfaceUp && isManaged,
        interfaceUp: isInterfaceUp,
        managed: isManaged
      };

    } catch (error) {
      logger.error('Failed to check WiFi status:', error);
      return { enabled: false, interfaceUp: false, managed: false };
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    logger.info('NetworkServiceManager cleanup complete');
  }
}