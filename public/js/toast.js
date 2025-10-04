/**
 * Toast Notification System
 *
 * Provides immediate, visible user feedback for validation errors,
 * success messages, and important information. Toasts appear at the
 * top of the screen and auto-dismiss after a few seconds.
 *
 * Usage:
 *   Toast.error("Validation failed");
 *   Toast.success("Settings saved");
 *   Toast.info("Camera connected");
 *   Toast.warning("Battery low");
 */

class ToastManager {
  constructor() {
    this.container = null;
    this.toasts = [];
    this.maxToasts = 3;
    this.defaultDuration = 4000; // 4 seconds
    this.init();
  }

  init() {
    // Create toast container if it doesn't exist
    this.container = document.getElementById("toast-container");
    if (!this.container) {
      this.container = document.createElement("div");
      this.container.id = "toast-container";
      this.container.className = "toast-container";
      document.body.appendChild(this.container);
    }
  }

  /**
   * Show a toast notification
   * @param {string} message - The message to display
   * @param {string} type - Type of toast (error, success, info, warning)
   * @param {number} duration - How long to show the toast (ms), 0 for persistent
   */
  show(message, type = "info", duration = null) {
    if (!message) return;

    // Use default duration if not specified
    if (duration === null) {
      duration = this.defaultDuration;
    }

    // Remove oldest toast if at max capacity
    if (this.toasts.length >= this.maxToasts) {
      const oldest = this.toasts.shift();
      this.removeToast(oldest);
    }

    // Create toast element
    const toast = this.createToast(message, type);
    this.toasts.push(toast);
    this.container.appendChild(toast);

    // Trigger animation
    requestAnimationFrame(() => {
      toast.classList.add("toast-show");
    });

    // Auto-hide after duration (unless duration is 0)
    if (duration > 0) {
      toast.autoHideTimeout = setTimeout(() => {
        this.hideToast(toast);
      }, duration);
    }

    return toast;
  }

  /**
   * Create a toast element
   * @param {string} message - The message text
   * @param {string} type - Type of toast
   * @returns {HTMLElement} The toast element
   */
  createToast(message, type) {
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.setAttribute("role", "alert");
    toast.setAttribute("aria-live", "assertive");

    // Icon based on type
    const icons = {
      error: "⚠️",
      success: "✓",
      info: "ℹ️",
      warning: "⚡",
    };

    const icon = document.createElement("span");
    icon.className = "toast-icon";
    icon.textContent = icons[type] || icons.info;

    const text = document.createElement("span");
    text.className = "toast-message";
    text.textContent = message;

    const closeBtn = document.createElement("button");
    closeBtn.className = "toast-close";
    closeBtn.innerHTML = "&times;";
    closeBtn.setAttribute("aria-label", "Close notification");
    closeBtn.addEventListener("click", () => {
      this.hideToast(toast);
    });

    toast.appendChild(icon);
    toast.appendChild(text);
    toast.appendChild(closeBtn);

    return toast;
  }

  /**
   * Hide and remove a toast
   * @param {HTMLElement} toast - The toast element to hide
   */
  hideToast(toast) {
    if (!toast || !toast.parentNode) return;

    // Clear auto-hide timeout if exists
    if (toast.autoHideTimeout) {
      clearTimeout(toast.autoHideTimeout);
    }

    // Trigger hide animation
    toast.classList.remove("toast-show");
    toast.classList.add("toast-hide");

    // Remove after animation completes
    setTimeout(() => {
      this.removeToast(toast);
    }, 300); // Match CSS animation duration
  }

  /**
   * Remove a toast from DOM and tracking array
   * @param {HTMLElement} toast - The toast element to remove
   */
  removeToast(toast) {
    if (!toast) return;

    const index = this.toasts.indexOf(toast);
    if (index > -1) {
      this.toasts.splice(index, 1);
    }

    if (toast.parentNode) {
      toast.parentNode.removeChild(toast);
    }
  }

  /**
   * Show an error toast
   * @param {string} message - Error message
   * @param {number} duration - Optional duration override
   */
  error(message, duration = null) {
    return this.show(message, "error", duration);
  }

  /**
   * Show a success toast
   * @param {string} message - Success message
   * @param {number} duration - Optional duration override
   */
  success(message, duration = null) {
    return this.show(message, "success", duration);
  }

  /**
   * Show an info toast
   * @param {string} message - Info message
   * @param {number} duration - Optional duration override
   */
  info(message, duration = null) {
    return this.show(message, "info", duration);
  }

  /**
   * Show a warning toast
   * @param {string} message - Warning message
   * @param {number} duration - Optional duration override
   */
  warning(message, duration = null) {
    return this.show(message, "warning", duration);
  }

  /**
   * Clear all toasts
   */
  clearAll() {
    this.toasts.forEach((toast) => {
      this.hideToast(toast);
    });
  }
}

// Create global Toast instance
window.Toast = new ToastManager();
