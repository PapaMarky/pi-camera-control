import { Router } from 'express';
import { logger } from '../utils/logger.js';
import { IntervalometerSession } from '../intervalometer/session.js';

export function createApiRouter(getCameraController, powerManager, server, networkStateManager, discoveryManager, intervalometerStateManager) {
  const router = Router();

  // Camera status and connection
  router.get('/camera/status', (req, res) => {
    try {
      const currentController = getCameraController();
      if (!currentController) {
        return res.json({ connected: false, error: 'No camera available' });
      }
      const status = currentController.getConnectionStatus();
      res.json(status);
    } catch (error) {
      logger.error('Failed to get camera status:', error);
      res.status(500).json({ error: 'Failed to get camera status' });
    }
  });

  // Camera settings
  router.get('/camera/settings', async (req, res) => {
    try {
      const currentController = getCameraController();
      if (!currentController) {
        return res.status(503).json({ error: 'No camera available' });
      }
      const settings = await currentController.getCameraSettings();
      res.json(settings);
    } catch (error) {
      logger.error('Failed to get camera settings:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Camera battery status
  router.get('/camera/battery', async (req, res) => {
    try {
      const currentController = getCameraController();
      if (!currentController) {
        return res.status(503).json({ error: 'No camera available' });
      }
      const battery = await currentController.getCameraBattery();
      res.json(battery);
    } catch (error) {
      logger.error('Failed to get camera battery:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Debug endpoint to see all available CCAPI endpoints
  router.get('/camera/debug/endpoints', (req, res) => {
    try {
      const currentController = getCameraController();
      if (!currentController) {
        return res.status(503).json({ error: 'No camera available' });
      }
      const status = currentController.getConnectionStatus();
      res.json({
        connected: status.connected,
        baseUrl: `https://${status.ip}:${status.port}`,
        capabilities: currentController.capabilities,
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
      const currentController = getCameraController();
      if (!currentController) {
        return res.status(503).json({ error: 'No camera available' });
      }
      await currentController.takePhoto();
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
      const currentController = getCameraController();
      if (!currentController) {
        return res.status(503).json({ error: 'No camera available' });
      }
      const result = await currentController.manualReconnect();
      
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
      const currentController = getCameraController();
      if (!currentController) {
        return res.status(503).json({ error: 'No camera available' });
      }
      const result = await currentController.updateConfiguration(ip, port.toString());
      
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
      
      const currentController = getCameraController();
      if (!currentController) {
        return res.status(503).json({ error: 'No camera available' });
      }
      const validation = await currentController.validateInterval(interval);
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
      
      // Get current camera controller
      const currentController = getCameraController();
      if (!currentController) {
        return res.status(503).json({ error: 'No camera available' });
      }
      
      // Validate against camera settings
      const validation = await currentController.validateInterval(interval);
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
      
      server.activeIntervalometerSession = new IntervalometerSession(() => getCameraController(), options);
      
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

  // Enhanced intervalometer with title support
  router.post('/intervalometer/start-with-title', async (req, res) => {
    try {
      const { interval, shots, stopTime, title } = req.body;
      
      // Validation
      if (!interval || interval <= 0) {
        return res.status(400).json({ error: 'Invalid interval value' });
      }
      
      // Check if session is already running
      if (server.activeIntervalometerSession && server.activeIntervalometerSession.state === 'running') {
        return res.status(400).json({ error: 'Intervalometer is already running' });
      }
      
      // Get current camera controller
      const currentController = getCameraController();
      if (!currentController) {
        return res.status(503).json({ error: 'No camera available' });
      }
      
      // Validate against camera settings
      const validation = await currentController.validateInterval(interval);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }
      
      // Clean up any existing session
      if (server.activeIntervalometerSession) {
        server.activeIntervalometerSession.cleanup();
        server.activeIntervalometerSession = null;
      }
      
      // Create and configure new session with title
      const options = { interval };
      if (title && title.trim()) options.title = title.trim();
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
      
      server.activeIntervalometerSession = new IntervalometerSession(() => getCameraController(), options);
      
      // Start the session
      await server.activeIntervalometerSession.start();
      
      logger.info('Intervalometer started with title support', options);
      
      res.json({ 
        success: true, 
        message: 'Intervalometer started successfully',
        status: server.activeIntervalometerSession.getStatus(),
        sessionId: server.activeIntervalometerSession.getSessionId(),
        title: server.activeIntervalometerSession.getTitle()
      });
    } catch (error) {
      logger.error('Failed to start intervalometer with title:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Timelapse Reports Management API
  router.get('/timelapse/reports', async (req, res) => {
    try {
      if (!intervalometerStateManager) {
        return res.status(503).json({ error: 'Timelapse reporting not available' });
      }
      
      const reports = await intervalometerStateManager.getReports();
      res.json({ reports });
    } catch (error) {
      logger.error('Failed to get timelapse reports:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/timelapse/reports/:id', async (req, res) => {
    try {
      const { id } = req.params;
      if (!intervalometerStateManager) {
        return res.status(503).json({ error: 'Timelapse reporting not available' });
      }
      
      const report = await intervalometerStateManager.getReport(id);
      if (!report) {
        return res.status(404).json({ error: 'Report not found' });
      }
      
      res.json(report);
    } catch (error) {
      logger.error('Failed to get timelapse report:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.put('/timelapse/reports/:id/title', async (req, res) => {
    try {
      const { id } = req.params;
      const { title } = req.body;
      
      if (!title || title.trim() === '') {
        return res.status(400).json({ error: 'Title cannot be empty' });
      }
      
      if (!intervalometerStateManager) {
        return res.status(503).json({ error: 'Timelapse reporting not available' });
      }
      
      const updatedReport = await intervalometerStateManager.updateReportTitle(id, title.trim());
      res.json(updatedReport);
    } catch (error) {
      if (error.message.includes('not found')) {
        return res.status(404).json({ error: 'Report not found' });
      }
      logger.error('Failed to update report title:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.delete('/timelapse/reports/:id', async (req, res) => {
    try {
      const { id } = req.params;
      if (!intervalometerStateManager) {
        return res.status(503).json({ error: 'Timelapse reporting not available' });
      }
      
      await intervalometerStateManager.deleteReport(id);
      res.json({ success: true, message: 'Report deleted successfully' });
    } catch (error) {
      logger.error('Failed to delete report:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/timelapse/sessions/:id/save', async (req, res) => {
    try {
      const { id } = req.params;
      const { title } = req.body;
      
      if (!intervalometerStateManager) {
        return res.status(503).json({ error: 'Timelapse reporting not available' });
      }
      
      const savedReport = await intervalometerStateManager.saveSessionReport(id, title);
      res.json({ 
        success: true, 
        message: 'Session saved as report successfully',
        report: savedReport 
      });
    } catch (error) {
      if (error.message.includes('not found')) {
        return res.status(404).json({ error: 'Session not found' });
      }
      logger.error('Failed to save session as report:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/timelapse/sessions/:id/discard', async (req, res) => {
    try {
      const { id } = req.params;
      
      if (!intervalometerStateManager) {
        return res.status(503).json({ error: 'Timelapse reporting not available' });
      }
      
      await intervalometerStateManager.discardSession(id);
      res.json({ success: true, message: 'Session discarded successfully' });
    } catch (error) {
      logger.error('Failed to discard session:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/timelapse/unsaved-session', async (req, res) => {
    try {
      if (!intervalometerStateManager) {
        return res.status(503).json({ error: 'Timelapse reporting not available' });
      }
      
      const state = intervalometerStateManager.getState();
      res.json({ 
        unsavedSession: state.hasUnsavedSession ? {
          sessionId: state.currentSessionId,
          // Additional unsaved session data would be added here
        } : null 
      });
    } catch (error) {
      logger.error('Failed to get unsaved session:', error);
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
  if (networkStateManager) {
    const networkServiceManager = networkStateManager.serviceManager; // Get direct access to service manager

    // Get current network status
    router.get('/network/status', async (req, res) => {
      try {
        const status = await networkStateManager.getNetworkStatus();
        res.json(status);
      } catch (error) {
        logger.error('Failed to get network status:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Switch network mode (field/development) - HIGH-LEVEL STATE OPERATION
    router.post('/network/mode', async (req, res) => {
      try {
        const { mode } = req.body;

        if (!mode || !['field', 'development'].includes(mode)) {
          return res.status(400).json({ error: 'Invalid mode. Must be "field" or "development"' });
        }

        const result = await networkStateManager.switchMode(mode);
        res.json(result);
      } catch (error) {
        logger.error('Failed to switch network mode:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Scan for WiFi networks - LOW-LEVEL SERVICE OPERATION
    router.get('/network/wifi/scan', async (req, res) => {
      try {
        const forceRefresh = req.query.refresh === 'true';
        const networks = await networkServiceManager.scanWiFiNetworks(forceRefresh);
        res.json({ networks });
      } catch (error) {
        logger.error('WiFi scan failed:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Get saved WiFi networks - LOW-LEVEL SERVICE OPERATION
    router.get('/network/wifi/saved', async (req, res) => {
      try {
        const networks = await networkServiceManager.getSavedNetworks();
        res.json({ networks });
      } catch (error) {
        logger.error('Failed to get saved networks:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Connect to WiFi network - LOW-LEVEL SERVICE OPERATION
    router.post('/network/wifi/connect', async (req, res) => {
      try {
        const { ssid, password, priority } = req.body;

        if (!ssid) {
          return res.status(400).json({ error: 'SSID is required' });
        }

        const result = await networkServiceManager.connectToWiFi(ssid, password, priority);
        res.json(result);
      } catch (error) {
        logger.error('WiFi connection failed:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Disconnect from WiFi - LOW-LEVEL SERVICE OPERATION
    router.post('/network/wifi/disconnect', async (req, res) => {
      try {
        const result = await networkServiceManager.disconnectWiFi();
        res.json(result);
      } catch (error) {
        logger.error('WiFi disconnection failed:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Remove saved WiFi network - LOW-LEVEL SERVICE OPERATION
    router.delete('/network/wifi/saved/:id', async (req, res) => {
      try {
        const { id } = req.params;
        const result = await networkServiceManager.removeSavedNetwork(id);
        res.json(result);
      } catch (error) {
        logger.error('Failed to remove saved network:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Configure access point - HIGH-LEVEL STATE OPERATION (affects overall state)
    router.post('/network/accesspoint/configure', async (req, res) => {
      try {
        const { ssid, passphrase, channel, hidden } = req.body;

        if (!ssid || !passphrase) {
          return res.status(400).json({ error: 'SSID and passphrase are required' });
        }

        if (passphrase.length < 8) {
          return res.status(400).json({ error: 'Passphrase must be at least 8 characters' });
        }

        const result = await networkStateManager.configureAccessPoint({
          ssid, passphrase, channel, hidden
        });
        res.json(result);
      } catch (error) {
        logger.error('Access point configuration failed:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Set WiFi country for international travel - LOW-LEVEL SERVICE OPERATION
    router.post('/network/wifi/country', async (req, res) => {
      try {
        const { country } = req.body;

        if (!country) {
          return res.status(400).json({ error: 'Country code is required' });
        }

        const result = await networkServiceManager.setWiFiCountry(country.toUpperCase());
        res.json(result);
      } catch (error) {
        logger.error('WiFi country setting failed:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Get current WiFi country - LOW-LEVEL SERVICE OPERATION
    router.get('/network/wifi/country', async (req, res) => {
      try {
        const result = await networkServiceManager.getWiFiCountry();
        res.json(result);
      } catch (error) {
        logger.error('Failed to get WiFi country:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Get available country codes - LOW-LEVEL SERVICE OPERATION
    router.get('/network/wifi/countries', async (req, res) => {
      try {
        const countries = networkServiceManager.getCountryCodes();
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
        const _controller = await discoveryManager.setPrimaryCamera(uuid);
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
        
        const _controller = await discoveryManager.connectToIp(ip, port);
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
  router.use((err, req, res, _next) => {
    logger.error('API route error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return router;
}