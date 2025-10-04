/**
 * WebSocket Message Schema Tests
 *
 * These tests ensure that all WebSocket messages conform to documented schemas
 * and that field names are consistent between frontend and backend.
 */

import { MessageSchemas, EventSchemas } from "./websocket-message-schemas.js";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Helper function to validate type
function validateType(value, expectedType) {
  if (expectedType.endsWith("?")) {
    // Optional field
    if (value === null || value === undefined) return true;
    expectedType = expectedType.slice(0, -1);
  }

  switch (expectedType) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number";
    case "boolean":
      return typeof value === "boolean";
    case "object":
      return typeof value === "object" && value !== null;
    case "array":
      return Array.isArray(value);
    default:
      return true;
  }
}

// Helper to validate schema
function validateSchema(message, schema) {
  const errors = [];

  function validate(obj, schemaObj, path = "") {
    // Check for required fields
    for (const [key, expectedType] of Object.entries(schemaObj)) {
      const currentPath = path ? `${path}.${key}` : key;

      if (typeof expectedType === "object" && !Array.isArray(expectedType)) {
        // Nested object
        if (!obj || !obj.hasOwnProperty(key)) {
          // Check if it's optional (contains '?' anywhere in nested object)
          const isOptional = JSON.stringify(expectedType).includes("?");
          if (!isOptional) {
            errors.push(`Missing required field: ${currentPath}`);
          }
        } else {
          validate(obj[key], expectedType, currentPath);
        }
      } else {
        // Simple type check
        const isOptional = expectedType.endsWith("?");
        if (!obj || !obj.hasOwnProperty(key)) {
          if (!isOptional) {
            errors.push(`Missing required field: ${currentPath}`);
          }
        } else if (!validateType(obj[key], expectedType)) {
          errors.push(
            `Type mismatch at ${currentPath}: expected ${expectedType}, got ${typeof obj[key]}`,
          );
        }
      }
    }

    // Check for unexpected fields
    if (obj) {
      for (const key of Object.keys(obj)) {
        const currentPath = path ? `${path}.${key}` : key;
        if (!schemaObj.hasOwnProperty(key)) {
          errors.push(`Unexpected field: ${currentPath}`);
        }
      }
    }
  }

  validate(message, schema);
  return errors;
}

describe("WebSocket Message Schema Validation", () => {
  describe("Server Message Schemas", () => {
    test("status_update message follows schema", () => {
      const statusUpdate = {
        type: "status_update",
        timestamp: new Date().toISOString(),
        camera: {
          connected: true,
          ip: "192.168.4.2",
        },
        discovery: {
          isDiscovering: true,
          cameras: 1,
        },
        power: {
          battery: { capacity: 85 },
          thermal: { temperature: 45.2 },
          uptime: 3600, // This field is in code but was missing from docs
        },
        network: {
          interfaces: {
            wlan0: { connected: true },
          },
        },
      };

      const errors = validateSchema(
        statusUpdate,
        MessageSchemas.serverMessages.status_update,
      );
      expect(errors).toEqual([]);
    });

    test("welcome message follows schema", () => {
      const welcome = {
        type: "welcome",
        timestamp: new Date().toISOString(),
        camera: { connected: false },
        power: { isRaspberryPi: true },
        network: { interfaces: {} },
        clientId: "192.168.4.3:54321",
      };

      const errors = validateSchema(
        welcome,
        MessageSchemas.serverMessages.welcome,
      );
      expect(errors).toEqual([]);
    });

    test("error message follows schema", () => {
      const error = {
        type: "error",
        timestamp: new Date().toISOString(),
        data: {
          message: "Camera not available",
        },
      };

      const errors = validateSchema(error, MessageSchemas.serverMessages.error);
      expect(errors).toEqual([]);
    });
  });

  describe("Client Message Schemas", () => {
    test("start_intervalometer_with_title message follows schema", () => {
      const message = {
        type: "start_intervalometer_with_title",
        data: {
          interval: 30,
          shots: 100,
          title: "Night Sky",
        },
      };

      const errors = validateSchema(
        message,
        MessageSchemas.clientMessages.start_intervalometer_with_title,
      );
      expect(errors).toEqual([]);
    });

    test("network_connect message follows schema", () => {
      const message = {
        type: "network_connect",
        data: {
          ssid: "TestNetwork",
          password: "password123",
        },
      };

      const errors = validateSchema(
        message,
        MessageSchemas.clientMessages.network_connect,
      );
      expect(errors).toEqual([]);
    });
  });

  describe("Event Payload Schemas", () => {
    test("photo_taken event has consistent fields", () => {
      const event = {
        success: true,
        shotNumber: 25,
      };

      const errors = validateSchema(event, EventSchemas.photo_taken);
      expect(errors).toEqual([]);
    });

    test("cameraIPChanged event has consistent fields", () => {
      const event = {
        uuid: "camera-123",
        oldIP: "192.168.1.100",
        newIP: "192.168.4.2",
      };

      const errors = validateSchema(event, EventSchemas.cameraIPChanged);
      expect(errors).toEqual([]);
    });

    test("session_saved event has consistent fields", () => {
      const event = {
        sessionId: "session-123",
        report: {
          id: "report-456",
          title: "Night Sky",
          createdAt: "2024-01-01T20:00:00.000Z",
        },
        message: "Session saved as report successfully",
      };

      const errors = validateSchema(event, EventSchemas.session_saved);
      expect(errors).toEqual([]);
    });

    test("session_saved event allows optional message", () => {
      const event = {
        sessionId: "session-123",
        report: {
          id: "report-456",
        },
      };

      const errors = validateSchema(event, EventSchemas.session_saved);
      expect(errors).toEqual([]);
    });

    test("session_discarded event has consistent fields", () => {
      const event = {
        sessionId: "session-123",
        message: "Session discarded successfully",
      };

      const errors = validateSchema(event, EventSchemas.session_discarded);
      expect(errors).toEqual([]);
    });

    test("session_discarded event allows optional message", () => {
      const event = {
        sessionId: "session-123",
      };

      const errors = validateSchema(event, EventSchemas.session_discarded);
      expect(errors).toEqual([]);
    });
  });

  describe("Error Response Consistency", () => {
    test("identifies multiple error patterns in use", () => {
      const patterns = [
        // Pattern 1: Standard error
        {
          error: "Error description",
          timestamp: "2024-01-01T12:00:00.000Z",
          code: "OPERATION_FAILED",
        },
        // Pattern 2: WebSocket error
        {
          type: "error",
          timestamp: "2024-01-01T12:00:00.000Z",
          data: { message: "Error message" },
        },
        // Pattern 3: Operation result
        {
          type: "operation_result",
          success: false,
          error: "Error message",
          timestamp: "2024-01-01T12:00:00.000Z",
        },
        // Pattern 4: Event-based error
        {
          type: "event",
          eventType: "operation_failed",
          timestamp: "2024-01-01T12:00:00.000Z",
          data: { error: "Error details" },
        },
      ];

      // This test documents the problem - we have 4 different patterns!
      const uniquePatterns = new Set(
        patterns.map((p) => Object.keys(p).sort().join(",")),
      );

      expect(uniquePatterns.size).toBe(4); // This should be 1!

      // TODO: After fixing, this test should check all errors match standardError schema
    });
  });
});

describe("Schema-Code Consistency Checks", () => {
  test("WebSocket handler processes all documented message types", () => {
    // This would check that handler.js handles all message types
    const handlerPath = path.join(__dirname, "../../src/websocket/handler.js");

    if (fs.existsSync(handlerPath)) {
      const handlerCode = fs.readFileSync(handlerPath, "utf8");

      for (const msgType of Object.keys(MessageSchemas.clientMessages)) {
        // Check if handler has a case for this message type
        const hasHandler =
          handlerCode.includes(`case '${msgType}'`) ||
          handlerCode.includes(`case "${msgType}"`) ||
          handlerCode.includes(`type === '${msgType}'`) ||
          handlerCode.includes(`type === "${msgType}"`) ||
          handlerCode.includes(`handleMessage('${msgType}'`) ||
          handlerCode.includes(`handleMessage("${msgType}"`);

        if (!hasHandler) {
          console.log(`Missing handler for message type: ${msgType}`);
        }
        expect(hasHandler).toBe(true);
      }
    }
  });

  test("All event types have documented schemas", () => {
    // This would check that all events emitted in code have schemas
    // For now, we document known events that need schemas
    const requiredEventSchemas = [
      "photo_taken",
      "cameraDiscovered",
      "cameraIPChanged",
      "sessionStarted",
      "pi-sync",
      "camera-sync",
    ];

    for (const eventType of requiredEventSchemas) {
      expect(EventSchemas).toHaveProperty(eventType);
    }
  });
});

// Export for use in other tests
export { validateSchema, validateType };
