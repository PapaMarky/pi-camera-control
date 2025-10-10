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
      type: "take_photo",
      data: {},
    },

    get_camera_settings: {
      type: "get_camera_settings",
      data: {},
    },

    start_intervalometer_with_title: {
      type: "start_intervalometer_with_title",
      data: {
        interval: "number",
        shots: "number",
        title: "string",
        stopTime: "string?", // optional
      },
    },

    network_connect: {
      type: "network_connect",
      data: {
        ssid: "string",
        password: "string",
      },
    },

    get_status: {
      type: "get_status",
      data: {},
    },

    "time-sync-response": {
      type: "time-sync-response",
      data: {
        clientTime: "number",
        serverTime: "number",
        requestId: "string",
      },
    },
  },

  // Server to Client Messages
  serverMessages: {
    welcome: {
      type: "welcome",
      timestamp: "string",
      camera: {
        connected: "boolean",
        ip: "string?",
        port: "string?",
        model: "string?",
      },
      power: {
        isRaspberryPi: "boolean",
        battery: "object?",
        thermal: "object?",
      },
      network: {
        interfaces: "object",
      },
      storage: {
        mounted: "boolean?",
        totalMB: "number?",
        freeMB: "number?",
        usedMB: "number?",
        percentUsed: "number?",
      },
      temperature: "string?",
      intervalometer: "object?",
      timesync: {
        pi: {
          isSynchronized: "boolean",
          reliability: "string",
          lastSyncTime: "string?",
        },
        camera: {
          isSynchronized: "boolean",
          lastSyncTime: "string?",
        },
        piProxyState: {
          state: "string",
          valid: "boolean",
          acquiredAt: "string?",
          ageSeconds: "number?",
          clientIP: "string?",
        },
        connectedClients: {
          ap0Count: "number",
          wlan0Count: "number",
        },
      },
      clientId: "string",
    },

    // Time sync status broadcast (periodic and after sync events)
    "time-sync-status": {
      type: "time-sync-status",
      data: {
        pi: {
          isSynchronized: "boolean",
          reliability: "string",
          lastSyncTime: "string?",
        },
        camera: {
          isSynchronized: "boolean",
          lastSyncTime: "string?",
        },
        piProxyState: {
          state: "string",
          valid: "boolean",
          acquiredAt: "string?",
          ageSeconds: "number?",
          clientIP: "string?",
        },
        connectedClients: {
          ap0Count: "number",
          wlan0Count: "number",
        },
      },
    },

    status_update: {
      type: "status_update",
      timestamp: "string",
      camera: {
        connected: "boolean",
        ip: "string?",
        model: "string?",
      },
      discovery: {
        isDiscovering: "boolean",
        cameras: "number",
      },
      power: {
        isRaspberryPi: "boolean?",
        battery: {
          capacity: "number?",
        },
        thermal: {
          temperature: "number?",
        },
        uptime: "number?", // This was missing from design!
      },
      network: {
        interfaces: "object",
      },
      storage: {
        mounted: "boolean?",
        totalMB: "number?",
        freeMB: "number?",
        usedMB: "number?",
        percentUsed: "number?",
      },
      temperature: "string?",
      intervalometer: {
        running: "boolean?",
        state: "string?",
        stats: {
          startTime: "string?",
          shotsTaken: "number?",
          shotsSuccessful: "number?",
          shotsFailed: "number?",
          currentShot: "number?",
          nextShotTime: "string?",
          overtimeShots: "number?",
          totalOvertimeSeconds: "number?",
          maxOvertimeSeconds: "number?",
          lastShotDuration: "number?",
          totalShotDurationSeconds: "number?",
        },
        options: {
          interval: "number?",
          totalShots: "number?",
          stopTime: "string?",
          stopCondition: "string?",
        },
        averageShotDuration: "number?",
      },
      timesync: {
        pi: {
          isSynchronized: "boolean?",
          reliability: "string?",
          lastSyncTime: "string?",
        },
        camera: {
          isSynchronized: "boolean?",
          lastSyncTime: "string?",
        },
        piProxyState: {
          state: "string?",
          valid: "boolean?",
          acquiredAt: "string?",
          ageSeconds: "number?",
          clientIP: "string?",
        },
        connectedClients: {
          ap0Count: "number?",
          wlan0Count: "number?",
        },
      },
    },

    event: {
      type: "event",
      eventType: "string",
      timestamp: "string",
      data: "object",
    },

    discovery_event: {
      type: "discovery_event",
      eventType: "string",
      timestamp: "string",
      data: "object",
    },

    network_event: {
      type: "network_event",
      eventType: "string",
      timestamp: "string",
      data: "object",
    },

    timelapse_event: {
      type: "timelapse_event",
      eventType: "string",
      timestamp: "string",
      data: "object",
    },

    error: {
      type: "error",
      timestamp: "string",
      data: {
        message: "string",
      },
    },
  },

  // Standardized Error Response (proposed single format)
  standardError: {
    type: "error",
    timestamp: "string",
    error: {
      message: "string",
      code: "string?",
      details: "object?",
    },
    context: {
      operation: "string?",
      component: "string?",
    },
  },
};

// Event payload schemas
const EventSchemas = {
  photo_taken: {
    success: "boolean",
    shotNumber: "number?",
    error: "string?",
  },

  photo_overtime: {
    sessionId: "string",
    title: "string",
    shotNumber: "number",
    interval: "number",
    shotDuration: "number",
    overtime: "number",
    filePath: "string?",
    message: "string",
  },

  // Discovery Events - NEW snake_case names (standardized)
  camera_discovered: {
    uuid: "string",
    modelName: "string",
    ipAddress: "string",
    port: "string?",
  },

  camera_connected: {
    uuid: "string",
    ipAddress: "string",
    port: "string?",
  },

  camera_offline: {
    uuid: "string",
    reason: "string?",
  },

  primary_camera_changed: {
    uuid: "string",
    info: "object",
    controller: "object?",
  },

  primary_camera_disconnected: {
    uuid: "string?",
    reason: "string",
  },

  // Discovery Events - DEPRECATED (temporary backward compatibility)
  cameraDiscovered: {
    uuid: "string",
    modelName: "string",
    ipAddress: "string",
    port: "string?",
  },

  // Internal event (not WebSocket broadcast)
  cameraIPChanged: {
    uuid: "string",
    oldIP: "string",
    newIP: "string",
  },

  sessionStarted: {
    sessionId: "string",
    title: "string?",
    interval: "number",
    totalShots: "number?",
  },

  // Time Sync Events - NEW snake_case names (standardized)
  pi_sync: {
    synchronized: "boolean",
    source: "string",
    offset: "number",
    reliability: "string",
  },

  camera_sync: {
    success: "boolean",
    previousTime: "string",
    newTime: "string",
    offset: "number?",
  },

  reliability_lost: {
    reason: "string?",
  },

  // Time Sync Events - DEPRECATED (temporary backward compatibility)
  "pi-sync": {
    synchronized: "boolean",
    source: "string",
    offset: "number",
    reliability: "string",
  },

  "camera-sync": {
    success: "boolean",
    previousTime: "string",
    newTime: "string",
    offset: "number?",
  },

  // Timelapse Session Events
  session_saved: {
    sessionId: "string",
    report: "object",
    message: "string?",
  },

  session_discarded: {
    sessionId: "string",
    message: "string?",
  },

  // Test Photo Events
  test_photo_download_progress: {
    percentage: "number",
    loaded: "number",
    total: "number",
    photoId: "number",
  },
};

export { MessageSchemas, EventSchemas };
