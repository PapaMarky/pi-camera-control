import dgram from 'dgram';
import axios from 'axios';
import { parseStringPromise } from 'xml2js';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';

/**
 * UPnP Discovery Service for Canon Cameras
 * Implements SSDP (Simple Service Discovery Protocol) to automatically discover
 * Canon cameras on the network using the CCAPI service identifiers.
 */
export class UPnPDiscovery extends EventEmitter {
  constructor() {
    super();
    this.socket = null;
    this.isListening = false;
    this.discoveredDevices = new Map(); // deviceUUID -> device info
    this.searchTimeout = null;
    this.announceTimeout = null;
    
    // SSDP multicast configuration
    this.MULTICAST_ADDRESS = '239.255.255.250';
    this.MULTICAST_PORT = 1900;
    
    // Canon CCAPI service identifiers from documentation
    this.CANON_SERVICE_TYPES = [
      'urn:schemas-canon-com:device:ICPO-CameraControlAPIService:1',
      'urn:schemas-canon-com:service:ICPO-CameraControlAPIService:1'
    ];
  }

  /**
   * Start listening for UPnP advertisements and perform active discovery
   */
  async startDiscovery() {
    try {
      await this.startListening();
      await this.performMSearch();
      
      // Periodically search for cameras every 60 seconds
      this.schedulePeriodicSearch();
      
      logger.info('UPnP discovery started successfully');
      return true;
    } catch (error) {
      logger.error('Failed to start UPnP discovery:', error);
      return false;
    }
  }

  /**
   * Start listening for SSDP NOTIFY messages (camera advertisements)
   */
  async startListening() {
    return new Promise((resolve, reject) => {
      this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      
      this.socket.on('message', (message, remote) => {
        this.handleSSDPMessage(message.toString(), remote);
      });
      
      this.socket.on('error', (error) => {
        logger.error('UPnP socket error:', error);
        reject(error);
      });
      
      this.socket.on('listening', () => {
        const address = this.socket.address();
        logger.debug(`UPnP listening on ${address.address}:${address.port}`);
        
        // Join multicast group to receive NOTIFY messages
        try {
          this.socket.addMembership(this.MULTICAST_ADDRESS);
          this.isListening = true;
          resolve();
        } catch (error) {
          logger.error('Failed to join multicast group:', error);
          reject(error);
        }
      });
      
      // Bind to multicast port
      this.socket.bind(this.MULTICAST_PORT);
    });
  }

  /**
   * Perform M-SEARCH to actively discover Canon cameras
   */
  async performMSearch() {
    if (!this.socket) {
      throw new Error('Socket not initialized');
    }

    logger.debug('Performing M-SEARCH for Canon cameras...');
    
    for (const serviceType of this.CANON_SERVICE_TYPES) {
      const searchMessage = [
        'M-SEARCH * HTTP/1.1',
        `HOST: ${this.MULTICAST_ADDRESS}:${this.MULTICAST_PORT}`,
        'MAN: "ssdp:discover"',
        'MX: 3',
        `ST: ${serviceType}`,
        '', ''
      ].join('\\r\\n');

      await new Promise((resolve, reject) => {
        this.socket.send(searchMessage, this.MULTICAST_PORT, this.MULTICAST_ADDRESS, (error) => {
          if (error) {
            logger.error(`M-SEARCH failed for ${serviceType}:`, error);
            reject(error);
          } else {
            logger.debug(`M-SEARCH sent for ${serviceType}`);
            resolve();
          }
        });
      });
      
      // Small delay between searches
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  /**
   * Handle incoming SSDP messages (NOTIFY and M-SEARCH responses)
   */
  handleSSDPMessage(message, remote) {
    try {
      const lines = message.split('\\r\\n');
      const firstLine = lines[0];
      
      if (firstLine.startsWith('NOTIFY')) {
        this.handleNotifyMessage(lines, remote);
      } else if (firstLine.startsWith('HTTP/1.1 200 OK')) {
        this.handleSearchResponse(lines, remote);
      }
    } catch (error) {
      logger.debug('Error parsing SSDP message:', error.message);
    }
  }

  /**
   * Handle SSDP NOTIFY messages from cameras
   */
  handleNotifyMessage(lines, remote) {
    const headers = this.parseHeaders(lines);
    
    // Check if this is a Canon camera advertisement
    const nt = headers['nt'];
    const usn = headers['usn'];
    const nts = headers['nts'];
    
    if (nts === 'ssdp:alive' && this.isCanonCamera(nt, usn)) {
      logger.debug(`Canon camera advertisement from ${remote.address}:`, { nt, usn });
      this.processDeviceLocation(headers, remote);
    } else if (nts === 'ssdp:byebye') {
      // Handle device going offline
      const deviceUUID = this.extractUUIDFromUSN(usn);
      if (deviceUUID && this.discoveredDevices.has(deviceUUID)) {
        logger.info(`Canon camera going offline: ${deviceUUID}`);
        this.discoveredDevices.delete(deviceUUID);
        this.emit('deviceOffline', deviceUUID);
      }
    }
  }

  /**
   * Handle M-SEARCH responses from cameras
   */
  handleSearchResponse(lines, remote) {
    const headers = this.parseHeaders(lines);
    
    // Check if this is a Canon camera response
    const st = headers['st'];
    const usn = headers['usn'];
    
    if (this.isCanonCamera(st, usn)) {
      logger.debug(`Canon camera M-SEARCH response from ${remote.address}:`, { st, usn });
      this.processDeviceLocation(headers, remote);
    }
  }

  /**
   * Check if the service type indicates a Canon camera
   */
  isCanonCamera(serviceType, usn) {
    if (!serviceType && !usn) return false;
    
    const canonIndicators = [
      'ICPO-CameraControlAPIService',
      'schemas-canon-com'
    ];
    
    return canonIndicators.some(indicator => 
      (serviceType && serviceType.includes(indicator)) ||
      (usn && usn.includes(indicator))
    );
  }

  /**
   * Process device location URL and fetch device description
   */
  async processDeviceLocation(headers, remote) {
    const location = headers['location'];
    const usn = headers['usn'];
    
    if (!location) {
      logger.debug('No location header in SSDP message');
      return;
    }

    const deviceUUID = this.extractUUIDFromUSN(usn);
    if (!deviceUUID) {
      logger.debug('Could not extract UUID from USN:', usn);
      return;
    }

    // Skip if we already know about this device
    if (this.discoveredDevices.has(deviceUUID)) {
      logger.debug(`Device ${deviceUUID} already discovered`);
      return;
    }

    try {
      logger.debug(`Fetching device description from: ${location}`);
      const deviceInfo = await this.fetchDeviceDescription(location);
      
      if (deviceInfo) {
        deviceInfo.uuid = deviceUUID;
        deviceInfo.ipAddress = remote.address;
        deviceInfo.discoveredAt = new Date();
        
        this.discoveredDevices.set(deviceUUID, deviceInfo);
        
        logger.info(`Canon camera discovered: ${deviceInfo.modelName} (${deviceInfo.serialNumber})`, {
          ip: deviceInfo.ipAddress,
          ccapiUrl: deviceInfo.ccapiUrl
        });
        
        this.emit('cameraDiscovered', deviceInfo);
      }
    } catch (error) {
      logger.error(`Failed to fetch device description from ${location}:`, error.message);
    }
  }

  /**
   * Fetch and parse device description XML
   */
  async fetchDeviceDescription(location) {
    try {
      const response = await axios.get(location, { timeout: 5000 });
      const deviceDesc = await parseStringPromise(response.data);
      
      return this.parseDeviceDescription(deviceDesc);
    } catch (error) {
      logger.debug('Error fetching device description:', error.message);
      return null;
    }
  }

  /**
   * Parse device description XML into useful camera information
   */
  parseDeviceDescription(deviceDesc) {
    try {
      const device = deviceDesc.root?.device?.[0];
      if (!device) return null;

      const service = device.serviceList?.[0]?.service?.[0];
      if (!service) return null;

      // Extract basic device information
      const deviceInfo = {
        deviceType: device.deviceType?.[0],
        friendlyName: device.friendlyName?.[0],
        manufacturer: device.manufacturer?.[0],
        manufacturerURL: device.manufacturerURL?.[0],
        modelDescription: device.modelDescription?.[0],
        modelName: device.modelName?.[0],
        serialNumber: device.serialNumber?.[0],
        udn: device.UDN?.[0]
      };

      // Extract Canon-specific extended information
      const nsPrefix = 'ns:';
      const xOnService = this.findExtendedValue(service, 'X_onService', nsPrefix);
      const xAccessURL = this.findExtendedValue(service, 'X_accessURL', nsPrefix);
      const xDeviceNickname = this.findExtendedValue(service, 'X_deviceNickname', nsPrefix);

      deviceInfo.connected = xOnService === '1';
      deviceInfo.ccapiUrl = xAccessURL;
      deviceInfo.nickname = xDeviceNickname;

      // Validate that this is actually a Canon camera with CCAPI
      if (!deviceInfo.ccapiUrl || !deviceInfo.manufacturer?.includes('Canon')) {
        logger.debug('Device description does not appear to be a Canon camera with CCAPI');
        return null;
      }

      return deviceInfo;
    } catch (error) {
      logger.error('Error parsing device description:', error);
      return null;
    }
  }

  /**
   * Find extended XML values with namespace prefix
   */
  findExtendedValue(service, tagName, nsPrefix = 'ns:') {
    const fullTagName = `${nsPrefix}${tagName}`;
    return service[fullTagName]?.[0];
  }

  /**
   * Extract UUID from USN (Unique Service Name)
   */
  extractUUIDFromUSN(usn) {
    if (!usn) return null;
    
    const uuidMatch = usn.match(/uuid:([a-f0-9-]+)/i);
    return uuidMatch ? uuidMatch[1] : null;
  }

  /**
   * Parse SSDP headers from message lines
   */
  parseHeaders(lines) {
    const headers = {};
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      const colonIndex = line.indexOf(':');
      if (colonIndex === -1) continue;
      
      const key = line.substring(0, colonIndex).toLowerCase().trim();
      const value = line.substring(colonIndex + 1).trim();
      headers[key] = value;
    }
    
    return headers;
  }

  /**
   * Schedule periodic M-SEARCH to discover cameras
   */
  schedulePeriodicSearch() {
    this.searchTimeout = setTimeout(async () => {
      try {
        await this.performMSearch();
      } catch (error) {
        logger.error('Periodic M-SEARCH failed:', error);
      }
      
      // Schedule next search
      this.schedulePeriodicSearch();
    }, 60000); // Every 60 seconds
  }

  /**
   * Get all currently discovered cameras
   */
  getDiscoveredCameras() {
    return Array.from(this.discoveredDevices.values());
  }

  /**
   * Get a specific camera by UUID
   */
  getCamera(uuid) {
    return this.discoveredDevices.get(uuid);
  }

  /**
   * Stop discovery service
   */
  async stopDiscovery() {
    logger.info('Stopping UPnP discovery...');
    
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
      this.searchTimeout = null;
    }
    
    if (this.announceTimeout) {
      clearTimeout(this.announceTimeout);
      this.announceTimeout = null;
    }
    
    if (this.socket && this.isListening) {
      try {
        this.socket.dropMembership(this.MULTICAST_ADDRESS);
      } catch (error) {
        logger.debug('Error dropping multicast membership:', error.message);
      }
      
      this.socket.close();
      this.socket = null;
      this.isListening = false;
    }
    
    this.discoveredDevices.clear();
    logger.info('UPnP discovery stopped');
  }
}