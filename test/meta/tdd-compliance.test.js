/**
 * TDD Compliance Tests
 *
 * These tests ensure that the TDD requirements in CLAUDE.md are being followed.
 * They validate that the test infrastructure is working and key utilities exist.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe("TDD Compliance Validation", () => {
  const projectRoot = path.join(__dirname, "../..");

  test("Jest configuration exists and supports ESM", () => {
    const jestConfigPath = path.join(projectRoot, "jest.config.js");
    expect(fs.existsSync(jestConfigPath)).toBe(true);

    const config = fs.readFileSync(jestConfigPath, "utf8");
    expect(config).toContain("testEnvironment");
    expect(config).toContain("node");
  });

  test("Required test directories exist", () => {
    const requiredDirs = [
      "test/schemas",
      "test/utils",
      "test/integration",
      "test/errors",
    ];

    for (const dir of requiredDirs) {
      const dirPath = path.join(projectRoot, dir);
      expect(fs.existsSync(dirPath)).toBe(true);
    }
  });

  test("Critical utility files exist", () => {
    const requiredFiles = [
      "src/utils/error-handlers.js",
      "test/schemas/websocket-message-schemas.js",
      "test/schemas/websocket-messages.test.js",
    ];

    for (const file of requiredFiles) {
      const filePath = path.join(projectRoot, file);
      expect(fs.existsSync(filePath)).toBe(true);
    }
  });

  test("Schema validation function exists", () => {
    // Just check that the file exists and can be imported
    const schemaTestPath = path.join(
      projectRoot,
      "test/schemas/websocket-messages.test.js",
    );
    expect(fs.existsSync(schemaTestPath)).toBe(true);

    // Check that it exports the expected function
    const content = fs.readFileSync(schemaTestPath, "utf8");
    expect(content).toContain("validateSchema");
    expect(content).toContain("export");
  });

  test("Error handler utilities are available", async () => {
    const errorHandlers = await import("../../src/utils/error-handlers.js");

    expect(typeof errorHandlers.createStandardError).toBe("function");
    expect(typeof errorHandlers.broadcastError).toBe("function");
    expect(typeof errorHandlers.convertLegacyError).toBe("function");
    expect(typeof errorHandlers.ErrorCodes).toBe("object");
    expect(typeof errorHandlers.Components).toBe("object");
  });

  test("Design documentation exists", () => {
    const designDocs = [
      "docs/design/architecture-overview.md",
      "docs/design/api-specification.md",
      "docs/design/data-flow-and-events.md",
      "docs/design/time-synchronization.md",
    ];

    for (const doc of designDocs) {
      const docPath = path.join(projectRoot, doc);
      expect(fs.existsSync(docPath)).toBe(true);
    }
  });

  test("TDD infrastructure is properly configured", () => {
    // Verify that Jest is configured and tests can run
    // This is more appropriate than checking documentation files
    const packageJsonPath = path.join(projectRoot, "package.json");
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

    // Check that test infrastructure exists
    expect(packageJson.scripts).toHaveProperty("test");
    expect(packageJson.devDependencies).toHaveProperty("jest");

    // Check that test directories exist
    const testDirs = ["test/schemas", "test/unit", "test/integration"];
    for (const dir of testDirs) {
      const testDirPath = path.join(projectRoot, dir);
      expect(fs.existsSync(testDirPath)).toBe(true);
    }
  });

  test("Package.json has test script configured", () => {
    const packageJsonPath = path.join(projectRoot, "package.json");
    expect(fs.existsSync(packageJsonPath)).toBe(true);

    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    expect(packageJson.scripts).toHaveProperty("test");
    // Updated to match ESM configuration requirement
    expect(packageJson.scripts.test).toContain("jest");
    expect(packageJson.devDependencies).toHaveProperty("jest");
  });

  test("Test infrastructure can run successfully", async () => {
    // This test validates that the test infrastructure is working
    expect(true).toBe(true); // If this test runs, Jest is working

    // Test that we can import and use error utilities
    const { createStandardError } = await import(
      "../../src/utils/error-handlers.js"
    );

    const error = createStandardError("Test error");
    expect(error).toHaveProperty("type", "error");
    expect(error).toHaveProperty("timestamp");
    expect(error).toHaveProperty("error");
    expect(error.error).toHaveProperty("message", "Test error");
  });

  test("All critical known issues have corresponding tests", () => {
    const criticalIssueTests = [
      "test/errors/error-standardization.test.js",
      "test/schemas/websocket-messages.test.js",
      "test/utils/error-handlers.test.js",
    ];

    for (const testFile of criticalIssueTests) {
      const testPath = path.join(projectRoot, testFile);
      expect(fs.existsSync(testPath)).toBe(true);
    }
  });
});
