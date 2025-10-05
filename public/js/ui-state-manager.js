/**
 * UIStateManager - Centralized UI element state management
 *
 * Handles in-progress states for any UI element type including buttons,
 * text displays, status indicators, and icons. Provides consistent
 * state preservation and restoration across all UI operations.
 */
class UIStateManager {
  constructor() {
    this.elementStates = new Map();
    this.timeouts = new Map();
    this.debugMode = false;
  }

  /**
   * Capture and preserve current state of any UI element
   */
  captureState(elementId) {
    const element = document.getElementById(elementId);
    if (!element) {
      if (this.debugMode)
        console.warn(`UIStateManager: Element ${elementId} not found`);
      return null;
    }

    const state = {
      textContent: element.textContent,
      innerHTML: element.innerHTML,
      disabled: element.disabled,
      className: element.className,
      style: element.style.cssText,
      attributes: {},
    };

    // Capture all attributes
    Array.from(element.attributes).forEach((attr) => {
      state.attributes[attr.name] = attr.value;
    });

    if (this.debugMode) {
      console.log(`UIStateManager: Captured state for ${elementId}`, state);
    }

    return state;
  }

  /**
   * Set in-progress state for any UI element type
   */
  setInProgress(elementId, options = {}) {
    const element = document.getElementById(elementId);
    if (!element) {
      if (this.debugMode)
        console.warn(
          `UIStateManager: Cannot set in-progress, element ${elementId} not found`,
        );
      return false;
    }

    // Preserve original state only once
    if (!this.elementStates.has(elementId)) {
      const originalState = this.captureState(elementId);
      if (originalState) {
        this.elementStates.set(elementId, originalState);
      }
    }

    // Apply in-progress state based on element type and options
    const {
      progressText = "In progress...",
      progressIcon = "⏳",
      disableElement = true,
      addProgressClass = true,
      timeout = null,
    } = options;

    // Handle different element types
    if (element.tagName === "BUTTON") {
      if (disableElement) element.disabled = true;

      const icon = element.querySelector(".btn-icon");
      const textSpan = element.querySelector(".btn-text");

      if (icon) {
        icon.textContent = progressIcon;
      }
      if (textSpan) {
        textSpan.textContent = progressText;
      } else if (!icon) {
        // Only set element.textContent if there's no icon or text span
        element.textContent = progressText;
      }

      if (addProgressClass) element.classList.add("in-progress");
    } else if (
      element.classList.contains("status-text") ||
      element.classList.contains("status-value") ||
      element.tagName === "SPAN" ||
      element.tagName === "DIV"
    ) {
      element.textContent = progressText;
      if (addProgressClass) element.classList.add("in-progress");
    } else {
      // Generic element handling
      element.textContent = progressText;
      if (addProgressClass) element.classList.add("in-progress");
    }

    // Set up timeout protection if specified
    if (timeout && timeout > 0) {
      const timeoutId = setTimeout(() => {
        console.warn(
          `UIStateManager: Auto-restoring ${elementId} after ${timeout}ms timeout`,
        );
        this.restore(elementId);
      }, timeout);

      this.timeouts.set(elementId, timeoutId);
    }

    if (this.debugMode) {
      console.log(
        `UIStateManager: Set in-progress state for ${elementId}`,
        options,
      );
    }

    return true;
  }

  /**
   * Restore original state for any UI element
   */
  restore(elementId) {
    const element = document.getElementById(elementId);
    const originalState = this.elementStates.get(elementId);

    if (!element) {
      if (this.debugMode)
        console.warn(
          `UIStateManager: Cannot restore, element ${elementId} not found`,
        );
      return false;
    }

    if (!originalState) {
      if (this.debugMode)
        console.warn(`UIStateManager: No saved state for ${elementId}`);
      return false;
    }

    // Restore all captured properties
    element.textContent = originalState.textContent;

    // Only restore innerHTML if it differs from textContent (has actual HTML)
    if (originalState.innerHTML !== originalState.textContent) {
      element.innerHTML = originalState.innerHTML;
    }

    if ("disabled" in originalState) {
      element.disabled = originalState.disabled;
    }

    element.className = originalState.className;
    element.style.cssText = originalState.style;

    // Restore attributes
    Object.entries(originalState.attributes).forEach(([name, value]) => {
      element.setAttribute(name, value);
    });

    // Clear saved state and timeout
    this.elementStates.delete(elementId);

    const timeoutId = this.timeouts.get(elementId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      this.timeouts.delete(elementId);
    }

    if (this.debugMode) {
      console.log(`UIStateManager: Restored state for ${elementId}`);
    }

    return true;
  }

  /**
   * Update element content while preserving in-progress state capability
   */
  updateContent(elementId, content, options = {}) {
    const element = document.getElementById(elementId);
    if (!element) {
      if (this.debugMode)
        console.warn(
          `UIStateManager: Cannot update content, element ${elementId} not found`,
        );
      return false;
    }

    const { updateType = "text", preserveState = false } = options;

    if (!preserveState && this.elementStates.has(elementId)) {
      // If we're updating content and not preserving state, clear saved state
      this.elementStates.delete(elementId);

      // Clear timeout as well
      const timeoutId = this.timeouts.get(elementId);
      if (timeoutId) {
        clearTimeout(timeoutId);
        this.timeouts.delete(elementId);
      }
    }

    if (updateType === "html") {
      element.innerHTML = content;
    } else {
      element.textContent = content;
    }

    if (this.debugMode) {
      console.log(`UIStateManager: Updated content for ${elementId}`, {
        content,
        options,
      });
    }

    return true;
  }

  /**
   * Check if element is currently in progress state
   */
  isInProgress(elementId) {
    return this.elementStates.has(elementId);
  }

  /**
   * Get all elements currently in progress
   */
  getActiveElements() {
    return Array.from(this.elementStates.keys());
  }

  /**
   * Force clear all in-progress states (emergency cleanup)
   */
  clearAll() {
    this.elementStates.forEach((state, elementId) => {
      this.restore(elementId);
    });

    // Clear any remaining timeouts
    this.timeouts.forEach((timeoutId) => clearTimeout(timeoutId));
    this.timeouts.clear();

    if (this.debugMode) {
      console.log("UIStateManager: Cleared all states");
    }
  }

  /**
   * Enable/disable debug logging
   */
  setDebugMode(enabled) {
    this.debugMode = enabled;
    console.log(
      `UIStateManager: Debug mode ${enabled ? "enabled" : "disabled"}`,
    );
  }

  /**
   * Get state information for debugging
   */
  getStateInfo() {
    return {
      activeElements: this.getActiveElements(),
      activeTimeouts: Array.from(this.timeouts.keys()),
      totalStates: this.elementStates.size,
    };
  }
}

// Create global instance
window.uiStateManager = new UIStateManager();

// Optional: Enable debug mode in development
if (
  window.location.hostname === "localhost" ||
  window.location.hostname.includes("picontrol")
) {
  window.uiStateManager.setDebugMode(true);
}
