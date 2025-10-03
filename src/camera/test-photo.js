/**
 * Test Photo Service
 *
 * Handles test photo capture with EXIF metadata extraction.
 * Temporarily overrides camera quality settings for faster test photos,
 * then restores original settings.
 *
 * Workflow (from feature-test-shot-plan.md lines 243-256):
 * 1. Get current quality settings
 * 2. Override to smallest size/quality
 * 3. Start event polling
 * 4. Trigger shutter button with AF
 * 5. Wait for addedcontents event
 * 6. Stop event polling (automatic)
 * 7. Download photo from CCAPI
 * 8. Restore previous quality settings
 * 9. Extract EXIF metadata
 * 10. Rename file: YYYYMMDD_HHMMSS_<original>
 * 11. Save to /data/test-shots/photos/
 * 12. Return metadata and file info
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import exifr from "exifr";
import { logger } from "../utils/logger.js";
import { waitForPhotoComplete } from "../utils/event-polling.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Storage directory for test photos
const PHOTOS_DIR = path.join(__dirname, "../../data/test-shots/photos");

// Timeout for photo capture (30s max shutter + 5s margin)
const PHOTO_TIMEOUT_MS = 35000;

/**
 * Manages test photo capture with EXIF extraction
 */
export class TestPhotoService {
  /**
   * Create a TestPhotoService instance
   * @param {Function|Object} cameraController - Camera controller instance or getter function
   */
  constructor(cameraController) {
    // Support both direct controller and getter function
    this.getController =
      typeof cameraController === "function"
        ? cameraController
        : () => cameraController;
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
   * @returns {Promise<Object>} Photo metadata {id, url, filename, timestamp, exif, filepath}
   * @throws {Error} If camera not connected or capture fails
   */
  async capturePhoto() {
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

    logger.info("Starting test photo capture", { photoId, timestamp });

    let originalQuality = null;

    try {
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

      // Step 2: Override to smallest JPEG size (keep RAW unchanged)
      // Find smallest JPEG option (prefer small2 or small1_normal)
      const jpegOptions = qualityOptions.jpeg || [];
      const smallestJpeg =
        jpegOptions.find((q) => q === "small2") ||
        jpegOptions.find((q) => q.includes("small1")) ||
        jpegOptions[jpegOptions.length - 1];

      if (smallestJpeg && smallestJpeg !== originalQuality.jpeg) {
        const newQuality = {
          raw: originalQuality.raw, // Keep RAW setting unchanged
          jpeg: smallestJpeg,
        };

        logger.debug("Setting quality to smallest JPEG for test photo", {
          from: originalQuality,
          to: newQuality,
        });

        await controller.client.put(
          `${controller.baseUrl}/ccapi/ver110/shooting/settings/stillimagequality`,
          { value: newQuality },
        );
      }

      // Step 3-6: Trigger shutter and wait for completion
      logger.debug("Pressing shutter button");
      await controller.client.post(
        `${controller.baseUrl}/ccapi/ver100/shooting/control/shutterbutton`,
        { af: true }, // Use AF from current settings
      );

      logger.debug("Waiting for photo completion event");
      const photoPath = await waitForPhotoComplete(
        controller,
        PHOTO_TIMEOUT_MS,
      );

      logger.info("Photo completion event received", { photoPath });

      // Brief delay to let camera finalize the file before download
      logger.debug("Waiting 500ms for camera to finalize file");
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Step 7: Download photo from CCAPI
      logger.debug("Downloading photo from camera", { photoPath });
      const photoResponse = await controller.client.get(
        `${controller.baseUrl}${photoPath}`,
        {
          responseType: "arraybuffer",
          timeout: 30000, // 30s timeout for download
        },
      );

      const photoData = Buffer.from(photoResponse.data);
      logger.debug("Photo downloaded", { size: photoData.length });

      // Step 9: Extract EXIF metadata
      logger.debug("Extracting EXIF metadata");
      const exif = await exifr.parse(photoData);

      logger.debug("EXIF metadata extracted", {
        hasDate: !!exif?.DateTimeOriginal,
        ISO: exif?.ISO,
        ShutterSpeed: exif?.ShutterSpeed,
        FNumber: exif?.FNumber,
      });

      // Step 10: Rename file with timestamp
      const originalFilename = path.basename(photoPath);
      const filename = this._generateFilename(originalFilename, exif);
      const filepath = path.join(PHOTOS_DIR, filename);

      // Step 11: Save to disk
      logger.debug("Saving photo to disk", { filepath });
      await fs.writeFile(filepath, photoData);

      const elapsed = Date.now() - startTime;

      // Create photo metadata
      const photo = {
        id: photoId,
        url: `/api/camera/photos/test/${photoId}`,
        filename,
        timestamp,
        exif: {
          ISO: exif?.ISO,
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
      // Always release capture lock
      this.captureLock = false;

      // Step 8: Restore previous quality settings (always, even on failure)
      if (originalQuality) {
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
}
