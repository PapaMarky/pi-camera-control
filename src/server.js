#!/usr/bin/env node

import express from 'express';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { createServer } from 'http';
import dotenv from 'dotenv';
import { logger } from './utils/logger.js';
import { CameraController } from './camera/controller.js';
import { PowerManager } from './system/power.js';
import { NetworkManager } from './network/manager.js';
import { createApiRouter } from './routes/api.js';
import { createWebSocketHandler } from './websocket/handler.js';

// Load environment variables
dotenv.config();

const PORT = process.env.PORT || 3000;
const CAMERA_IP = process.env.CAMERA_IP || '192.168.12.98';
const CAMERA_PORT = process.env.CAMERA_PORT || '443';

class CameraControlServer {
  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.wss = new WebSocketServer({ server: this.server });
    
    // Initialize camera controller with disconnection callback
    this.cameraController = new CameraController(CAMERA_IP, CAMERA_PORT, (status) => {
      this.broadcastCameraStatusChange(status);
    });
    this.powerManager = new PowerManager();
    this.networkManager = new NetworkManager();
    
    // Shared intervalometer session across WebSocket and REST API
    this.activeIntervalometerSession = null;
    // Store WebSocket handler for broadcasting
    this.wsHandler = null;
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
    this.setupErrorHandling();
  }

  setupMiddleware() {
    // Security and performance middleware
    this.app.use(helmet({
      contentSecurityPolicy: false // Allow inline scripts for development
    }));
    this.app.use(compression());
    this.app.use(cors());
    
    // JSON parsing with size limits for Pi optimization
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    
    // Request logging
    this.app.use((req, res, next) => {
      logger.info(`${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      next();
    });
  }

  setupRoutes() {
    // API routes
    this.app.use('/api', createApiRouter(this.cameraController, this.powerManager, this, this.networkManager));
    
    // Serve static files (Phase 3 - web interface)
    this.app.use(express.static('public'));
    
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        camera: this.cameraController.getConnectionStatus(),
        power: this.powerManager.getStatus(),
        uptime: process.uptime()
      });
    });
    
    // Fallback for SPA routing (Phase 3)
    this.app.get('*', (req, res) => {
      res.sendFile('index.html', { root: 'public' }, (err) => {
        if (err) {
          res.status(404).json({ error: 'Not found' });
        }
      });
    });
  }

  setupWebSocket() {
    this.wsHandler = createWebSocketHandler(this.cameraController, this.powerManager, this, this.networkManager);
    this.wss.on('connection', this.wsHandler);
    
    logger.info('WebSocket server initialized');
  }

  broadcastCameraStatusChange(status) {
    if (!this.wsHandler || !this.wsHandler.broadcastStatus) {
      logger.debug('No WebSocket handler available for broadcasting camera status');
      return;
    }
    
    logger.info('Broadcasting immediate camera status change to all clients');
    this.wsHandler.broadcastStatus();
  }

  setupErrorHandling() {
    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({ error: 'Endpoint not found' });
    });
    
    // Global error handler
    this.app.use((err, req, res, next) => {
      logger.error('Unhandled error:', err);
      res.status(500).json({ 
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
      });
    });
    
    // Graceful shutdown
    process.on('SIGTERM', () => this.shutdown('SIGTERM'));
    process.on('SIGINT', () => this.shutdown('SIGINT'));
  }

  async start() {
    try {
      // Initialize camera connection (don't fail server if camera fails)
      const cameraInitialized = await this.cameraController.initialize();
      if (!cameraInitialized) {
        logger.warn('Camera initialization failed - server will continue with connection attempts');
      }
      
      // Start power monitoring
      await this.powerManager.initialize();
      
      // Initialize network manager
      const networkInitialized = await this.networkManager.initialize();
      if (!networkInitialized) {
        logger.warn('Network manager initialization failed - network features may not work');
      } else {
        logger.info('Network manager initialized successfully');
      }
      
      // Start server
      this.server.listen(PORT, () => {
        logger.info(`Camera Control Server started on port ${PORT}`, {
          environment: process.env.NODE_ENV || 'development',
          camera: `${CAMERA_IP}:${CAMERA_PORT}`,
          cameraConnected: cameraInitialized,
          pid: process.pid
        });
      });
      
    } catch (error) {
      logger.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  async shutdown(signal) {
    logger.info(`Received ${signal}, shutting down gracefully...`);
    
    // Stop accepting new connections
    this.server.close(() => {
      logger.info('HTTP server closed');
    });
    
    // Close WebSocket connections
    this.wss.clients.forEach((client) => {
      client.terminate();
    });
    
    // Cleanup camera and power monitoring
    await this.cameraController.cleanup();
    await this.powerManager.cleanup();
    await this.networkManager.cleanup();
    
    logger.info('Graceful shutdown complete');
    process.exit(0);
  }
}

// Start server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new CameraControlServer();
  server.start();
}

export { CameraControlServer };