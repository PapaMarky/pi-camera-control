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
import { DiscoveryManager } from './discovery/manager.js';
import { PowerManager } from './system/power.js';
import { NetworkManager } from './network/manager.js';
import { createApiRouter } from './routes/api.js';
import { createWebSocketHandler } from './websocket/handler.js';

// Load environment variables
dotenv.config();

const PORT = process.env.PORT || 3000;
const CAMERA_IP = process.env.CAMERA_IP || '192.168.12.98';
const CAMERA_PORT = process.env.CAMERA_PORT || '443';
const USE_DISCOVERY = process.env.USE_DISCOVERY !== 'false'; // Enable discovery by default

class CameraControlServer {
  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.wss = new WebSocketServer({ server: this.server });
    
    // Initialize discovery manager or fallback to direct camera connection
    if (USE_DISCOVERY) {
      this.discoveryManager = new DiscoveryManager();
      this.cameraController = null; // Will be set by discovery
      this.setupDiscoveryHandlers();
    } else {
      // Fallback to hardcoded camera connection
      this.discoveryManager = null;
      this.cameraController = new CameraController(CAMERA_IP, CAMERA_PORT, (status) => {
        this.broadcastCameraStatusChange(status);
      });
    }
    
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

  setupDiscoveryHandlers() {
    // Handle camera discovery events
    this.discoveryManager.on('cameraDiscovered', (deviceInfo) => {
      logger.info(`Camera discovered: ${deviceInfo.modelName} at ${deviceInfo.ipAddress}`);
      this.broadcastDiscoveryEvent('cameraDiscovered', deviceInfo);
    });

    this.discoveryManager.on('cameraConnected', ({ uuid, info, controller }) => {
      // Set as primary camera if none exists
      if (!this.cameraController) {
        this.cameraController = controller;
        logger.info(`Set primary camera: ${info.modelName}`);
      }
      this.broadcastDiscoveryEvent('cameraConnected', { uuid, info });
    });

    this.discoveryManager.on('cameraOffline', (uuid) => {
      logger.info(`Camera offline: ${uuid}`);
      this.broadcastDiscoveryEvent('cameraOffline', { uuid });
    });

    this.discoveryManager.on('primaryCameraChanged', (primaryCamera) => {
      this.cameraController = primaryCamera.controller;
      logger.info(`Primary camera changed: ${primaryCamera.info.modelName}`);
      this.broadcastDiscoveryEvent('primaryCameraChanged', {
        uuid: primaryCamera.uuid,
        info: primaryCamera.info
      });
    });

    this.discoveryManager.on('primaryCameraDisconnected', () => {
      this.cameraController = null;
      logger.warn('Primary camera disconnected');
      this.broadcastDiscoveryEvent('primaryCameraDisconnected', {});
    });
  }

  broadcastDiscoveryEvent(eventType, data) {
    if (!this.wsHandler || !this.wsHandler.broadcastDiscoveryEvent) {
      logger.debug('No WebSocket handler available for broadcasting discovery events');
      return;
    }
    
    this.wsHandler.broadcastDiscoveryEvent(eventType, data);
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
    // API routes - pass discoveryManager for enhanced functionality
    this.app.use('/api', createApiRouter(
      () => this.cameraController, // Getter function for dynamic camera controller
      this.powerManager, 
      this, 
      this.networkManager,
      this.discoveryManager
    ));
    
    // Serve static files (Phase 3 - web interface)
    this.app.use(express.static('public'));
    
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      const cameraStatus = this.cameraController 
        ? this.cameraController.getConnectionStatus() 
        : { connected: false, error: 'No camera available' };
      
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        camera: cameraStatus,
        power: this.powerManager.getStatus(),
        discovery: this.discoveryManager ? this.discoveryManager.getStatus() : null,
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
    this.wsHandler = createWebSocketHandler(
      () => this.cameraController, // Getter function for dynamic camera controller
      this.powerManager, 
      this, 
      this.networkManager,
      this.discoveryManager
    );
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
      // Initialize camera connection or discovery
      if (this.discoveryManager) {
        // Start UPnP discovery
        logger.info('Starting UPnP camera discovery...');
        const discoveryStarted = await this.discoveryManager.startDiscovery();
        if (!discoveryStarted) {
          logger.warn('UPnP discovery failed to start - falling back to manual connection');
          // Fallback to manual connection
          try {
            await this.discoveryManager.connectToIp(CAMERA_IP, CAMERA_PORT);
          } catch (error) {
            logger.warn('Fallback camera connection failed:', error.message);
          }
        }
      } else {
        // Direct camera connection (legacy mode)
        const cameraInitialized = await this.cameraController.initialize();
        if (!cameraInitialized) {
          logger.warn('Camera initialization failed - server will continue with connection attempts');
        }
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
      
      // Start server (IPv4 only when IPv6 is disabled system-wide)
      this.server.listen(PORT, () => {
        const discoveryInfo = this.discoveryManager 
          ? `discovery enabled (fallback: ${CAMERA_IP}:${CAMERA_PORT})`
          : `direct connection: ${CAMERA_IP}:${CAMERA_PORT}`;
          
        logger.info(`Camera Control Server started on port ${PORT}`, {
          environment: process.env.NODE_ENV || 'development',
          camera: discoveryInfo,
          discovery: !!this.discoveryManager,
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
    
    // Cleanup discovery, camera and power monitoring
    if (this.discoveryManager) {
      await this.discoveryManager.stopDiscovery();
    }
    if (this.cameraController) {
      await this.cameraController.cleanup();
    }
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