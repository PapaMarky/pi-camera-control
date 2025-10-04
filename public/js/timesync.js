/**
 * Client-side TimeSync Module
 *
 * Handles time synchronization requests from the server
 */

class TimeSync {
  constructor(websocket) {
    this.ws = websocket;
    this.lastSyncStatus = null;
    this.syncStatusElement = null;
    this.registerHandlers();
    this.initializeUI();
  }

  /**
   * Register WebSocket message handlers
   */
  registerHandlers() {
    // Listen for time sync requests
    this.ws.on("time-sync-request", (data) => {
      this.handleTimeSyncRequest(data);
    });

    // Listen for GPS requests
    this.ws.on("gps-request", (data) => {
      this.handleGPSRequest(data);
    });

    // Listen for sync status updates
    this.ws.on("time-sync-status", (data) => {
      this.updateSyncStatus(data);
    });
  }

  /**
   * Initialize UI elements
   */
  initializeUI() {
    // Add sync status indicator to the UI
    const statusBar = document.querySelector(".status-bar");
    if (statusBar) {
      const syncIndicator = document.createElement("div");
      syncIndicator.className = "sync-status-indicator";
      syncIndicator.innerHTML = `
        <span class="sync-icon">🔄</span>
        <span class="sync-text">Time Sync</span>
        <span class="sync-status">--</span>
      `;
      statusBar.appendChild(syncIndicator);
      this.syncStatusElement = syncIndicator.querySelector(".sync-status");
    }
  }

  /**
   * Handle time sync request from server
   */
  handleTimeSyncRequest(data) {
    console.log("Time sync requested by server");

    // Get current client time and timezone
    const clientTime = new Date().toISOString();
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    // Prepare response
    const response = {
      type: "time-sync-response",
      requestId: data.requestId,
      clientTime: clientTime,
      timezone: timezone,
    };

    // Try to get GPS location if available
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          response.gps = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
          };
          this.sendTimeSyncResponse(response);
        },
        (error) => {
          console.log("GPS not available:", error.message);
          this.sendTimeSyncResponse(response);
        },
        { timeout: 3000 },
      );
    } else {
      this.sendTimeSyncResponse(response);
    }
  }

  /**
   * Send time sync response to server
   */
  sendTimeSyncResponse(response) {
    this.ws.send("time-sync-response", response);
    console.log("Time sync response sent:", response);
  }

  /**
   * Handle GPS request from server
   */
  handleGPSRequest(data) {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          this.ws.send("gps-response", {
            requestId: data.requestId,
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: new Date().toISOString(),
          });
        },
        (error) => {
          this.ws.send("gps-response", {
            requestId: data.requestId,
            error: error.message,
          });
        },
        { timeout: 5000, enableHighAccuracy: true },
      );
    } else {
      this.ws.send("gps-response", {
        requestId: data.requestId,
        error: "Geolocation not supported",
      });
    }
  }

  /**
   * Update sync status in UI
   */
  updateSyncStatus(status) {
    this.lastSyncStatus = status;

    if (this.syncStatusElement) {
      if (status.piReliable) {
        this.syncStatusElement.textContent = "✓";
        this.syncStatusElement.className = "sync-status sync-ok";
        this.syncStatusElement.title = `Last sync: ${this.formatTime(status.lastPiSync)}`;
      } else {
        this.syncStatusElement.textContent = "!";
        this.syncStatusElement.className = "sync-status sync-warning";
        this.syncStatusElement.title = status.lastPiSync
          ? `Last sync: ${this.formatTime(status.lastPiSync)} (expired)`
          : "No sync performed";
      }
    }

    // Show notification if sync lost reliability
    if (this.lastSyncStatus?.piReliable && !status.piReliable) {
      this.showNotification("Time sync reliability lost", "warning");
    }
  }

  /**
   * Format time for display
   */
  formatTime(isoString) {
    if (!isoString) return "Never";
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)} hours ago`;
    return date.toLocaleString();
  }

  /**
   * Show notification
   */
  showNotification(message, type = "info") {
    // Use existing notification system if available
    if (window.showNotification) {
      window.showNotification(message, type);
    } else {
      console.log(`[${type}] ${message}`);
    }
  }

  /**
   * Manually trigger time sync
   */
  manualSync() {
    console.log("Manual time sync requested");

    const clientTime = new Date().toISOString();
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    this.ws.send("manual-time-sync", {
      clientTime: clientTime,
      timezone: timezone,
    });

    this.showNotification("Time sync requested", "info");
  }

  /**
   * Get current sync status
   */
  getStatus() {
    return this.lastSyncStatus;
  }
}

// Export for use in main app
window.TimeSync = TimeSync;
