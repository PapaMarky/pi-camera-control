/**
 * Network Operation Guard
 *
 * Utilities to prevent risky network operations during active timelapse sessions
 * Addresses IP-5 from integration-issues-fix-plan.md
 */

import { logger } from "./logger.js";

/**
 * Check if a network operation is safe to perform
 * @param {object} intervalometerStateManager - The intervalometer state manager
 * @returns {{safe: boolean, reason?: string, sessionState?: string}}
 */
export function isNetworkOperationSafe(intervalometerStateManager) {
  // If no state manager available, allow operation (dev environment)
  if (!intervalometerStateManager) {
    logger.debug(
      "No intervalometer state manager available - allowing network operation",
    );
    return { safe: true };
  }

  const state = intervalometerStateManager.getState();

  // Block operations during running or paused sessions
  const unsafeStates = ["running", "paused"];

  if (unsafeStates.includes(state.state)) {
    logger.warn(
      `Network operation blocked - timelapse session is ${state.state}`,
    );
    return {
      safe: false,
      reason: `A timelapse session is ${state.state}`,
      sessionState: state.state,
    };
  }

  // Allow operations when stopped, stopping, or completed
  return { safe: true };
}

/**
 * Create a standardized error response for blocked network operations
 * @param {string} sessionState - Current session state
 * @param {string} operation - The operation that was attempted
 * @returns {object} Error response object
 */
export function createNetworkOperationError(sessionState, operation) {
  return {
    success: false,
    error:
      "Network operations are not allowed during an active timelapse session",
    details: {
      operation,
      sessionState,
      suggestion:
        "Please stop or complete the timelapse session before changing network settings",
    },
  };
}
