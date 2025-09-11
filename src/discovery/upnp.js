import dgram from 'dgram';
import axios from 'axios';
import { parseStringPromise } from 'xml2js';
import { EventEmitter } from 'events';
import { networkInterfaces } from 'os';
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
    
    // Canon CCAPI service identifiers from official documentation v1.40
    this.CANON_SERVICE_TYPES = [
      'urn:schemas-canon-com:device:ICPO-CameraControlAPIService:1',    // Canon device type
      'urn:schemas-canon-com:service:ICPO-CameraControlAPIService:1',   // Canon service type
      'urn:schemas-upnp-org:device:ICPO-CameraControlAPIService:1',     // UPnP device type (official)
      'upnp:rootdevice',  // General UPnP root device
      'ssdp:all'          // All SSDP services
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
   * Get available network interfaces for camera discovery
   */
  getAvailableInterfaces() {
    const interfaces = networkInterfaces();
    const availableInterfaces = [];
    
    for (const [name, addresses] of Object.entries(interfaces)) {
      if (!addresses) continue;
      
      for (const addr of addresses) {
        // Look for IPv4 addresses that aren't loopback
        if (addr.family === 'IPv4' && !addr.internal) {
          availableInterfaces.push({
            name,
            address: addr.address,
            netmask: addr.netmask,
            // Prioritize access point interface
            priority: name === 'ap0' ? 1 : name === 'wlan0' ? 2 : 3
          });
        }
      }
    }
    
    // Sort by priority (ap0 first, then wlan0, then others)
    return availableInterfaces.sort((a, b) => a.priority - b.priority);
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
        
        // Join multicast group on all available interfaces
        this.joinMulticastOnInterfaces();
        this.isListening = true;
        resolve();
      });
      
      // Bind to multicast port
      this.socket.bind(this.MULTICAST_PORT);
    });
  }

  /**
   * Join multicast group on all available network interfaces
   */
  joinMulticastOnInterfaces() {
    const interfaces = this.getAvailableInterfaces();
    logger.debug('Available network interfaces:', interfaces.map(i => `${i.name}:${i.address}`));
    
    for (const iface of interfaces) {
      try {
        this.socket.addMembership(this.MULTICAST_ADDRESS, iface.address);
        logger.info(`Joined multicast on interface ${iface.name} (${iface.address})`);
      } catch (error) {
        logger.warn(`Failed to join multicast on interface ${iface.name} (${iface.address}):`, error.message);
      }
    }
    
    // If no specific interfaces worked, try default
    if (interfaces.length === 0) {
      try {
        this.socket.addMembership(this.MULTICAST_ADDRESS);
        logger.debug('Joined multicast on default interface');
      } catch (error) {
        logger.error('Failed to join multicast group:', error);
        throw error;
      }
    }
  }

  /**
   * Perform M-SEARCH to actively discover Canon cameras on all interfaces
   */
  async performMSearch() {
    if (!this.socket) {
      throw new Error('Socket not initialized');
    }

    const interfaces = this.getAvailableInterfaces();
    logger.debug('Performing M-SEARCH for Canon cameras on all interfaces...');
    
    for (const serviceType of this.CANON_SERVICE_TYPES) {
      const searchMessage = [
        'M-SEARCH * HTTP/1.1',
        `HOST: ${this.MULTICAST_ADDRESS}:${this.MULTICAST_PORT}`,
        'MAN: "ssdp:discover"',
        'MX: 3',
        `ST: ${serviceType}`,
        '', ''
      ].join('\\r\\n');

      // Send M-SEARCH on each available interface
      for (const iface of interfaces) {
        try {
          // Set the outbound interface for this search
          await new Promise((resolve, reject) => {
            this.socket.send(searchMessage, this.MULTICAST_PORT, this.MULTICAST_ADDRESS, (error) => {
              if (error) {
                logger.warn(`M-SEARCH failed for ${serviceType} on ${iface.name}:`, error);
                resolve(); // Don't fail the whole process
              } else {
                logger.debug(`M-SEARCH sent for ${serviceType} on ${iface.name} (${iface.address})`);
                resolve();
              }
            });
          });
          
          // Small delay between interface searches
          await new Promise(resolve => setTimeout(resolve, 50));
        } catch (error) {
          logger.warn(`Error sending M-SEARCH on ${iface.name}:`, error.message);
        }
      }
      
      // If no interfaces available, try default
      if (interfaces.length === 0) {
        await new Promise((resolve, reject) => {
          this.socket.send(searchMessage, this.MULTICAST_PORT, this.MULTICAST_ADDRESS, (error) => {
            if (error) {
              logger.error(`M-SEARCH failed for ${serviceType}:`, error);
              reject(error);
            } else {
              logger.debug(`M-SEARCH sent for ${serviceType} on default interface`);
              resolve();
            }
          });
        });
      }
      
      // Delay between service type searches
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  /**
   * Handle incoming SSDP messages (NOTIFY and M-SEARCH responses)
   */
  handleSSDPMessage(message, remote) {
    try {
      logger.info(`Received SSDP message from ${remote.address}:${remote.port}:`);
      logger.info(message); // Log the full message content
      
      const lines = message.split('\r\n');
      const firstLine = lines[0];
      
      logger.debug(`SSDP message type: ${firstLine}`);
      
      if (firstLine.startsWith('NOTIFY')) {
        this.handleNotifyMessage(lines, remote);
      } else if (firstLine.startsWith('HTTP/1.1 200 OK')) {
        this.handleSearchResponse(lines, remote);
      } else {
        logger.debug('Unknown SSDP message type:', firstLine);
      }
    } catch (error) {
      logger.error('Error parsing SSDP message:', error);
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
    const location = headers['location'];
    
    logger.debug(`NOTIFY message from ${remote.address}: NT=${nt}, USN=${usn}, NTS=${nts}, Location=${location}`);
    
    if (nts === 'ssdp:alive') {
      const isCanon = this.isCanonCamera(nt, usn);
      logger.debug(`Canon camera check result for NOTIFY: ${isCanon}`);
      
      if (isCanon) {
        logger.info(`Canon camera NOTIFY from ${remote.address}:`, { nt, usn, location });
        this.processDeviceLocation(headers, remote);
      }
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
    const location = headers['location'];
    
    logger.debug(`M-SEARCH response from ${remote.address}: ST=${st}, USN=${usn}, Location=${location}`);
    
    const isCanon = this.isCanonCamera(st, usn);
    logger.debug(`Canon camera check result for M-SEARCH response: ${isCanon}`);
    
    if (isCanon) {
      logger.info(`Canon camera M-SEARCH response from ${remote.address}:`, { st, usn, location });
      this.processDeviceLocation(headers, remote);
    }
  }

  /**
   * Check if the service type indicates a Canon camera (based on CCAPI v1.40 specification)
   */
  isCanonCamera(serviceType, usn) {
    if (!serviceType && !usn) return false;
    
    // Official Canon CCAPI service identifiers from documentation
    const canonServiceTypes = [
      'ICPO-CameraControlAPIService',
      'schemas-canon-com',
      'Canon Device Discovery',
      'Canon Digital Camera'
    ];
    
    // Check for Canon-specific service types in ST or USN
    const hasCanonIndicator = canonServiceTypes.some(indicator => 
      (serviceType && serviceType.includes(indicator)) ||
      (usn && usn.includes(indicator))
    );
    
    // Accept upnp:rootdevice only if it has Canon indicators in USN
    const isCanonRootDevice = (serviceType === 'upnp:rootdevice') && 
      (usn && canonServiceTypes.some(indicator => usn.includes(indicator)));
    
    logger.debug(`Canon camera check - ST: ${serviceType}, USN: ${usn}, hasCanonIndicator: ${hasCanonIndicator}, isCanonRootDevice: ${isCanonRootDevice}`);
    
    return hasCanonIndicator || isCanonRootDevice;
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

      // Extract Canon-specific extended information (CCAPI v1.40 specification)
      // Try multiple namespace prefixes as Canon may vary implementation
      const nsPrefixes = ['ns:', 'canon:', ''];
      let xOnService, xAccessURL, xDeviceNickname;
      
      for (const prefix of nsPrefixes) {
        xOnService = xOnService || this.findExtendedValue(service, 'X_onService', prefix);
        xAccessURL = xAccessURL || this.findExtendedValue(service, 'X_accessURL', prefix);
        xDeviceNickname = xDeviceNickname || this.findExtendedValue(service, 'X_deviceNickname', prefix);
      }

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
   * Handles xml2js parsed objects which can have various structures
   */
  findExtendedValue(service, tagName, nsPrefix = 'ns:') {
    const fullTagName = `${nsPrefix}${tagName}`;
    const value = service[fullTagName]?.[0];
    
    if (value === undefined || value === null) {
      return null;
    }
    
    // If it's already a string, return it
    if (typeof value === 'string') {
      return value;
    }
    
    // If it's an object from xml2js, extract the text content
    if (typeof value === 'object') {
      // xml2js format: { _: "actual content", $: { attributes } }
      if (value._ !== undefined) {
        return value._;
      }
      // Some xml parsers put content in different properties
      if (value['#text'] !== undefined) {
        return value['#text'];
      }
      // If it's just an object with a text property
      if (value.text !== undefined) {
        return value.text;
      }
    }
    
    return value;
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