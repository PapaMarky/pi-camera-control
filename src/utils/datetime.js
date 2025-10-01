/**
 * Date/Time Utility Functions
 * Provides consistent datetime handling across the application
 */

/**
 * Format a Date object as a local ISO-like string (not UTC)
 * Returns format: YYYY-MM-DDTHH:mm:ss.sss+HH:mm
 * This preserves the local timezone offset
 *
 * @param {Date} date - The date to format
 * @returns {string} Local datetime string with timezone offset
 */
export function toLocalISOString(date) {
  if (!(date instanceof Date)) {
    date = new Date(date);
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  const ms = String(date.getMilliseconds()).padStart(3, "0");

  // Get timezone offset in format +HH:mm or -HH:mm
  const tzOffset = -date.getTimezoneOffset();
  const tzSign = tzOffset >= 0 ? "+" : "-";
  const tzHours = String(Math.floor(Math.abs(tzOffset) / 60)).padStart(2, "0");
  const tzMinutes = String(Math.abs(tzOffset) % 60).padStart(2, "0");
  const timezone = `${tzSign}${tzHours}:${tzMinutes}`;

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${ms}${timezone}`;
}

/**
 * Format a Date object for use in filenames and titles
 * Returns format: YYYYMMDD-HHmmss (local time)
 *
 * @param {Date} date - The date to format
 * @returns {string} Filename-safe datetime string
 */
export function toFilenameFormat(date) {
  if (!(date instanceof Date)) {
    date = new Date(date);
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

/**
 * Convert a date to a report-safe format
 * Uses local ISO string to preserve timezone information
 *
 * @param {Date} date - The date to format
 * @returns {string} Report-safe datetime string
 */
export function toReportFormat(date) {
  return toLocalISOString(date);
}
