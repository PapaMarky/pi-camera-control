/**
 * Test Shot UI Manager
 * Handles live view capture and image gallery
 */
class TestShotUI {
  constructor(wsManager) {
    this.wsManager = wsManager;
    this.captures = []; // Live view captures
    this.testPhotos = []; // Test photos with EXIF
    this.settings = null; // Current camera settings
    this.pendingChanges = {}; // Track pending setting changes
    this.isCapturing = false; // Prevent concurrent test photo captures

    console.log("TestShotUI: Constructor called");
  }

  /**
   * Helper to extract error message from API response
   * @param {Response} response - Fetch API response object
   * @returns {Promise<string>} Error message from response body or generic message
   */
  async extractErrorMessage(response) {
    let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
    try {
      const errorData = await response.json();
      if (errorData.error && errorData.error.message) {
        errorMessage = errorData.error.message;
      }
    } catch (e) {
      // If parsing fails, use the generic message
    }
    return errorMessage;
  }

  // Safe initialization - don't call initialize yet
  // Will be called after DOM is fully ready

  initialize() {
    console.log("TestShotUI: Initialize called");

    try {
      // Setup event handlers
      this.setupEventHandlers();
      this.updateButtonStates(); // Enable buttons if camera connected

      console.log("TestShotUI: Initialized successfully");
    } catch (error) {
      console.error("TestShotUI: Initialization failed:", error);
    }
  }

  updateButtonStates() {
    // Enable/disable buttons based on camera connection
    const captureBtn = document.getElementById("capture-liveview-btn");
    const takePhotoBtn = document.getElementById("take-photo-btn");
    const clearBtn = document.getElementById("clear-liveview-btn");

    // Check if camera is connected via global cameraManager status
    const isConnected =
      window.cameraManager &&
      window.cameraManager.status &&
      window.cameraManager.status.connected;

    if (captureBtn) captureBtn.disabled = !isConnected;
    if (takePhotoBtn) takePhotoBtn.disabled = !isConnected;
    if (clearBtn) clearBtn.disabled = this.captures.length === 0;

    console.log(
      `TestShotUI: Buttons ${isConnected ? "enabled" : "disabled"} (camera ${isConnected ? "connected" : "disconnected"})`,
    );
  }

  setupEventHandlers() {
    console.log("TestShotUI: Setting up event handlers");

    // Capture live view button
    const captureBtn = document.getElementById("capture-liveview-btn");
    if (captureBtn) {
      captureBtn.addEventListener("click", () => this.captureLiveView());
      console.log("TestShotUI: Capture button handler attached");
    } else {
      console.log(
        "TestShotUI: Capture button not found (OK if not on page yet)",
      );
    }

    // Take photo button
    const takePhotoBtn = document.getElementById("take-photo-btn");
    if (takePhotoBtn) {
      takePhotoBtn.addEventListener("click", () => this.captureTestPhoto());
      console.log("TestShotUI: Take photo button handler attached");
    }

    // Clear button
    const clearBtn = document.getElementById("clear-liveview-btn");
    if (clearBtn) {
      clearBtn.addEventListener("click", () => this.clearAll());
      console.log("TestShotUI: Clear button handler attached");
    }

    // Refresh settings button
    const refreshSettingsBtn = document.getElementById("refresh-settings-btn");
    if (refreshSettingsBtn) {
      refreshSettingsBtn.addEventListener("click", () => this.loadSettings());
      console.log("TestShotUI: Refresh settings button handler attached");
    }

    // Apply settings button
    const applySettingsBtn = document.getElementById("apply-settings-btn");
    if (applySettingsBtn) {
      applySettingsBtn.addEventListener("click", () => this.applySettings());
      console.log("TestShotUI: Apply settings button handler attached");
    }

    // Load existing test photos
    this.loadTestPhotos();
  }

  async captureLiveView() {
    console.log("TestShotUI: Capture live view clicked");

    const btn = document.getElementById("capture-liveview-btn");
    if (!btn) return;

    try {
      // Disable button and show loading
      btn.disabled = true;
      const originalText = btn.querySelector(".btn-text").textContent;
      btn.querySelector(".btn-text").textContent = "Capturing...";

      // Call API
      const response = await fetch("/api/camera/liveview/capture", {
        method: "POST",
      });

      if (!response.ok) {
        const errorMessage = await this.extractErrorMessage(response);
        throw new Error(errorMessage);
      }

      const capture = await response.json();
      console.log("TestShotUI: Capture successful:", capture);

      // Add to captures list
      this.captures.push(capture);
      this.renderGallery();
    } catch (error) {
      console.error("TestShotUI: Capture failed:", error);
      alert(`Failed to capture: ${error.message}`);
    } finally {
      // Restore button
      btn.disabled = false;
      btn.querySelector(".btn-text").textContent = "Capture Live View";
    }
  }

  async clearAll() {
    console.log("TestShotUI: Clear all clicked");

    if (!confirm("Clear all captured images?")) {
      return;
    }

    try {
      const response = await fetch("/api/camera/liveview/clear", {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorMessage = await this.extractErrorMessage(response);
        throw new Error(errorMessage);
      }

      this.captures = [];
      this.renderGallery();
      console.log("TestShotUI: All captures cleared");
    } catch (error) {
      console.error("TestShotUI: Clear failed:", error);
      alert(`Failed to clear: ${error.message}`);
    }
  }

  async deleteImage(id) {
    console.log("TestShotUI: Delete image clicked", id);

    if (!confirm("Delete this image?")) {
      return;
    }

    try {
      const response = await fetch(`/api/camera/liveview/images/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorMessage = await this.extractErrorMessage(response);
        throw new Error(errorMessage);
      }

      // Remove from local captures list
      this.captures = this.captures.filter((c) => c.id !== id);
      this.renderGallery();
      console.log("TestShotUI: Image deleted", id);
    } catch (error) {
      console.error("TestShotUI: Delete failed:", error);
      alert(`Failed to delete: ${error.message}`);
    }
  }

  renderGallery() {
    console.log(
      "TestShotUI: Rendering gallery with",
      this.captures.length,
      "images",
    );

    const gallery = document.getElementById("liveview-gallery");
    if (!gallery) {
      console.log("TestShotUI: Gallery element not found");
      return;
    }

    if (this.captures.length === 0) {
      gallery.innerHTML =
        '<p style="text-align: center; padding: 2rem; color: #666;">No images captured yet. Click "Capture Live View" to start.</p>';
      return;
    }

    // Simple list of images with delete buttons (newest first)
    gallery.innerHTML = this.captures
      .slice()
      .reverse()
      .map(
        (capture) => `
      <div style="margin-bottom: 1rem; padding: 1rem; border: 1px solid #ddd; border-radius: 4px;">
        <img src="/api/camera/liveview/images/${capture.id}/file"
             style="max-width: 100%; height: auto; cursor: pointer;"
             onclick="window.open(this.src, '_blank')"
             alt="Live view ${capture.id}">
        <div style="margin-top: 0.5rem; display: flex; justify-content: space-between; align-items: center;">
          <p style="margin: 0; font-size: 0.875rem; color: #666;">
            ID: ${capture.id} | ${new Date(capture.timestamp).toLocaleString()}
          </p>
          <button onclick="window.testShotUI.deleteImage(${capture.id})"
                  style="background: rgba(220, 53, 69, 0.9); color: white; border: none; border-radius: 4px; padding: 0.25rem 0.5rem; cursor: pointer; font-size: 0.875rem;"
                  title="Delete this image">
            🗑️ Delete
          </button>
        </div>
      </div>
    `,
      )
      .join("");
  }

  async loadSettings() {
    console.log("TestShotUI: Loading camera settings");

    const refreshBtn = document.getElementById("refresh-settings-btn");
    const displayDiv = document.getElementById("camera-settings-display");

    if (!displayDiv) {
      console.log("TestShotUI: Settings display element not found");
      return;
    }

    try {
      if (refreshBtn) {
        refreshBtn.disabled = true;
        const btnText = refreshBtn.querySelector(".btn-text");
        if (btnText) btnText.textContent = "Loading...";
      }

      const response = await fetch("/api/camera/settings");

      if (!response.ok) {
        const errorMessage = await this.extractErrorMessage(response);
        throw new Error(errorMessage);
      }

      this.settings = await response.json();
      this.pendingChanges = {};
      this.renderSettings();

      console.log("TestShotUI: Camera settings loaded", this.settings);
    } catch (error) {
      console.error("TestShotUI: Failed to load settings:", error);
      displayDiv.innerHTML = `<p style="color: #dc3545; grid-column: 1 / -1;">Failed to load settings: ${error.message}</p>`;
    } finally {
      if (refreshBtn) {
        refreshBtn.disabled = false;
        const btnText = refreshBtn.querySelector(".btn-text");
        if (btnText) btnText.textContent = "Refresh Settings";
      }
    }
  }

  renderSettings() {
    const displayDiv = document.getElementById("camera-settings-display");
    if (!displayDiv || !this.settings) return;

    // Common settings to display (top priority)
    const commonSettings = [
      "iso",
      "av",
      "tv",
      "wb",
      "colortemperature",
      "exposuremode",
    ];

    // Filter to only show settings that have ability values (editable)
    const editableSettings = Object.entries(this.settings)
      .filter(([key, data]) => data && data.ability && data.ability.length > 0)
      .sort((a, b) => {
        // Sort common settings first
        const aCommon = commonSettings.indexOf(a[0]);
        const bCommon = commonSettings.indexOf(b[0]);
        if (aCommon !== -1 && bCommon !== -1) return aCommon - bCommon;
        if (aCommon !== -1) return -1;
        if (bCommon !== -1) return 1;
        return a[0].localeCompare(b[0]);
      });

    if (editableSettings.length === 0) {
      displayDiv.innerHTML =
        '<p style="color: #666; grid-column: 1 / -1;">No editable settings available</p>';
      return;
    }

    // Clear existing content
    displayDiv.innerHTML = "";

    // Create DOM elements instead of HTML strings to avoid escaping issues
    editableSettings.forEach(([key, data]) => {
      const currentValue = this.pendingChanges[key] || data.value;
      const hasChange = this.pendingChanges.hasOwnProperty(key);

      const container = document.createElement("div");
      container.style.cssText = `display: flex; flex-direction: column; gap: 0.5rem; ${hasChange ? "background: rgba(255, 193, 7, 0.1); padding: 0.5rem; border-radius: 4px;" : ""}`;

      const label = document.createElement("label");
      label.style.cssText =
        "font-weight: 600; font-size: 0.875rem; text-transform: uppercase;";
      label.textContent = key;

      const select = document.createElement("select");
      select.id = `setting-${key}`;
      select.style.cssText =
        "padding: 0.5rem; border: 1px solid #ddd; border-radius: 4px; font-size: 0.875rem;";

      // Add options
      data.ability.forEach((val) => {
        const option = document.createElement("option");
        option.value = val; // No escaping needed - DOM handles it
        option.textContent = val;
        if (currentValue === val) {
          option.selected = true;
        }
        select.appendChild(option);
      });

      // Add change handler
      select.addEventListener("change", (e) => {
        this.onSettingChange(key, e.target.value);
      });

      container.appendChild(label);
      container.appendChild(select);

      if (hasChange) {
        const modifiedLabel = document.createElement("span");
        modifiedLabel.style.cssText = "color: #ffc107; font-size: 0.75rem;";
        modifiedLabel.textContent = "● Modified";
        container.appendChild(modifiedLabel);
      }

      displayDiv.appendChild(container);
    });
  }

  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  onSettingChange(key, value) {
    console.log(`TestShotUI: Setting changed: ${key} = ${value}`);

    // Check if this is different from the original value
    if (
      this.settings &&
      this.settings[key] &&
      this.settings[key].value === value
    ) {
      // Changed back to original, remove from pending changes
      delete this.pendingChanges[key];
    } else {
      // New change
      this.pendingChanges[key] = value;
    }

    // Update UI
    this.renderSettings();

    // Show/hide Apply button
    const applyBtn = document.getElementById("apply-settings-btn");
    if (applyBtn) {
      if (Object.keys(this.pendingChanges).length > 0) {
        applyBtn.style.display = "block";
        applyBtn.disabled = false;
      } else {
        applyBtn.style.display = "none";
        applyBtn.disabled = true;
      }
    }
  }

  async applySettings() {
    console.log("TestShotUI: Applying settings changes", this.pendingChanges);

    if (Object.keys(this.pendingChanges).length === 0) {
      console.log("TestShotUI: No changes to apply");
      return;
    }

    const applyBtn = document.getElementById("apply-settings-btn");

    try {
      if (applyBtn) {
        applyBtn.disabled = true;
        const btnText = applyBtn.querySelector(".btn-text");
        if (btnText) btnText.textContent = "Applying...";
      }

      // Apply all pending changes
      for (const [setting, value] of Object.entries(this.pendingChanges)) {
        const response = await fetch(`/api/camera/settings/${setting}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ value }),
        });

        if (!response.ok) {
          const errorMessage = await this.extractErrorMessage(response);
          throw new Error(`Failed to update ${setting}: ${errorMessage}`);
        }

        console.log(`TestShotUI: Applied ${setting} = ${value}`);
      }

      // Clear pending changes and reload settings
      this.pendingChanges = {};
      await this.loadSettings();

      console.log("TestShotUI: All settings applied successfully");
    } catch (error) {
      console.error("TestShotUI: Failed to apply settings:", error);
      alert(`Failed to apply settings: ${error.message}`);
    } finally {
      if (applyBtn) {
        applyBtn.disabled = true;
        applyBtn.style.display = "none";
        const btnText = applyBtn.querySelector(".btn-text");
        if (btnText) btnText.textContent = "Apply Changes";
      }
    }
  }

  // ===== Test Photo Functions =====

  /**
   * Capture a test photo with EXIF metadata
   */
  async captureTestPhoto() {
    console.log("TestShotUI: Capture test photo clicked");

    // Prevent concurrent captures
    if (this.isCapturing) {
      console.log("TestShotUI: Capture already in progress, ignoring click");
      return;
    }

    const btn = document.getElementById("take-photo-btn");
    if (!btn) return;

    this.isCapturing = true;

    try {
      // Disable both capture buttons during operation
      btn.disabled = true;
      const liveviewBtn = document.getElementById("capture-liveview-btn");
      if (liveviewBtn) liveviewBtn.disabled = true;

      const originalText = btn.querySelector(".btn-text").textContent;
      btn.querySelector(".btn-text").textContent = "Taking photo...";

      // Listen for download progress events
      const progressHandler = (data) => {
        console.log("TestShotUI: Download progress event received:", data);
        btn.querySelector(".btn-text").textContent =
          `Downloading (${data.percentage}%)`;
      };

      this.wsManager.on("test_photo_download_progress", progressHandler);

      try {
        // Call API
        const response = await fetch("/api/camera/photos/test", {
          method: "POST",
        });

        if (!response.ok) {
          const errorMessage = await this.extractErrorMessage(response);
          throw new Error(errorMessage);
        }

        const photo = await response.json();
        console.log("TestShotUI: Test photo captured:", photo);

        // Add to test photos list
        this.testPhotos.push(photo);
        this.renderTestPhotoGallery();
      } finally {
        // Clean up progress listener
        this.wsManager.off("test_photo_download_progress", progressHandler);
      }
    } catch (error) {
      console.error("TestShotUI: Test photo capture failed:", error);
      alert(`Failed to capture test photo: ${error.message}`);
    } finally {
      // Restore buttons
      this.isCapturing = false;
      btn.disabled = false;
      btn.querySelector(".btn-text").textContent = "Take Photo";
      const liveviewBtn = document.getElementById("capture-liveview-btn");
      if (liveviewBtn) liveviewBtn.disabled = false;
    }
  }

  /**
   * Load all test photos from server
   */
  async loadTestPhotos() {
    console.log("TestShotUI: Loading test photos");

    try {
      const response = await fetch("/api/camera/photos/test");

      if (!response.ok) {
        // If 404 or other error, just show empty gallery
        console.log("TestShotUI: No test photos available");
        this.testPhotos = [];
        this.renderTestPhotoGallery();
        return;
      }

      const data = await response.json();
      this.testPhotos = data.photos || [];
      console.log("TestShotUI: Loaded", this.testPhotos.length, "test photos");
      this.renderTestPhotoGallery();
    } catch (error) {
      console.error("TestShotUI: Failed to load test photos:", error);
      this.testPhotos = [];
      this.renderTestPhotoGallery();
    }
  }

  /**
   * Format processing time for display
   * @param {number} ms - Processing time in milliseconds
   * @returns {string|null} Formatted time (e.g., "2.3s" or "450ms") or null if invalid
   */
  formatProcessingTime(ms) {
    if (ms === undefined || ms === null || ms < 0) {
      return null;
    }

    if (ms >= 1000) {
      // Display as seconds with 1 decimal place
      return `${(ms / 1000).toFixed(1)}s`;
    } else {
      // Display as milliseconds
      return `${Math.round(ms)}ms`;
    }
  }

  /**
   * Render the test photo gallery
   */
  renderTestPhotoGallery() {
    console.log(
      "TestShotUI: Rendering test photo gallery with",
      this.testPhotos.length,
      "photos",
    );

    const gallery = document.getElementById("testphoto-gallery");
    if (!gallery) {
      console.log("TestShotUI: Test photo gallery element not found");
      return;
    }

    if (this.testPhotos.length === 0) {
      gallery.innerHTML =
        '<p style="text-align: center; padding: 2rem; color: #666;">No test photos captured yet. Click "Take Photo" to capture a full-resolution photo.</p>';
      return;
    }

    // Display photos (newest first)
    gallery.innerHTML = this.testPhotos
      .slice()
      .reverse()
      .map((photo) => {
        const exif = photo.exif || {};
        const exifDisplay = this.formatExif(exif);

        // Format processing time for display
        const processingTime = this.formatProcessingTime(
          photo.processingTimeMs,
        );
        const processingTimeDisplay = processingTime
          ? ` (${processingTime})`
          : "";

        return `
        <div class="test-photo-card" style="margin-bottom: 1rem; padding: 1rem; border: 1px solid #ddd; border-radius: 4px;">
          <img src="${photo.url}/file"
               style="max-width: 100%; height: auto; cursor: pointer;"
               onclick="window.open(this.src, '_blank')"
               alt="Test photo ${photo.id}">

          <!-- EXIF Metadata -->
          <div class="exif-metadata" data-exif style="margin-top: 0.75rem; padding: 0.75rem; background: rgba(0,0,0,0.05); border-radius: 4px; font-size: 0.875rem;">
            <div style="font-weight: 600; margin-bottom: 0.5rem;">Details</div>
            ${photo.cameraPath ? `<div style="margin-bottom: 0.5rem;"><strong>${photo.cameraPath}${processingTimeDisplay}</strong></div>` : ""}
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 0.5rem;">
              ${exifDisplay}
            </div>
          </div>

          <!-- Action Buttons -->
          <div style="margin-top: 0.75rem; display: flex; justify-content: flex-end; gap: 0.5rem;">
            <div style="display: flex; gap: 0.5rem;">
              <button onclick="window.testShotUI.downloadPhoto(${photo.id}, '${photo.filename}')"
                      data-action="download-photo"
                      style="background: rgba(13, 110, 253, 0.9); color: white; border: none; border-radius: 4px; padding: 0.25rem 0.5rem; cursor: pointer; font-size: 0.875rem;"
                      title="Download photo">
                📥 Download
              </button>
              <button onclick="window.testShotUI.deleteTestPhoto(${photo.id})"
                      data-action="delete-photo"
                      style="background: rgba(220, 53, 69, 0.9); color: white; border: none; border-radius: 4px; padding: 0.25rem 0.5rem; cursor: pointer; font-size: 0.875rem;"
                      title="Delete photo">
                🗑️ Delete
              </button>
            </div>
          </div>
        </div>
      `;
      })
      .join("");
  }

  /**
   * Format EXIF metadata for display
   * @param {Object} exif - EXIF data object
   * @returns {string} HTML string for EXIF display
   */
  formatExif(exif) {
    const fields = [];

    // ISO
    if (exif.ISO) {
      fields.push(`<div><strong>ISO:</strong> ${exif.ISO}</div>`);
    }

    // Exposure Time (prefer ExposureTime over ShutterSpeed as it's more standard)
    const exposureValue = exif.ExposureTime || exif.ShutterSpeed;
    if (exposureValue) {
      const shutterDisplay = this.formatShutterSpeed(exposureValue);
      fields.push(`<div><strong>Exposure:</strong> ${shutterDisplay}</div>`);
    }

    // Aperture
    if (exif.FNumber) {
      fields.push(`<div><strong>Aperture:</strong> f/${exif.FNumber}</div>`);
    }

    // White Balance
    if (exif.WhiteBalance) {
      fields.push(`<div><strong>WB:</strong> ${exif.WhiteBalance}</div>`);
    }

    // Capture Date
    if (exif.DateTimeOriginal) {
      const date = new Date(exif.DateTimeOriginal);
      fields.push(
        `<div><strong>Captured:</strong> ${date.toLocaleString()}</div>`,
      );
    }

    return fields.length > 0
      ? fields.join("")
      : "<div>No EXIF data available</div>";
  }

  /**
   * Format shutter speed for display
   * @param {string|number} speed - Shutter speed value
   * @returns {string} Formatted shutter speed (e.g., "1/250" or "30s")
   */
  formatShutterSpeed(speed) {
    if (typeof speed === "string") {
      // Already formatted
      return speed;
    }

    const numSpeed = parseFloat(speed);
    if (numSpeed >= 1) {
      // Long exposure (1 second or more)
      return `${numSpeed}s`;
    } else if (numSpeed > 0) {
      // Fast shutter (fraction of a second)
      return `1/${Math.round(1 / numSpeed)}`;
    }

    return speed.toString();
  }

  /**
   * Download a test photo
   * @param {number} photoId - Photo ID
   * @param {string} filename - Original filename
   */
  downloadPhoto(photoId, filename) {
    console.log("TestShotUI: Download photo", photoId, filename);

    // Create a temporary link and trigger download
    const link = document.createElement("a");
    link.href = `/api/camera/photos/test/${photoId}/file`;
    link.download = filename;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  /**
   * Delete a test photo
   * @param {number} photoId - Photo ID to delete
   */
  async deleteTestPhoto(photoId) {
    console.log("TestShotUI: Delete test photo clicked", photoId);

    if (!confirm("Delete this test photo?")) {
      return;
    }

    try {
      const response = await fetch(`/api/camera/photos/test/${photoId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorMessage = await this.extractErrorMessage(response);
        throw new Error(errorMessage);
      }

      // Remove from local list
      this.testPhotos = this.testPhotos.filter((p) => p.id !== photoId);
      this.renderTestPhotoGallery();
      console.log("TestShotUI: Test photo deleted", photoId);
    } catch (error) {
      console.error("TestShotUI: Delete failed:", error);
      alert(`Failed to delete photo: ${error.message}`);
    }
  }
}

// Export for use in app.js
if (typeof window !== "undefined") {
  window.TestShotUI = TestShotUI;
}
