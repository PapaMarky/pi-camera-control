import { logger } from '../utils/logger.js';
import { IntervalometerSession } from '../intervalometer/session.js';

export function createWebSocketHandler(cameraController, powerManager, server) {
  const clients = new Set();
  
  // Broadcast status updates to all connected clients
  const broadcastStatus = () => {
    if (clients.size === 0) return;
    
    const status = {
      type: 'status_update',
      timestamp: new Date().toISOString(),
      camera: cameraController.getConnectionStatus(),
      power: {
        ...powerManager.getStatus(),
        uptime: process.uptime() // Add system uptime to power data
      }
    };
    
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
        logger.debug('Failed to send to WebSocket client:', error.message);
        deadClients.add(client);
      }
    }
    
    // Clean up dead connections
    for (const deadClient of deadClients) {
      clients.delete(deadClient);
    }
  };
  
  // Start periodic status broadcasts (every 10 seconds for real-time UI)
  const statusInterval = setInterval(broadcastStatus, 10000);
  
  // Handle individual WebSocket connections
  const handleConnection = (ws, req) => {
    const clientId = `${req.socket.remoteAddress}:${req.socket.remotePort}`;
    
    logger.info(`WebSocket client connected: ${clientId}`);
    clients.add(ws);
    
    // Send initial status immediately
    try {
      const initialStatus = {
        type: 'welcome',
        timestamp: new Date().toISOString(),
        camera: cameraController.getConnectionStatus(),
        power: powerManager.getStatus(),
        intervalometer: server.activeIntervalometerSession ? 
          server.activeIntervalometerSession.getStatus() : null,
        clientId
      };
      
      ws.send(JSON.stringify(initialStatus));
    } catch (error) {
      logger.error('Failed to send welcome message:', error);
    }
    
    // Handle incoming messages from clients
    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        await handleClientMessage(ws, message, clientId);
      } catch (error) {
        logger.error('Error handling WebSocket message:', error);
        sendError(ws, 'Invalid message format');
      }
    });
    
    // Handle client disconnection
    ws.on('close', (code, reason) => {
      logger.info(`WebSocket client disconnected: ${clientId} (${code}: ${reason})`);
      clients.delete(ws);
    });
    
    // Handle WebSocket errors
    ws.on('error', (error) => {
      logger.error(`WebSocket error for ${clientId}:`, error);
      clients.delete(ws);
    });
  };
  
  // Handle different types of client messages
  const handleClientMessage = async (ws, message, clientId) => {
    const { type, data } = message;
    
    logger.debug(`WebSocket message from ${clientId}:`, { type, data });
    
    try {
      switch (type) {
        case 'take_photo':
          await handleTakePhoto(ws, data);
          break;
          
        case 'get_camera_settings':
          await handleGetCameraSettings(ws);
          break;
          
        case 'validate_interval':
          await handleValidateInterval(ws, data);
          break;
          
        case 'start_intervalometer':
          await handleStartIntervalometer(ws, data);
          break;
          
        case 'stop_intervalometer':
          await handleStopIntervalometer(ws);
          break;
          
        case 'get_status':
          await handleGetStatus(ws);
          break;
          
        case 'ping':
          sendResponse(ws, 'pong', { timestamp: new Date().toISOString() });
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
  
  const handleTakePhoto = async (ws, data) => {
    try {
      await cameraController.takePhoto();
      sendResponse(ws, 'photo_taken', {
        success: true,
        timestamp: new Date().toISOString()
      });
      
      // Broadcast photo taken event to all clients
      broadcastEvent('photo_taken', { timestamp: new Date().toISOString() });
      
    } catch (error) {
      sendError(ws, `Failed to take photo: ${error.message}`);
    }
  };
  
  const handleGetCameraSettings = async (ws) => {
    try {
      const settings = await cameraController.getCameraSettings();
      sendResponse(ws, 'camera_settings', settings);
    } catch (error) {
      sendError(ws, `Failed to get camera settings: ${error.message}`);
    }
  };
  
  const handleValidateInterval = async (ws, data) => {
    try {
      const { interval } = data;
      if (!interval || interval <= 0) {
        return sendError(ws, 'Invalid interval value');
      }
      
      const validation = await cameraController.validateInterval(interval);
      sendResponse(ws, 'interval_validation', validation);
    } catch (error) {
      sendError(ws, `Failed to validate interval: ${error.message}`);
    }
  };
  
  const handleStartIntervalometer = async (ws, data) => {
    try {
      const { interval, shots, stopTime } = data;
      
      // Validation
      if (!interval || interval <= 0) {
        return sendError(ws, 'Invalid interval value');
      }
      
      // Check if session is already running
      if (server.activeIntervalometerSession && server.activeIntervalometerSession.state === 'running') {
        return sendError(ws, 'Intervalometer is already running');
      }
      
      // Validate against camera settings
      const validation = await cameraController.validateInterval(interval);
      if (!validation.valid) {
        return sendError(ws, validation.error);
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
      
      // Set up event handlers to broadcast updates to all clients
      server.activeIntervalometerSession.on('started', (sessionData) => {
        logger.info('Session started event received, broadcasting...');
        broadcastEvent('intervalometer_started', sessionData);
      });
      
      server.activeIntervalometerSession.on('photo_taken', (photoData) => {
        logger.info('Photo taken event received, broadcasting:', photoData);
        broadcastEvent('intervalometer_photo', photoData);
      });
      
      server.activeIntervalometerSession.on('photo_failed', (errorData) => {
        logger.info('Photo failed event received, broadcasting:', errorData);
        broadcastEvent('intervalometer_error', errorData);
      });
      
      server.activeIntervalometerSession.on('completed', (completionData) => {
        logger.info('Session completed event received, broadcasting:', completionData);
        broadcastEvent('intervalometer_completed', completionData);
      });
      
      server.activeIntervalometerSession.on('stopped', (stopData) => {
        logger.info('Session stopped event received, broadcasting:', stopData);
        broadcastEvent('intervalometer_stopped', stopData);
      });
      
      server.activeIntervalometerSession.on('error', (errorData) => {
        logger.info('Session error event received, broadcasting:', errorData);
        broadcastEvent('intervalometer_error', errorData);
      });
      
      // Start the session
      await server.activeIntervalometerSession.start();
      
      logger.info('Intervalometer started via WebSocket', options);
      
      sendResponse(ws, 'intervalometer_start', {
        success: true,
        message: 'Intervalometer started successfully',
        status: server.activeIntervalometerSession.getStatus()
      });
    } catch (error) {
      logger.error('Failed to start intervalometer via WebSocket:', error);
      sendError(ws, `Failed to start intervalometer: ${error.message}`);
    }
  };
  
  const handleStopIntervalometer = async (ws) => {
    try {
      if (!server.activeIntervalometerSession) {
        return sendError(ws, 'No intervalometer session is running');
      }
      
      await server.activeIntervalometerSession.stop();
      const finalStatus = server.activeIntervalometerSession.getStatus();
      
      logger.info('Intervalometer stopped via WebSocket', finalStatus.stats);
      
      sendResponse(ws, 'intervalometer_stop', {
        success: true,
        message: 'Intervalometer stopped successfully',
        status: finalStatus
      });
    } catch (error) {
      logger.error('Failed to stop intervalometer via WebSocket:', error);
      sendError(ws, `Failed to stop intervalometer: ${error.message}`);
    }
  };
  
  const handleGetStatus = async (ws) => {
    const status = {
      camera: cameraController.getConnectionStatus(),
      power: powerManager.getStatus(),
      timestamp: new Date().toISOString()
    };
    
    sendResponse(ws, 'status', status);
  };
  
  const sendResponse = (ws, type, data) => {
    try {
      const response = {
        type,
        data,
        timestamp: new Date().toISOString()
      };
      
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify(response));
      }
    } catch (error) {
      logger.error('Failed to send WebSocket response:', error);
    }
  };
  
  const sendError = (ws, error) => {
    sendResponse(ws, 'error', { message: error });
  };
  
  const broadcastEvent = (type, data) => {
    const event = {
      type: 'event',
      eventType: type,
      data,
      timestamp: new Date().toISOString()
    };
    
    const message = JSON.stringify(event);
    logger.info(`Broadcasting event ${type} to ${clients.size} clients:`, event);
    
    for (const client of clients) {
      try {
        if (client.readyState === client.OPEN) {
          client.send(message);
          logger.debug(`Sent event to client`);
        }
      } catch (error) {
        logger.debug('Failed to broadcast event:', error.message);
      }
    }
  };
  
  // Cleanup function for graceful shutdown
  const cleanup = () => {
    clearInterval(statusInterval);
    
    for (const client of clients) {
      try {
        if (client.readyState === client.OPEN) {
          client.close(1000, 'Server shutdown');
        }
      } catch (error) {
        logger.debug('Error closing WebSocket client:', error.message);
      }
    }
    
    clients.clear();
  };
  
  // Attach cleanup to the handler for access from server
  handleConnection.cleanup = cleanup;
  
  return handleConnection;
}