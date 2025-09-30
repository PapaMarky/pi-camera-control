/**
 * WebSocket Message Schema Definitions
 *
 * This file defines the expected schemas for all WebSocket messages.
 * These schemas serve as the contract between frontend and backend.
 */

const MessageSchemas = {
  // Client to Server Messages
  clientMessages: {
    take_photo: {
      type: 'take_photo',
      data: {}
    },

    get_camera_settings: {
      type: 'get_camera_settings',
      data: {}
    },

    start_intervalometer_with_title: {
      type: 'start_intervalometer_with_title',
      data: {
        interval: 'number',
        shots: 'number',
        title: 'string',
        stopTime: 'string?'  // optional
      }
    },

    network_connect: {
      type: 'network_connect',
      data: {
        ssid: 'string',
        password: 'string'
      }
    },

    get_status: {
      type: 'get_status',
      data: {}
    },

    'time-sync-response': {
      type: 'time-sync-response',
      data: {
        clientTime: 'number',
        serverTime: 'number',
        requestId: 'string'
      }
    }
  },

  // Server to Client Messages
  serverMessages: {
    welcome: {
      type: 'welcome',
      timestamp: 'string',
      camera: {
        connected: 'boolean',
        ip: 'string?',
        port: 'string?',
        model: 'string?'
      },
      power: {
        isRaspberryPi: 'boolean',
        battery: 'object?',
        thermal: 'object?'
      },
      network: {
        interfaces: 'object'
      },
      intervalometer: 'object?',
      timesync: 'object?',
      clientId: 'string'
    },

    status_update: {
      type: 'status_update',
      timestamp: 'string',
      camera: {
        connected: 'boolean',
        ip: 'string?',
        model: 'string?'
      },
      discovery: {
        isDiscovering: 'boolean',
        cameras: 'number'
      },
      power: {
        isRaspberryPi: 'boolean?',
        battery: {
          capacity: 'number?'
        },
        thermal: {
          temperature: 'number?'
        },
        uptime: 'number?'  // This was missing from design!
      },
      network: {
        interfaces: 'object'
      }
    },

    event: {
      type: 'event',
      eventType: 'string',
      timestamp: 'string',
      data: 'object'
    },

    discovery_event: {
      type: 'discovery_event',
      eventType: 'string',
      timestamp: 'string',
      data: 'object'
    },

    network_event: {
      type: 'network_event',
      eventType: 'string',
      timestamp: 'string',
      data: 'object'
    },

    timelapse_event: {
      type: 'timelapse_event',
      eventType: 'string',
      timestamp: 'string',
      data: 'object'
    },

    error: {
      type: 'error',
      timestamp: 'string',
      data: {
        message: 'string'
      }
    }
  },

  // Standardized Error Response (proposed single format)
  standardError: {
    type: 'error',
    timestamp: 'string',
    error: {
      message: 'string',
      code: 'string?',
      details: 'object?'
    },
    context: {
      operation: 'string?',
      component: 'string?'
    }
  }
};

// Event payload schemas
const EventSchemas = {
  photo_taken: {
    success: 'boolean',
    shotNumber: 'number?',
    error: 'string?'
  },

  // Discovery Events - NEW snake_case names (standardized)
  camera_discovered: {
    uuid: 'string',
    modelName: 'string',
    ipAddress: 'string',
    port: 'string?'
  },

  camera_connected: {
    uuid: 'string',
    ipAddress: 'string',
    port: 'string?'
  },

  camera_offline: {
    uuid: 'string',
    reason: 'string?'
  },

  primary_camera_changed: {
    uuid: 'string',
    info: 'object',
    controller: 'object?'
  },

  primary_camera_disconnected: {
    uuid: 'string?',
    reason: 'string'
  },

  // Discovery Events - DEPRECATED (temporary backward compatibility)
  cameraDiscovered: {
    uuid: 'string',
    modelName: 'string',
    ipAddress: 'string',
    port: 'string?'
  },

  // Internal event (not WebSocket broadcast)
  cameraIPChanged: {
    uuid: 'string',
    oldIP: 'string',
    newIP: 'string'
  },

  sessionStarted: {
    sessionId: 'string',
    title: 'string?',
    interval: 'number',
    totalShots: 'number?'
  },

  // Time Sync Events - NEW snake_case names (standardized)
  pi_sync: {
    synchronized: 'boolean',
    source: 'string',
    offset: 'number',
    reliability: 'string'
  },

  camera_sync: {
    success: 'boolean',
    previousTime: 'string',
    newTime: 'string',
    offset: 'number?'
  },

  reliability_lost: {
    reason: 'string?'
  },

  // Time Sync Events - DEPRECATED (temporary backward compatibility)
  'pi-sync': {
    synchronized: 'boolean',
    source: 'string',
    offset: 'number',
    reliability: 'string'
  },

  'camera-sync': {
    success: 'boolean',
    previousTime: 'string',
    newTime: 'string',
    offset: 'number?'
  }
};

export { MessageSchemas, EventSchemas };