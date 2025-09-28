/**
 * Standardized Error Handling Utilities
 *
 * This module provides utilities to create and broadcast errors in a consistent format
 * across all components. All error responses should use these utilities.
 */

/**
 * Creates a standardized error object
 * @param {string} message - The error message
 * @param {Object} options - Additional error options
 * @param {string} options.code - Error code (e.g., 'CAMERA_OFFLINE')
 * @param {string} options.operation - Operation that failed (e.g., 'takePhoto')
 * @param {string} options.component - Component that generated the error
 * @param {Object} options.details - Additional error details
 * @returns {Object} Standardized error object
 */
export function createStandardError(message, options = {}) {
  return {
    type: 'error',
    timestamp: new Date().toISOString(),
    error: {
      message,
      code: options.code || undefined,
      operation: options.operation || undefined,
      component: options.component || undefined,
      details: options.details || undefined
    }
  };
}

/**
 * Creates a standardized API error response
 * @param {string} message - The error message
 * @param {Object} options - Additional error options
 * @returns {Object} API error response
 */
export function createApiError(message, options = {}) {
  const error = createStandardError(message, options);
  return {
    error: error.error,
    timestamp: error.timestamp
  };
}

/**
 * Broadcasts a standardized error to all WebSocket clients
 * @param {Set} clients - Set of WebSocket clients
 * @param {string} message - The error message
 * @param {Object} options - Additional error options
 * @returns {Object} The error object that was sent
 */
export function broadcastError(clients, message, options = {}) {
  const error = createStandardError(message, options);

  if (clients && clients.size > 0) {
    const errorMessage = JSON.stringify(error);

    for (const client of clients) {
      if (client.readyState === client.OPEN) {
        try {
          client.send(errorMessage);
        } catch (sendError) {
          // Log failed send, but don't throw - other clients should still receive the message
          console.error('Failed to send error to client:', sendError);
        }
      }
    }
  }

  return error;
}

/**
 * Converts legacy error formats to standard format
 * @param {Object} legacyError - Legacy error object
 * @param {string} component - Component name for context
 * @returns {Object} Standardized error object
 */
export function convertLegacyError(legacyError, component = 'Unknown') {
  // Handle different legacy formats
  if (legacyError.type === 'operation_result' && !legacyError.success) {
    // Convert operation_result format
    return createStandardError(legacyError.error, {
      code: 'OPERATION_FAILED',
      component: component
    });
  }

  if (legacyError.data && legacyError.data.message) {
    // Convert old WebSocket error format
    return createStandardError(legacyError.data.message, {
      component: component
    });
  }

  if (legacyError.error && typeof legacyError.error === 'string') {
    // Convert API error format
    return createStandardError(legacyError.error, {
      code: legacyError.code,
      component: component
    });
  }

  // If already in standard format or unknown format, return as-is
  return legacyError;
}

/**
 * Error codes for common scenarios
 */
export const ErrorCodes = {
  // Camera errors
  CAMERA_OFFLINE: 'CAMERA_OFFLINE',
  CAMERA_BUSY: 'CAMERA_BUSY',
  PHOTO_FAILED: 'PHOTO_FAILED',
  CAMERA_TIMEOUT: 'CAMERA_TIMEOUT',

  // Network errors
  NETWORK_ERROR: 'NETWORK_ERROR',
  CONNECTION_FAILED: 'CONNECTION_FAILED',
  WIFI_SCAN_FAILED: 'WIFI_SCAN_FAILED',

  // System errors
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  SYSTEM_ERROR: 'SYSTEM_ERROR',

  // Validation errors
  INVALID_PARAMETER: 'INVALID_PARAMETER',
  MISSING_PARAMETER: 'MISSING_PARAMETER',
  VALIDATION_FAILED: 'VALIDATION_FAILED',

  // Session errors
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  OPERATION_FAILED: 'OPERATION_FAILED'
};

/**
 * Component names for error tracking
 */
export const Components = {
  CAMERA_CONTROLLER: 'CameraController',
  DISCOVERY_MANAGER: 'DiscoveryManager',
  NETWORK_MANAGER: 'NetworkManager',
  INTERVALOMETER: 'IntervalometerManager',
  POWER_MANAGER: 'PowerManager',
  WEBSOCKET_HANDLER: 'WebSocketHandler',
  API_ROUTER: 'ApiRouter',
  TIME_SYNC: 'TimeSyncService'
};