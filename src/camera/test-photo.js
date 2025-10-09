/**
 * Test Photo Service
 *
 * Handles test photo capture with EXIF metadata extraction.
 * Supports both JPEG and RAW (CR3) file formats via exiftool-vendored.
 * Optionally overrides camera quality settings for faster test photos,
 * then restores original settings.
 *
 * Workflow:
 * 1. Get current quality settings (if useCurrentSettings=false)
 * 2. Override to smallest size/quality (if requested)
 * 3. Start event polling
 * 4. Trigger shutter button with AF
 * 5. Wait for addedcontents event
 * 6. Stop event polling (automatic)
 * 7. Download photo from CCAPI
 * 8. Restore previous quality settings (if changed)
 * 9. Save photo to temp file
 * 10. Extract EXIF metadata using exiftool (supports JPEG, CR3, CR2, etc.)
 * 11. Rename file: YYYYMMDD_HHMMSS_<original>
 * 12. Return metadata and file info
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { exiftool } from "exiftool-vendored";
import { logger } from "../utils/logger.js";
import { waitForPhotoComplete } from "../utils/event-polling.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Storage directory for test photos
const PHOTOS_DIR = path.join(__dirname, "../../data/test-shots/photos");

// Timeout for photo capture (30s max shutter + processing + margin)
// Increased to handle long exposures with multiple polling attempts
const PHOTO_TIMEOUT_MS = 60000;

/**
 * Manages test photo capture with EXIF extraction
 */
export class TestPhotoService {
  /**
   * Create a TestPhotoService instance
   * @param {Function|Object} cameraController - Camera controller instance or getter function
   * @param {Object} wsHandler - WebSocket handler for broadcasting progress events (optional)
   */
  constructor(cameraController, wsHandler = null) {
    // Support both direct controller and getter function
    this.getController =
      typeof cameraController === "function"
        ? cameraController
        : () => cameraController;
    this.wsHandler = wsHandler;
    this.photos = []; // In-memory list of photos
    this.photoId = 1;
    this.captureLock = false; // Prevent concurrent captures
    this._ensureDirectoryExists();
  }

  /**
   * Ensure the photos storage directory exists
   * @private
   */
  async _ensureDirectoryExists() {
    try {
      await fs.mkdir(PHOTOS_DIR, { recursive: true });
      logger.info("Test photos storage directory ready", { path: PHOTOS_DIR });
    } catch (error) {
      logger.error("Failed to create test photos directory", {
        error: error.message,
      });
    }
  }

  /**
   * Format EXIF date as YYYYMMDD_HHMMSS
   * @private
   * @param {Date} date - Date to format
   * @returns {string} Formatted date string
   */
  _formatTimestamp(date) {
    const pad = (n) => String(n).padStart(2, "0");
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    const seconds = pad(date.getSeconds());
    return `${year}${month}${day}_${hours}${minutes}${seconds}`;
  }

  /**
   * Generate filename from EXIF data or download timestamp
   * @private
   * @param {string} originalName - Original filename from camera
   * @param {Object} exif - EXIF metadata
   * @returns {string} Formatted filename
   */
  _generateFilename(originalName, exif) {
    const timestamp = exif?.DateTimeOriginal
      ? this._formatTimestamp(new Date(exif.DateTimeOriginal))
      : this._formatTimestamp(new Date());

    const dlMarker = exif?.DateTimeOriginal ? "" : "_dl";
    return `${timestamp}${dlMarker}_${originalName}`;
  }

  /**
   * Capture a test photo with EXIF metadata
   *
   * @param {boolean} [useCurrentSettings=true] - If true (default), uses camera's current quality settings.
   *                                               If false, temporarily reduces quality to smallest JPEG for faster capture.
   * @returns {Promise<Object>} Photo metadata {id, url, filename, timestamp, exif, filepath}
   * @throws {Error} If camera not connected or capture fails
   */
  async capturePhoto(useCurrentSettings = true) {
    // Prevent concurrent captures to avoid quality setting race conditions
    if (this.captureLock) {
      logger.error("Photo capture already in progress");
      throw new Error("Photo capture already in progress");
    }

    this.captureLock = true;
    const startTime = Date.now();

    // Get current camera controller
    const controller = this.getController();

    // Check camera connection
    if (!controller || !controller.connected) {
      logger.error("Test photo capture failed: camera not connected");
      throw new Error("Camera not connected");
    }

    const photoId = this.photoId++;
    const timestamp = new Date().toISOString();

    logger.info("Starting test photo capture", {
      photoId,
      timestamp,
      useCurrentSettings,
    });

    let originalQuality = null;

    try {
      // Step 1 & 2: Override quality settings (only if requested)
      if (!useCurrentSettings) {
        // Step 1: Get current quality settings (Canon R50 uses ver110)
        logger.debug("Getting current quality settings");
        const settingsResponse = await controller.client.get(
          `${controller.baseUrl}/ccapi/ver110/shooting/settings`,
        );

        const qualityData = settingsResponse.data.stillimagequality;
        originalQuality = qualityData.value;
        const qualityOptions = qualityData.ability;

        logger.debug("Current quality settings retrieved", {
          currentQuality: originalQuality,
          availableOptions: qualityOptions,
        });

        // Step 2: Override to smallest JPEG size and disable RAW for faster capture
        // Find smallest JPEG option (prefer small2 or small1_normal)
        const jpegOptions = qualityOptions.jpeg || [];
        const smallestJpeg =
          jpegOptions.find((q) => q === "small2") ||
          jpegOptions.find((q) => q.includes("small1")) ||
          jpegOptions[jpegOptions.length - 1];

        // Override quality if we have a JPEG option and it's different from current
        if (smallestJpeg && smallestJpeg !== originalQuality.jpeg) {
          const newQuality = {
            jpeg: smallestJpeg,
          };

          // Only include 'raw' property if it exists in original settings
          // When camera is in JPEG-only mode, there is no 'raw' property
          if (originalQuality.hasOwnProperty("raw")) {
            newQuality.raw = "off"; // Disable RAW to avoid large files for test photos
          }

          logger.debug("Reducing quality to smallest JPEG for test photo", {
            from: originalQuality,
            to: newQuality,
          });

          await controller.client.put(
            `${controller.baseUrl}/ccapi/ver110/shooting/settings/stillimagequality`,
            { value: newQuality },
          );
        } else {
          logger.debug(
            "Quality already at smallest JPEG or no JPEG option available",
          );
        }
      } else {
        logger.debug("Using camera's current quality settings (no override)");
      }

      // Step 3-6: Start polling BEFORE pressing shutter to avoid race condition
      // Events can fire within 640ms of shutter press, so we must be listening first
      logger.debug("Starting event polling (before shutter press)");
      const photoCompletionPromise = waitForPhotoComplete(
        controller,
        PHOTO_TIMEOUT_MS,
      );

      // Capture timestamp RIGHT BEFORE shutter button press
      const shutterStartTime = Date.now();

      logger.debug("Pressing shutter button");
      await controller.client.post(
        `${controller.baseUrl}/ccapi/ver100/shooting/control/shutterbutton`,
        { af: true }, // Use AF from current settings
      );

      logger.debug("Waiting for photo completion event");
      const photoPath = await photoCompletionPromise;

      // Capture timestamp RIGHT AFTER addedcontents event received
      const processingEndTime = Date.now();
      const processingTimeMs = processingEndTime - shutterStartTime;

      logger.info("Photo completion event received", {
        photoPath,
        processingTimeMs,
      });

      // Step 7A: Skip file size retrieval to avoid connection conflicts
      // The controller's client has maxSockets:1 which can prevent download
      let fileSize = 0;
      logger.debug("Skipping file size check to avoid connection conflict");

      // Pause connection monitoring during download to prevent false disconnection
      // Large file downloads can take 30+ seconds and camera won't respond to
      // connection checks during this time
      controller.pauseConnectionMonitoring();
      logger.debug("Paused connection monitoring for photo download");

      // Step 7B: Download photo from CCAPI with retry for camera busy and progress tracking
      // Camera may need time to finalize file after reporting it's ready
      let photoData = null;
      const maxDownloadRetries = 5;
      let downloadRetry = 0;

      while (downloadRetry < maxDownloadRetries) {
        // Create https agent for this download attempt
        // MUST be destroyed after use to prevent connection leaks (FIN_WAIT2 accumulation)
        const axios = (await import("axios")).default;
        const https = (await import("https")).default;
        const httpsAgent = new https.Agent({
          rejectUnauthorized: false,
          keepAlive: false, // Don't keep connection alive for one-time download
        });

        try {
          // CR3 files need more time for camera to finalize
          // Start with 2s delay, then exponential backoff: 2s, 4s, 8s, 16s, 32s
          const delayMs = 2000 * Math.pow(2, downloadRetry);
          logger.info(
            `Waiting ${delayMs}ms before download attempt ${downloadRetry + 1}/${maxDownloadRetries}`,
          );
          await new Promise((resolve) => setTimeout(resolve, delayMs));

          logger.debug("Downloading photo from camera", {
            photoPath,
            attempt: downloadRetry + 1,
            fileSize,
          });

          // Use axios directly with custom config for large file downloads
          // The controller's client has maxSockets:1 which can cause conflicts
          const photoResponse = await axios.get(
            `${controller.baseUrl}${photoPath}`,
            {
              responseType: "arraybuffer",
              timeout: 120000, // 2 minutes for large CR3 files
              httpsAgent,
              onDownloadProgress: (progressEvent) => {
                const loaded = progressEvent.loaded;
                const total = progressEvent.total || fileSize;

                if (total > 0) {
                  const percentage = Math.round((loaded / total) * 100);

                  // Emit WebSocket event for frontend
                  if (this.wsHandler && this.wsHandler.broadcast) {
                    this.wsHandler.broadcast("test_photo_download_progress", {
                      percentage,
                      loaded,
                      total,
                      photoId,
                    });
                  }
                }
              },
            },
          );

          photoData = Buffer.from(photoResponse.data);
          logger.info("Photo downloaded successfully", {
            size: photoData.length,
            attempts: downloadRetry + 1,
            photoPath,
          });
          break; // Success, exit retry loop
        } catch (downloadError) {
          const isCameraBusy = downloadError.response?.status === 503;

          logger.error("Download error occurred", {
            error: downloadError.message,
            code: downloadError.code,
            status: downloadError.response?.status,
            attempt: downloadRetry + 1,
            photoPath,
          });

          if (isCameraBusy && downloadRetry < maxDownloadRetries - 1) {
            logger.debug(`Camera busy (503), will retry`, {
              attempt: downloadRetry + 1,
              remaining: maxDownloadRetries - downloadRetry - 1,
            });
            downloadRetry++;
            // Agent will be destroyed below, new one created for next iteration
            continue; // Retry
          }

          // Out of retries or different error - throw
          throw downloadError;
        } finally {
          // CRITICAL: Destroy the https agent to properly close connections
          // Without this, connections accumulate in FIN_WAIT2 state and camera refuses new connections
          httpsAgent.destroy();
          logger.debug("HTTPS agent destroyed for download attempt", {
            attempt: downloadRetry + 1,
          });
        }
      }

      // Step 9: Rename file with timestamp (before EXIF extraction)
      const originalFilename = path.basename(photoPath);

      // Step 10: Save to disk FIRST (exiftool reads from files, not buffers)
      // We'll rename the file after EXIF extraction when we have the timestamp
      const tempFilename = `temp_${Date.now()}_${originalFilename}`;
      const tempFilepath = path.join(PHOTOS_DIR, tempFilename);

      logger.debug("Saving photo to temp location for EXIF extraction", {
        tempFilepath,
      });
      await fs.writeFile(tempFilepath, photoData);

      // Step 11: Extract EXIF metadata from saved file
      logger.info("Extracting EXIF metadata", { photoPath, tempFilepath });
      let exif;
      try {
        logger.debug("Calling exiftool.read()");
        const exifData = await exiftool.read(tempFilepath);
        logger.debug("exiftool.read() completed successfully");

        // Map exiftool field names to our standard format
        exif = {
          ISO: exifData.ISO,
          ExposureTime: exifData.ExposureTime,
          ShutterSpeed: exifData.ShutterSpeedValue || exifData.ShutterSpeed,
          FNumber: exifData.FNumber || exifData.Aperture,
          WhiteBalance: exifData.WhiteBalance,
          DateTimeOriginal: exifData.DateTimeOriginal,
          Model: exifData.Model,
        };

        logger.info("EXIF metadata extracted successfully", {
          hasDate: !!exif?.DateTimeOriginal,
          ISO: exif?.ISO,
          ExposureTime: exif?.ExposureTime,
          ShutterSpeed: exif?.ShutterSpeed,
          FNumber: exif?.FNumber,
          fileType: exifData.FileType || path.extname(photoPath),
        });
      } catch (exifError) {
        // Log error but don't fail - we can still save the photo without EXIF
        logger.error("EXIF extraction failed", {
          photoPath,
          tempFilepath,
          error: exifError.message,
          stack: exifError.stack,
        });
        // Create minimal EXIF object
        exif = {};
      }

      // Step 12: Rename file with timestamp from EXIF
      const filename = this._generateFilename(originalFilename, exif);
      const filepath = path.join(PHOTOS_DIR, filename);

      // Rename temp file to final name
      logger.debug("Renaming photo with timestamp", {
        from: tempFilepath,
        to: filepath,
      });
      await fs.rename(tempFilepath, filepath);

      const elapsed = Date.now() - startTime;

      // Extract camera path from photoPath (e.g., "/ccapi/ver130/contents/card1/100CANON/IMG_0031.JPG" -> "100CANON/IMG_0031.JPG")
      const cameraPath = photoPath.split("/").slice(-2).join("/");

      // Create photo metadata
      const photo = {
        id: photoId,
        url: `/api/camera/photos/test/${photoId}`,
        filename,
        timestamp,
        cameraPath, // Original path on camera
        processingTimeMs, // Time from shutterbutton press to addedcontents event
        exif: {
          ISO: exif?.ISO,
          ExposureTime: exif?.ExposureTime,
          ShutterSpeed: exif?.ShutterSpeed,
          FNumber: exif?.FNumber,
          WhiteBalance: exif?.WhiteBalance,
          DateTimeOriginal: exif?.DateTimeOriginal,
          Model: exif?.Model,
        },
        filepath,
        size: photoData.length,
      };

      this.photos.push(photo);

      logger.info("Test photo capture completed", {
        photoId,
        filename,
        size: photoData.length,
        processingTimeMs: `${processingTimeMs}ms`,
        elapsed: `${elapsed}ms`,
      });

      return photo;
    } catch (error) {
      const elapsed = Date.now() - startTime;

      // Extract error details
      const statusCode = error.response?.status || "unknown";
      const requestUrl = error.config?.url || "unknown";
      let errorMessage = error.message;

      if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      }

      // Add context for 503 errors (camera busy)
      if (statusCode === 503) {
        errorMessage = `Camera busy (503) - please wait a moment before trying again`;
      }

      logger.error("Test photo capture failed", {
        photoId,
        error: errorMessage,
        status: statusCode,
        url: requestUrl,
        elapsed: `${elapsed}ms`,
      });

      // Re-throw with clean error message
      const cleanError = new Error(errorMessage);
      cleanError.status = statusCode;
      throw cleanError;
    } finally {
      // Always resume connection monitoring
      const controller = this.getController();
      if (controller) {
        controller.resumeConnectionMonitoring();
        logger.debug("Resumed connection monitoring after photo operation");
      }

      // Always release capture lock
      this.captureLock = false;

      // Step 8: Restore previous quality settings (always, even on failure)
      if (originalQuality) {
        // Wait a moment for camera to finish processing before restoring settings
        await new Promise((resolve) => setTimeout(resolve, 1000));

        try {
          logger.debug("Restoring original quality settings", {
            quality: originalQuality,
          });
          await controller.client.put(
            `${controller.baseUrl}/ccapi/ver110/shooting/settings/stillimagequality`,
            { value: originalQuality },
          );
          logger.debug("Quality settings restored");
        } catch (restoreError) {
          logger.warn("Failed to restore quality settings (non-critical)", {
            error: restoreError.message,
          });
        }
      }
    }
  }

  /**
   * List all captured test photos
   * @returns {Array<Object>} Array of photo metadata
   */
  listPhotos() {
    return this.photos;
  }

  /**
   * Get a specific photo by ID
   * @param {number} id - Photo ID
   * @returns {Object|undefined} Photo metadata or undefined if not found
   */
  getPhoto(id) {
    return this.photos.find((p) => p.id === id);
  }

  /**
   * Delete a specific photo by ID
   * @param {number} id - Photo ID to delete
   * @returns {Promise<boolean>} True if deleted, false if not found
   */
  async deletePhoto(id) {
    const photo = this.photos.find((p) => p.id === id);

    if (!photo) {
      logger.warn("Photo not found for deletion", { id });
      return false;
    }

    logger.info("Deleting test photo", { id, filepath: photo.filepath });

    // Remove from photos list
    this.photos = this.photos.filter((p) => p.id !== id);

    // Delete file from disk
    try {
      await fs.unlink(photo.filepath);
      logger.info("Test photo deleted", { id });
    } catch (error) {
      logger.warn("Failed to delete photo file (non-critical)", {
        id,
        filepath: photo.filepath,
        error: error.message,
      });
    }

    return true;
  }

  /**
   * Shutdown the service and cleanup resources
   * Terminates the exiftool process pool gracefully
   */
  async shutdown() {
    logger.info("Shutting down TestPhotoService");
    try {
      await exiftool.end();
      logger.info("ExifTool process pool terminated");
    } catch (error) {
      logger.warn("Error shutting down ExifTool", { error: error.message });
    }
  }
}
