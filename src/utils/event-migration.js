/**
 * Event Name Migration Utility
 *
 * Temporary utility for migrating event names to snake_case convention.
 * Supports dual emission of both old and new event names during transition.
 *
 * TODO: Remove this file after frontend migration is complete
 */

import { logger } from "./logger.js";

/**
 * Event name mappings for migration
 * Maps old event names to new snake_case names
 */
export const EVENT_NAME_MIGRATIONS = {
  // Discovery events: camelCase → snake_case
  cameraDiscovered: "camera_discovered",
  cameraConnected: "camera_connected",
  cameraOffline: "camera_offline",
  primaryCameraChanged: "primary_camera_changed",
  primaryCameraDisconnected: "primary_camera_disconnected",
  cameraError: "camera_error",

  // Time sync events: kebab-case → snake_case
  "camera-sync": "camera_sync",
  "pi-sync": "pi_sync",
  "reliability-lost": "reliability_lost",
};

/**
 * Emits both old and new event names during migration
 * Logs deprecation warning for old event names
 *
 * @param {Function} broadcastFn - Function to call for broadcasting (e.g., broadcastDiscoveryEvent)
 * @param {string} oldName - Deprecated event name
 * @param {string} newName - New snake_case event name
 * @param {Object} data - Event data to broadcast
 */
export function dualEmit(broadcastFn, oldName, newName, data) {
  // Emit new name first (primary)
  broadcastFn(newName, data);

  // Emit old name second (deprecated) with warning
  logger.warn(
    `[EVENT MIGRATION] Emitting deprecated event "${oldName}". Use "${newName}" instead. This will be removed in a future release.`,
  );
  broadcastFn(oldName, data);
}

/**
 * Gets the new snake_case name for an event, or returns the original if no migration needed
 *
 * @param {string} eventName - Event name to check
 * @returns {string} New event name or original if no migration
 */
export function getNewEventName(eventName) {
  return EVENT_NAME_MIGRATIONS[eventName] || eventName;
}

/**
 * Checks if an event name needs migration
 *
 * @param {string} eventName - Event name to check
 * @returns {boolean} True if event needs migration
 */
export function needsMigration(eventName) {
  return eventName in EVENT_NAME_MIGRATIONS;
}

/**
 * Helper for migrating discovery events with dual emission
 *
 * @param {Function} broadcastFn - broadcastDiscoveryEvent function
 * @param {string} eventName - Event name (will be migrated if needed)
 * @param {Object} data - Event data
 */
export function emitDiscoveryEvent(broadcastFn, eventName, data) {
  if (needsMigration(eventName)) {
    const newName = getNewEventName(eventName);
    dualEmit(broadcastFn, eventName, newName, data);
  } else {
    // Already using correct naming or not in migration list
    broadcastFn(eventName, data);
  }
}

/**
 * Statistics tracking for migration (useful for monitoring)
 */
const migrationStats = {
  totalDeprecatedEmissions: 0,
  eventCounts: {},
};

/**
 * Gets current migration statistics
 * @returns {Object} Statistics object
 * @note Currently returns empty stats - tracking not yet implemented
 */
export function getMigrationStats() {
  return { ...migrationStats };
}

/**
 * Resets migration statistics (useful for testing)
 */
export function resetMigrationStats() {
  migrationStats.totalDeprecatedEmissions = 0;
  migrationStats.eventCounts = {};
}
