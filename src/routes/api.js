import { Router } from 'express';
import { logger } from '../utils/logger.js';

export function createApiRouter(cameraController, powerManager) {
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

  // Intervalometer control (placeholder for Phase 2 expansion)
  router.post('/intervalometer/start', async (req, res) => {
    try {
      const { interval, shots, stopTime } = req.body;
      
      // Validation
      if (!interval || interval <= 0) {
        return res.status(400).json({ error: 'Invalid interval value' });
      }
      
      // Validate against camera settings
      const validation = await cameraController.validateInterval(interval);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }
      
      // TODO: Implement intervalometer session management
      // For now, just acknowledge the request
      logger.info('Intervalometer start requested', { interval, shots, stopTime });
      
      res.json({ 
        success: true, 
        message: 'Intervalometer functionality coming in Phase 2 expansion',
        params: { interval, shots, stopTime }
      });
    } catch (error) {
      logger.error('Failed to start intervalometer:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/intervalometer/stop', (req, res) => {
    // TODO: Implement intervalometer session management
    res.json({ success: true, message: 'Stop command acknowledged' });
  });

  router.get('/intervalometer/status', (req, res) => {
    // TODO: Return actual intervalometer status
    res.json({ 
      running: false, 
      message: 'Intervalometer status coming in Phase 2 expansion' 
    });
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
      res.json({
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        platform: process.platform,
        nodeVersion: process.version,
        timestamp: new Date().toISOString()
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