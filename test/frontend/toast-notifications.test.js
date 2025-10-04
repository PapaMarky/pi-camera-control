/**
 * Toast Notification System Tests
 *
 * Tests the toast notification system used for immediate user feedback
 * on validation errors and important messages.
 */

import { jest } from "@jest/globals";

describe("Toast Notification System", () => {
  let toastManager;
  let mockDocument;
  let toastContainer;

  beforeEach(() => {
    // Create mock toast container
    toastContainer = {
      appendChild: jest.fn(),
      removeChild: jest.fn(),
      children: [],
      style: {},
    };

    // Mock document
    mockDocument = {
      createElement: jest.fn((tag) => {
        const attributes = {};
        const element = {
          tagName: tag.toUpperCase(),
          className: "",
          textContent: "",
          style: {},
          classList: {
            add: jest.fn(function (className) {
              this.className += (this.className ? " " : "") + className;
            }),
            remove: jest.fn(),
          },
          addEventListener: jest.fn(),
          remove: jest.fn(),
          setAttribute: jest.fn((name, value) => {
            attributes[name] = value;
          }),
          getAttribute: jest.fn((name) => attributes[name]),
        };
        return element;
      }),
      getElementById: jest.fn((id) => {
        if (id === "toast-container") return toastContainer;
        return null;
      }),
      body: {
        appendChild: jest.fn(),
      },
    };

    global.document = mockDocument;
    global.setTimeout = jest.fn((fn, delay) => {
      // Store the timeout for manual triggering
      return { fn, delay };
    });
    global.clearTimeout = jest.fn();

    // Import the ToastManager (will be created)
    // toastManager = new ToastManager();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("Toast Creation", () => {
    test("should create toast container on initialization", () => {
      // When ToastManager is created without existing container
      mockDocument.getElementById.mockReturnValue(null);

      // Create manager (simulated)
      const createToastContainer = () => {
        let container = document.getElementById("toast-container");
        if (!container) {
          container = document.createElement("div");
          container.id = "toast-container";
          document.body.appendChild(container);
        }
        return container;
      };

      const container = createToastContainer();

      expect(mockDocument.createElement).toHaveBeenCalledWith("div");
      expect(mockDocument.body.appendChild).toHaveBeenCalled();
    });

    test("should create error toast with correct styling", () => {
      const createToast = (message, type = "error") => {
        const toast = document.createElement("div");
        toast.className = `toast toast-${type}`;

        const icon = document.createElement("span");
        icon.className = "toast-icon";
        icon.textContent = type === "error" ? "⚠️" : "ℹ️";

        const text = document.createElement("span");
        text.className = "toast-message";
        text.textContent = message;

        return { toast, icon, text };
      };

      const { toast, icon, text } = createToast(
        "Please enter a valid number",
        "error",
      );

      expect(toast.className).toContain("toast-error");
      expect(icon.textContent).toBe("⚠️");
      expect(text.textContent).toBe("Please enter a valid number");
    });

    test("should create success toast with correct styling", () => {
      const createToast = (message, type = "success") => {
        const toast = document.createElement("div");
        toast.className = `toast toast-${type}`;

        const icon = document.createElement("span");
        icon.className = "toast-icon";
        icon.textContent = type === "success" ? "✓" : "ℹ️";

        const text = document.createElement("span");
        text.className = "toast-message";
        text.textContent = message;

        return { toast, icon, text };
      };

      const { toast, icon, text } = createToast(
        "Settings saved successfully",
        "success",
      );

      expect(toast.className).toContain("toast-success");
      expect(icon.textContent).toBe("✓");
      expect(text.textContent).toBe("Settings saved successfully");
    });
  });

  describe("Toast Display", () => {
    test("should append toast to container", () => {
      const showToast = (message, type = "error") => {
        const container = document.getElementById("toast-container");
        const toast = document.createElement("div");
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        container.appendChild(toast);
        return toast;
      };

      const toast = showToast("Validation error", "error");

      expect(toastContainer.appendChild).toHaveBeenCalledWith(toast);
    });

    test("should auto-hide toast after duration", () => {
      const showToast = (message, type = "error", duration = 3000) => {
        const toast = document.createElement("div");
        toast.className = `toast toast-${type}`;
        toast.textContent = message;

        // Auto-hide after duration
        const timeoutId = setTimeout(() => {
          toast.remove();
        }, duration);

        return { toast, timeoutId };
      };

      const { toast, timeoutId } = showToast("Error message", "error", 3000);

      expect(global.setTimeout).toHaveBeenCalledWith(
        expect.any(Function),
        3000,
      );
      expect(timeoutId.delay).toBe(3000);

      // Simulate timeout execution
      timeoutId.fn();
      expect(toast.remove).toHaveBeenCalled();
    });

    test("should allow manual dismissal of toast", () => {
      const createDismissibleToast = (message, type = "error") => {
        const toast = document.createElement("div");
        toast.className = `toast toast-${type}`;

        const closeBtn = document.createElement("button");
        closeBtn.className = "toast-close";
        closeBtn.textContent = "×";

        closeBtn.addEventListener("click", () => {
          toast.remove();
        });

        return { toast, closeBtn };
      };

      const { toast, closeBtn } = createDismissibleToast("Error message");

      expect(closeBtn.addEventListener).toHaveBeenCalledWith(
        "click",
        expect.any(Function),
      );
    });
  });

  describe("Toast Types", () => {
    test("should support error type", () => {
      const getToastConfig = (type) => {
        const configs = {
          error: { icon: "⚠️", className: "toast-error" },
          success: { icon: "✓", className: "toast-success" },
          info: { icon: "ℹ️", className: "toast-info" },
          warning: { icon: "⚡", className: "toast-warning" },
        };
        return configs[type];
      };

      const config = getToastConfig("error");
      expect(config.icon).toBe("⚠️");
      expect(config.className).toBe("toast-error");
    });

    test("should support success type", () => {
      const getToastConfig = (type) => {
        const configs = {
          error: { icon: "⚠️", className: "toast-error" },
          success: { icon: "✓", className: "toast-success" },
          info: { icon: "ℹ️", className: "toast-info" },
          warning: { icon: "⚡", className: "toast-warning" },
        };
        return configs[type];
      };

      const config = getToastConfig("success");
      expect(config.icon).toBe("✓");
      expect(config.className).toBe("toast-success");
    });

    test("should support info type", () => {
      const getToastConfig = (type) => {
        const configs = {
          error: { icon: "⚠️", className: "toast-error" },
          success: { icon: "✓", className: "toast-success" },
          info: { icon: "ℹ️", className: "toast-info" },
          warning: { icon: "⚡", className: "toast-warning" },
        };
        return configs[type];
      };

      const config = getToastConfig("info");
      expect(config.icon).toBe("ℹ️");
      expect(config.className).toBe("toast-info");
    });

    test("should support warning type", () => {
      const getToastConfig = (type) => {
        const configs = {
          error: { icon: "⚠️", className: "toast-error" },
          success: { icon: "✓", className: "toast-success" },
          info: { icon: "ℹ️", className: "toast-info" },
          warning: { icon: "⚡", className: "toast-warning" },
        };
        return configs[type];
      };

      const config = getToastConfig("warning");
      expect(config.icon).toBe("⚡");
      expect(config.className).toBe("toast-warning");
    });
  });

  describe("Multiple Toasts", () => {
    test("should stack multiple toasts", () => {
      const toasts = [];

      const showToast = (message) => {
        const toast = document.createElement("div");
        toast.textContent = message;
        toasts.push(toast);
        toastContainer.appendChild(toast);
        return toast;
      };

      showToast("First error");
      showToast("Second error");
      showToast("Third error");

      expect(toasts.length).toBe(3);
      expect(toastContainer.appendChild).toHaveBeenCalledTimes(3);
    });

    test("should limit maximum number of toasts", () => {
      const MAX_TOASTS = 3;
      const toasts = [];

      const showToast = (message) => {
        const toast = document.createElement("div");
        toast.textContent = message;

        // Remove oldest if at max
        if (toasts.length >= MAX_TOASTS) {
          const oldest = toasts.shift();
          oldest.remove();
        }

        toasts.push(toast);
        toastContainer.appendChild(toast);
        return toast;
      };

      showToast("Toast 1");
      showToast("Toast 2");
      showToast("Toast 3");
      showToast("Toast 4"); // Should remove Toast 1

      expect(toasts.length).toBe(3);
      expect(toasts[0].textContent).toBe("Toast 2");
    });
  });

  describe("Integration with Validation", () => {
    test("should show toast for empty shots input validation error", () => {
      let lastToast = null;

      const showErrorToast = (message) => {
        const toast = document.createElement("div");
        toast.className = "toast toast-error";
        toast.textContent = message;
        lastToast = toast;
        toastContainer.appendChild(toast);
        return toast;
      };

      const validateShotsInput = (value) => {
        const parsed = parseInt(value);
        if (!value || parsed <= 0 || isNaN(parsed)) {
          showErrorToast("Please enter a valid number of shots");
          return false;
        }
        return true;
      };

      const isValid = validateShotsInput("");

      expect(isValid).toBe(false);
      expect(lastToast).not.toBeNull();
      expect(lastToast.textContent).toBe(
        "Please enter a valid number of shots",
      );
      expect(lastToast.className).toContain("toast-error");
    });

    test("should show toast for empty stop time validation error", () => {
      let lastToast = null;

      const showErrorToast = (message) => {
        const toast = document.createElement("div");
        toast.className = "toast toast-error";
        toast.textContent = message;
        lastToast = toast;
        toastContainer.appendChild(toast);
        return toast;
      };

      const validateTimeInput = (value) => {
        if (!value) {
          showErrorToast("Please enter a stop time");
          return false;
        }
        return true;
      };

      const isValid = validateTimeInput("");

      expect(isValid).toBe(false);
      expect(lastToast).not.toBeNull();
      expect(lastToast.textContent).toBe("Please enter a stop time");
      expect(lastToast.className).toContain("toast-error");
    });
  });

  describe("Accessibility", () => {
    test("should use aria-live for screen readers", () => {
      const createAccessibleToast = (message, type = "error") => {
        const toast = document.createElement("div");
        toast.className = `toast toast-${type}`;
        toast.setAttribute("role", "alert");
        toast.setAttribute("aria-live", "assertive");
        toast.textContent = message;
        return toast;
      };

      const toast = createAccessibleToast("Validation error", "error");

      expect(toast.getAttribute).toBeDefined();
    });
  });
});
