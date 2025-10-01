import { logger } from "../utils/logger.js";
// Removed unused import: IntervalometerSession
import {
  createStandardError,
  ErrorCodes,
  Components,
} from "../utils/error-handlers.js";

export function createWebSocketHandler(
  cameraController,
  powerManager,
  server,
  networkManager,
  discoveryManager,
  intervalometerStateManager,
  timeSyncService = null,
) {
  const clients = new Set();
  const clientInfo = new Map(); // Track client info for time sync

  // Set up network event listeners for real-time updates
  if (networkManager && networkManager.stateManager) {
    networkManager.stateManager.on("serviceStateChanged", (data) => {
      broadcastNetworkEvent("network_service_changed", data);
    });

    networkManager.stateManager.on("interfaceStateChanged", (data) => {
      broadcastNetworkEvent("network_interface_changed", data);
    });

    networkManager.stateManager.on("accessPointConfigured", (data) => {
      broadcastNetworkEvent("access_point_configured", data);
    });

    networkManager.stateManager.on("wifiConnectionStarted", (data) => {
      broadcastNetworkEvent("wifi_connection_started", data);
    });

    networkManager.stateManager.on("wifiConnectionFailed", (data) => {
      broadcastNetworkEvent("wifi_connection_failed", data);
    });
  }

  // Broadcast network-specific events to all connected clients
  const broadcastNetworkEvent = (eventType, data) => {
    if (clients.size === 0) return;

    const message = JSON.stringify({
      type: eventType,
      timestamp: new Date().toISOString(),
      data: data,
    });

    const deadClients = new Set();

    for (const client of clients) {
      try {
        if (client.readyState === client.OPEN) {
          client.send(message);
        } else {
          deadClients.add(client);
        }
      } catch (error) {
        logger.debug(
          "Failed to send network event to WebSocket client:",
          error.message,
        );
        deadClients.add(client);
      }
    }

    // Clean up dead connections
    for (const deadClient of deadClients) {
      clients.delete(deadClient);
    }
  };

  // Broadcast status updates to all connected clients
  const broadcastStatus = async (forceRefresh = false) => {
    if (clients.size === 0) return;

    // Get network status if networkManager is available
    let networkStatus = null;
    console.log(
      "BROADCAST: networkManager available:",
      !!networkManager,
      "forceRefresh:",
      forceRefresh,
    );
    if (networkManager) {
      try {
        networkStatus = await networkManager.getNetworkStatus(forceRefresh);
        console.log(
          "BROADCAST: getNetworkStatus result:",
          networkStatus ? "SUCCESS" : "NULL",
        );
        if (
          networkStatus &&
          networkStatus.interfaces &&
          networkStatus.interfaces.wlan0
        ) {
          console.log("BROADCAST: wlan0 data:", {
            network: networkStatus.interfaces.wlan0.network,
            connected: networkStatus.interfaces.wlan0.connected,
            active: networkStatus.interfaces.wlan0.active,
          });
        } else {
          console.log("BROADCAST: No wlan0 data in result");
        }
      } catch (error) {
        console.log("BROADCAST: Error getting network status:", error.message);
        logger.error("Failed to get network status for broadcast:", error);
      }
    } else {
      console.log("BROADCAST: NetworkManager not available");
      logger.error("NetworkManager not available for broadcast");
    }

    // Get current camera controller (it's a function that returns the current controller)
    const currentCameraController = cameraController();
    const cameraStatus = currentCameraController
      ? currentCameraController.getConnectionStatus()
      : { connected: false, error: "No camera available" };

    // Get discovery status if available
    let discoveryStatus = null;
    if (discoveryManager) {
      try {
        discoveryStatus = discoveryManager.getStatus();
      } catch (error) {
        logger.debug("Failed to get discovery status for broadcast:", error);
      }
    }

    const status = {
      type: "status_update",
      timestamp: new Date().toISOString(),
      camera: cameraStatus,
      discovery: discoveryStatus,
      power: {
        ...powerManager.getStatus(),
        uptime: process.uptime(), // Add system uptime to power data
      },
      network: networkStatus,
    };

    logger.debug(
      "Broadcasting status with network:",
      networkStatus ? "PRESENT" : "NULL",
    );

    const message = JSON.stringify(status);
    const deadClients = new Set();

    for (const client of clients) {
      try {
        if (client.readyState === client.OPEN) {
          client.send(message);
        } else {
          deadClients.add(client);
        }
      } catch (error) {
        logger.debug("Failed to send to WebSocket client:", error.message);
        deadClients.add(client);
      }
    }

    // Clean up dead connections
    for (const deadClient of deadClients) {
      clients.delete(deadClient);
    }
  };

  // Start periodic status broadcasts (every 10 seconds for real-time UI)
  const statusInterval = setInterval(() => {
    console.log("Broadcasting status at:", new Date().toISOString());
    broadcastStatus();
  }, 10000);

  // Handle individual WebSocket connections
  const handleConnection = async (ws, req) => {
    const clientIP =
      req.socket.remoteAddress?.replace(/^::ffff:/, "") || "unknown";
    const clientId = `${clientIP}:${req.socket.remotePort}`;

    logger.info(`WebSocket client connected: ${clientId}`);
    clients.add(ws);

    // Determine client interface (ap0 or wlan0)
    let clientInterface = "unknown";
    if (networkManager) {
      try {
        const _networkStatus = await networkManager.getNetworkStatus(false);
        // Check if client IP is in AP range (typically 192.168.4.x)
        if (clientIP.startsWith("192.168.4.")) {
          clientInterface = "ap0";
        } else {
          clientInterface = "wlan0";
        }
      } catch (error) {
        logger.error("Failed to determine client interface:", error);
      }
    }

    // Store client info for time sync
    clientInfo.set(ws, { ip: clientIP, interface: clientInterface });

    // Handle time sync for new connection
    logger.info(
      `WebSocket: About to call TimeSync for ${clientIP} on ${clientInterface}`,
    );
    try {
      if (timeSyncService) {
        await timeSyncService.handleClientConnection(
          clientIP,
          clientInterface,
          ws,
        );
      }
      logger.info(`WebSocket: TimeSync call completed for ${clientIP}`);
    } catch (error) {
      logger.error(`WebSocket: TimeSync call failed for ${clientIP}:`, error);
    }

    // Send initial status immediately
    try {
      // Get network status for welcome message
      let networkStatus = null;
      if (networkManager) {
        try {
          networkStatus = await networkManager.getNetworkStatus(false);
          logger.info("Network status for welcome message:", networkStatus);
        } catch (error) {
          logger.error("Failed to get network status for welcome:", error);
        }
      } else {
        logger.warn("NetworkManager not available for welcome message");
      }

      const initialStatus = {
        type: "welcome",
        timestamp: new Date().toISOString(),
        camera: cameraController()
          ? cameraController().getConnectionStatus()
          : { connected: false, error: "No camera available" },
        power: powerManager.getStatus(),
        network: networkStatus,
        intervalometer: server.activeIntervalometerSession
          ? server.activeIntervalometerSession.getStatus()
          : null,
        timesync: timeSyncService
          ? (() => {
              const rawStatus = timeSyncService.getStatus();
              return {
                pi: {
                  isSynchronized: rawStatus.piReliable,
                  reliability: timeSyncService.getPiReliability
                    ? timeSyncService.getPiReliability(rawStatus)
                    : "none",
                  lastSyncTime: rawStatus.lastPiSync,
                },
                camera: {
                  isSynchronized: !!rawStatus.lastCameraSync,
                  lastSyncTime: rawStatus.lastCameraSync,
                },
              };
            })()
          : null,
        clientId,
      };

      ws.send(JSON.stringify(initialStatus));

      // Send current TimeSyncService status separately
      if (timeSyncService) {
        setTimeout(() => {
          timeSyncService.broadcastSyncStatus();
        }, 100);
      }
    } catch (error) {
      logger.error("Failed to send welcome message:", error);
    }

    // Handle incoming messages from clients
    ws.on("message", async (data) => {
      try {
        const message = JSON.parse(data.toString());
        await handleClientMessage(ws, message, clientId);
      } catch (error) {
        logger.error("Error handling WebSocket message:", error);
        sendError(ws, "Invalid message format");
      }
    });

    // Handle client disconnection
    ws.on("close", (code, reason) => {
      logger.info(
        `WebSocket client disconnected: ${clientId} (${code}: ${reason})`,
      );
      clients.delete(ws);

      // Clean up time sync tracking
      const info = clientInfo.get(ws);
      if (info) {
        if (timeSyncService) {
          timeSyncService.handleClientDisconnection(info.ip);
        }
        clientInfo.delete(ws);
      }
    });

    // Handle WebSocket errors
    ws.on("error", (error) => {
      logger.error(`WebSocket error for ${clientId}:`, error);
      clients.delete(ws);

      // Clean up time sync tracking
      const info = clientInfo.get(ws);
      if (info) {
        if (timeSyncService) {
          timeSyncService.handleClientDisconnection(info.ip);
        }
        clientInfo.delete(ws);
      }
    });
  };

  // Handle different types of client messages
  const handleClientMessage = async (ws, message, clientId) => {
    const { type, data } = message;

    logger.info(`WebSocket message from ${clientId}: type=${type}`);

    try {
      switch (type) {
        case "take_photo":
          await handleTakePhoto(ws, data);
          break;

        case "get_camera_settings":
          await handleGetCameraSettings(ws);
          break;

        case "validate_interval":
          await handleValidateInterval(ws, data);
          break;

        case "start_intervalometer":
          await handleStartIntervalometer(ws, data);
          break;

        case "stop_intervalometer":
          await handleStopIntervalometer(ws);
          break;

        case "get_status":
          await handleGetStatus(ws);
          break;

        case "network_scan":
          await handleNetworkScan(ws, data);
          break;

        case "network_connect":
          await handleNetworkConnect(ws, data);
          break;

        case "network_disconnect":
          await handleNetworkDisconnect(ws);
          break;

        case "wifi_enable":
          await handleWiFiEnable(ws);
          break;

        case "wifi_disable":
          await handleWiFiDisable(ws);
          break;

        case "start_intervalometer_with_title":
          await handleStartIntervalometerWithTitle(ws, data);
          break;

        case "get_timelapse_reports":
          await handleGetTimelapseReports(ws);
          break;

        case "get_timelapse_report":
          await handleGetTimelapseReport(ws, data);
          break;

        case "update_report_title":
          await handleUpdateReportTitle(ws, data);
          break;

        case "delete_timelapse_report":
          await handleDeleteTimelapseReport(ws, data);
          break;

        case "save_session_as_report":
          await handleSaveSessionAsReport(ws, data);
          break;

        case "discard_session":
          await handleDiscardSession(ws, data);
          break;

        case "get_unsaved_session":
          await handleGetUnsavedSession(ws);
          break;

        case "ping":
          sendResponse(ws, "pong", { timestamp: new Date().toISOString() });
          break;

        case "time-sync-response":
          logger.info(`Received time-sync-response from ${clientId}`, data);
          await handleTimeSyncResponse(ws, data);
          break;

        case "gps-response":
          await handleGPSResponse(ws, data);
          break;

        case "manual-time-sync":
          await handleManualTimeSync(ws, data);
          break;

        case "get-time-sync-status":
          await handleGetTimeSyncStatus(ws);
          break;

        default:
          logger.warn(`Unknown WebSocket message type: ${type}`);
          sendError(ws, `Unknown message type: ${type}`);
      }
    } catch (error) {
      logger.error(`Error handling WebSocket message type ${type}:`, error);
      sendError(ws, `Error processing ${type}: ${error.message}`);
    }
  };

  const handleTakePhoto = async (ws, _data) => {
    try {
      const currentController = cameraController();
      if (!currentController) {
        ws.send(
          JSON.stringify({
            type: "photo_result",
            success: false,
            error: "No camera available",
          }),
        );
        return;
      }
      await currentController.takePhoto();
      sendResponse(ws, "photo_taken", {
        success: true,
        timestamp: new Date().toISOString(),
      });

      // Broadcast photo taken event to all clients
      broadcastEvent("photo_taken", { timestamp: new Date().toISOString() });
    } catch (error) {
      sendError(ws, `Failed to take photo: ${error.message}`, {
        code: ErrorCodes.PHOTO_FAILED,
        operation: "takePhoto",
      });
    }
  };

  const handleGetCameraSettings = async (ws) => {
    try {
      const currentController = cameraController();
      if (!currentController) {
        ws.send(
          JSON.stringify({
            type: "settings_result",
            success: false,
            error: "No camera available",
          }),
        );
        return;
      }
      const settings = await currentController.getCameraSettings();
      sendResponse(ws, "camera_settings", settings);
    } catch (error) {
      sendError(ws, `Failed to get camera settings: ${error.message}`);
    }
  };

  const handleValidateInterval = async (ws, data) => {
    try {
      const { interval } = data;
      if (!interval || interval <= 0) {
        return sendError(ws, "Invalid interval value");
      }

      const currentController = cameraController();
      if (!currentController) {
        return sendError(ws, "No camera available");
      }

      const validation = await currentController.validateInterval(interval);
      sendResponse(ws, "interval_validation", validation);
    } catch (error) {
      sendError(ws, `Failed to validate interval: ${error.message}`);
    }
  };

  const handleStartIntervalometer = async (ws, data) => {
    // Delegate to the new timelapse system for all intervalometer sessions
    // This ensures backward compatibility while using the enhanced timelapse reporting
    const enhancedData = {
      ...data,
      title: data.title || null, // Use provided title or let system auto-generate
    };

    logger.info(
      "Legacy intervalometer request, delegating to timelapse system",
    );
    return await handleStartIntervalometerWithTitle(ws, enhancedData);
  };

  const handleStopIntervalometer = async (ws) => {
    try {
      if (!server.activeIntervalometerSession) {
        return sendError(ws, "No intervalometer session is running");
      }

      await server.activeIntervalometerSession.stop();
      const finalStatus = server.activeIntervalometerSession.getStatus();

      logger.info("Intervalometer stopped via WebSocket", finalStatus.stats);

      sendResponse(ws, "intervalometer_stop", {
        success: true,
        message: "Intervalometer stopped successfully",
        status: finalStatus,
      });
    } catch (error) {
      logger.error("Failed to stop intervalometer via WebSocket:", error);
      sendError(ws, `Failed to stop intervalometer: ${error.message}`);
    }
  };

  const handleGetStatus = async (ws) => {
    let networkStatus = null;
    if (networkManager) {
      try {
        networkStatus = await networkManager.getNetworkStatus(false);
      } catch (error) {
        logger.debug("Failed to get network status:", error);
      }
    }

    const status = {
      camera: cameraController()
        ? cameraController().getConnectionStatus()
        : { connected: false, error: "No camera available" },
      power: powerManager.getStatus(),
      network: networkStatus,
      timestamp: new Date().toISOString(),
    };

    sendResponse(ws, "status", status);
  };

  const handleNetworkScan = async (ws, data) => {
    if (!networkManager || !networkManager.serviceManager) {
      return sendError(ws, "Network management not available");
    }

    try {
      const forceRefresh = data?.refresh || false;
      // Use ServiceManager directly for low-level WiFi operations
      const networks =
        await networkManager.serviceManager.scanWiFiNetworks(forceRefresh);
      sendResponse(ws, "network_scan_result", { networks });
    } catch (error) {
      logger.error("Network scan failed via WebSocket:", error);
      sendError(ws, `Network scan failed: ${error.message}`);
    }
  };

  const handleNetworkConnect = async (ws, data) => {
    if (!networkManager || !networkManager.serviceManager) {
      return sendError(ws, "Network management not available", {
        code: ErrorCodes.SERVICE_UNAVAILABLE,
        operation: "network_connect",
      });
    }

    try {
      const { ssid, password, priority } = data;

      if (!ssid) {
        return sendError(ws, "SSID is required", {
          code: ErrorCodes.INVALID_PARAMETER,
          operation: "network_connect",
        });
      }

      // Use ServiceManager directly for low-level WiFi operations
      const result = await networkManager.serviceManager.connectToWiFi(
        ssid,
        password,
        priority,
      );

      // Send success result with network details
      sendResponse(ws, "network_connect_result", {
        success: true,
        network: ssid,
        method: result.method || "NetworkManager",
      });

      // Force immediate network state update to capture new SSID
      setTimeout(async () => {
        logger.info(
          "Broadcasting updated status with new SSID (force refresh)",
        );
        broadcastStatus(true); // Force refresh to get latest network state
      }, 2000); // Reduced delay for faster UI update

      // Additional update after longer delay to ensure everything has settled
      setTimeout(async () => {
        logger.info(
          "Second network state update for WiFi connection verification",
        );
        broadcastStatus(true); // Force refresh to verify final state
      }, 8000);
    } catch (error) {
      logger.error("Network connection failed via WebSocket:", error);
      sendError(ws, error.message, {
        code: ErrorCodes.NETWORK_ERROR,
        operation: "network_connect",
      });
    }
  };

  const handleNetworkDisconnect = async (ws) => {
    if (!networkManager || !networkManager.serviceManager) {
      return sendError(ws, "Network management not available");
    }

    try {
      // Use ServiceManager directly for low-level WiFi operations
      const result = await networkManager.serviceManager.disconnectWiFi();
      sendResponse(ws, "network_disconnect_result", result);

      // Broadcast network status change to all clients
      // Give more time for network changes to propagate
      setTimeout(async () => {
        logger.info("Broadcasting status after network disconnection");
        await networkManager.updateNetworkState(); // Force state refresh
        broadcastStatus();
      }, 5000);
    } catch (error) {
      logger.error("Network disconnection failed via WebSocket:", error);
      sendError(ws, `Disconnection failed: ${error.message}`);
    }
  };

  const handleWiFiEnable = async (ws) => {
    if (!networkManager || !networkManager.serviceManager) {
      return sendError(ws, "Network management not available");
    }

    try {
      const result = await networkManager.serviceManager.enableWiFi();
      sendResponse(ws, "wifi_enable_result", result);

      // Broadcast network status change to all clients
      setTimeout(() => broadcastStatus(), 2000);
    } catch (error) {
      logger.error("WiFi enable failed via WebSocket:", error);
      sendError(ws, `WiFi enable failed: ${error.message}`);
    }
  };

  const handleWiFiDisable = async (ws) => {
    if (!networkManager || !networkManager.serviceManager) {
      return sendError(ws, "Network management not available");
    }

    try {
      const result = await networkManager.serviceManager.disableWiFi();
      sendResponse(ws, "wifi_disable_result", result);

      // Broadcast network status change to all clients
      setTimeout(() => broadcastStatus(), 2000);
    } catch (error) {
      logger.error("WiFi disable failed via WebSocket:", error);
      sendError(ws, `WiFi disable failed: ${error.message}`);
    }
  };

  // Timelapse reporting WebSocket handlers
  const handleStartIntervalometerWithTitle = async (ws, data) => {
    try {
      const { interval, shots, stopTime, stopCondition, title } = data;

      // Validation
      if (!interval || interval <= 0) {
        return sendError(ws, "Invalid interval value");
      }

      // Validate stopCondition (required)
      if (!stopCondition) {
        return sendError(ws, "stopCondition is required (valid values: unlimited, stop-after, stop-at)");
      }

      const validStopConditions = ["unlimited", "stop-after", "stop-at"];
      if (!validStopConditions.includes(stopCondition)) {
        return sendError(ws, `Invalid stopCondition: ${stopCondition}. Valid values: ${validStopConditions.join(', ')}`);
      }

      // Validate stopCondition-specific parameters
      if (stopCondition === 'stop-after' && (!shots || shots <= 0)) {
        return sendError(ws, "shots parameter required for stop-after stopCondition");
      }

      if (stopCondition === 'stop-at' && !stopTime) {
        return sendError(ws, "stopTime parameter required for stop-at stopCondition");
      }

      // Check if session is already running
      if (
        server.activeIntervalometerSession &&
        server.activeIntervalometerSession.state === "running"
      ) {
        return sendError(ws, "Intervalometer is already running");
      }

      // Validate against camera settings
      const currentController = cameraController();
      if (!currentController) {
        return sendError(ws, "No camera available");
      }

      const validation = await currentController.validateInterval(interval);
      if (!validation.valid) {
        return sendError(ws, validation.error);
      }

      // Clean up any existing session
      if (server.activeIntervalometerSession) {
        server.activeIntervalometerSession.cleanup();
        server.activeIntervalometerSession = null;
      }

      // Create and configure new session with title
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

      server.activeIntervalometerSession =
        await intervalometerStateManager.createSession(
          () => cameraController(),
          options,
        );

      // Set up event handlers with enhanced events for reporting
      server.activeIntervalometerSession.on("started", (sessionData) => {
        logger.info("Session started event received, broadcasting...");
        broadcastEvent("intervalometer_started", {
          ...sessionData,
          sessionId: server.activeIntervalometerSession.id,
          title: server.activeIntervalometerSession.title,
        });
      });

      server.activeIntervalometerSession.on("photo_taken", (photoData) => {
        logger.info("Photo taken event received, broadcasting:", photoData);
        broadcastEvent("intervalometer_photo", photoData);
      });

      server.activeIntervalometerSession.on("photo_failed", (errorData) => {
        logger.info("Photo failed event received, broadcasting:", errorData);
        broadcastEvent("intervalometer_error", errorData);
      });

      server.activeIntervalometerSession.on("completed", (completionData) => {
        logger.info(
          "Session completed event received, broadcasting:",
          completionData,
        );
        broadcastEvent("intervalometer_completed", completionData);
        // Broadcast that there's an unsaved session needing user decision
        broadcastEvent("timelapse_session_needs_decision", {
          sessionId: completionData.sessionId,
          title: completionData.title,
          completionData,
        });
      });

      server.activeIntervalometerSession.on("stopped", (stopData) => {
        logger.info("Session stopped event received, broadcasting:", stopData);
        broadcastEvent("intervalometer_stopped", stopData);
        // Broadcast that there's an unsaved session needing user decision
        broadcastEvent("timelapse_session_needs_decision", {
          sessionId: stopData.sessionId,
          title: stopData.title,
          completionData: stopData,
        });
      });

      server.activeIntervalometerSession.on("error", (errorData) => {
        logger.info("Session error event received, broadcasting:", errorData);
        broadcastEvent("intervalometer_error", errorData);
        // Broadcast that there's an unsaved session needing user decision
        broadcastEvent("timelapse_session_needs_decision", {
          sessionId: errorData.sessionId,
          title: errorData.title,
          completionData: errorData,
        });
      });

      // Request time sync from client before starting session
      if (timeSyncService && ws) {
        logger.info("Requesting time sync from client before starting timelapse");
        const clientIP = ws._socket?.remoteAddress?.replace("::ffff:", "") || "unknown";
        timeSyncService.requestClientTime(clientIP, ws);
        // Wait briefly for sync to complete
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Start the session
      await server.activeIntervalometerSession.start();

      logger.info("Intervalometer started with title via WebSocket", options);

      sendResponse(ws, "intervalometer_start", {
        success: true,
        message: "Intervalometer started successfully",
        status: server.activeIntervalometerSession.getStatus(),
        sessionId: server.activeIntervalometerSession.id,
        title: server.activeIntervalometerSession.title,
      });
    } catch (error) {
      logger.error(
        "Failed to start intervalometer with title via WebSocket:",
        error,
      );
      sendError(ws, `Failed to start intervalometer: ${error.message}`);
    }
  };

  const handleGetTimelapseReports = async (ws) => {
    try {
      if (!intervalometerStateManager) {
        return sendError(ws, "Timelapse reporting not available");
      }

      const reports = await intervalometerStateManager.getReports();
      sendResponse(ws, "timelapse_reports", { reports });
    } catch (error) {
      logger.error("Failed to get timelapse reports via WebSocket:", error);
      sendError(ws, `Failed to get timelapse reports: ${error.message}`);
    }
  };

  const handleGetTimelapseReport = async (ws, data) => {
    try {
      const { id } = data;
      if (!id) {
        return sendError(ws, "Report ID is required");
      }

      if (!intervalometerStateManager) {
        return sendError(ws, "Timelapse reporting not available");
      }

      const report = await intervalometerStateManager.getReport(id);
      if (!report) {
        return sendError(ws, "Report not found");
      }

      sendResponse(ws, "timelapse_report", { report });
    } catch (error) {
      logger.error("Failed to get timelapse report via WebSocket:", error);
      sendError(ws, `Failed to get timelapse report: ${error.message}`);
    }
  };

  const handleUpdateReportTitle = async (ws, data) => {
    try {
      const { id, title } = data;
      if (!id || !title) {
        return sendError(ws, "Report ID and title are required");
      }

      if (title.trim() === "") {
        return sendError(ws, "Title cannot be empty");
      }

      if (!intervalometerStateManager) {
        return sendError(ws, "Timelapse reporting not available");
      }

      const updatedReport = await intervalometerStateManager.updateReportTitle(
        id,
        title.trim(),
      );
      sendResponse(ws, "report_title_updated", { report: updatedReport });

      // Broadcast the update to all clients
      broadcastTimelapseEvent("report_updated", {
        reportId: id,
        title: title.trim(),
      });
    } catch (error) {
      logger.error("Failed to update report title via WebSocket:", error);
      sendError(ws, `Failed to update report title: ${error.message}`);
    }
  };

  const handleDeleteTimelapseReport = async (ws, data) => {
    try {
      const { id } = data;
      if (!id) {
        return sendError(ws, "Report ID is required");
      }

      if (!intervalometerStateManager) {
        return sendError(ws, "Timelapse reporting not available");
      }

      await intervalometerStateManager.deleteReport(id);
      sendResponse(ws, "report_deleted", { reportId: id });

      // Broadcast the deletion to all clients
      broadcastTimelapseEvent("report_deleted", { reportId: id });
    } catch (error) {
      logger.error("Failed to delete timelapse report via WebSocket:", error);
      sendError(ws, `Failed to delete timelapse report: ${error.message}`);
    }
  };

  const handleSaveSessionAsReport = async (ws, data) => {
    try {
      const { sessionId, title } = data;
      if (!sessionId) {
        return sendError(ws, "Session ID is required");
      }

      if (!intervalometerStateManager) {
        return sendError(ws, "Timelapse reporting not available");
      }

      const savedReport = await intervalometerStateManager.saveSessionReport(
        sessionId,
        title,
      );
      sendResponse(ws, "session_saved", {
        sessionId,
        report: savedReport,
        message: "Session saved as report successfully",
      });

      // Broadcast the new report to all clients
      broadcastTimelapseEvent("report_saved", { report: savedReport });
    } catch (error) {
      logger.error("Failed to save session as report via WebSocket:", error);
      sendError(ws, `Failed to save session as report: ${error.message}`);
    }
  };

  const handleDiscardSession = async (ws, data) => {
    try {
      const { sessionId } = data;
      if (!sessionId) {
        return sendError(ws, "Session ID is required");
      }

      if (!intervalometerStateManager) {
        return sendError(ws, "Timelapse reporting not available");
      }

      await intervalometerStateManager.discardSession(sessionId);
      sendResponse(ws, "session_discarded", {
        sessionId,
        message: "Session discarded successfully",
      });

      // Broadcast the discard action to all clients
      broadcastTimelapseEvent("session_discarded", { sessionId });
    } catch (error) {
      logger.error("Failed to discard session via WebSocket:", error);
      sendError(ws, `Failed to discard session: ${error.message}`);
    }
  };

  const handleGetUnsavedSession = async (ws) => {
    try {
      if (!intervalometerStateManager) {
        return sendError(ws, "Timelapse reporting not available");
      }

      const state = intervalometerStateManager.getState();
      sendResponse(ws, "unsaved_session", {
        unsavedSession: state.hasUnsavedSession
          ? {
              sessionId: state.currentSessionId,
              // Additional unsaved session data would be added here
            }
          : null,
      });
    } catch (error) {
      logger.error("Failed to get unsaved session via WebSocket:", error);
      sendError(ws, `Failed to get unsaved session: ${error.message}`);
    }
  };

  const sendResponse = (ws, type, data) => {
    try {
      const response = {
        type,
        data,
        timestamp: new Date().toISOString(),
      };

      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify(response));
      }
    } catch (error) {
      logger.error("Failed to send WebSocket response:", error);
    }
  };

  const sendError = (ws, message, options = {}) => {
    try {
      const standardError = createStandardError(message, {
        code: options.code || ErrorCodes.OPERATION_FAILED,
        operation: options.operation,
        component: options.component || Components.WEBSOCKET_HANDLER,
        details: options.details,
      });

      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify(standardError));
      }
    } catch (error) {
      logger.error("Failed to send error to WebSocket client:", error);
    }
  };

  // Universal method to send operation results with consistent structure
  const broadcastEvent = (type, data) => {
    const event = {
      type: "event",
      eventType: type,
      data,
      timestamp: new Date().toISOString(),
    };

    const message = JSON.stringify(event);
    logger.info(
      `Broadcasting event ${type} to ${clients.size} clients:`,
      event,
    );

    for (const client of clients) {
      try {
        if (client.readyState === client.OPEN) {
          client.send(message);
          logger.debug(`Sent event to client`);
        }
      } catch (error) {
        logger.debug("Failed to broadcast event:", error.message);
      }
    }
  };

  // Cleanup function for graceful shutdown
  const cleanup = () => {
    clearInterval(statusInterval);

    for (const client of clients) {
      try {
        if (client.readyState === client.OPEN) {
          client.close(1000, "Server shutdown");
        }
      } catch (error) {
        logger.debug("Error closing WebSocket client:", error.message);
      }
    }

    clients.clear();
  };

  // Function to broadcast discovery events to all clients
  const broadcastDiscoveryEvent = (eventType, data) => {
    const discoveryEvent = {
      type: "discovery_event",
      eventType,
      data,
      timestamp: new Date().toISOString(),
    };

    const message = JSON.stringify(discoveryEvent);
    logger.info(
      `Broadcasting discovery event ${eventType} to ${clients.size} clients`,
    );

    for (const client of clients) {
      try {
        if (client.readyState === client.OPEN) {
          client.send(message);
        }
      } catch (error) {
        logger.debug("Failed to broadcast discovery event:", error.message);
      }
    }

    // Also trigger a status update to refresh camera status
    setTimeout(() => broadcastStatus(), 500);
  };

  // Function to broadcast timelapse reporting events to all clients
  const broadcastTimelapseEvent = (eventType, data) => {
    const timelapseEvent = {
      type: "timelapse_event",
      eventType,
      data,
      timestamp: new Date().toISOString(),
    };

    const message = JSON.stringify(timelapseEvent);
    logger.info(
      `Broadcasting timelapse event ${eventType} to ${clients.size} clients`,
    );

    for (const client of clients) {
      try {
        if (client.readyState === client.OPEN) {
          client.send(message);
        }
      } catch (error) {
        logger.debug("Failed to broadcast timelapse event:", error.message);
      }
    }
  };

  // Function to broadcast activity log messages to all clients
  const broadcastActivityLog = (data) => {
    const activityLogEvent = {
      type: "activity_log",
      data,
      timestamp: new Date().toISOString(),
    };

    const message = JSON.stringify(activityLogEvent);
    logger.debug(
      `Broadcasting activity log to ${clients.size} clients: ${data.message}`,
    );

    for (const client of clients) {
      try {
        if (client.readyState === client.OPEN) {
          client.send(message);
        }
      } catch (error) {
        logger.debug("Failed to broadcast activity log:", error.message);
      }
    }
  };

  // Time sync message handlers
  const handleTimeSyncResponse = async (ws, data) => {
    try {
      const info = clientInfo.get(ws);
      if (!info) {
        logger.warn("Received time sync response from unknown client");
        return;
      }

      const { clientTime, timezone, gps } = data;
      if (timeSyncService) {
        await timeSyncService.handleClientTimeResponse(
          info.ip,
          clientTime,
          timezone,
          gps,
        );
      }
    } catch (error) {
      logger.error("Failed to handle time sync response:", error);
    }
  };

  const handleGPSResponse = async (ws, data) => {
    try {
      const info = clientInfo.get(ws);
      if (!info) {
        logger.warn("Received GPS response from unknown client");
        return;
      }

      // Store GPS data if valid
      if (timeSyncService && data.latitude && data.longitude) {
        timeSyncService.lastGPS = {
          latitude: data.latitude,
          longitude: data.longitude,
          accuracy: data.accuracy,
          timestamp: data.timestamp,
        };
        logger.info(`GPS location updated from ${info.ip}`);
      }
    } catch (error) {
      logger.error("Failed to handle GPS response:", error);
    }
  };

  const handleManualTimeSync = async (ws, data) => {
    try {
      const info = clientInfo.get(ws);
      if (!info) {
        return sendError(ws, "Client information not found");
      }

      const { clientTime, timezone } = data;
      await timeSyncService.handleClientTimeResponse(
        info.ip,
        clientTime,
        timezone,
      );

      sendResponse(ws, "manual_sync_complete", {
        success: true,
        message: "Manual time sync completed",
        status: timeSyncService.getStatus(),
      });
    } catch (error) {
      logger.error("Failed to handle manual time sync:", error);
      sendError(ws, `Manual time sync failed: ${error.message}`);
    }
  };

  const handleGetTimeSyncStatus = async (ws) => {
    try {
      if (!timeSyncService) {
        sendError(ws, "Time sync service not available");
        return;
      }

      const status = timeSyncService.getStatus();
      const statistics = timeSyncService.getStatistics();

      sendResponse(ws, "time_sync_status", {
        status,
        statistics,
      });
    } catch (error) {
      logger.error("Failed to get time sync status:", error);
      sendError(ws, `Failed to get time sync status: ${error.message}`);
    }
  };

  // Attach cleanup and broadcast functions to the handler for access from server
  handleConnection.cleanup = cleanup;
  handleConnection.broadcastStatus = broadcastStatus;
  handleConnection.broadcastDiscoveryEvent = broadcastDiscoveryEvent;
  handleConnection.broadcastTimelapseEvent = broadcastTimelapseEvent;
  handleConnection.broadcastActivityLog = broadcastActivityLog;

  return handleConnection;
}
