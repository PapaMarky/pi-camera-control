class WebSocketManager {
  constructor() {
    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 1000;
    this.listeners = new Map();
    this.connected = false;
    this.connecting = false;
  }

  connect() {
    if (this.connecting || this.connected) {
      return;
    }

    this.connecting = true;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    console.log('Connecting to WebSocket:', wsUrl);
    this.emit('connecting');

    try {
      this.ws = new WebSocket(wsUrl);
      
      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.connected = true;
        this.connecting = false;
        this.reconnectAttempts = 0;
        this.reconnectDelay = 1000;
        this.emit('connected');
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleMessage(data);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      this.ws.onclose = (event) => {
        console.log('WebSocket disconnected:', event.code, event.reason);
        this.connected = false;
        this.connecting = false;
        this.emit('disconnected', { code: event.code, reason: event.reason });
        
        // Auto-reconnect unless it was a clean shutdown
        if (event.code !== 1000) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.connected = false;
        this.connecting = false;
        this.emit('error', error);
      };

    } catch (error) {
      console.error('Failed to create WebSocket:', error);
      this.connecting = false;
      this.emit('error', error);
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      this.emit('max_reconnect_attempts');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 30000);
    
    console.log(`Scheduling reconnection attempt ${this.reconnectAttempts} in ${delay}ms`);
    this.emit('reconnecting', { attempt: this.reconnectAttempts, delay });

    setTimeout(() => {
      this.connect();
    }, delay);
  }

  send(type, data = {}) {
    if (!this.connected || !this.ws) {
      console.warn('WebSocket not connected, cannot send message:', type);
      return false;
    }

    try {
      const message = JSON.stringify({ type, data });
      this.ws.send(message);
      return true;
    } catch (error) {
      console.error('Error sending WebSocket message:', error);
      return false;
    }
  }

  // Enhanced method to send WebSocket operations with automatic UI state management
  async sendOperation(type, data = {}, uiOptions = {}) {
    const { elementId, progressText, progressIcon, timeout = 30000, onSuccess, onError } = uiOptions;

    try {
      // Set UI element to in-progress state if specified
      if (elementId) {
        window.uiStateManager.setInProgress(elementId, {
          progressText,
          progressIcon,
          timeout
        });
      }

      // Send the WebSocket message
      const success = this.send(type, data);
      if (!success) {
        throw new Error('Failed to send WebSocket message');
      }

      // Return a promise that resolves when the result is received
      return new Promise((resolve, reject) => {
        const resultType = `${type}_result`;
        const timeoutId = setTimeout(() => {
          this.off(resultType, handleResult);
          if (elementId) {
            window.uiStateManager.restore(elementId);
          }
          reject(new Error(`Operation timed out after ${timeout}ms`));
        }, timeout);

        const handleResult = (result) => {
          clearTimeout(timeoutId);
          this.off(resultType, handleResult);

          if (elementId) {
            window.uiStateManager.restore(elementId);
          }

          if (result.success) {
            if (onSuccess) onSuccess(result);
            resolve(result);
          } else {
            const error = new Error(result.error || 'Operation failed');
            error.result = result;
            if (onError) onError(error);
            reject(error);
          }
        };

        this.on(resultType, handleResult);
      });

    } catch (error) {
      if (elementId) {
        window.uiStateManager.restore(elementId);
      }
      if (onError) onError(error);
      throw error;
    }
  }

  isConnected() {
    return this.connected && this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  handleMessage(message) {
    const { type, data, eventType } = message;
    
    // Handle different message types
    switch (type) {
      case 'welcome':
        console.log('Received welcome message:', message);
        this.emit('welcome', message);
        break;
        
      case 'status_update':
        // For status_update, the camera/power data is in the message itself, not in 'data'
        this.emit('status_update', { 
          camera: message.camera, 
          power: message.power, 
          timestamp: message.timestamp 
        });
        break;
        
      case 'event':
        // Handle broadcast events from the backend
        if (eventType) {
          console.log('Received broadcast event:', eventType, data);
          this.emit(eventType, data);
        }
        break;
        
      case 'photo_taken':
        this.emit('photo_taken', data);
        break;
        
      case 'camera_settings':
        this.emit('camera_settings', data);
        break;
        
      case 'interval_validation':
        this.emit('interval_validation', data);
        break;
        
      case 'intervalometer_start':
        this.emit('intervalometer_start', data);
        break;
        
      case 'intervalometer_stop':
        this.emit('intervalometer_stop', data);
        break;
        
      case 'status':
        this.emit('status', data);
        break;
        
      case 'pong':
        this.emit('pong', data);
        break;

      case 'network_scan_result':
        this.emit('network_scan_result', data);
        break;

      case 'network_mode_result':
        this.emit('network_mode_result', data);
        break;

      case 'network_connect_result':
        this.emit('network_connect_result', data);
        break;

      case 'network_disconnect_result':
        this.emit('network_disconnect_result', data);
        break;

      case 'timelapse_reports':
        this.emit('timelapse_reports', data);
        break;

      case 'unsaved_session':
        this.emit('unsaved_session', data);
        break;

      case 'error':
        console.error('WebSocket error response:', data);
        this.emit('error_response', data);
        break;

      default:
        console.log('Unknown WebSocket message type:', type, data);
    }
  }

  // Event emitter functionality
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  off(event, callback) {
    if (this.listeners.has(event)) {
      const callbacks = this.listeners.get(event);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in ${event} listener:`, error);
        }
      });
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
    this.connected = false;
    this.connecting = false;
  }

  // Utility methods for common operations
  takePhoto() {
    return this.send('take_photo');
  }

  getCameraSettings() {
    return this.send('get_camera_settings');
  }

  validateInterval(interval) {
    return this.send('validate_interval', { interval });
  }

  startIntervalometer(options) {
    return this.send('start_intervalometer', options);
  }

  stopIntervalometer() {
    return this.send('stop_intervalometer');
  }

  getStatus() {
    return this.send('get_status');
  }

  ping() {
    return this.send('ping');
  }
}

// Global WebSocket manager instance
window.wsManager = new WebSocketManager();