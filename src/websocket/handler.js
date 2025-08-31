import { logger } from '../utils/logger.js';

export function createWebSocketHandler(cameraController, powerManager) {
  const clients = new Set();
  
  // Broadcast status updates to all connected clients
  const broadcastStatus = () => {
    if (clients.size === 0) return;
    
    const status = {
      type: 'status_update',
      timestamp: new Date().toISOString(),
      camera: cameraController.getConnectionStatus(),
      power: powerManager.getStatus()
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
    // TODO: Implement full intervalometer functionality in Phase 2 expansion
    logger.info('Intervalometer start requested via WebSocket:', data);
    sendResponse(ws, 'intervalometer_start', {
      success: true,
      message: 'Intervalometer functionality coming in Phase 2 expansion',
      params: data
    });
  };
  
  const handleStopIntervalometer = async (ws) => {
    // TODO: Implement intervalometer stop functionality
    sendResponse(ws, 'intervalometer_stop', {
      success: true,
      message: 'Stop command acknowledged'
    });
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
    
    for (const client of clients) {
      try {
        if (client.readyState === client.OPEN) {
          client.send(message);
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