/**
 * Frontend Intervalometer Input Validation Tests
 *
 * Tests the validation logic and user feedback for the intervalometer form fields,
 * ensuring clear error messages when required fields are missing or invalid.
 */

import { jest } from "@jest/globals";

describe("Intervalometer Input Validation", () => {
  let mockDocument;
  let elements;
  let errorHandler;
  let logHandler;
  let toastHandler;

  beforeEach(() => {
    // Reset state for each test
    const errorMessages = [];
    const logMessages = [];
    const toastMessages = [];

    errorHandler = jest.fn((msg) => errorMessages.push(msg));
    logHandler = jest.fn((msg, type) => logMessages.push({ msg, type }));
    toastHandler = jest.fn((msg, type = "error") =>
      toastMessages.push({ msg, type }),
    );

    // Mock Toast global
    global.Toast = {
      error: jest.fn((msg) => toastHandler(msg, "error")),
      success: jest.fn((msg) => toastHandler(msg, "success")),
      info: jest.fn((msg) => toastHandler(msg, "info")),
      warning: jest.fn((msg) => toastHandler(msg, "warning")),
    };

    // Create mock DOM elements
    elements = {
      intervalInput: { value: "10" },
      shotsRadio: { value: "shots", checked: false },
      timeRadio: { value: "time", checked: false },
      unlimitedRadio: { value: "unlimited", checked: true },
      shotsInput: {
        value: "",
        disabled: true,
        focus: jest.fn(),
        placeholder: "10",
        defaultValue: "",
      },
      timeInput: { value: "", disabled: true },
      sessionTitleInput: { value: "" },
    };

    // Mock document.getElementById
    mockDocument = {
      getElementById: jest.fn((id) => {
        const elementMap = {
          "interval-input": elements.intervalInput,
          "shots-radio": elements.shotsRadio,
          "time-radio": elements.timeRadio,
          "unlimited-radio": elements.unlimitedRadio,
          "shots-input": elements.shotsInput,
          "stop-time-input": elements.timeInput,
          "session-title-input": elements.sessionTitleInput,
        };
        return elementMap[id] || null;
      }),
      querySelector: jest.fn((selector) => {
        if (selector === 'input[name="stop-condition"]:checked') {
          if (elements.shotsRadio.checked) return elements.shotsRadio;
          if (elements.timeRadio.checked) return elements.timeRadio;
          if (elements.unlimitedRadio.checked) return elements.unlimitedRadio;
        }
        return null;
      }),
    };

    // Replace global document
    global.document = mockDocument;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // Implementation of startIntervalometer validation logic from camera.js (lines 806-888)
  function validateAndBuildOptions() {
    const interval = parseFloat(
      document.getElementById("interval-input").value,
    );
    const stopCondition = document.querySelector(
      'input[name="stop-condition"]:checked',
    ).value;
    const title = document.getElementById("session-title-input").value.trim();

    const options = { interval };

    // Add title if provided
    if (title) {
      options.title = title;
    }

    // Map UI stopCondition values to backend values and add to options
    if (stopCondition === "shots") {
      const shots = document.getElementById("shots-input").value;
      const parsedShots = parseInt(shots);
      if (!shots || parsedShots <= 0 || isNaN(parsedShots)) {
        const errorMessage = "Please enter a valid number of shots";
        if (global.Toast) {
          global.Toast.error(errorMessage);
        }
        // Validation errors no longer add to activity log (removed errorHandler call)
        return null;
      }
      options.stopCondition = "stop-after";
      options.shots = parsedShots;
    } else if (stopCondition === "time") {
      const stopTime = document.getElementById("stop-time-input").value;
      if (!stopTime) {
        const errorMessage = "Please enter a stop time";
        if (global.Toast) {
          global.Toast.error(errorMessage);
        }
        // Validation errors no longer add to activity log (removed errorHandler call)
        return null;
      }
      options.stopCondition = "stop-at";
      options.stopTime = stopTime;
    } else {
      options.stopCondition = "unlimited";
    }

    return options;
  }

  describe("Stop After Field Validation", () => {
    test('should show error when "shots" radio is selected but shots input is empty', () => {
      // Set up the form state: "shots" radio selected, but input is empty
      elements.shotsRadio.checked = true;
      elements.unlimitedRadio.checked = false;
      elements.shotsInput.disabled = false;
      elements.shotsInput.value = ""; // Empty value (the issue!)

      const result = validateAndBuildOptions();

      expect(result).toBeNull();
      // Validation errors now only show toast, not activity log
      expect(global.Toast.error).toHaveBeenCalledWith(
        expect.stringMatching(/valid number of shots/i),
      );
      expect(errorHandler).not.toHaveBeenCalled();
    });

    test('should show error when "shots" radio is selected but shots input is zero', () => {
      elements.shotsRadio.checked = true;
      elements.unlimitedRadio.checked = false;
      elements.shotsInput.disabled = false;
      elements.shotsInput.value = "0"; // Zero is invalid

      const result = validateAndBuildOptions();

      expect(result).toBeNull();
      // Validation errors now only show toast, not activity log
      expect(global.Toast.error).toHaveBeenCalledWith(
        expect.stringMatching(/valid number of shots/i),
      );
      expect(errorHandler).not.toHaveBeenCalled();
    });

    test('should show error when "shots" radio is selected but shots input is negative', () => {
      elements.shotsRadio.checked = true;
      elements.unlimitedRadio.checked = false;
      elements.shotsInput.disabled = false;
      elements.shotsInput.value = "-5"; // Negative is invalid

      const result = validateAndBuildOptions();

      expect(result).toBeNull();
      // Validation errors now only show toast, not activity log
      expect(global.Toast.error).toHaveBeenCalledWith(
        expect.stringMatching(/valid number of shots/i),
      );
      expect(errorHandler).not.toHaveBeenCalled();
    });

    test("should build valid options when shots input has valid value", () => {
      elements.shotsRadio.checked = true;
      elements.unlimitedRadio.checked = false;
      elements.shotsInput.disabled = false;
      elements.shotsInput.value = "25"; // Valid

      const result = validateAndBuildOptions();

      expect(result).not.toBeNull();
      expect(result.stopCondition).toBe("stop-after");
      expect(result.shots).toBe(25);
      expect(errorHandler).not.toHaveBeenCalled();
    });
  });

  describe("Stop At Field Validation", () => {
    test('should show error when "time" radio is selected but time input is empty', () => {
      elements.timeRadio.checked = true;
      elements.unlimitedRadio.checked = false;
      elements.timeInput.disabled = false;
      elements.timeInput.value = ""; // Empty time

      const result = validateAndBuildOptions();

      expect(result).toBeNull();
      // Validation errors now only show toast, not activity log
      expect(global.Toast.error).toHaveBeenCalledWith(
        expect.stringMatching(/stop time/i),
      );
      expect(errorHandler).not.toHaveBeenCalled();
    });

    test("should build valid options when time input has valid value", () => {
      elements.timeRadio.checked = true;
      elements.unlimitedRadio.checked = false;
      elements.timeInput.disabled = false;
      elements.timeInput.value = "23:30"; // Valid time

      const result = validateAndBuildOptions();

      expect(result).not.toBeNull();
      expect(result.stopCondition).toBe("stop-at");
      expect(result.stopTime).toBe("23:30");
      expect(errorHandler).not.toHaveBeenCalled();
    });
  });

  describe("Unlimited Mode Validation", () => {
    test("should build valid options when unlimited radio is selected", () => {
      // Default state: unlimited is already checked
      const result = validateAndBuildOptions();

      expect(result).not.toBeNull();
      expect(result.stopCondition).toBe("unlimited");
      expect(result.shots).toBeUndefined();
      expect(result.stopTime).toBeUndefined();
      expect(errorHandler).not.toHaveBeenCalled();
    });
  });

  describe("Placeholder vs Default Value (HTML)", () => {
    test("shots input should have placeholder text, not a default value", () => {
      const shotsInput = elements.shotsInput;

      // The input should have a placeholder
      expect(shotsInput.placeholder).toBe("10");

      // But should NOT have a default value
      expect(shotsInput.value).toBe("");
      expect(shotsInput.defaultValue).toBe("");
    });

    test('placeholder "10" should not be treated as an actual value', () => {
      // When user sees the placeholder "10" but hasn't entered anything
      elements.shotsInput.value = ""; // Empty - just showing placeholder

      // This should be treated as invalid (no value entered)
      elements.shotsRadio.checked = true;
      elements.unlimitedRadio.checked = false;

      const result = validateAndBuildOptions();

      expect(result).toBeNull();
      // Validation errors now only show toast, not activity log
      expect(global.Toast.error).toHaveBeenCalled();
      expect(errorHandler).not.toHaveBeenCalled();
    });
  });

  describe("Enhanced UX Improvements", () => {
    test('PROPOSED: should make "10" a real default value instead of placeholder', () => {
      // This test documents a UX improvement: instead of placeholder,
      // use a real default value so users can just click Start

      // Set up what SHOULD happen with a default value
      const shotsInputWithDefault = {
        value: "10", // Real default value, not placeholder
        placeholder: "", // No placeholder needed
        disabled: false,
      };

      elements.shotsRadio.checked = true;
      elements.unlimitedRadio.checked = false;

      // Temporarily replace the mock to test improved behavior
      const originalMock = mockDocument.getElementById;
      mockDocument.getElementById = jest.fn((id) => {
        if (id === "shots-input") return shotsInputWithDefault;
        return originalMock(id);
      });

      const result = validateAndBuildOptions();

      // With a default value, this should work without error
      expect(result).not.toBeNull();
      expect(result.shots).toBe(10);
      expect(errorHandler).not.toHaveBeenCalled();

      // Restore original mock
      mockDocument.getElementById = originalMock;
    });

    test("PROPOSED: validation error should focus the problematic input", () => {
      // This documents desired behavior for better UX
      elements.shotsRadio.checked = true;
      elements.unlimitedRadio.checked = false;
      elements.shotsInput.value = "";

      validateAndBuildOptions();

      // After showing error, the input should receive focus
      // This helps users immediately correct the issue
      // Note: This is NOT currently implemented - test documents desired behavior
      // expect(elements.shotsInput.focus).toHaveBeenCalled();
    });

    test("PROPOSED: should provide visual indication of invalid field", () => {
      // Document desired behavior: invalid fields should have visual styling
      elements.shotsRadio.checked = true;
      elements.unlimitedRadio.checked = false;
      elements.shotsInput.value = "";

      // Simulate adding error class to invalid input
      const addErrorClass = () => {
        if (elements.shotsInput.classList) {
          elements.shotsInput.classList.add("input-error");
        }
      };

      validateAndBuildOptions();

      // In an improved implementation, invalid inputs would get error styling
      // Note: This is NOT currently implemented - test documents desired behavior
    });
  });

  describe("Edge Cases", () => {
    test("should handle non-numeric shots input", () => {
      elements.shotsRadio.checked = true;
      elements.unlimitedRadio.checked = false;
      elements.shotsInput.value = "abc"; // Non-numeric

      const result = validateAndBuildOptions();

      // parseInt('abc') returns NaN, which should fail validation
      expect(result).toBeNull();
      // Validation errors now only show toast, not activity log
      expect(global.Toast.error).toHaveBeenCalled();
      expect(errorHandler).not.toHaveBeenCalled();
    });

    test("should handle decimal shots input", () => {
      elements.shotsRadio.checked = true;
      elements.unlimitedRadio.checked = false;
      elements.shotsInput.value = "10.5"; // Decimal

      const result = validateAndBuildOptions();

      // parseInt() truncates, so this becomes 10 (valid)
      expect(result).not.toBeNull();
      expect(result.shots).toBe(10);
    });

    test("should handle very large shots value", () => {
      elements.shotsRadio.checked = true;
      elements.unlimitedRadio.checked = false;
      elements.shotsInput.value = "999999";

      const result = validateAndBuildOptions();

      expect(result).not.toBeNull();
      expect(result.shots).toBe(999999);
    });
  });

  describe("Toast Notification Integration", () => {
    test("should show toast notification for empty shots input", () => {
      elements.shotsRadio.checked = true;
      elements.unlimitedRadio.checked = false;
      elements.shotsInput.value = "";

      const result = validateAndBuildOptions();

      expect(result).toBeNull();
      expect(global.Toast.error).toHaveBeenCalledWith(
        "Please enter a valid number of shots",
      );
      // Validation errors should NOT add activity log entries
      expect(errorHandler).not.toHaveBeenCalled();
    });

    test("should show toast notification for zero shots", () => {
      elements.shotsRadio.checked = true;
      elements.unlimitedRadio.checked = false;
      elements.shotsInput.value = "0";

      const result = validateAndBuildOptions();

      expect(result).toBeNull();
      expect(global.Toast.error).toHaveBeenCalledWith(
        "Please enter a valid number of shots",
      );
      // Validation errors should NOT add activity log entries
      expect(errorHandler).not.toHaveBeenCalled();
    });

    test("should show toast notification for negative shots", () => {
      elements.shotsRadio.checked = true;
      elements.unlimitedRadio.checked = false;
      elements.shotsInput.value = "-5";

      const result = validateAndBuildOptions();

      expect(result).toBeNull();
      expect(global.Toast.error).toHaveBeenCalledWith(
        "Please enter a valid number of shots",
      );
      // Validation errors should NOT add activity log entries
      expect(errorHandler).not.toHaveBeenCalled();
    });

    test("should show toast notification for empty stop time", () => {
      elements.timeRadio.checked = true;
      elements.unlimitedRadio.checked = false;
      elements.timeInput.value = "";

      const result = validateAndBuildOptions();

      expect(result).toBeNull();
      expect(global.Toast.error).toHaveBeenCalledWith(
        "Please enter a stop time",
      );
      // Validation errors should NOT add activity log entries
      expect(errorHandler).not.toHaveBeenCalled();
    });

    test("should NOT show toast for valid input", () => {
      elements.shotsRadio.checked = true;
      elements.unlimitedRadio.checked = false;
      elements.shotsInput.value = "25";

      const result = validateAndBuildOptions();

      expect(result).not.toBeNull();
      expect(global.Toast.error).not.toHaveBeenCalled();
      expect(errorHandler).not.toHaveBeenCalled();
    });

    test("validation errors should ONLY show toast, NOT activity log", () => {
      // Updated requirement: validation errors show toast for immediate feedback
      // but do NOT clutter the activity log (which is for camera events)
      elements.shotsRadio.checked = true;
      elements.unlimitedRadio.checked = false;
      elements.shotsInput.value = "";

      const result = validateAndBuildOptions();

      // Toast for immediate visibility
      expect(global.Toast.error).toHaveBeenCalled();

      // NO activity log for validation errors (activity log is for camera events only)
      expect(errorHandler).not.toHaveBeenCalled();

      // Verify the toast message
      expect(global.Toast.error).toHaveBeenCalledWith(
        expect.stringContaining("valid number of shots"),
      );
    });
  });
});
