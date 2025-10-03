import { Router } from "express";
import { logger } from "../utils/logger.js";
import {
  createApiError,
  ErrorCodes,
  Components,
} from "../utils/error-handlers.js";

export function createApiRouter(
  getCameraController,
  powerManager,
  server,
  networkStateManager,
  discoveryManager,
  intervalometerStateManager,
  liveViewManager,
  testPhotoService,
) {
  const router = Router();

  // Camera status and connection
  router.get("/camera/status", (req, res) => {
    try {
      const currentController = getCameraController();
      if (!currentController) {
        // Return specification-compliant response even when no camera
        return res.json({
          connected: false,
          ip: null,
          port: null,
          lastError: "No camera available",
          shutterEndpoint: null,
          hasCapabilities: false,
        });
      }
      const status = currentController.getConnectionStatus();
      res.json(status);
    } catch (error) {
      logger.error("Failed to get camera status:", error);
      res.status(500).json(
        createApiError("Failed to get camera status", {
          code: ErrorCodes.SYSTEM_ERROR,
          component: Components.API_ROUTER,
          operation: "getCameraStatus",
        }),
      );
    }
  });

  // Camera settings
  router.get("/camera/settings", async (req, res) => {
    try {
      const currentController = getCameraController();
      if (!currentController) {
        return res.status(503).json(
          createApiError("No camera available", {
            code: ErrorCodes.CAMERA_OFFLINE,
            component: Components.API_ROUTER,
            operation: "getCameraSettings",
          }),
        );
      }
      const settings = await currentController.getCameraSettings();
      res.json(settings);
    } catch (error) {
      logger.error("Failed to get camera settings:", error);
      res.status(500).json(
        createApiError(error.message, {
          code: ErrorCodes.SYSTEM_ERROR,
          component: Components.API_ROUTER,
          operation: "getCameraSettings",
        }),
      );
    }
  });

  // Update a specific camera setting
  router.put("/camera/settings/:setting", async (req, res) => {
    try {
      const currentController = getCameraController();
      if (!currentController) {
        return res.status(503).json(
          createApiError("No camera available", {
            code: ErrorCodes.CAMERA_OFFLINE,
            component: Components.API_ROUTER,
            operation: "updateCameraSetting",
          }),
        );
      }

      const { setting } = req.params;
      const { value } = req.body;

      if (!value) {
        return res.status(400).json(
          createApiError("Missing value in request body", {
            code: ErrorCodes.INVALID_PARAMETER,
            component: Components.API_ROUTER,
            operation: "updateCameraSetting",
          }),
        );
      }

      await currentController.updateCameraSetting(setting, value);
      res.json({
        success: true,
        message: `Setting ${setting} updated to ${value}`,
        setting,
        value,
      });
    } catch (error) {
      logger.error(
        `Failed to update camera setting ${req.params.setting}:`,
        error,
      );
      res.status(500).json(
        createApiError(error.message, {
          code: ErrorCodes.SYSTEM_ERROR,
          component: Components.API_ROUTER,
          operation: "updateCameraSetting",
        }),
      );
    }
  });

  // Camera battery status
  router.get("/camera/battery", async (req, res) => {
    try {
      const currentController = getCameraController();
      if (!currentController) {
        return res.status(503).json(
          createApiError("No camera available", {
            code: ErrorCodes.CAMERA_OFFLINE,
            component: Components.API_ROUTER,
            operation: "getCameraBattery",
          }),
        );
      }
      const battery = await currentController.getCameraBattery();
      res.json(battery);
    } catch (error) {
      logger.error("Failed to get camera battery:", error);
      res.status(500).json(
        createApiError(error.message, {
          code: ErrorCodes.SYSTEM_ERROR,
          component: Components.API_ROUTER,
          operation: "getCameraBattery",
        }),
      );
    }
  });

  // Get camera datetime with timezone and DST information
  router.get("/camera/datetime", async (req, res) => {
    try {
      const currentController = getCameraController();
      if (!currentController) {
        return res.status(503).json(
          createApiError("No camera available", {
            code: ErrorCodes.CAMERA_OFFLINE,
            component: Components.API_ROUTER,
            operation: "getCameraDateTime",
          }),
        );
      }
      const datetimeDetails =
        await currentController.getCameraDateTimeDetails();
      res.json(datetimeDetails);
    } catch (error) {
      logger.error("Failed to get camera datetime:", error);
      res.status(500).json(
        createApiError(error.message, {
          code: ErrorCodes.SYSTEM_ERROR,
          component: Components.API_ROUTER,
          operation: "getCameraDateTime",
        }),
      );
    }
  });

  // Live View capture - capture a preview image from camera
  router.post("/camera/liveview/capture", async (req, res) => {
    try {
      const currentController = getCameraController();
      if (!currentController) {
        return res.status(503).json(
          createApiError("No camera available", {
            code: ErrorCodes.CAMERA_OFFLINE,
            component: Components.API_ROUTER,
            operation: "captureLiveView",
          }),
        );
      }

      const capture = await liveViewManager.captureImage();
      res.json(capture);
    } catch (error) {
      logger.error("Failed to capture live view image:", error);
      // Use the error's status code if available, otherwise default to 500
      const statusCode = error.status || 500;
      res.status(statusCode).json(
        createApiError(error.message, {
          code: ErrorCodes.PHOTO_FAILED,
          component: Components.API_ROUTER,
          operation: "captureLiveView",
        }),
      );
    }
  });

  // List all live view captures
  router.get("/camera/liveview/images", (req, res) => {
    try {
      const captures = liveViewManager.listCaptures();
      res.json({ captures });
    } catch (error) {
      logger.error("Failed to list live view captures:", error);
      res.status(500).json(
        createApiError(error.message, {
          code: ErrorCodes.SYSTEM_ERROR,
          component: Components.API_ROUTER,
          operation: "listLiveViewCaptures",
        }),
      );
    }
  });

  // Get specific live view capture metadata by ID
  router.get("/camera/liveview/images/:id", (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json(
          createApiError("Invalid capture ID", {
            code: ErrorCodes.INVALID_PARAMETER,
            component: Components.API_ROUTER,
            operation: "getLiveViewCapture",
          }),
        );
      }

      const capture = liveViewManager.getCapture(id);
      if (!capture) {
        return res.status(404).json(
          createApiError("Capture not found", {
            code: ErrorCodes.SESSION_NOT_FOUND,
            component: Components.API_ROUTER,
            operation: "getLiveViewCapture",
          }),
        );
      }

      res.json(capture);
    } catch (error) {
      logger.error("Failed to get live view capture:", error);
      res.status(500).json(
        createApiError(error.message, {
          code: ErrorCodes.SYSTEM_ERROR,
          component: Components.API_ROUTER,
          operation: "getLiveViewCapture",
        }),
      );
    }
  });

  // Serve live view image file
  router.get("/camera/liveview/images/:id/file", (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json(
          createApiError("Invalid capture ID", {
            code: ErrorCodes.INVALID_PARAMETER,
            component: Components.API_ROUTER,
            operation: "getLiveViewImageFile",
          }),
        );
      }

      const capture = liveViewManager.getCapture(id);
      if (!capture) {
        return res.status(404).json(
          createApiError("Capture not found", {
            code: ErrorCodes.SESSION_NOT_FOUND,
            component: Components.API_ROUTER,
            operation: "getLiveViewImageFile",
          }),
        );
      }

      res.sendFile(capture.filepath, (err) => {
        if (err) {
          logger.error("Failed to send live view image file:", err);
          if (!res.headersSent) {
            res.status(404).json(
              createApiError("Image file not found", {
                code: ErrorCodes.SESSION_NOT_FOUND,
                component: Components.API_ROUTER,
                operation: "getLiveViewImageFile",
              }),
            );
          }
        }
      });
    } catch (error) {
      logger.error("Failed to serve live view image:", error);
      res.status(500).json(
        createApiError(error.message, {
          code: ErrorCodes.SYSTEM_ERROR,
          component: Components.API_ROUTER,
          operation: "getLiveViewImageFile",
        }),
      );
    }
  });

  // Delete a specific live view capture
  router.delete("/camera/liveview/images/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json(
          createApiError("Invalid capture ID", {
            code: ErrorCodes.INVALID_PARAMETER,
            component: Components.API_ROUTER,
            operation: "deleteLiveViewCapture",
          }),
        );
      }

      const deleted = await liveViewManager.deleteCapture(id);
      if (!deleted) {
        return res.status(404).json(
          createApiError("Capture not found", {
            code: ErrorCodes.SESSION_NOT_FOUND,
            component: Components.API_ROUTER,
            operation: "deleteLiveViewCapture",
          }),
        );
      }

      res.json({ success: true, message: "Live view capture deleted", id });
    } catch (error) {
      logger.error("Failed to delete live view capture:", error);
      res.status(500).json(
        createApiError(error.message, {
          code: ErrorCodes.SYSTEM_ERROR,
          component: Components.API_ROUTER,
          operation: "deleteLiveViewCapture",
        }),
      );
    }
  });

  // Clear all live view captures
  router.delete("/camera/liveview/clear", async (req, res) => {
    try {
      await liveViewManager.clearAll();
      res.json({ success: true, message: "All live view captures cleared" });
    } catch (error) {
      logger.error("Failed to clear live view captures:", error);
      res.status(500).json(
        createApiError(error.message, {
          code: ErrorCodes.SYSTEM_ERROR,
          component: Components.API_ROUTER,
          operation: "clearLiveViewCaptures",
        }),
      );
    }
  });

  // ===== Test Photo Capture Endpoints =====

  // Capture test photo with EXIF metadata
  router.post("/camera/photos/test", async (req, res) => {
    try {
      const currentController = getCameraController();
      if (!currentController) {
        return res.status(503).json(
          createApiError("No camera available", {
            code: ErrorCodes.CAMERA_OFFLINE,
            component: Components.API_ROUTER,
            operation: "captureTestPhoto",
          }),
        );
      }

      const photo = await testPhotoService.capturePhoto();
      res.json(photo);
    } catch (error) {
      logger.error("Failed to capture test photo:", error);
      const statusCode = typeof error.status === 'number' ? error.status : 500;
      res.status(statusCode).json(
        createApiError(error.message, {
          code: ErrorCodes.PHOTO_FAILED,
          component: Components.API_ROUTER,
          operation: "captureTestPhoto",
        }),
      );
    }
  });

  // List all test photos
  router.get("/camera/photos/test", (req, res) => {
    try {
      const photos = testPhotoService.listPhotos();
      res.json({ photos });
    } catch (error) {
      logger.error("Failed to list test photos:", error);
      res.status(500).json(
        createApiError(error.message, {
          code: ErrorCodes.SYSTEM_ERROR,
          component: Components.API_ROUTER,
          operation: "listTestPhotos",
        }),
      );
    }
  });

  // Get specific test photo metadata by ID
  router.get("/camera/photos/test/:id", (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json(
          createApiError("Invalid photo ID", {
            code: ErrorCodes.INVALID_PARAMETER,
            component: Components.API_ROUTER,
            operation: "getTestPhoto",
          }),
        );
      }

      const photo = testPhotoService.getPhoto(id);
      if (!photo) {
        return res.status(404).json(
          createApiError("Photo not found", {
            code: ErrorCodes.SESSION_NOT_FOUND,
            component: Components.API_ROUTER,
            operation: "getTestPhoto",
          }),
        );
      }

      res.json(photo);
    } catch (error) {
      logger.error("Failed to get test photo:", error);
      res.status(500).json(
        createApiError(error.message, {
          code: ErrorCodes.SYSTEM_ERROR,
          component: Components.API_ROUTER,
          operation: "getTestPhoto",
        }),
      );
    }
  });

  // Serve test photo image file
  router.get("/camera/photos/test/:id/file", (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json(
          createApiError("Invalid photo ID", {
            code: ErrorCodes.INVALID_PARAMETER,
            component: Components.API_ROUTER,
            operation: "getTestPhotoFile",
          }),
        );
      }

      const photo = testPhotoService.getPhoto(id);
      if (!photo) {
        return res.status(404).json(
          createApiError("Photo not found", {
            code: ErrorCodes.SESSION_NOT_FOUND,
            component: Components.API_ROUTER,
            operation: "getTestPhotoFile",
          }),
        );
      }

      res.sendFile(photo.filepath, (err) => {
        if (err) {
          logger.error("Failed to send test photo file:", err);
          if (!res.headersSent) {
            res.status(404).json(
              createApiError("Photo file not found", {
                code: ErrorCodes.SESSION_NOT_FOUND,
                component: Components.API_ROUTER,
                operation: "getTestPhotoFile",
              }),
            );
          }
        }
      });
    } catch (error) {
      logger.error("Failed to serve test photo:", error);
      res.status(500).json(
        createApiError(error.message, {
          code: ErrorCodes.SYSTEM_ERROR,
          component: Components.API_ROUTER,
          operation: "getTestPhotoFile",
        }),
      );
    }
  });

  // Delete a specific test photo
  router.delete("/camera/photos/test/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json(
          createApiError("Invalid photo ID", {
            code: ErrorCodes.INVALID_PARAMETER,
            component: Components.API_ROUTER,
            operation: "deleteTestPhoto",
          }),
        );
      }

      const deleted = await testPhotoService.deletePhoto(id);
      if (!deleted) {
        return res.status(404).json(
          createApiError("Photo not found", {
            code: ErrorCodes.SESSION_NOT_FOUND,
            component: Components.API_ROUTER,
            operation: "deleteTestPhoto",
          }),
        );
      }

      res.json({ success: true, message: "Test photo deleted", id });
    } catch (error) {
      logger.error("Failed to delete test photo:", error);
      res.status(500).json(
        createApiError(error.message, {
          code: ErrorCodes.SYSTEM_ERROR,
          component: Components.API_ROUTER,
          operation: "deleteTestPhoto",
        }),
      );
    }
  });

  // Debug endpoint to see all available CCAPI endpoints
  router.get("/camera/debug/endpoints", (req, res) => {
    try {
      const currentController = getCameraController();
      if (!currentController) {
        return res.status(503).json(
          createApiError("No camera available", {
            code: ErrorCodes.CAMERA_OFFLINE,
            component: Components.API_ROUTER,
            operation: "getCameraDebugEndpoints",
          }),
        );
      }
      const status = currentController.getConnectionStatus();
      res.json({
        connected: status.connected,
        baseUrl: `https://${status.ip}:${status.port}`,
        capabilities: currentController.capabilities,
        shutterEndpoint: status.shutterEndpoint,
      });
    } catch (error) {
      logger.error("Failed to get camera debug info:", error);
      res.status(500).json(
        createApiError("Failed to get camera debug info", {
          code: ErrorCodes.SYSTEM_ERROR,
          component: Components.API_ROUTER,
          operation: "getCameraDebugEndpoints",
        }),
      );
    }
  });

  // Take a single photo
  router.post("/camera/photo", async (req, res) => {
    try {
      const currentController = getCameraController();
      if (!currentController) {
        return res.status(503).json(
          createApiError("No camera available", {
            code: ErrorCodes.CAMERA_OFFLINE,
            component: Components.API_ROUTER,
            operation: "takePhoto",
          }),
        );
      }
      await currentController.takePhoto();
      res.json({ success: true, timestamp: new Date().toISOString() });
    } catch (error) {
      logger.error("Failed to take photo:", error);
      res.status(500).json(
        createApiError(error.message, {
          code: ErrorCodes.PHOTO_FAILED,
          component: Components.API_ROUTER,
          operation: "takePhoto",
        }),
      );
    }
  });

  // Manual reconnect trigger
  router.post("/camera/reconnect", async (req, res) => {
    try {
      logger.info("Manual reconnect requested");
      const currentController = getCameraController();
      if (!currentController) {
        return res.status(503).json(
          createApiError("No camera available", {
            code: ErrorCodes.CAMERA_OFFLINE,
            component: Components.API_ROUTER,
            operation: "manualReconnect",
          }),
        );
      }
      const result = await currentController.manualReconnect();

      if (result) {
        res.json({ success: true, message: "Reconnection successful" });
      } else {
        res.json({ success: false, error: "Reconnection failed" });
      }
    } catch (error) {
      logger.error("Failed to reconnect to camera:", error);
      res.status(500).json(
        createApiError(error.message, {
          code: ErrorCodes.CONNECTION_FAILED,
          component: Components.API_ROUTER,
          operation: "manualReconnect",
        }),
      );
    }
  });

  // Update camera IP and port configuration
  router.post("/camera/configure", async (req, res) => {
    try {
      const { ip, port = "443" } = req.body;

      // Validate IP address format
      if (!ip || typeof ip !== "string") {
        return res.status(400).json(
          createApiError("IP address is required", {
            code: ErrorCodes.INVALID_PARAMETER,
            component: Components.API_ROUTER,
            operation: "configureCam",
            details: { success: false },
          }),
        );
      }

      // Basic IP address validation
      const ipRegex =
        /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
      if (!ipRegex.test(ip)) {
        return res.status(400).json(
          createApiError("Invalid IP address format", {
            code: ErrorCodes.INVALID_PARAMETER,
            component: Components.API_ROUTER,
            operation: "configureCamera",
            details: { success: false },
          }),
        );
      }

      // Validate port
      const portNum = parseInt(port);
      if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
        return res.status(400).json(
          createApiError("Port must be between 1 and 65535", {
            code: ErrorCodes.INVALID_PARAMETER,
            component: Components.API_ROUTER,
            operation: "configureCamera",
            details: { success: false },
          }),
        );
      }

      logger.info(`Camera configuration update requested: ${ip}:${port}`);
      const currentController = getCameraController();
      if (!currentController) {
        return res.status(503).json(
          createApiError("No camera available", {
            code: ErrorCodes.CAMERA_OFFLINE,
            component: Components.API_ROUTER,
            operation: "configureCamera",
          }),
        );
      }
      const result = await currentController.updateConfiguration(
        ip,
        port.toString(),
      );

      if (result) {
        res.json({
          success: true,
          message: "Camera configuration updated successfully",
          configuration: { ip, port },
        });
      } else {
        res.json({
          success: false,
          error: "Failed to connect to camera with new configuration",
        });
      }
    } catch (error) {
      logger.error("Failed to update camera configuration:", error);
      res.status(500).json(
        createApiError(error.message, {
          code: ErrorCodes.SYSTEM_ERROR,
          component: Components.API_ROUTER,
          operation: "configureCamera",
          details: { success: false },
        }),
      );
    }
  });

  // Intervalometer control
  router.post("/intervalometer/start", async (req, res) => {
    try {
      const { interval, shots, stopTime, stopCondition, title } = req.body;

      // Validation
      if (!interval || interval <= 0) {
        return res.status(400).json(
          createApiError("Invalid interval value", {
            code: ErrorCodes.INVALID_PARAMETER,
            component: Components.API_ROUTER,
            operation: "startIntervalometer",
          }),
        );
      }

      // Validate stopCondition (required)
      if (!stopCondition) {
        return res.status(400).json(
          createApiError("stopCondition is required", {
            code: ErrorCodes.INVALID_PARAMETER,
            component: Components.API_ROUTER,
            operation: "startIntervalometer",
            details: {
              validValues: ["unlimited", "stop-after", "stop-at"],
            },
          }),
        );
      }

      const validStopConditions = ["unlimited", "stop-after", "stop-at"];
      if (!validStopConditions.includes(stopCondition)) {
        return res.status(400).json(
          createApiError(`Invalid stopCondition: ${stopCondition}`, {
            code: ErrorCodes.INVALID_PARAMETER,
            component: Components.API_ROUTER,
            operation: "startIntervalometer",
            details: {
              validValues: validStopConditions,
            },
          }),
        );
      }

      // Validate stopCondition-specific parameters
      if (stopCondition === "stop-after" && (!shots || shots <= 0)) {
        return res.status(400).json(
          createApiError(
            "shots parameter required for stop-after stopCondition",
            {
              code: ErrorCodes.INVALID_PARAMETER,
              component: Components.API_ROUTER,
              operation: "startIntervalometer",
            },
          ),
        );
      }

      if (stopCondition === "stop-at" && !stopTime) {
        return res.status(400).json(
          createApiError(
            "stopTime parameter required for stop-at stopCondition",
            {
              code: ErrorCodes.INVALID_PARAMETER,
              component: Components.API_ROUTER,
              operation: "startIntervalometer",
            },
          ),
        );
      }

      // Check if session is already running
      if (
        server.activeIntervalometerSession &&
        server.activeIntervalometerSession.state === "running"
      ) {
        return res.status(400).json(
          createApiError("Intervalometer is already running", {
            code: ErrorCodes.OPERATION_FAILED,
            component: Components.API_ROUTER,
            operation: "startIntervalometer",
          }),
        );
      }

      // Get current camera controller
      const currentController = getCameraController();
      if (!currentController) {
        return res.status(503).json(
          createApiError("No camera available", {
            code: ErrorCodes.CAMERA_OFFLINE,
            component: Components.API_ROUTER,
            operation: "startIntervalometer",
          }),
        );
      }

      // Validate against camera settings
      const validation = await currentController.validateInterval(interval);
      if (!validation.valid) {
        return res.status(400).json(
          createApiError(validation.error, {
            code: ErrorCodes.VALIDATION_FAILED,
            component: Components.API_ROUTER,
            operation: "startIntervalometer",
          }),
        );
      }

      // Clean up any existing session
      if (server.activeIntervalometerSession) {
        server.activeIntervalometerSession.cleanup();
        server.activeIntervalometerSession = null;
      }

      // Create and configure new session with optional title
      const options = { interval };
      if (title && title.trim()) options.title = title.trim();
      if (stopCondition) options.stopCondition = stopCondition;
      if (shots && shots > 0) options.totalShots = parseInt(shots);
      if (stopTime) {
        // Parse time as HH:MM and create a future date
        const [hours, minutes] = stopTime.split(":").map(Number);
        const now = new Date();
        const stopDate = new Date();
        stopDate.setHours(hours, minutes, 0, 0);

        // If the time is in the past, assume it's for tomorrow
        if (stopDate <= now) {
          stopDate.setDate(stopDate.getDate() + 1);
        }

        options.stopTime = stopDate;
      }

      // Use state manager to create session (supports stopCondition and reporting)
      if (!intervalometerStateManager) {
        return res.status(503).json(
          createApiError("Intervalometer state manager not available", {
            code: ErrorCodes.SERVICE_UNAVAILABLE,
            component: Components.API_ROUTER,
            operation: "startIntervalometer",
          }),
        );
      }

      server.activeIntervalometerSession =
        await intervalometerStateManager.createSession(
          () => getCameraController(),
          options,
        );

      // Start the session
      await server.activeIntervalometerSession.start();

      logger.info("Intervalometer started", options);

      res.json({
        success: true,
        message: "Intervalometer started successfully",
        status: server.activeIntervalometerSession.getStatus(),
        sessionId: server.activeIntervalometerSession.id,
        title: server.activeIntervalometerSession.title,
      });
    } catch (error) {
      logger.error("Failed to start intervalometer:", error);
      res.status(500).json(
        createApiError(error.message, {
          code: ErrorCodes.SYSTEM_ERROR,
          component: Components.API_ROUTER,
        }),
      );
    }
  });

  router.post("/intervalometer/stop", async (req, res) => {
    try {
      if (!server.activeIntervalometerSession) {
        return res.status(400).json(
          createApiError("No intervalometer session is running", {
            code: ErrorCodes.OPERATION_FAILED,
            component: Components.API_ROUTER,
            operation: "stopIntervalometer",
          }),
        );
      }

      await server.activeIntervalometerSession.stop();
      const finalStatus = server.activeIntervalometerSession.getStatus();

      logger.info("Intervalometer stopped", finalStatus.stats);

      res.json({
        success: true,
        message: "Intervalometer stopped successfully",
        status: finalStatus,
      });
    } catch (error) {
      logger.error("Failed to stop intervalometer:", error);
      res.status(500).json(
        createApiError(error.message, {
          code: ErrorCodes.SYSTEM_ERROR,
          component: Components.API_ROUTER,
        }),
      );
    }
  });

  router.get("/intervalometer/status", (req, res) => {
    try {
      const status = server.intervalometerStateManager.getSessionStatus();

      // If no active session, return minimal response
      if (status.state === "stopped" && !status.stats) {
        return res.json({
          running: false,
          state: "stopped",
        });
      }

      // Return specification-compliant response with required fields
      res.json({
        running: status.state === "running",
        state: status.state,
        stats: {
          startTime: status.stats?.startTime || new Date().toISOString(),
          shotsTaken: status.stats?.shotsTaken || status.progress?.shots || 0,
          shotsSuccessful:
            status.stats?.shotsSuccessful || status.stats?.successful || 0,
          shotsFailed: status.stats?.shotsFailed || status.stats?.failed || 0,
          currentShot:
            (status.stats?.shotsTaken || status.progress?.shots || 0) + 1,
          nextShotTime: status.nextShotTime || null,
        },
        options: {
          interval: status.options?.interval || 30,
          totalShots:
            status.options?.totalShots || status.progress?.total || null,
          stopTime: status.options?.stopTime || null,
          stopCondition: status.options?.stopCondition,
        },
      });
    } catch (error) {
      logger.error("Failed to get intervalometer status:", error);
      res.status(500).json(
        createApiError(error.message, {
          code: ErrorCodes.SYSTEM_ERROR,
          component: Components.API_ROUTER,
        }),
      );
    }
  });

  // Timelapse Reports Management API
  router.get("/timelapse/reports", async (req, res) => {
    try {
      if (!intervalometerStateManager) {
        return res.status(503).json(
          createApiError("Timelapse reporting not available", {
            code: ErrorCodes.SERVICE_UNAVAILABLE,
            component: Components.API_ROUTER,
          }),
        );
      }

      const reports = await intervalometerStateManager.getReports();
      res.json({ reports });
    } catch (error) {
      logger.error("Failed to get timelapse reports:", error);
      res.status(500).json(
        createApiError(error.message, {
          code: ErrorCodes.SYSTEM_ERROR,
          component: Components.API_ROUTER,
        }),
      );
    }
  });

  router.get("/timelapse/reports/:id", async (req, res) => {
    try {
      const { id } = req.params;
      if (!intervalometerStateManager) {
        return res.status(503).json(
          createApiError("Timelapse reporting not available", {
            code: ErrorCodes.SERVICE_UNAVAILABLE,
            component: Components.API_ROUTER,
          }),
        );
      }

      const report = await intervalometerStateManager.getReport(id);
      if (!report) {
        return res.status(404).json(
          createApiError("Report not found", {
            code: ErrorCodes.SESSION_NOT_FOUND,
            component: Components.API_ROUTER,
          }),
        );
      }

      res.json(report);
    } catch (error) {
      logger.error("Failed to get timelapse report:", error);
      res.status(500).json(
        createApiError(error.message, {
          code: ErrorCodes.SYSTEM_ERROR,
          component: Components.API_ROUTER,
        }),
      );
    }
  });

  router.put("/timelapse/reports/:id/title", async (req, res) => {
    try {
      const { id } = req.params;
      const { title } = req.body;

      if (!title || title.trim() === "") {
        return res.status(400).json(
          createApiError("Title cannot be empty", {
            code: ErrorCodes.INVALID_PARAMETER,
            component: Components.API_ROUTER,
            operation: "updateReportTitle",
          }),
        );
      }

      if (!intervalometerStateManager) {
        return res.status(503).json(
          createApiError("Timelapse reporting not available", {
            code: ErrorCodes.SERVICE_UNAVAILABLE,
            component: Components.API_ROUTER,
          }),
        );
      }

      const updatedReport = await intervalometerStateManager.updateReportTitle(
        id,
        title.trim(),
      );
      res.json(updatedReport);
    } catch (error) {
      if (error.message.includes("not found")) {
        return res.status(404).json(
          createApiError("Report not found", {
            code: ErrorCodes.SESSION_NOT_FOUND,
            component: Components.API_ROUTER,
          }),
        );
      }
      logger.error("Failed to update report title:", error);
      res.status(500).json(
        createApiError(error.message, {
          code: ErrorCodes.SYSTEM_ERROR,
          component: Components.API_ROUTER,
        }),
      );
    }
  });

  router.delete("/timelapse/reports/:id", async (req, res) => {
    try {
      const { id } = req.params;
      if (!intervalometerStateManager) {
        return res.status(503).json(
          createApiError("Timelapse reporting not available", {
            code: ErrorCodes.SERVICE_UNAVAILABLE,
            component: Components.API_ROUTER,
          }),
        );
      }

      await intervalometerStateManager.deleteReport(id);
      res.json({ success: true, message: "Report deleted successfully" });
    } catch (error) {
      logger.error("Failed to delete report:", error);
      res.status(500).json(
        createApiError(error.message, {
          code: ErrorCodes.SYSTEM_ERROR,
          component: Components.API_ROUTER,
        }),
      );
    }
  });

  router.post("/timelapse/sessions/:id/save", async (req, res) => {
    try {
      const { id } = req.params;
      const { title } = req.body;

      if (!intervalometerStateManager) {
        return res.status(503).json(
          createApiError("Timelapse reporting not available", {
            code: ErrorCodes.SERVICE_UNAVAILABLE,
            component: Components.API_ROUTER,
          }),
        );
      }

      const savedReport = await intervalometerStateManager.saveSessionReport(
        id,
        title,
      );
      res.json({
        success: true,
        message: "Session saved as report successfully",
        report: savedReport,
      });
    } catch (error) {
      if (error.message.includes("not found")) {
        return res.status(404).json(
          createApiError("Session not found", {
            code: ErrorCodes.SESSION_NOT_FOUND,
            component: Components.API_ROUTER,
          }),
        );
      }
      logger.error("Failed to save session as report:", error);
      res.status(500).json(
        createApiError(error.message, {
          code: ErrorCodes.SYSTEM_ERROR,
          component: Components.API_ROUTER,
        }),
      );
    }
  });

  router.post("/timelapse/sessions/:id/discard", async (req, res) => {
    try {
      const { id } = req.params;

      if (!intervalometerStateManager) {
        return res.status(503).json(
          createApiError("Timelapse reporting not available", {
            code: ErrorCodes.SERVICE_UNAVAILABLE,
            component: Components.API_ROUTER,
          }),
        );
      }

      await intervalometerStateManager.discardSession(id);
      res.json({ success: true, message: "Session discarded successfully" });
    } catch (error) {
      logger.error("Failed to discard session:", error);
      res.status(500).json(
        createApiError(error.message, {
          code: ErrorCodes.SYSTEM_ERROR,
          component: Components.API_ROUTER,
        }),
      );
    }
  });

  router.get("/timelapse/unsaved-session", async (req, res) => {
    try {
      if (!intervalometerStateManager) {
        return res.status(503).json(
          createApiError("Timelapse reporting not available", {
            code: ErrorCodes.SERVICE_UNAVAILABLE,
            component: Components.API_ROUTER,
          }),
        );
      }

      const state = intervalometerStateManager.getState();
      res.json({
        unsavedSession: state.hasUnsavedSession
          ? {
              sessionId: state.currentSessionId,
              // Additional unsaved session data would be added here
            }
          : null,
      });
    } catch (error) {
      logger.error("Failed to get unsaved session:", error);
      res.status(500).json(
        createApiError(error.message, {
          code: ErrorCodes.SYSTEM_ERROR,
          component: Components.API_ROUTER,
        }),
      );
    }
  });

  // Set system time from client
  router.post("/system/time", async (req, res) => {
    try {
      const { timestamp, timezone } = req.body;

      if (!timestamp) {
        return res.status(400).json(
          createApiError("Timestamp is required", {
            code: ErrorCodes.INVALID_PARAMETER,
            component: Components.API_ROUTER,
            operation: "setSystemTime",
          }),
        );
      }

      const clientTime = new Date(timestamp);
      if (isNaN(clientTime.getTime())) {
        return res.status(400).json(
          createApiError("Invalid timestamp format", {
            code: ErrorCodes.INVALID_PARAMETER,
            component: Components.API_ROUTER,
            operation: "setSystemTime",
          }),
        );
      }

      // Check if we're running on Linux (Pi) before attempting to set system time
      if (process.platform !== "linux") {
        logger.warn("Time sync requested but not running on Linux - ignoring");
        return res.json({
          success: false,
          error: "Time synchronization only supported on Linux systems",
          currentTime: new Date().toISOString(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        });
      }

      // Format timestamp for date command (YYYY-MM-DD HH:MM:SS UTC)
      // Always use UTC for internal system time to avoid timezone confusion
      const formattedTime = clientTime
        .toISOString()
        .slice(0, 19)
        .replace("T", " ");

      logger.info(
        `Time sync requested. Current: ${new Date().toISOString()}, Client: ${clientTime.toISOString()}, Client timezone: ${timezone}`,
      );

      const { spawn } = await import("child_process");

      // Set system time in UTC
      const setTime = spawn("sudo", ["date", "-u", "-s", formattedTime], {
        stdio: "pipe",
      });

      setTime.on("close", async (timeCode) => {
        if (timeCode === 0) {
          logger.info(
            `System time synchronized successfully to UTC: ${formattedTime}`,
          );

          // Set timezone if provided
          let timezoneSetResult = null;
          if (timezone) {
            try {
              // Set system timezone using timedatectl (systemd)
              const setTimezone = spawn(
                "sudo",
                ["timedatectl", "set-timezone", timezone],
                { stdio: "pipe" },
              );

              await new Promise((resolve) => {
                setTimezone.on("close", (tzCode) => {
                  if (tzCode === 0) {
                    timezoneSetResult = { success: true, timezone };
                    logger.info(`System timezone set to: ${timezone}`);
                    resolve();
                  } else {
                    logger.warn(
                      `Failed to set timezone to ${timezone}, exit code: ${tzCode}`,
                    );
                    timezoneSetResult = {
                      success: false,
                      error: `Failed to set timezone: ${timezone}`,
                    };
                    resolve(); // Don't fail the whole operation
                  }
                });

                setTimezone.on("error", (tzError) => {
                  logger.warn("Timezone set error:", tzError.message);
                  timezoneSetResult = {
                    success: false,
                    error: tzError.message,
                  };
                  resolve(); // Don't fail the whole operation
                });
              });
            } catch (error) {
              logger.warn("Error setting timezone:", error.message);
              timezoneSetResult = { success: false, error: error.message };
            }
          }

          const newTime = new Date().toISOString();
          const newTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

          res.json({
            success: true,
            message: "System time synchronized successfully",
            previousTime: new Date().toISOString(),
            newTime: newTime,
            timezone: newTimezone,
            timezoneSync: timezoneSetResult,
          });
        } else {
          logger.error(`Time sync failed with exit code: ${timeCode}`);
          res.status(500).json({
            success: false,
            error: "Failed to set system time. Check sudo permissions.",
          });
        }
      });

      setTime.on("error", (error) => {
        logger.error("Time sync error:", error);
        res.status(500).json({
          success: false,
          error: "Failed to execute time sync command",
        });
      });
    } catch (error) {
      logger.error("Failed to sync time:", error);
      res.status(500).json(
        createApiError(error.message, {
          code: ErrorCodes.SYSTEM_ERROR,
          component: Components.API_ROUTER,
        }),
      );
    }
  });

  // Get current system time
  router.get("/system/time", (req, res) => {
    try {
      res.json({
        currentTime: new Date().toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        timestamp: Date.now(),
      });
    } catch (error) {
      logger.error("Failed to get system time:", error);
      res.status(500).json(
        createApiError("Failed to get system time", {
          code: ErrorCodes.SYSTEM_ERROR,
          component: Components.API_ROUTER,
        }),
      );
    }
  });

  // Power and system status
  router.get("/system/power", (req, res) => {
    try {
      const status = powerManager.getStatus();
      res.json(status);
    } catch (error) {
      logger.error("Failed to get power status:", error);
      res.status(500).json(
        createApiError("Failed to get power status", {
          code: ErrorCodes.SYSTEM_ERROR,
          component: Components.API_ROUTER,
        }),
      );
    }
  });

  router.get("/system/status", (req, res) => {
    try {
      const powerStatus = powerManager.getStatus();
      res.json({
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        platform: process.platform,
        nodeVersion: process.version,
        timestamp: new Date().toISOString(),
        power: powerStatus,
      });
    } catch (error) {
      logger.error("Failed to get system status:", error);
      res.status(500).json(
        createApiError("Failed to get system status", {
          code: ErrorCodes.SYSTEM_ERROR,
          component: Components.API_ROUTER,
        }),
      );
    }
  });

  // Network Management Routes
  if (networkStateManager) {
    const networkServiceManager = networkStateManager.serviceManager; // Get direct access to service manager

    // Get current network status
    router.get("/network/status", async (req, res) => {
      try {
        const status = await networkStateManager.getNetworkStatus(true);
        res.json(status);
      } catch (error) {
        logger.error("Failed to get network status:", error);
        res.status(500).json(
          createApiError(error.message, {
            code: ErrorCodes.SYSTEM_ERROR,
            component: Components.API_ROUTER,
          }),
        );
      }
    });

    // Scan for WiFi networks - LOW-LEVEL SERVICE OPERATION
    router.get("/network/wifi/scan", async (req, res) => {
      try {
        const forceRefresh = req.query.refresh === "true";
        const networks =
          await networkServiceManager.scanWiFiNetworks(forceRefresh);
        res.json({ networks });
      } catch (error) {
        logger.error("WiFi scan failed:", error);
        res.status(500).json(
          createApiError(error.message, {
            code: ErrorCodes.SYSTEM_ERROR,
            component: Components.API_ROUTER,
          }),
        );
      }
    });

    // Get saved WiFi networks - LOW-LEVEL SERVICE OPERATION
    router.get("/network/wifi/saved", async (req, res) => {
      try {
        const networks = await networkServiceManager.getSavedNetworks();
        res.json({ networks });
      } catch (error) {
        logger.error("Failed to get saved networks:", error);
        res.status(500).json(
          createApiError(error.message, {
            code: ErrorCodes.SYSTEM_ERROR,
            component: Components.API_ROUTER,
          }),
        );
      }
    });

    // Connect to WiFi network - LOW-LEVEL SERVICE OPERATION
    router.post("/network/wifi/connect", async (req, res) => {
      try {
        const { ssid, password, priority } = req.body;

        if (!ssid) {
          return res.status(400).json(
            createApiError("SSID is required", {
              code: ErrorCodes.INVALID_PARAMETER,
              component: Components.API_ROUTER,
              operation: "connectToWiFi",
            }),
          );
        }

        const result = await networkServiceManager.connectToWiFi(
          ssid,
          password,
          priority,
        );
        res.json(result);
      } catch (error) {
        logger.error("WiFi connection failed:", error);
        res.status(500).json(
          createApiError(error.message, {
            code: ErrorCodes.SYSTEM_ERROR,
            component: Components.API_ROUTER,
          }),
        );
      }
    });

    // Disconnect from WiFi - LOW-LEVEL SERVICE OPERATION
    router.post("/network/wifi/disconnect", async (req, res) => {
      try {
        const result = await networkServiceManager.disconnectWiFi();
        res.json(result);
      } catch (error) {
        logger.error("WiFi disconnection failed:", error);
        res.status(500).json(
          createApiError(error.message, {
            code: ErrorCodes.SYSTEM_ERROR,
            component: Components.API_ROUTER,
          }),
        );
      }
    });

    // Configure access point - HIGH-LEVEL STATE OPERATION (affects overall state)
    router.post("/network/accesspoint/configure", async (req, res) => {
      try {
        const { ssid, passphrase, channel, hidden } = req.body;

        if (!ssid || !passphrase) {
          return res.status(400).json(
            createApiError("SSID and passphrase are required", {
              code: ErrorCodes.INVALID_PARAMETER,
              component: Components.API_ROUTER,
              operation: "configureAccessPoint",
            }),
          );
        }

        if (passphrase.length < 8) {
          return res.status(400).json(
            createApiError("Passphrase must be at least 8 characters", {
              code: ErrorCodes.INVALID_PARAMETER,
              component: Components.API_ROUTER,
              operation: "configureAccessPoint",
            }),
          );
        }

        const result = await networkStateManager.configureAccessPoint({
          ssid,
          passphrase,
          channel,
          hidden,
        });
        res.json(result);
      } catch (error) {
        logger.error("Access point configuration failed:", error);
        res.status(500).json(
          createApiError(error.message, {
            code: ErrorCodes.SYSTEM_ERROR,
            component: Components.API_ROUTER,
          }),
        );
      }
    });

    // Set WiFi country for international travel - LOW-LEVEL SERVICE OPERATION
    router.post("/network/wifi/country", async (req, res) => {
      try {
        const { country } = req.body;

        // Enhanced input validation
        if (!country) {
          return res.status(400).json({
            error: "Country code is required",
            details:
              "Please provide a valid 2-letter ISO country code (e.g., US, JP)",
          });
        }

        // Validate country code format
        const countryCode = country.toString().toUpperCase().trim();
        if (!/^[A-Z]{2}$/.test(countryCode)) {
          return res.status(400).json({
            error: "Invalid country code format",
            details:
              "Country code must be exactly 2 uppercase letters (e.g., US, JP, GB)",
          });
        }

        // Check if country code is in our supported list
        const availableCountries = networkServiceManager.getCountryCodes();
        const isSupported = availableCountries.some(
          (c) => c.code === countryCode,
        );
        if (!isSupported) {
          return res.status(400).json({
            error: "Unsupported country code",
            details: `Country code '${countryCode}' is not supported. Use GET /api/network/wifi/countries for available codes.`,
          });
        }

        const result = await networkServiceManager.setWiFiCountry(countryCode);
        res.json(result);
      } catch (error) {
        logger.error("WiFi country setting failed:", error);
        res.status(500).json(
          createApiError(error.message, {
            code: ErrorCodes.SYSTEM_ERROR,
            component: Components.API_ROUTER,
          }),
        );
      }
    });

    // Get current WiFi country - LOW-LEVEL SERVICE OPERATION
    router.get("/network/wifi/country", async (req, res) => {
      try {
        const result = await networkServiceManager.getWiFiCountry();
        res.json(result);
      } catch (error) {
        logger.error("Failed to get WiFi country:", error);
        res.status(500).json(
          createApiError(error.message, {
            code: ErrorCodes.SYSTEM_ERROR,
            component: Components.API_ROUTER,
          }),
        );
      }
    });

    // Get available country codes - LOW-LEVEL SERVICE OPERATION
    router.get("/network/wifi/countries", async (req, res) => {
      try {
        const countries = networkServiceManager.getCountryCodes();
        res.json({ countries });
      } catch (error) {
        logger.error("Failed to get country codes:", error);
        res.status(500).json(
          createApiError(error.message, {
            code: ErrorCodes.SYSTEM_ERROR,
            component: Components.API_ROUTER,
          }),
        );
      }
    });

    // Enable WiFi (wlan0) while keeping Access Point (ap0) active
    router.post("/network/wifi/enable", async (req, res) => {
      try {
        const result = await networkServiceManager.enableWiFi();
        res.json(result);
      } catch (error) {
        logger.error("Failed to enable WiFi:", error);
        res.status(500).json(
          createApiError(error.message, {
            code: ErrorCodes.SYSTEM_ERROR,
            component: Components.API_ROUTER,
          }),
        );
      }
    });

    // Disable WiFi (wlan0) while keeping Access Point (ap0) active
    router.post("/network/wifi/disable", async (req, res) => {
      try {
        const result = await networkServiceManager.disableWiFi();
        res.json(result);
      } catch (error) {
        logger.error("Failed to disable WiFi:", error);
        res.status(500).json(
          createApiError(error.message, {
            code: ErrorCodes.SYSTEM_ERROR,
            component: Components.API_ROUTER,
          }),
        );
      }
    });

    // Check if WiFi is enabled
    router.get("/network/wifi/enabled", async (req, res) => {
      try {
        const status = await networkServiceManager.isWiFiEnabled();
        res.json(status);
      } catch (error) {
        logger.error("Failed to check WiFi status:", error);
        res.status(500).json(
          createApiError(error.message, {
            code: ErrorCodes.SYSTEM_ERROR,
            component: Components.API_ROUTER,
          }),
        );
      }
    });
  }

  // ===== Camera Discovery API =====
  if (discoveryManager) {
    // Get discovery status
    router.get("/discovery/status", (req, res) => {
      try {
        const status = discoveryManager.getStatus();
        res.json(status);
      } catch (error) {
        logger.error("Failed to get discovery status:", error);
        res.status(500).json(
          createApiError("Failed to get discovery status", {
            code: ErrorCodes.SYSTEM_ERROR,
            component: Components.API_ROUTER,
          }),
        );
      }
    });

    // Get discovered cameras
    router.get("/discovery/cameras", (req, res) => {
      try {
        const cameras = discoveryManager.getDiscoveredCameras();
        res.json(cameras);
      } catch (error) {
        logger.error("Failed to get discovered cameras:", error);
        res.status(500).json(
          createApiError("Failed to get discovered cameras", {
            code: ErrorCodes.SYSTEM_ERROR,
            component: Components.API_ROUTER,
          }),
        );
      }
    });

    // Manually trigger camera search
    router.post("/discovery/scan", async (req, res) => {
      try {
        await discoveryManager.searchForCameras();
        res.json({ success: true, message: "Camera scan initiated" });
      } catch (error) {
        logger.error("Failed to trigger camera scan:", error);
        res.status(500).json(
          createApiError("Failed to trigger camera scan", {
            code: ErrorCodes.SYSTEM_ERROR,
            component: Components.API_ROUTER,
          }),
        );
      }
    });

    // Set primary camera
    router.post("/discovery/primary/:uuid", async (req, res) => {
      try {
        const { uuid } = req.params;
        await discoveryManager.setPrimaryCamera(uuid);
        res.json({ success: true, message: "Primary camera set", uuid });
      } catch (error) {
        logger.error("Failed to set primary camera:", error);
        res.status(500).json(
          createApiError(error.message, {
            code: ErrorCodes.SYSTEM_ERROR,
            component: Components.API_ROUTER,
          }),
        );
      }
    });

    // Connect to camera by IP (manual connection)
    router.post("/discovery/connect", async (req, res) => {
      try {
        const { ip, port = "443" } = req.body;
        if (!ip) {
          return res.status(400).json(
            createApiError("IP address is required", {
              code: ErrorCodes.INVALID_PARAMETER,
              component: Components.API_ROUTER,
              operation: "connectToCamera",
            }),
          );
        }

        await discoveryManager.connectToIp(ip, port);
        res.json({ success: true, message: "Connected to camera", ip, port });
      } catch (error) {
        logger.error("Failed to connect to camera:", error);
        res.status(500).json(
          createApiError(error.message, {
            code: ErrorCodes.SYSTEM_ERROR,
            component: Components.API_ROUTER,
          }),
        );
      }
    });

    // Get specific camera by UUID
    router.get("/discovery/cameras/:uuid", (req, res) => {
      try {
        const { uuid } = req.params;
        const camera = discoveryManager.getCamera(uuid);
        if (!camera) {
          return res.status(404).json(
            createApiError("Camera not found", {
              code: ErrorCodes.CAMERA_OFFLINE,
              component: Components.API_ROUTER,
            }),
          );
        }
        res.json(camera);
      } catch (error) {
        logger.error("Failed to get camera:", error);
        res.status(500).json(
          createApiError("Failed to get camera", {
            code: ErrorCodes.SYSTEM_ERROR,
            component: Components.API_ROUTER,
          }),
        );
      }
    });

    // Get last successful camera IP for UI pre-population
    router.get("/discovery/last-ip", (req, res) => {
      try {
        const lastIP = discoveryManager.getLastSuccessfulIP();
        res.json({ lastIP });
      } catch (error) {
        logger.error("Failed to get last camera IP:", error);
        res.status(500).json(
          createApiError("Failed to get last camera IP", {
            code: ErrorCodes.SYSTEM_ERROR,
            component: Components.API_ROUTER,
          }),
        );
      }
    });

    // Clear camera connection history
    router.delete("/discovery/connection-history", async (req, res) => {
      try {
        await discoveryManager.clearConnectionHistory();
        res.json({ success: true, message: "Connection history cleared" });
      } catch (error) {
        logger.error("Failed to clear connection history:", error);
        res.status(500).json(
          createApiError("Failed to clear connection history", {
            code: ErrorCodes.SYSTEM_ERROR,
            component: Components.API_ROUTER,
          }),
        );
      }
    });
  }

  // TimeSync status endpoint
  router.get("/timesync/status", (req, res) => {
    try {
      // Import timeSyncService (dynamic import to avoid circular dependency)
      import("../timesync/service.js")
        .then(({ default: timeSyncService }) => {
          const status = timeSyncService.getStatus();
          const statistics = timeSyncService.getStatistics();

          res.json({
            success: true,
            status,
            statistics,
          });
        })
        .catch((error) => {
          logger.error("Failed to import timeSyncService:", error);
          res.status(500).json({
            success: false,
            error: "TimeSync service not available",
          });
        });
    } catch (error) {
      logger.error("Failed to get TimeSync status:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get TimeSync status",
      });
    }
  });

  // Camera time sync endpoint
  router.post("/timesync/camera", async (req, res) => {
    try {
      // Import timeSyncService (dynamic import to avoid circular dependency)
      const { default: timeSyncService } = await import(
        "../timesync/service.js"
      );

      // Get the camera controller from the discovery manager
      const cameraController = getCameraController();

      // Check if camera controller exists and is connected
      if (!cameraController) {
        return res.status(400).json({
          success: false,
          error: "No camera available",
        });
      }

      if (!cameraController.connected) {
        return res.status(400).json({
          success: false,
          error: "Camera not connected",
        });
      }

      // Get current camera time first
      const previousCameraTime = await cameraController.getCameraDateTime();

      // Get Pi time and sync camera to it
      const piTime = new Date();
      const success = await cameraController.setCameraDateTime(piTime);

      if (success) {
        // Calculate offset in milliseconds
        const previousTime = previousCameraTime
          ? new Date(previousCameraTime)
          : piTime;
        const offset = previousTime.getTime() - piTime.getTime();

        // Record the sync event in TimeSyncService
        timeSyncService.state.recordCameraSync(offset);

        // Trigger a status broadcast to update UI
        timeSyncService.broadcastSyncStatus();

        res.json({
          success: true,
          previousTime: previousTime.toISOString(),
          newTime: piTime.toISOString(),
          offset: offset,
        });
      } else {
        res.status(400).json({
          success: false,
          error: "Failed to synchronize camera time",
        });
      }
    } catch (error) {
      logger.error("Failed to sync camera time:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  });

  // Error handling middleware for API routes
  router.use((err, req, res, _next) => {
    logger.error("API route error:", err);
    res.status(500).json(
      createApiError("Internal server error", {
        code: ErrorCodes.SYSTEM_ERROR,
        component: Components.API_ROUTER,
      }),
    );
  });

  return router;
}
