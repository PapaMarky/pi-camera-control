import { Router } from 'express';
import { logger } from '../utils/logger.js';
import { IntervalometerSession } from '../intervalometer/session.js';

export function createApiRouter(cameraController, powerManager, server) {
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

  // Error handling middleware for API routes
  router.use((err, req, res, next) => {
    logger.error('API route error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return router;
}