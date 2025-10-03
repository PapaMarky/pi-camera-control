/**
 * CCAPI Event Polling Utility
 *
 * Provides utilities for waiting on camera events during photo capture.
 * Used by test photo service to detect when photo capture is complete.
 *
 * CCAPI Event Polling (Canon EOS R50 - ver110):
 * - GET /ccapi/ver110/event/polling?timeout=long
 * - Long-polling endpoint that returns when camera state changes
 * - Returns addedcontents event with file path when photo is captured
 * - Timeout parameter: "long" (about 30 seconds per CCAPI spec)
 * - HTTP timeout: 35 seconds (30s CCAPI timeout + 5s margin)
 *
 * Phase 0 Research: Camera supports concurrent polling + control (347ms response)
 */

import { logger } from "./logger.js";

// Default timeout: 30s max shutter speed + 5s margin
const DEFAULT_TIMEOUT_MS = 35000;

/**
 * Wait for photo capture completion event from camera
 *
 * Starts CCAPI event polling and waits for addedcontents event indicating
 * photo capture is complete. Returns the file path from the event.
 *
 * @param {Object} cameraController - Camera controller instance
 * @param {number} timeoutMs - Optional timeout in milliseconds (default: 35000)
 * @returns {Promise<string>} File path of captured photo
 * @throws {Error} If timeout occurs, camera disconnects, or no photo path received
 */
export async function waitForPhotoComplete(
  cameraController,
  timeoutMs = DEFAULT_TIMEOUT_MS,
) {
  // Validate camera controller
  if (!cameraController) {
    throw new Error("Camera controller is required");
  }

  logger.info("Starting event polling for photo completion", {
    timeout: `${timeoutMs}ms`,
  });

  try {
    // Start event polling with timeout=long for long-polling (ver110)
    const response = await cameraController.client.get(
      `${cameraController.baseUrl}/ccapi/ver110/event/polling`,
      {
        params: {
          timeout: "long",
        },
        timeout: timeoutMs,
      },
    );

    // Extract addedcontents from response
    const addedcontents = response.data?.addedcontents;

    if (!addedcontents || addedcontents.length === 0) {
      logger.error("Event polling returned no photo path", {
        responseData: response.data,
      });
      throw new Error("No photo path in event response");
    }

    // Return first file path (typically JPEG, may have RAW as second entry)
    const filePath = addedcontents[0];
    logger.info("Photo completion event received", {
      filePath,
      totalFiles: addedcontents.length,
    });

    return filePath;
  } catch (error) {
    // Handle specific error cases
    if (error.code === "ECONNABORTED" || error.message.includes("timeout")) {
      logger.error("Timeout waiting for photo completion", {
        timeout: `${timeoutMs}ms`,
        error: error.message,
      });
      throw new Error(`Timeout waiting for photo completion (${timeoutMs}ms)`);
    }

    if (
      error.code === "ECONNREFUSED" ||
      error.code === "ENOTFOUND" ||
      error.message.includes("Network Error")
    ) {
      logger.error("Camera disconnected during event polling", {
        error: error.message,
      });
      throw new Error("Camera disconnected during photo capture");
    }

    // Handle CCAPI error responses
    if (error.response?.status) {
      const apiMessage =
        error.response.data?.message || "CCAPI event polling failed";
      logger.error("CCAPI error during event polling", {
        status: error.response.status,
        message: apiMessage,
      });
      throw new Error(apiMessage);
    }

    // Re-throw if already processed (e.g., "No photo path in event response")
    if (
      error.message === "No photo path in event response" ||
      error.message === "Camera controller is required"
    ) {
      throw error;
    }

    // Unknown error
    logger.error("Unknown error during event polling", {
      error: error.message,
      code: error.code,
    });
    throw new Error(`Event polling failed: ${error.message}`);
  }
}
