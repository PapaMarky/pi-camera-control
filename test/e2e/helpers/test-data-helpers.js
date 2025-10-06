/**
 * Test Data Helpers for E2E Tests
 *
 * Helpers for creating test data like mock timelapse reports
 */

import fs from "fs/promises";
import path from "path";

/**
 * Create a mock timelapse report file for testing
 * @param {Object} options - Report options
 * @returns {Promise<Object>} Created report data
 */
export async function createMockTimelapseReport(options = {}) {
  const reportId = options.id || `test-report-${Date.now()}`;
  const sessionId = options.sessionId || `test-session-${Date.now()}`;

  const report = {
    id: reportId,
    sessionId: sessionId,
    title: options.title || "Test Timelapse Report",
    status: options.status || "completed",
    startTime: options.startTime || new Date().toISOString(),
    endTime: options.endTime || new Date().toISOString(),
    duration: options.duration || 3000000,
    intervalometer: {
      interval: options.interval || 30,
      numberOfShots: options.numberOfShots || 100,
      stopCondition: options.stopCondition || "stop-after",
    },
    results: {
      imagesCaptured: options.imagesCaptured || 100,
      imagesSuccessful: options.imagesSuccessful || 98,
      imagesFailed: options.imagesFailed || 2,
      errors: options.errors || [
        {
          timestamp: new Date().toISOString(),
          shotNumber: 50,
          error: "Test error 1",
        },
        {
          timestamp: new Date().toISOString(),
          shotNumber: 75,
          error: "Test error 2",
        },
      ],
    },
    metadata: {
      savedAt: new Date().toISOString(),
      version: "2.0.0",
      completionReason: options.completionReason || "Session completed",
    },
  };

  // Ensure the reports directory exists
  const reportsDir = path.join(
    process.cwd(),
    "data",
    "timelapse-reports",
    "reports",
  );
  await fs.mkdir(reportsDir, { recursive: true });

  // Write the report file
  const reportPath = path.join(reportsDir, `${reportId}.json`);
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

  return report;
}

/**
 * Delete a timelapse report file
 * @param {string} reportId - Report ID to delete
 * @returns {Promise<void>}
 */
export async function deleteMockTimelapseReport(reportId) {
  const reportPath = path.join(
    process.cwd(),
    "data",
    "timelapse-reports",
    "reports",
    `${reportId}.json`,
  );

  try {
    await fs.unlink(reportPath);
  } catch (error) {
    // Ignore if file doesn't exist
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

/**
 * Delete all test timelapse reports
 * @returns {Promise<void>}
 */
export async function cleanupTestReports() {
  const reportsDir = path.join(
    process.cwd(),
    "data",
    "timelapse-reports",
    "reports",
  );

  try {
    const files = await fs.readdir(reportsDir);
    const testFiles = files.filter((f) => f.startsWith("test-report-"));

    await Promise.all(
      testFiles.map((f) => fs.unlink(path.join(reportsDir, f))),
    );
  } catch (error) {
    // Ignore if directory doesn't exist
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}
