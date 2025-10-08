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
 *
 * File Type Handling:
 * - Supports both JPEG and RAW (CR3) file formats
 * - Prefers JPEG when both are available (smaller files, faster download)
 * - Returns CR3 when camera is in RAW-only mode
 * - RAW+JPEG mode: Camera may emit CR3 first, JPEG in subsequent event
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

  const startTime = Date.now();
  let pollCount = 0;

  try {
    // Keep polling until we get addedcontents event or timeout
    while (Date.now() - startTime < timeoutMs) {
      pollCount++;
      const remainingTime = timeoutMs - (Date.now() - startTime);

      logger.debug(`Event poll attempt ${pollCount}`, {
        remainingTime: `${remainingTime}ms`,
      });

      try {
        // Poll for events with timeout=long (waits ~30s for events)
        // Use remaining time or 35s, whichever is less
        const pollTimeout = Math.min(remainingTime, 35000);

        const response = await cameraController.client.get(
          `${cameraController.baseUrl}/ccapi/ver110/event/polling`,
          {
            params: {
              timeout: "long",
            },
            timeout: pollTimeout,
          },
        );

        // Check if this response contains addedcontents
        const addedcontents = response.data?.addedcontents;

        if (addedcontents && addedcontents.length > 0) {
          const elapsed = Date.now() - startTime;

          // Categorize files by type
          const jpegFiles = addedcontents.filter((filePath) => {
            const ext = filePath.split(".").pop().toLowerCase();
            return ext === "jpg" || ext === "jpeg";
          });

          const rawFiles = addedcontents.filter((filePath) => {
            const ext = filePath.split(".").pop().toLowerCase();
            return ext === "cr3" || ext === "cr2" || ext === "raw";
          });

          logger.info("Photo completion event received", {
            totalFiles: addedcontents.length,
            allFiles: addedcontents,
            jpegFiles: jpegFiles.length,
            rawFiles: rawFiles.length,
            pollCount,
            elapsed: `${elapsed}ms`,
          });

          // Prefer JPEG (smaller files), but accept RAW if that's all we have
          // This supports both RAW-only mode and RAW+JPEG mode
          let filePath;
          if (jpegFiles.length > 0) {
            filePath = jpegFiles[0];
            logger.debug("Using JPEG file", { filePath });
          } else if (rawFiles.length > 0) {
            filePath = rawFiles[0];
            logger.debug("Using RAW file (no JPEG available)", { filePath });
          } else {
            // Unknown file type - use first file anyway
            filePath = addedcontents[0];
            logger.warn(
              "Unknown file type in addedcontents, using first file",
              {
                filePath,
                allFiles: addedcontents,
              },
            );
          }

          return filePath;
        }

        // No addedcontents in this event, continue polling
        // Add small delay to avoid rapid successive requests
        logger.debug("Event received but no addedcontents, continuing", {
          eventKeys: Object.keys(response.data || {}),
        });
        await new Promise((resolve) => setTimeout(resolve, 50)); // 50ms delay
      } catch (pollError) {
        // Handle errors from individual poll attempts
        if (
          pollError.code === "ECONNABORTED" ||
          pollError.message.includes("timeout")
        ) {
          // HTTP timeout on this poll - check if we have time to retry
          const elapsed = Date.now() - startTime;
          if (elapsed >= timeoutMs) {
            throw new Error(
              `Timeout waiting for photo completion (${timeoutMs}ms)`,
            );
          }
          logger.debug("Poll timeout, retrying", { elapsed: `${elapsed}ms` });
          continue;
        }

        // Connection errors should be re-thrown
        if (
          pollError.code === "ECONNREFUSED" ||
          pollError.code === "ENOTFOUND" ||
          pollError.message.includes("Network Error")
        ) {
          throw new Error("Camera disconnected during photo capture");
        }

        // CCAPI errors - handle "Already started" with retry
        if (pollError.response?.status) {
          const apiMessage =
            pollError.response.data?.message || "CCAPI event polling failed";

          // Handle "Already started" - camera session may not be fully closed yet
          if (apiMessage === "Already started") {
            logger.debug(
              "Polling session already active, waiting before retry",
            );
            await new Promise((resolve) => setTimeout(resolve, 100)); // Wait 100ms
            continue;
          }

          throw new Error(apiMessage);
        }

        // Unknown error - re-throw
        throw pollError;
      }
    }

    // If we exit the loop, we've timed out
    const elapsed = Date.now() - startTime;
    logger.error("Timeout waiting for addedcontents event", {
      elapsed: `${elapsed}ms`,
      pollCount,
    });
    throw new Error(
      `Timeout waiting for photo completion (${timeoutMs}ms, ${pollCount} polls)`,
    );
  } catch (error) {
    // Handle top-level errors
    if (error.message.includes("Camera controller is required")) {
      throw error;
    }

    if (error.message.includes("Camera disconnected")) {
      logger.error("Camera disconnected during event polling", {
        error: error.message,
      });
      throw error;
    }

    if (error.message.includes("Timeout waiting for photo completion")) {
      logger.error("Timeout waiting for photo completion", {
        timeout: `${timeoutMs}ms`,
        pollCount,
      });
      throw error;
    }

    // Unknown error
    logger.error("Unknown error during event polling", {
      error: error.message,
      code: error.code,
      pollCount,
    });
    throw new Error(`Event polling failed: ${error.message}`);
  }
}
