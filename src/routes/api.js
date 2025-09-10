import { Router } from 'express';
import { logger } from '../utils/logger.js';
import { IntervalometerSession } from '../intervalometer/session.js';

export function createApiRouter(cameraController, powerManager, server, networkManager, discoveryManager) {
  const router = Router();

  // Camera status and connection
  router.get('/camera/status', (req, res) => {
    try {
      const status = cameraController.getConnectionStatus();
      res.json(status);
    } catch (error) {
      logger.error('Failed to get camera status:', error);
      res.status(500).json({ error: 'Failed to get camera status' });
    }
  });

  // Camera settings
  router.get('/camera/settings', async (req, res) => {
    try {
      const settings = await cameraController.getCameraSettings();
      res.json(settings);
    } catch (error) {
      logger.error('Failed to get camera settings:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Camera battery status
  router.get('/camera/battery', async (req, res) => {
    try {
      const battery = await cameraController.getCameraBattery();
      res.json(battery);
    } catch (error) {
      logger.error('Failed to get camera battery:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Debug endpoint to see all available CCAPI endpoints
  router.get('/camera/debug/endpoints', (req, res) => {
    try {
      const status = cameraController.getConnectionStatus();
      res.json({
        connected: status.connected,
        baseUrl: `https://${status.ip}:${status.port}`,
        capabilities: cameraController.capabilities,
        shutterEndpoint: status.shutterEndpoint
      });
    } catch (error) {
      logger.error('Failed to get camera debug info:', error);
      res.status(500).json({ error: 'Failed to get camera debug info' });
    }
  });

  // Take a single photo
  router.post('/camera/photo', async (req, res) => {
    try {
      await cameraController.takePhoto();
      res.json({ success: true, timestamp: new Date().toISOString() });
    } catch (error) {
      logger.error('Failed to take photo:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Manual reconnect trigger
  router.post('/camera/reconnect', async (req, res) => {
    try {
      logger.info('Manual reconnect requested');
      const result = await cameraController.manualReconnect();
      
      if (result) {
        res.json({ success: true, message: 'Reconnection successful' });
      } else {
        res.json({ success: false, error: 'Reconnection failed' });
      }
    } catch (error) {
      logger.error('Failed to reconnect to camera:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Update camera IP and port configuration
  router.post('/camera/configure', async (req, res) => {
    try {
      const { ip, port = '443' } = req.body;
      
      // Validate IP address format
      if (!ip || typeof ip !== 'string') {
        return res.status(400).json({ success: false, error: 'IP address is required' });
      }
      
      // Basic IP address validation
      const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
      if (!ipRegex.test(ip)) {
        return res.status(400).json({ success: false, error: 'Invalid IP address format' });
      }
      
      // Validate port
      const portNum = parseInt(port);
      if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
        return res.status(400).json({ success: false, error: 'Port must be between 1 and 65535' });
      }
      
      logger.info(`Camera configuration update requested: ${ip}:${port}`);
      const result = await cameraController.updateConfiguration(ip, port.toString());
      
      if (result) {
        res.json({ 
          success: true, 
          message: 'Camera configuration updated successfully',
          configuration: { ip, port }
        });
      } else {
        res.json({ 
          success: false, 
          error: 'Failed to connect to camera with new configuration' 
        });
      }
    } catch (error) {
      logger.error('Failed to update camera configuration:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Validate intervalometer settings
  router.post('/camera/validate-interval', async (req, res) => {
    try {
      const { interval } = req.body;
      
      if (!interval || interval <= 0) {
        return res.status(400).json({ error: 'Invalid interval value' });
      }
      
      const validation = await cameraController.validateInterval(interval);
      res.json(validation);
    } catch (error) {
      logger.error('Failed to validate interval:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Intervalometer control
  router.post('/intervalometer/start', async (req, res) => {
    try {
      const { interval, shots, stopTime } = req.body;
      
      // Validation
      if (!interval || interval <= 0) {
        return res.status(400).json({ error: 'Invalid interval value' });
      }
      
      // Check if session is already running
      if (server.activeIntervalometerSession && server.activeIntervalometerSession.state === 'running') {
        return res.status(400).json({ error: 'Intervalometer is already running' });
      }
      
      // Validate against camera settings
      const validation = await cameraController.validateInterval(interval);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }
      
      // Clean up any existing session
      if (server.activeIntervalometerSession) {
        server.activeIntervalometerSession.cleanup();
        server.activeIntervalometerSession = null;
      }
      
      // Create and configure new session
      const options = { interval };
      if (shots && shots > 0) options.totalShots = parseInt(shots);
      if (stopTime) {
        // Parse time as HH:MM and create a future date
        const [hours, minutes] = stopTime.split(':').map(Number);
        const now = new Date();
        const stopDate = new Date();
        stopDate.setHours(hours, minutes, 0, 0);
        
        // If the time is in the past, assume it's for tomorrow
        if (stopDate <= now) {
          stopDate.setDate(stopDate.getDate() + 1);
        }
        
        options.stopTime = stopDate;
      }
      
      server.activeIntervalometerSession = new IntervalometerSession(cameraController, options);
      
      // Start the session
      await server.activeIntervalometerSession.start();
      
      logger.info('Intervalometer started', options);
      
      res.json({ 
        success: true, 
        message: 'Intervalometer started successfully',
        status: server.activeIntervalometerSession.getStatus()
      });
    } catch (error) {
      logger.error('Failed to start intervalometer:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/intervalometer/stop', async (req, res) => {
    try {
      if (!server.activeIntervalometerSession) {
        return res.status(400).json({ error: 'No intervalometer session is running' });
      }
      
      await server.activeIntervalometerSession.stop();
      const finalStatus = server.activeIntervalometerSession.getStatus();
      
      logger.info('Intervalometer stopped', finalStatus.stats);
      
      res.json({ 
        success: true, 
        message: 'Intervalometer stopped successfully',
        status: finalStatus
      });
    } catch (error) {
      logger.error('Failed to stop intervalometer:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/intervalometer/status', (req, res) => {
    try {
      if (!server.activeIntervalometerSession) {
        return res.json({ 
          running: false, 
          state: 'stopped',
          message: 'No active intervalometer session'
        });
      }
      
      const status = server.activeIntervalometerSession.getStatus();
      res.json({
        running: status.state === 'running',
        ...status
      });
    } catch (error) {
      logger.error('Failed to get intervalometer status:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Set system time from client
  router.post('/system/time', async (req, res) => {
    try {
      const { timestamp } = req.body;
      
      if (!timestamp) {
        return res.status(400).json({ error: 'Timestamp is required' });
      }
      
      const clientTime = new Date(timestamp);
      if (isNaN(clientTime.getTime())) {
        return res.status(400).json({ error: 'Invalid timestamp format' });
      }
      
      // Check if we're running on Linux (Pi) before attempting to set system time
      if (process.platform !== 'linux') {
        logger.warn('Time sync requested but not running on Linux - ignoring');
        return res.json({ 
          success: false, 
          error: 'Time synchronization only supported on Linux systems',
          currentTime: new Date().toISOString()
        });
      }
      
      // Format timestamp for date command (YYYY-MM-DD HH:MM:SS)
      const formattedTime = clientTime.toISOString().slice(0, 19).replace('T', ' ');
      
      logger.info(`Time sync requested. Current: ${new Date().toISOString()}, Client: ${clientTime.toISOString()}`);
      
      // Use child_process to set system time
      const { spawn } = await import('child_process');
      const setTime = spawn('sudo', ['date', '-s', formattedTime], { stdio: 'pipe' });
      
      setTime.on('close', (code) => {
        if (code === 0) {
          const newTime = new Date().toISOString();
          logger.info(`System time synchronized successfully to: ${newTime}`);
          res.json({ 
            success: true, 
            message: 'System time synchronized successfully',
            previousTime: new Date().toISOString(),
            newTime: newTime
          });
        } else {
          logger.error(`Time sync failed with exit code: ${code}`);
          res.status(500).json({ 
            success: false, 
            error: 'Failed to set system time. Check sudo permissions.' 
          });
        }
      });
      
      setTime.on('error', (error) => {
        logger.error('Time sync error:', error);
        res.status(500).json({ 
          success: false, 
          error: 'Failed to execute time sync command' 
        });
      });
      
    } catch (error) {
      logger.error('Failed to sync time:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get current system time
  router.get('/system/time', (req, res) => {
    try {
      res.json({
        currentTime: new Date().toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        timestamp: Date.now()
      });
    } catch (error) {
      logger.error('Failed to get system time:', error);
      res.status(500).json({ error: 'Failed to get system time' });
    }
  });

  // Power and system status
  router.get('/system/power', (req, res) => {
    try {
      const status = powerManager.getStatus();
      res.json(status);
    } catch (error) {
      logger.error('Failed to get power status:', error);
      res.status(500).json({ error: 'Failed to get power status' });
    }
  });

  router.get('/system/status', (req, res) => {
    try {
      const powerStatus = powerManager.getStatus();
      res.json({
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        platform: process.platform,
        nodeVersion: process.version,
        timestamp: new Date().toISOString(),
        power: powerStatus
      });
    } catch (error) {
      logger.error('Failed to get system status:', error);
      res.status(500).json({ error: 'Failed to get system status' });
    }
  });

  // Network Management Routes
  if (networkManager) {
    // Get current network status
    router.get('/network/status', async (req, res) => {
      try {
        const status = await networkManager.getNetworkStatus();
        res.json(status);
      } catch (error) {
        logger.error('Failed to get network status:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Switch network mode (field/development)
    router.post('/network/mode', async (req, res) => {
      try {
        const { mode } = req.body;
        
        if (!mode || !['field', 'development'].includes(mode)) {
          return res.status(400).json({ error: 'Invalid mode. Must be "field" or "development"' });
        }

        const result = await networkManager.switchNetworkMode(mode);
        res.json(result);
      } catch (error) {
        logger.error('Failed to switch network mode:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Scan for WiFi networks
    router.get('/network/wifi/scan', async (req, res) => {
      try {
        const forceRefresh = req.query.refresh === 'true';
        const networks = await networkManager.scanWiFiNetworks(forceRefresh);
        res.json({ networks });
      } catch (error) {
        logger.error('WiFi scan failed:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Get saved WiFi networks
    router.get('/network/wifi/saved', async (req, res) => {
      try {
        const networks = await networkManager.getSavedNetworks();
        res.json({ networks });
      } catch (error) {
        logger.error('Failed to get saved networks:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Connect to WiFi network
    router.post('/network/wifi/connect', async (req, res) => {
      try {
        const { ssid, password, priority } = req.body;
        
        if (!ssid) {
          return res.status(400).json({ error: 'SSID is required' });
        }

        const result = await networkManager.connectToWiFi(ssid, password, priority);
        res.json(result);
      } catch (error) {
        logger.error('WiFi connection failed:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Disconnect from WiFi
    router.post('/network/wifi/disconnect', async (req, res) => {
      try {
        const result = await networkManager.disconnectWiFi();
        res.json(result);
      } catch (error) {
        logger.error('WiFi disconnection failed:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Remove saved WiFi network
    router.delete('/network/wifi/saved/:id', async (req, res) => {
      try {
        const { id } = req.params;
        const result = await networkManager.removeSavedNetwork(id);
        res.json(result);
      } catch (error) {
        logger.error('Failed to remove saved network:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Configure access point
    router.post('/network/accesspoint/configure', async (req, res) => {
      try {
        const { ssid, passphrase, channel, hidden } = req.body;
        
        if (!ssid || !passphrase) {
          return res.status(400).json({ error: 'SSID and passphrase are required' });
        }

        if (passphrase.length < 8) {
          return res.status(400).json({ error: 'Passphrase must be at least 8 characters' });
        }

        const result = await networkManager.configureAccessPoint({
          ssid, passphrase, channel, hidden
        });
        res.json(result);
      } catch (error) {
        logger.error('Access point configuration failed:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Set WiFi country for international travel
    router.post('/network/wifi/country', async (req, res) => {
      try {
        const { country } = req.body;
        
        if (!country) {
          return res.status(400).json({ error: 'Country code is required' });
        }
        
        const result = await networkManager.setWiFiCountry(country.toUpperCase());
        res.json(result);
      } catch (error) {
        logger.error('WiFi country setting failed:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Get current WiFi country
    router.get('/network/wifi/country', async (req, res) => {
      try {
        const result = await networkManager.getWiFiCountry();
        res.json(result);
      } catch (error) {
        logger.error('Failed to get WiFi country:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Get available country codes
    router.get('/network/wifi/countries', async (req, res) => {
      try {
        const countries = networkManager.getCountryCodes();
        res.json({ countries });
      } catch (error) {
        logger.error('Failed to get country codes:', error);
        res.status(500).json({ error: error.message });
      }
    });
  }

  // ===== Camera Discovery API =====
  if (discoveryManager) {
    // Get discovery status
    router.get('/discovery/status', (req, res) => {
      try {
        const status = discoveryManager.getStatus();
        res.json(status);
      } catch (error) {
        logger.error('Failed to get discovery status:', error);
        res.status(500).json({ error: 'Failed to get discovery status' });
      }
    });

    // Get discovered cameras
    router.get('/discovery/cameras', (req, res) => {
      try {
        const cameras = discoveryManager.getDiscoveredCameras();
        res.json(cameras);
      } catch (error) {
        logger.error('Failed to get discovered cameras:', error);
        res.status(500).json({ error: 'Failed to get discovered cameras' });
      }
    });

    // Manually trigger camera search
    router.post('/discovery/scan', async (req, res) => {
      try {
        await discoveryManager.searchForCameras();
        res.json({ success: true, message: 'Camera scan initiated' });
      } catch (error) {
        logger.error('Failed to trigger camera scan:', error);
        res.status(500).json({ error: 'Failed to trigger camera scan' });
      }
    });

    // Set primary camera
    router.post('/discovery/primary/:uuid', async (req, res) => {
      try {
        const { uuid } = req.params;
        const controller = await discoveryManager.setPrimaryCamera(uuid);
        res.json({ success: true, message: 'Primary camera set', uuid });
      } catch (error) {
        logger.error('Failed to set primary camera:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Connect to camera by IP (manual connection)
    router.post('/discovery/connect', async (req, res) => {
      try {
        const { ip, port = '443' } = req.body;
        if (!ip) {
          return res.status(400).json({ error: 'IP address is required' });
        }
        
        const controller = await discoveryManager.connectToIp(ip, port);
        res.json({ success: true, message: 'Connected to camera', ip, port });
      } catch (error) {
        logger.error('Failed to connect to camera:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Get specific camera by UUID
    router.get('/discovery/cameras/:uuid', (req, res) => {
      try {
        const { uuid } = req.params;
        const camera = discoveryManager.getCamera(uuid);
        if (!camera) {
          return res.status(404).json({ error: 'Camera not found' });
        }
        res.json(camera);
      } catch (error) {
        logger.error('Failed to get camera:', error);
        res.status(500).json({ error: 'Failed to get camera' });
      }
    });
  }

  // Error handling middleware for API routes
  router.use((err, req, res, next) => {
    logger.error('API route error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return router;
}