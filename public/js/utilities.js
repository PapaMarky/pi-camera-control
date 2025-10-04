class UtilitiesManager {
  constructor() {
    this.timeDifference = null;
    this.updateTimeInterval = null;
  }

  initialize() {
    this.setupEventListeners();
    this.startTimeUpdates();
    this.getCurrentTime();
  }

  setupEventListeners() {
    const getTimeBtn = document.getElementById("get-time-btn");
    const syncTimeBtn = document.getElementById("sync-time-btn");

    if (getTimeBtn) {
      getTimeBtn.addEventListener("click", () => {
        this.getCurrentTime();
      });
    }

    if (syncTimeBtn) {
      syncTimeBtn.addEventListener("click", () => {
        this.syncTimeToServer();
      });
    }
  }

  startTimeUpdates() {
    // Update client time display every second
    this.updateTimeInterval = setInterval(() => {
      this.updateClientTime();
    }, 1000);
  }

  stopTimeUpdates() {
    if (this.updateTimeInterval) {
      clearInterval(this.updateTimeInterval);
      this.updateTimeInterval = null;
    }
  }

  updateClientTime() {
    const clientTimeElement = document.getElementById("client-current-time");
    if (clientTimeElement) {
      const now = new Date();
      const clientTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      clientTimeElement.textContent = now.toLocaleString("en-US", {
        timeZone: clientTimezone,
        timeZoneName: "short",
      });
    }
  }

  async getCurrentTime() {
    try {
      // Use UIStateManager for consistent state handling
      window.uiStateManager.setInProgress("get-time-btn", {
        progressText: "Getting Time...",
        timeout: 15000,
      });

      const response = await fetch("/api/system/time");
      const data = await response.json();

      if (response.ok) {
        const piTimeElement = document.getElementById("pi-current-time");
        const timeDifferenceElement =
          document.getElementById("time-difference");

        if (piTimeElement) {
          // Always display Pi time in the client's local timezone for consistency
          const piTime = new Date(data.currentTime);
          const clientTimezone =
            Intl.DateTimeFormat().resolvedOptions().timeZone;
          piTimeElement.textContent = piTime.toLocaleString("en-US", {
            timeZone: clientTimezone,
            timeZoneName: "short",
          });
        }

        // Calculate time difference in UTC to avoid timezone confusion
        const piTime = new Date(data.currentTime);
        const clientTime = new Date();
        this.timeDifference = clientTime.getTime() - piTime.getTime();

        if (timeDifferenceElement) {
          if (Math.abs(this.timeDifference) < 1000) {
            timeDifferenceElement.textContent = "In sync (< 1 second)";
            timeDifferenceElement.style.color = "var(--accent-success)";
          } else {
            const diffSeconds = Math.round(this.timeDifference / 1000);
            const absSeconds = Math.abs(diffSeconds);
            const direction = diffSeconds > 0 ? "ahead" : "behind";

            let timeText;
            if (absSeconds < 60) {
              timeText = `${absSeconds} second${absSeconds !== 1 ? "s" : ""}`;
            } else if (absSeconds < 3600) {
              const minutes = Math.round(absSeconds / 60);
              timeText = `${minutes} minute${minutes !== 1 ? "s" : ""}`;
            } else {
              const hours = Math.round(absSeconds / 3600);
              timeText = `${hours} hour${hours !== 1 ? "s" : ""}`;
            }

            timeDifferenceElement.textContent = `Client ${timeText} ${direction}`;
            timeDifferenceElement.style.color =
              absSeconds > 300
                ? "var(--accent-danger)"
                : "var(--accent-warning)";
          }
        }

        // Display timezone information
        const piTimezoneElement = document.getElementById("pi-timezone");
        if (piTimezoneElement) {
          piTimezoneElement.textContent = `Pi timezone: ${data.timezone || "Unknown"}`;
        }

        this.log("Time information retrieved successfully", "success");
      } else {
        throw new Error(data.error || "Failed to get time information");
      }
    } catch (error) {
      console.error("Failed to get time:", error);
      this.log(`Failed to get time: ${error.message}`, "error");
    } finally {
      window.uiStateManager.restore("get-time-btn");
    }
  }

  async syncTimeToServer() {
    try {
      // Use UIStateManager for consistent state handling
      window.uiStateManager.setInProgress("sync-time-btn", {
        progressText: "Syncing...",
        timeout: 20000, // Time sync can take longer
      });

      const clientTime = new Date();
      const clientTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

      // Check last sync status first
      await this.displayLastSyncStatus();

      this.log(`Syncing time and timezone to Pi...`, "info");
      this.log(
        `Client time: ${clientTime.toLocaleString("en-US", { timeZone: clientTimezone, timeZoneName: "short" })}`,
        "info",
      );

      const response = await fetch("/api/system/time", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          timestamp: clientTime.toISOString(),
          timezone: clientTimezone,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        this.log("Time synchronized successfully to Pi", "success");

        // Log timezone sync result
        if (data.timezoneSync) {
          if (data.timezoneSync.success) {
            this.log(
              `Timezone synchronized to: ${data.timezoneSync.timezone}`,
              "success",
            );
          } else {
            this.log(
              `Timezone sync failed: ${data.timezoneSync.error}`,
              "warning",
            );
          }
        }

        // Refresh the time display after sync
        setTimeout(() => {
          this.getCurrentTime();
        }, 1000);
      } else {
        throw new Error(data.error || "Failed to synchronize time");
      }
    } catch (error) {
      console.error("Failed to sync time:", error);
      this.log(`Failed to sync time: ${error.message}`, "error");
    } finally {
      window.uiStateManager.restore("sync-time-btn");
    }
  }

  async displayLastSyncStatus() {
    try {
      console.log("Fetching TimeSync status...");
      const response = await fetch("/api/timesync/status");
      console.log("TimeSync response status:", response.status);

      if (response.ok) {
        const data = await response.json();
        console.log("TimeSync data:", data);
        const status = data.status;

        if (status.lastPiSync) {
          const lastSyncTime = new Date(status.lastPiSync);
          const now = new Date();
          const timeSinceSync = now - lastSyncTime;
          const minutesAgo = Math.floor(timeSinceSync / 60000);
          const hoursAgo = Math.floor(minutesAgo / 60);

          let timeAgoText;
          if (minutesAgo < 1) {
            timeAgoText = "just now";
          } else if (minutesAgo < 60) {
            timeAgoText = `${minutesAgo} minute${minutesAgo !== 1 ? "s" : ""} ago`;
          } else if (hoursAgo < 24) {
            timeAgoText = `${hoursAgo} hour${hoursAgo !== 1 ? "s" : ""} ago`;
          } else {
            const daysAgo = Math.floor(hoursAgo / 24);
            timeAgoText = `${daysAgo} day${daysAgo !== 1 ? "s" : ""} ago`;
          }

          const reliabilityStatus = status.piReliable
            ? "✓ Reliable"
            : "⚠ Expired";
          this.log(
            `Last auto-sync: ${timeAgoText} (${reliabilityStatus})`,
            "info",
          );

          if (status.syncSource) {
            this.log(`Sync source: ${status.syncSource}`, "info");
          }
        } else {
          console.log("No lastPiSync found, showing warning message");
          this.log("No automatic time sync has occurred yet", "warning");
        }
      } else {
        console.log("TimeSync API response not ok:", response.status);
      }
    } catch (error) {
      // Silently fail if TimeSync status is not available
      console.error("TimeSync status error:", error.message);
      this.log("Could not check auto-sync status", "warning");
    }
  }

  log(message, type = "info") {
    console.log(`[Utilities] Logging message: "${message}" (type: ${type})`);

    // Use the existing camera log system if available
    if (window.cameraManager && window.cameraManager.log) {
      console.log("[Utilities] Using cameraManager.log");
      window.cameraManager.log(message, type);
    } else {
      console.log(
        `[Utilities] No cameraManager found, using console: ${message}`,
      );

      // Try to log directly to activity log if camera manager isn't available
      const activityLog = document.getElementById("activity-log");
      if (activityLog) {
        const logEntry = document.createElement("div");
        logEntry.className = `log-entry ${type}`;
        logEntry.innerHTML = `
          <span class="log-time">${new Date().toLocaleTimeString()}</span>
          <span class="log-message">${message}</span>
        `;
        activityLog.appendChild(logEntry);
        activityLog.scrollTop = activityLog.scrollHeight;
        console.log("[Utilities] Added message directly to activity log");
      }
    }
  }

  cleanup() {
    this.stopTimeUpdates();
  }
}

// Initialize the utilities manager when the page loads
document.addEventListener("DOMContentLoaded", () => {
  window.utilitiesManager = new UtilitiesManager();
});
