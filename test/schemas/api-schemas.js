/**
 * API Response Schemas Based on Design Specifications
 *
 * These schemas represent the CORRECT API response formats according to
 * docs/design/api-specification.md, not the current implementation.
 */

export const APISchemas = {
  // Intervalometer Status Response (Lines 142-157 in api-specification.md)
  intervalometerStatus: {
    active: {
      type: "object",
      required: ["running", "state", "stats", "options"],
      properties: {
        running: { type: "boolean", enum: [true] },
        state: { type: "string", enum: ["running"] },
        stats: {
          type: "object",
          required: [
            "startTime",
            "shotsTaken",
            "shotsSuccessful",
            "shotsFailed",
            "currentShot",
          ],
          properties: {
            startTime: { type: "string", format: "date-time" },
            shotsTaken: { type: "number", minimum: 0 },
            shotsSuccessful: { type: "number", minimum: 0 },
            shotsFailed: { type: "number", minimum: 0 },
            currentShot: { type: "number", minimum: 1 },
            nextShotTime: { type: "string", format: "date-time" },
          },
        },
        options: {
          type: "object",
          required: ["interval"],
          properties: {
            interval: { type: "number", minimum: 1 },
            totalShots: { type: ["number", "null"], minimum: 1 },
            stopTime: { type: ["string", "null"], format: "date-time" },
          },
        },
      },
    },
    inactive: {
      type: "object",
      required: ["running", "state"],
      properties: {
        running: { type: "boolean", enum: [false] },
        state: { type: "string", enum: ["stopped", "inactive"] },
        // Note: 'message' field is NOT in specification
      },
    },
  },

  // Network Status Response (Lines 210-230 in api-specification.md)
  networkStatus: {
    type: "object",
    required: ["interfaces"],
    properties: {
      interfaces: {
        type: "object",
        patternProperties: {
          "^(wlan0|ap0)$": {
            type: "object",
            required: ["active"],
            properties: {
              active: { type: "boolean" },
              connected: { type: "boolean" },
              network: { type: ["string", "null"] },
              signal: { type: "number", minimum: 0, maximum: 100 },
              ip: { type: ["string", "null"], format: "ipv4" },
            },
          },
        },
      },
      services: {
        type: "object",
        properties: {
          hostapd: {
            type: "object",
            required: ["active"],
            properties: {
              active: { type: "boolean" },
            },
          },
          dnsmasq: {
            type: "object",
            required: ["active"],
            properties: {
              active: { type: "boolean" },
            },
          },
        },
      },
    },
  },

  // Camera Status Response (Lines 19-28 in api-specification.md)
  cameraStatus: {
    type: "object",
    required: ["connected"],
    properties: {
      connected: { type: "boolean" },
      ip: { type: ["string", "null"], format: "ipv4" },
      port: { type: ["string", "null"] },
      lastError: { type: ["string", "null"] },
      shutterEndpoint: { type: ["string", "null"] },
      hasCapabilities: { type: "boolean" },
    },
  },

  // Camera Settings Response (Lines 38-43 in api-specification.md)
  cameraSettings: {
    type: "object",
    properties: {
      av: {
        type: "object",
        required: ["value", "available"],
        properties: {
          value: { type: "string" },
          available: { type: "array", items: { type: "string" } },
        },
      },
      tv: {
        type: "object",
        required: ["value", "available"],
        properties: {
          value: { type: "string" },
          available: { type: "array", items: { type: "string" } },
        },
      },
      iso: {
        type: "object",
        required: ["value", "available"],
        properties: {
          value: { type: "string" },
          available: { type: "array", items: { type: "string" } },
        },
      },
    },
  },

  // Camera Battery Response - Based on real Canon CCAPI documentation
  // CameraControlAPI_Reference_v140/4.4.4 and 4.4.5
  cameraBattery: {
    type: "object",
    required: ["batterylist"],
    properties: {
      batterylist: {
        type: "array",
        items: {
          type: "object",
          required: ["position", "name", "kind", "level", "quality"],
          properties: {
            position: {
              type: "string",
              enum: ["camera", "grip01", "grip02"],
            },
            name: { type: "string" },
            kind: {
              type: "string",
              enum: [
                "battery",
                "not_inserted",
                "ac_adapter",
                "dc_coupler",
                "unknown",
              ],
            },
            level: {
              type: "string", // Canon returns strings: "0"-"100" or "low"/"high"/"full" etc
            },
            quality: {
              type: "string",
              enum: ["bad", "normal", "good", "unknown"],
            },
          },
        },
      },
    },
  },

  // Photo Response (Lines 71-76 in api-specification.md)
  photoResponse: {
    type: "object",
    required: ["success", "timestamp"],
    properties: {
      success: { type: "boolean" },
      timestamp: { type: "string", format: "date-time" },
    },
  },
};

// Schema validation helper
export function validateAPISchema(data, schemaName, subSchema = null) {
  const schema = subSchema
    ? APISchemas[schemaName][subSchema]
    : APISchemas[schemaName];

  if (!schema) {
    throw new Error(
      `Schema ${schemaName}${subSchema ? "." + subSchema : ""} not found`,
    );
  }

  // Simple validation - in real implementation, use ajv or similar
  return validateObject(data, schema);
}

function validateObject(data, schema) {
  const errors = [];

  // Check required fields
  if (schema.required) {
    for (const field of schema.required) {
      if (!(field in data)) {
        errors.push(`Missing required field: ${field}`);
      }
    }
  }

  // Check field types and constraints
  if (schema.properties) {
    for (const [field, fieldSchema] of Object.entries(schema.properties)) {
      if (field in data) {
        const fieldErrors = validateField(data[field], fieldSchema, field);
        errors.push(...fieldErrors);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function validateField(value, schema, fieldName) {
  const errors = [];

  // Type validation
  if (schema.type) {
    const expectedTypes = Array.isArray(schema.type)
      ? schema.type
      : [schema.type];
    const actualType =
      value === null ? "null" : Array.isArray(value) ? "array" : typeof value;

    if (!expectedTypes.includes(actualType)) {
      errors.push(
        `Field ${fieldName}: expected ${expectedTypes.join(" or ")}, got ${actualType}`,
      );
    }
  }

  // Enum validation
  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(
      `Field ${fieldName}: value '${value}' not in allowed values [${schema.enum.join(", ")}]`,
    );
  }

  // Number constraints
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push(
        `Field ${fieldName}: value ${value} below minimum ${schema.minimum}`,
      );
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      errors.push(
        `Field ${fieldName}: value ${value} above maximum ${schema.maximum}`,
      );
    }
  }

  // Array validation
  if (Array.isArray(value) && schema.items) {
    value.forEach((item, index) => {
      const itemErrors = validateField(
        item,
        schema.items,
        `${fieldName}[${index}]`,
      );
      errors.push(...itemErrors);
    });
  }

  // Object validation (for nested objects)
  if (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    schema.properties
  ) {
    const objectValidation = validateObject(value, schema);
    errors.push(...objectValidation.errors);
  }

  return errors;
}
