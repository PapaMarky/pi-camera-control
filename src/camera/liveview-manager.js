/**
 * Live View Manager
 *
 * Handles live view image capture from Canon camera via CCAPI.
 * Provides simple on-demand capture functionality for the Test Shot feature.
 *
 * Phase 0 Research Results:
 * - Live view enable: ~1.6s
 * - Image capture: ~1.2s
 * - Total: ~2.8s (acceptable for MVP)
 * - Image size: ~29KB (small size)
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Storage directory for live view captures
const LIVEVIEW_DIR = path.join(__dirname, '../../data/test-shots/liveview');

/**
 * Manages live view image capture and storage
 */
export class LiveViewManager {
  /**
   * Create a LiveViewManager instance
   * @param {Function|Object} cameraController - Camera controller instance or getter function
   */
  constructor(cameraController) {
    // Support both direct controller and getter function
    this.getController = typeof cameraController === 'function'
      ? cameraController
      : () => cameraController;
    this.captures = []; // In-memory list of captures for MVP
    this.captureId = 1;
    this._ensureDirectoryExists();
  }

  /**
   * Ensure the live view storage directory exists
   * @private
   */
  async _ensureDirectoryExists() {
    try {
      await fs.mkdir(LIVEVIEW_DIR, { recursive: true });
      logger.info('Live view storage directory ready', { path: LIVEVIEW_DIR });
    } catch (error) {
      logger.error('Failed to create live view directory', { error: error.message });
    }
  }

  /**
   * Capture a live view image from the camera
   *
   * Workflow:
   * 1. Enable live view (small size for fast capture)
   * 2. Capture image via /liveview/flip
   * 3. Save to disk with timestamp
   * 4. Disable live view
   * 5. Add to captures list
   *
   * @returns {Promise<Object>} Capture metadata {id, url, timestamp, size, filepath}
   * @throws {Error} If camera not connected or capture fails
   */
  async captureImage() {
    const startTime = Date.now();

    // Get current camera controller
    const controller = this.getController();

    // Check camera connection
    if (!controller || !controller.connected) {
      logger.error('Live view capture failed: camera not connected');
      throw new Error('Camera not connected');
    }

    const captureId = this.captureId++;
    const timestamp = new Date().toISOString();
    const filename = `${Date.now()}.jpg`;
    const filepath = path.join(LIVEVIEW_DIR, filename);

    logger.info('Starting live view capture', { captureId, timestamp });

    try {
      // Step 1: Enable live view
      logger.debug('Enabling live view (small size)');
      await controller.client.post(
        `${controller.baseUrl}/ccapi/ver100/shooting/liveview`,
        {
          liveviewsize: 'small',
          cameradisplay: 'on',
        }
      );

      // Step 2: Capture image
      logger.debug('Capturing live view image');
      const response = await controller.client.get(
        `${controller.baseUrl}/ccapi/ver100/shooting/liveview/flip`,
        {
          responseType: 'arraybuffer',
          timeout: 10000, // 10s timeout (3x Phase 0 time for safety)
        }
      );

      // Step 3: Save to disk
      logger.debug('Saving live view image', { filepath, size: response.data.length });
      await fs.writeFile(filepath, Buffer.from(response.data));

      const size = response.data.length;
      const elapsed = Date.now() - startTime;

      // Step 4: Disable live view (cleanup)
      try {
        logger.debug('Disabling live view');
        await controller.client.post(
          `${controller.baseUrl}/ccapi/ver100/shooting/liveview`,
          {
            liveviewsize: 'off',
          }
        );
      } catch (disableError) {
        // Log but don't fail - capture succeeded
        logger.warn('Failed to disable live view (non-critical)', {
          error: disableError.message,
        });
      }

      // Step 5: Add to captures list
      const capture = {
        id: captureId,
        url: `/api/camera/liveview/images/${captureId}`,
        timestamp,
        size,
        filepath,
      };

      this.captures.push(capture);

      logger.info('Live view capture completed', {
        captureId,
        size,
        elapsed: `${elapsed}ms`,
      });

      return capture;
    } catch (error) {
      logger.error('Live view capture failed', {
        captureId,
        error: error.message,
        elapsed: `${Date.now() - startTime}ms`,
      });

      // Attempt cleanup on failure
      try {
        const controller = this.getController();
        if (controller && controller.connected) {
          await controller.client.post(
            `${controller.baseUrl}/ccapi/ver100/shooting/liveview`,
            {
              liveviewsize: 'off',
            }
          );
        }
      } catch (cleanupError) {
        logger.warn('Cleanup failed after capture error', {
          error: cleanupError.message,
        });
      }

      throw error;
    }
  }

  /**
   * List all captured live view images
   * @returns {Array<Object>} Array of capture metadata
   */
  listCaptures() {
    return this.captures;
  }

  /**
   * Get a specific capture by ID
   * @param {number} id - Capture ID
   * @returns {Object|undefined} Capture metadata or undefined if not found
   */
  getCapture(id) {
    return this.captures.find((c) => c.id === id);
  }

  /**
   * Delete a specific capture by ID
   * @param {number} id - Capture ID to delete
   * @returns {Promise<boolean>} True if deleted, false if not found
   */
  async deleteCapture(id) {
    const capture = this.captures.find((c) => c.id === id);

    if (!capture) {
      logger.warn('Capture not found for deletion', { id });
      return false;
    }

    logger.info('Deleting live view capture', { id, filepath: capture.filepath });

    // Remove from captures list
    this.captures = this.captures.filter((c) => c.id !== id);

    // Delete file from disk
    try {
      await fs.unlink(capture.filepath);
      logger.info('Live view capture deleted', { id });
    } catch (error) {
      logger.warn('Failed to delete capture file (non-critical)', {
        id,
        filepath: capture.filepath,
        error: error.message,
      });
    }

    return true;
  }

  /**
   * Clear all captures
   * Note: For MVP, this clears the list and optionally deletes files
   * @returns {Promise<void>}
   */
  async clearAll() {
    logger.info('Clearing all live view captures', {
      count: this.captures.length,
    });

    // Optional: Delete files from disk
    // For now, just clear the list (files will accumulate for observation)
    this.captures = [];
    this.captureId = 1;

    logger.info('All live view captures cleared');
  }
}
