#!/usr/bin/env node

import express from "express";
import { WebSocketServer } from "ws";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import { createServer } from "http";
import dotenv from "dotenv";
import { logger } from "./utils/logger.js";
// import { CameraController } from './camera/controller.js'; // Unused import
import { DiscoveryManager } from "./discovery/manager.js";
import { PowerManager } from "./system/power.js";
import { NetworkStateManager } from "./network/state-manager.js";
// import { NetworkServiceManager } from './network/service-manager.js'; // Unused import
import { IntervalometerStateManager } from "./intervalometer/state-manager.js";
import { LiveViewManager } from "./camera/liveview-manager.js";
import { TestPhotoService } from "./camera/test-photo.js";
import { createApiRouter } from "./routes/api.js";
import { createWebSocketHandler } from "./websocket/handler.js";
import timeSyncService from "./timesync/service.js";
import { emitDiscoveryEvent } from "./utils/event-migration.js";
import { NetworkHealthMonitor } from "./network/health-monitor.js";

// Load environment variables
dotenv.config();

const PORT = process.env.PORT || 3000;
const CAMERA_IP = process.env.CAMERA_IP || "192.168.12.98";
const CAMERA_PORT = process.env.CAMERA_PORT || "443";

class CameraControlServer {
  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.wss = new WebSocketServer({ server: this.server });

    // Initialize discovery manager (camera state is managed within it)
    // Discovery is always enabled with fallback to hardcoded IP
    this.discoveryManager = new DiscoveryManager();
    this.setupDiscoveryHandlers();

    this.powerManager = new PowerManager();
    this.networkManager = new NetworkStateManager();

    // Initialize network health monitor (auto-detects wlan0 vs ap0)
    // Pass function to get last camera IP from connection history
    this.healthMonitor = new NetworkHealthMonitor(
      60000, // Check every 60 seconds
      () => this.discoveryManager.getLastSuccessfulIP(),
    );
    this.setupHealthMonitorHandlers();

    // Initialize centralized intervalometer state manager
    this.intervalometerStateManager = new IntervalometerStateManager();
    this.setupIntervalometerHandlers();

    // Initialize live view manager with camera controller getter function
    // LiveViewManager will call this function to get the current controller
    this.liveViewManager = new LiveViewManager(() =>
      this.getCurrentCameraController(),
    );

    // Initialize test photo service with camera controller getter function
    // wsHandler will be set in setupWebSocket()
    this.testPhotoService = new TestPhotoService(() =>
      this.getCurrentCameraController(),
    );

    // Keep legacy activeIntervalometerSession for backward compatibility
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
    this.discoveryManager.on("cameraDiscovered", (deviceInfo) => {
      logger.info(
        `Camera discovered: ${deviceInfo.modelName} at ${deviceInfo.ipAddress}`,
      );
      this.broadcastDiscoveryEvent("cameraDiscovered", deviceInfo);
    });

    this.discoveryManager.on(
      "cameraConnected",
      async ({ uuid, info, controller: _controller }) => {
        logger.info(`Camera connected: ${info.modelName}`);
        this.broadcastDiscoveryEvent("cameraConnected", { uuid, info });

        // Trigger camera time sync on connection
        await timeSyncService.handleCameraConnection();
      },
    );

    this.discoveryManager.on("cameraOffline", (uuid) => {
      logger.info(`Camera offline: ${uuid}`);
      this.broadcastDiscoveryEvent("cameraOffline", { uuid });
    });

    this.discoveryManager.on("primaryCameraChanged", async (primaryCamera) => {
      logger.info(`Primary camera changed: ${primaryCamera.info.modelName}`);
      this.broadcastDiscoveryEvent("primaryCameraChanged", {
        uuid: primaryCamera.uuid,
        info: primaryCamera.info,
      });

      // Update health monitor with camera IP
      this.healthMonitor.setCameraIP(primaryCamera.info.ipAddress);

      // Trigger camera time sync when primary camera changes (new camera connected)
      await timeSyncService.handleCameraConnection();
    });

    this.discoveryManager.on("primaryCameraDisconnected", () => {
      logger.warn("Primary camera disconnected");
      this.broadcastDiscoveryEvent("primaryCameraDisconnected", {});
    });

    this.discoveryManager.on("cameraError", (errorData) => {
      logger.error("Camera error event:", errorData);
      this.broadcastDiscoveryEvent("cameraError", errorData);
    });
  }

  setupHealthMonitorHandlers() {
    this.healthMonitor.on("interface-recovered", async ({ cameraIP }) => {
      logger.info(
        `Network interface recovered, attempting to reconnect to camera at ${cameraIP}`,
      );
      try {
        await this.discoveryManager.connectToIp(cameraIP);
        logger.info(`Successfully reconnected to camera at ${cameraIP}`);
      } catch (error) {
        logger.error(
          `Failed to reconnect to camera after interface recovery: ${error.message}`,
        );
      }
    });

    this.healthMonitor.on("recovery-failed", ({ error }) => {
      logger.error(`Network interface recovery failed: ${error}`);
    });
  }

  setupIntervalometerHandlers() {
    // Handle intervalometer state manager events
    this.intervalometerStateManager.on("sessionStarted", (data) => {
      logger.info(`Timelapse session started: ${data.title}`);
      this.broadcastTimelapseEvent("session_started", data);
    });

    this.intervalometerStateManager.on("sessionCompleted", (data) => {
      logger.info(`Timelapse session completed: ${data.title}`);
      this.broadcastTimelapseEvent("session_completed", data);
    });

    this.intervalometerStateManager.on("sessionStopped", (data) => {
      logger.info(`Timelapse session stopped: ${data.title}`);
      this.broadcastTimelapseEvent("session_stopped", data);
    });

    this.intervalometerStateManager.on("sessionError", (data) => {
      logger.error(`Timelapse session error: ${data.title} - ${data.reason}`);
      this.broadcastTimelapseEvent("session_error", data);
    });

    this.intervalometerStateManager.on("reportSaved", (data) => {
      logger.info(`Timelapse report saved: ${data.title}`);
      this.broadcastTimelapseEvent("report_saved", data);
    });

    this.intervalometerStateManager.on("reportDeleted", (data) => {
      logger.info(`Timelapse report deleted: ${data.reportId}`);
      this.broadcastTimelapseEvent("report_deleted", data);
    });

    this.intervalometerStateManager.on("unsavedSessionFound", (data) => {
      logger.info(`Unsaved session found: ${data.title}`);
      this.broadcastTimelapseEvent("unsaved_session_found", data);
    });
  }

  broadcastDiscoveryEvent(eventType, data) {
    if (!this.wsHandler || !this.wsHandler.broadcastDiscoveryEvent) {
      logger.debug(
        "No WebSocket handler available for broadcasting discovery events",
      );
      return;
    }

    // Use dual emission wrapper for migration (emits both old and new event names)
    emitDiscoveryEvent(
      this.wsHandler.broadcastDiscoveryEvent.bind(this.wsHandler),
      eventType,
      data,
    );
  }

  broadcastTimelapseEvent(eventType, data) {
    if (!this.wsHandler || !this.wsHandler.broadcastTimelapseEvent) {
      logger.debug(
        "No WebSocket handler available for broadcasting timelapse events",
      );
      return;
    }

    this.wsHandler.broadcastTimelapseEvent(eventType, data);
  }

  setupMiddleware() {
    // Security and performance middleware
    this.app.use(
      helmet({
        contentSecurityPolicy: false, // Allow inline scripts for development
      }),
    );
    this.app.use(compression());
    this.app.use(cors());

    // JSON parsing with size limits for Pi optimization
    this.app.use(express.json({ limit: "10mb" }));
    this.app.use(express.urlencoded({ extended: true, limit: "10mb" }));

    // Request logging
    this.app.use((req, res, next) => {
      logger.info(`${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.get("User-Agent"),
      });
      next();
    });
  }

  setupRoutes() {
    // API routes - pass discoveryManager and intervalometer state manager for enhanced functionality
    this.app.use(
      "/api",
      createApiRouter(
        () => this.getCurrentCameraController(), // Getter function for current camera controller
        this.powerManager,
        this,
        this.networkManager,
        this.discoveryManager,
        this.intervalometerStateManager,
        this.liveViewManager,
        this.testPhotoService,
      ),
    );

    // Serve static files (Phase 3 - web interface)
    this.app.use(express.static("public"));

    // Health check endpoint
    this.app.get("/health", (req, res) => {
      const currentController = this.getCurrentCameraController();
      const cameraStatus = currentController
        ? currentController.getConnectionStatus()
        : { connected: false, error: "No camera available" };

      res.json({
        status: "ok",
        timestamp: new Date().toISOString(),
        camera: cameraStatus,
        power: this.powerManager.getStatus(),
        discovery: this.discoveryManager
          ? this.discoveryManager.getStatus()
          : null,
        uptime: process.uptime(),
      });
    });

    // Fallback for SPA routing (Phase 3) - exclude API routes
    this.app.get("*", (req, res) => {
      // Don't serve HTML for API routes - let them return proper 404
      if (req.path.startsWith("/api/")) {
        return res.status(404).json({ error: "API endpoint not found" });
      }

      // Serve index.html for SPA routes
      res.sendFile("index.html", { root: "public" }, (err) => {
        if (err) {
          res.status(404).json({ error: "Not found" });
        }
      });
    });
  }

  setupWebSocket() {
    this.wsHandler = createWebSocketHandler(
      () => this.getCurrentCameraController(), // Getter function for current camera controller
      this.powerManager,
      this,
      this.networkManager,
      this.discoveryManager,
      this.intervalometerStateManager,
      this.liveViewManager,
      timeSyncService,
    );
    this.wss.on("connection", this.wsHandler);

    // Set wsHandler in test photo service for progress broadcasting
    this.testPhotoService.wsHandler = this.wsHandler;

    logger.info("WebSocket server initialized");
  }

  broadcastCameraStatusChange(_status) {
    if (!this.wsHandler || !this.wsHandler.broadcastStatus) {
      logger.debug(
        "No WebSocket handler available for broadcasting camera status",
      );
      return;
    }

    logger.info("Broadcasting immediate camera status change to all clients");
    this.wsHandler.broadcastStatus();
  }

  setupErrorHandling() {
    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({ error: "Endpoint not found" });
    });

    // Global error handler
    this.app.use((err, req, res, _next) => {
      logger.error("Unhandled error:", err);
      res.status(500).json({
        error: "Internal server error",
        message:
          process.env.NODE_ENV === "development" ? err.message : undefined,
      });
    });

    // Graceful shutdown
    process.on("SIGTERM", () => this.shutdown("SIGTERM"));
    process.on("SIGINT", () => this.shutdown("SIGINT"));
  }

  // Get current camera controller from appropriate source
  getCurrentCameraController() {
    return this.discoveryManager.getPrimaryCamera();
  }

  async start() {
    try {
      // Initialize discovery manager (including connection history)
      await this.discoveryManager.initialize();

      // Initialize camera discovery (always enabled)
      logger.info("Starting UPnP camera discovery...");
      const discoveryStarted = await this.discoveryManager.startDiscovery();
      if (!discoveryStarted) {
        logger.warn(
          "UPnP discovery failed to start - falling back to manual connection",
        );
        // Fallback to manual connection
        try {
          await this.discoveryManager.connectToIp(CAMERA_IP, CAMERA_PORT);
        } catch (error) {
          logger.warn("Fallback camera connection failed:", error.message);
        }
      }

      // Start power monitoring
      await this.powerManager.initialize();

      // Initialize network manager
      const networkInitialized = await this.networkManager.initialize();
      if (!networkInitialized) {
        logger.warn(
          "Network manager initialization failed - network features may not work",
        );
      } else {
        logger.info("Network manager initialized successfully");
      }

      // Start network health monitor (only on Linux/Pi)
      if (process.platform === "linux") {
        this.healthMonitor.start();
        logger.info("Network health monitor started");
      } else {
        logger.debug("Network health monitor disabled (not running on Linux)");
      }

      // Initialize intervalometer state manager
      const intervalometerInitialized =
        await this.intervalometerStateManager.initialize();
      if (!intervalometerInitialized) {
        logger.warn(
          "Intervalometer state manager initialization failed - timelapse reporting may not work",
        );
      } else {
        logger.info("Intervalometer state manager initialized successfully");
      }

      // Start server (IPv4 only when IPv6 is disabled system-wide)
      // Bind to all interfaces (0.0.0.0) so server is accessible from both WiFi and AP networks
      this.server.listen(PORT, "0.0.0.0", () => {
        const discoveryInfo = this.discoveryManager
          ? `discovery enabled (fallback: ${CAMERA_IP}:${CAMERA_PORT})`
          : `direct connection: ${CAMERA_IP}:${CAMERA_PORT}`;

        logger.info(`Camera Control Server started on port ${PORT}`, {
          environment: process.env.NODE_ENV || "development",
          camera: discoveryInfo,
          discovery: !!this.discoveryManager,
          pid: process.pid,
        });

        // Initialize TimeSync service after server is listening
        const getCameraController = () =>
          this.discoveryManager.getPrimaryController();

        // Create WebSocket manager interface for TimeSync
        const wsManager = {
          broadcast: (message) => {
            // Handle different message types appropriately
            if (message.type === "activity_log") {
              // Broadcast activity log messages to all clients
              if (this.wsHandler && this.wsHandler.broadcastActivityLog) {
                this.wsHandler.broadcastActivityLog(message.data);
              }
            } else if (message.type === "time-sync-status") {
              // Broadcast time sync status directly to all clients
              if (this.wsHandler && this.wsHandler.broadcast) {
                this.wsHandler.broadcast(JSON.stringify(message));
              }
            } else {
              // Use the existing broadcastNetworkEvent method for other messages
              if (this.wsHandler && this.wsHandler.broadcastNetworkEvent) {
                this.wsHandler.broadcastNetworkEvent(
                  "time_sync_update",
                  message,
                );
              }
            }
          },
        };

        timeSyncService.initialize(wsManager, getCameraController);
        logger.info("TimeSync service initialized after server start");
      });
    } catch (error) {
      logger.error("Failed to start server:", error);
      process.exit(1);
    }
  }

  async shutdown(signal) {
    logger.info(`Received ${signal}, shutting down gracefully...`);

    // Stop accepting new connections
    this.server.close(() => {
      logger.info("HTTP server closed");
    });

    // Close WebSocket connections
    this.wss.clients.forEach((client) => {
      client.terminate();
    });

    // Cleanup TimeSync service
    timeSyncService.cleanup();

    // Cleanup discovery, camera and power monitoring
    await this.discoveryManager.stopDiscovery();
    await this.powerManager.cleanup();
    await this.networkManager.cleanup();

    // Cleanup intervalometer state manager
    await this.intervalometerStateManager.cleanup();

    logger.info("Graceful shutdown complete");
    process.exit(0);
  }
}

// Start server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new CameraControlServer();
  server.start();
}

export { CameraControlServer };
