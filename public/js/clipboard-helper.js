/**
 * Clipboard Helper Utility
 *
 * Provides a cross-context clipboard copy function that works in both
 * secure (HTTPS) and non-secure (HTTP) contexts.
 *
 * In secure contexts (HTTPS), uses the modern Clipboard API.
 * In non-secure contexts (HTTP), falls back to document.execCommand('copy').
 *
 * Usage:
 *   copyToClipboard('text to copy')
 *     .then(() => console.log('Copied!'))
 *     .catch(err => console.error('Copy failed:', err));
 */

/**
 * Copy text to clipboard with automatic fallback for non-secure contexts
 *
 * @param {string} text - The text to copy to clipboard
 * @returns {Promise<void>} Promise that resolves when copy succeeds
 */
function copyToClipboard(text) {
  // Try modern Clipboard API first (works in secure contexts)
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text);
  }

  // Fallback for non-secure contexts (HTTP)
  // Uses the older execCommand method
  return new Promise((resolve, reject) => {
    try {
      // Create a temporary textarea element
      const textArea = document.createElement("textarea");

      // Set the text content
      textArea.value = text;

      // Style to make it invisible and prevent layout issues
      textArea.style.position = "fixed";
      textArea.style.left = "-999999px";
      textArea.style.top = "-999999px";
      textArea.style.opacity = "0";

      // Add to DOM
      document.body.appendChild(textArea);

      // Select the text
      textArea.focus();
      textArea.select();

      // Try to copy
      const successful = document.execCommand("copy");

      // Clean up
      document.body.removeChild(textArea);

      if (successful) {
        resolve();
      } else {
        reject(new Error("execCommand('copy') failed"));
      }
    } catch (err) {
      // Clean up if error occurred
      const textArea = document.querySelector('textarea[style*="-999999px"]');
      if (textArea && textArea.parentNode) {
        textArea.parentNode.removeChild(textArea);
      }

      reject(err);
    }
  });
}

// Make available globally
if (typeof window !== "undefined") {
  window.copyToClipboard = copyToClipboard;
}

// Also export for module usage
if (typeof module !== "undefined" && module.exports) {
  module.exports = { copyToClipboard };
}
