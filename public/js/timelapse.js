/**
 * Timelapse Reports UI Manager
 * Handles the user interface for timelapse report management and session completion
 */
class TimelapseUI {
  constructor(wsManager) {
    this.wsManager = wsManager;
    this.currentReport = null;
    this.unsavedSession = null;
    this.boundHandlers = new Map(); // Track bound handlers for cleanup
    this.isCompletionScreenVisible = false; // Track if completion screen is currently displayed

    this.initialize();
  }

  initialize() {
    console.log("Initializing Timelapse UI...");

    // Bind event handlers
    this.setupEventHandlers();

    // Load initial data
    this.loadReports();
    this.checkForUnsavedSession();

    console.log("Timelapse UI initialized");
  }

  setupEventHandlers() {
    // Reports list handlers
    document
      .getElementById("refresh-reports-btn")
      .addEventListener("click", () => {
        this.loadReports();
      });

    document
      .getElementById("back-to-reports-btn")
      .addEventListener("click", () => {
        this.showReportsList();
      });

    // Report actions
    document
      .getElementById("edit-report-title-btn")
      .addEventListener("click", () => {
        this.editReportTitle();
      });

    document
      .getElementById("delete-report-btn")
      .addEventListener("click", () => {
        this.deleteReport();
      });

    document
      .getElementById("download-json-btn")
      .addEventListener("click", () => {
        this.downloadReportAsJSON();
      });

    document
      .getElementById("download-markdown-btn")
      .addEventListener("click", () => {
        this.downloadReportAsMarkdown();
      });

    // Session completion handlers
    document
      .getElementById("completion-done-btn")
      .addEventListener("click", () => {
        this.handleCompletionDone();
      });

    // WebSocket event handlers
    if (this.wsManager) {
      // Helper to register and track handlers
      const registerHandler = (event, handler) => {
        this.boundHandlers.set(event, handler);
        this.wsManager.on(event, handler);
      };

      // Report data responses
      // Use ONLY broadcast event to avoid duplicate UI updates
      registerHandler("timelapse_reports", (data) => {
        this.handleReportsResponse(data);
      });

      registerHandler("timelapse_report_response", (data) => {
        this.handleReportResponse(data);
      });

      // Session events
      registerHandler("session_completed", (data) => {
        this.handleSessionCompleted(data);
      });

      registerHandler("session_stopped", (data) => {
        this.handleSessionStopped(data);
      });

      registerHandler("session_error", (data) => {
        this.handleSessionError(data);
      });

      registerHandler("unsaved_session_found", (data) => {
        this.handleUnsavedSessionFound(data);
      });

      registerHandler("report_saved", (data) => {
        this.loadReports(); // Refresh the list after saving
      });

      registerHandler("session_saved", (data) => {
        this.handleSessionSaved(); // Hide completion page and show success
      });

      registerHandler("report_deleted", (data) => {
        // If we're currently viewing the deleted report, navigate back to list
        if (this.currentReport && this.currentReport.id === data.id) {
          this.showReportsList();
        }
        this.loadReports(); // Refresh the list after deleting
      });

      // Handle session discard response
      registerHandler("session_discarded", (data) => {
        this.handleSessionDiscarded();
      });
    }
  }

  /**
   * Cleanup method to remove all event listeners
   * Should be called before destroying the UI manager instance
   */
  destroy() {
    console.log("TimelapseUI: Cleaning up event listeners");

    // Remove all WebSocket event handlers
    for (const [event, handler] of this.boundHandlers) {
      this.wsManager.off(event, handler);
    }
    this.boundHandlers.clear();

    console.log("TimelapseUI: Cleanup complete");
  }

  /**
   * Load all saved reports
   */
  async loadReports() {
    try {
      this.showReportsLoading();

      if (this.wsManager && this.wsManager.isConnected()) {
        // Use WebSocket if available
        this.wsManager.send("get_timelapse_reports", {});
      } else {
        // Fallback to REST API
        const response = await fetch("/api/timelapse/reports");
        const data = await response.json();
        this.handleReportsResponse(data);
      }
    } catch (error) {
      console.error("Failed to load reports:", error);
      this.showReportsError("Failed to load reports");
    }
  }

  /**
   * Check for unsaved session from previous run
   */
  async checkForUnsavedSession() {
    try {
      if (this.wsManager && this.wsManager.isConnected()) {
        // Use WebSocket if available
        this.wsManager.send("get_unsaved_session", {});
      } else {
        // Fallback to REST API
        const response = await fetch("/api/timelapse/unsaved-session");
        const data = await response.json();
        if (data.unsavedSession) {
          this.handleUnsavedSessionFound(data.unsavedSession);
        }
      }
    } catch (error) {
      console.error("Failed to check for unsaved session:", error);
    }
  }

  /**
   * Handle reports response from API
   */
  handleReportsResponse(data) {
    const reportsContainer = document.getElementById("reports-container");
    const loadingElement = document.getElementById("reports-loading");
    const emptyElement = document.getElementById("reports-empty");
    const listElement = document.getElementById("reports-list");

    loadingElement.style.display = "none";

    if (data.reports && data.reports.length > 0) {
      emptyElement.style.display = "none";
      listElement.style.display = "block";
      this.renderReportsList(data.reports);
    } else {
      emptyElement.style.display = "block";
      listElement.style.display = "none";
    }
  }

  /**
   * Render the reports list
   */
  renderReportsList(reports) {
    const listElement = document.getElementById("reports-list");

    listElement.innerHTML = reports
      .map(
        (report) => `
      <div class="report-item" data-report-id="${report.id}">
        <div class="report-header">
          <h5 class="report-title">${this.escapeHtml(report.title)}</h5>
          <span class="report-status ${report.status}">${this.getStatusIcon(report.status)} ${this.formatStatus(report.status)}</span>
        </div>
        <div class="report-details">
          <div class="report-stat">
            <span class="stat-label">Date:</span>
            <span class="stat-value">${this.formatDate(report.startTime)}</span>
          </div>
          <div class="report-stat">
            <span class="stat-label">Duration:</span>
            <span class="stat-value">${this.formatDuration(report.duration)}</span>
          </div>
          <div class="report-stat">
            <span class="stat-label">Images:</span>
            <span class="stat-value">${report.results.imagesSuccessful}/${report.results.imagesCaptured}</span>
          </div>
        </div>
        <div class="report-actions">
          <button class="view-report-btn icon-btn" data-report-id="${report.id}" title="View details">
            <span class="btn-icon">👁️</span>
          </button>
          <button class="delete-report-btn icon-btn danger" data-report-id="${report.id}" title="Delete report">
            <span class="btn-icon">🗑️</span>
          </button>
        </div>
      </div>
    `,
      )
      .join("");

    // Add click handlers for view buttons
    listElement.querySelectorAll(".view-report-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const reportId = e.currentTarget.dataset.reportId;
        this.viewReport(reportId);
      });
    });

    // Add click handlers for delete buttons
    listElement.querySelectorAll(".delete-report-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const reportId = e.currentTarget.dataset.reportId;
        const reportItem = e.currentTarget.closest(".report-item");
        const reportTitle =
          reportItem.querySelector(".report-title").textContent;

        if (
          confirm(
            `Are you sure you want to delete "${reportTitle}"? This action cannot be undone.`,
          )
        ) {
          this.deleteReportById(reportId);
        }
      });
    });
  }

  /**
   * View a specific report
   */
  async viewReport(reportId) {
    try {
      if (this.wsManager && this.wsManager.isConnected()) {
        this.wsManager.send("get_timelapse_report", { id: reportId });
      } else {
        const response = await fetch(`/api/timelapse/reports/${reportId}`);
        const data = await response.json();
        this.handleReportResponse(data);
      }
    } catch (error) {
      console.error("Failed to load report:", error);
      this.showError("Failed to load report details");
    }
  }

  /**
   * Handle individual report response
   */
  handleReportResponse(data) {
    if (data.report) {
      this.currentReport = data.report;
      this.showReportDetails(data.report);
    }
  }

  /**
   * Show report details view
   */
  showReportDetails(report) {
    const listSection = document.getElementById("reports-list-section");
    const detailsSection = document.getElementById("report-details-section");
    const titleElement = document.getElementById("report-title");
    const contentElement = document.getElementById("report-content");

    listSection.style.display = "none";
    detailsSection.style.display = "block";
    titleElement.textContent = report.title;

    contentElement.innerHTML = `
      <div class="report-overview">
        <div class="overview-stats">
          <div class="stat-card">
            <div class="stat-icon">📷</div>
            <div class="stat-content">
              <div class="stat-number">${report.results.imagesSuccessful}</div>
              <div class="stat-label">Successful Images</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon">⏱️</div>
            <div class="stat-content">
              <div class="stat-number">${this.formatDuration(report.duration)}</div>
              <div class="stat-label">Duration</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon">📊</div>
            <div class="stat-content">
              <div class="stat-number">${Math.round((report.results.imagesSuccessful / report.results.imagesCaptured) * 100)}%</div>
              <div class="stat-label">Success Rate</div>
            </div>
          </div>
        </div>
      </div>
      
      <div class="report-sections">
        <div class="report-section">
          <h5>Session Information</h5>
          <div class="info-grid">
            <div class="info-item">
              <span class="info-label">Start Time:</span>
              <span class="info-value">${this.formatDateTime(report.startTime)}</span>
            </div>
            <div class="info-item">
              <span class="info-label">End Time:</span>
              <span class="info-value">${this.formatDateTime(report.endTime)}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Interval:</span>
              <span class="info-value">${report.intervalometer?.interval || "-"} seconds</span>
            </div>
            <div class="info-item">
              <span class="info-label">Total Planned:</span>
              <span class="info-value">${report.intervalometer?.numberOfShots || "Unlimited"}</span>
            </div>
          </div>
        </div>
        
        <div class="report-section">
          <h5>Results</h5>
          <div class="info-grid">
            <div class="info-item">
              <span class="info-label">Images Captured:</span>
              <span class="info-value">${report.results.imagesCaptured}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Successful:</span>
              <span class="info-value success">${report.results.imagesSuccessful}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Failed:</span>
              <span class="info-value ${report.results.imagesFailed > 0 ? "error" : "success"}">${report.results.imagesFailed}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Completion:</span>
              <span class="info-value">${report.metadata.completionReason}</span>
            </div>
            ${
              report.results.firstImageName
                ? `
            <div class="info-item">
              <span class="info-label">First Image:</span>
              <span class="info-value copyable" title="Click to copy">${this.escapeHtml(report.results.firstImageName)}</span>
            </div>
            `
                : ""
            }
            ${
              report.results.lastImageName
                ? `
            <div class="info-item">
              <span class="info-label">Last Image:</span>
              <span class="info-value copyable" title="Click to copy">${this.escapeHtml(report.results.lastImageName)}</span>
            </div>
            `
                : ""
            }
          </div>
        </div>
        
        ${
          report.results.errors && report.results.errors.length > 0
            ? `
        <div class="report-section">
          <h5>Errors</h5>
          <div class="errors-list">
            ${report.results.errors
              .map(
                (error) => `
              <div class="error-item">
                <span class="error-time">${this.formatTime(error.timestamp)}</span>
                <span class="error-shot">Shot ${error.shotNumber}</span>
                <span class="error-message">${this.escapeHtml(error.error)}</span>
              </div>
            `,
              )
              .join("")}
          </div>
        </div>
        `
            : ""
        }
        
        <div class="report-section">
          <h5>Metadata</h5>
          <div class="info-grid">
            <div class="info-item">
              <span class="info-label">Saved At:</span>
              <span class="info-value">${this.formatDateTime(report.metadata.savedAt)}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Version:</span>
              <span class="info-value">${report.metadata.version}</span>
            </div>
          </div>
        </div>
      </div>
    `;

    // Add click-to-copy functionality for copyable elements
    setTimeout(() => {
      contentElement.querySelectorAll(".copyable").forEach((element) => {
        element.style.cursor = "pointer";
        element.addEventListener("click", () => {
          const text = element.textContent;
          // Use clipboard helper with fallback for non-secure contexts
          window
            .copyToClipboard(text)
            .then(() => {
              // Show brief visual feedback
              const originalText = element.textContent;
              element.textContent = "✓ Copied!";
              setTimeout(() => {
                element.textContent = originalText;
              }, 1000);
            })
            .catch((err) => {
              console.error("Failed to copy:", err);
            });
        });
      });
    }, 0);
  }

  /**
   * Show reports list view
   */
  showReportsList() {
    const listSection = document.getElementById("reports-list-section");
    const detailsSection = document.getElementById("report-details-section");

    detailsSection.style.display = "none";
    listSection.style.display = "block";
    this.currentReport = null;
  }

  /**
   * Edit report title
   */
  editReportTitle() {
    if (!this.currentReport) return;

    const newTitle = prompt("Enter new title:", this.currentReport.title);
    if (
      newTitle &&
      newTitle.trim() &&
      newTitle.trim() !== this.currentReport.title
    ) {
      this.updateReportTitle(this.currentReport.id, newTitle.trim());
    }
  }

  /**
   * Update report title
   */
  async updateReportTitle(reportId, newTitle) {
    try {
      if (this.wsManager && this.wsManager.isConnected()) {
        this.wsManager.send("update_report_title", {
          reportId,
          title: newTitle,
        });
      } else {
        const response = await fetch(
          `/api/timelapse/reports/${reportId}/title`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: newTitle }),
          },
        );

        if (response.ok) {
          this.currentReport.title = newTitle;
          document.getElementById("report-title").textContent = newTitle;
          this.loadReports(); // Refresh the list
        }
      }
    } catch (error) {
      console.error("Failed to update report title:", error);
      this.showError("Failed to update title");
    }
  }

  /**
   * Delete current report
   */
  deleteReport() {
    if (!this.currentReport) return;

    if (
      confirm(
        `Are you sure you want to delete "${this.currentReport.title}"? This action cannot be undone.`,
      )
    ) {
      this.deleteReportById(this.currentReport.id);
    }
  }

  /**
   * Delete report by ID
   */
  async deleteReportById(reportId) {
    try {
      if (this.wsManager && this.wsManager.isConnected()) {
        // Send delete request via WebSocket
        this.wsManager.send("delete_timelapse_report", { id: reportId });

        // Navigate immediately if we're currently viewing this report
        // The report_deleted event will refresh the list after backend confirms deletion
        if (this.currentReport && this.currentReport.id === reportId) {
          this.showReportsList();
        }
      } else {
        const response = await fetch(`/api/timelapse/reports/${reportId}`, {
          method: "DELETE",
        });

        if (response.ok) {
          this.showReportsList();
          this.loadReports(); // Refresh the list
        }
      }
    } catch (error) {
      console.error("Failed to delete report:", error);
      this.showError("Failed to delete report");
    }
  }

  /**
   * Handle session completed event
   */
  handleSessionCompleted(data) {
    // Only show completion screen if not already visible (prevent duplicates)
    if (!this.isCompletionScreenVisible) {
      this.unsavedSession = data;
      this.showSessionCompletion(data, "completed");
    } else {
      console.log(
        "Completion screen already visible, ignoring duplicate session_completed event",
      );
    }
  }

  /**
   * Handle session stopped event
   */
  handleSessionStopped(data) {
    // Only show completion screen if not already visible (prevent duplicates)
    if (!this.isCompletionScreenVisible) {
      this.unsavedSession = data;
      this.showSessionCompletion(data, "stopped");
    } else {
      console.log(
        "Completion screen already visible, ignoring duplicate session_stopped event",
      );
    }
  }

  /**
   * Handle session error event
   */
  handleSessionError(data) {
    // Only show completion screen if not already visible (prevent duplicates)
    if (!this.isCompletionScreenVisible) {
      this.unsavedSession = data;
      this.showSessionCompletion(data, "error");
    } else {
      console.log(
        "Completion screen already visible, ignoring duplicate session_error event",
      );
    }
  }

  /**
   * Handle unsaved session found
   */
  handleUnsavedSessionFound(sessionData) {
    console.log("Unsaved session found:", sessionData);
    this.unsavedSession = sessionData;
    this.showSessionCompletion(
      sessionData.completionData,
      sessionData.completionData.reason.includes("error")
        ? "error"
        : "completed",
    );
  }

  /**
   * Show session completion screen
   */
  showSessionCompletion(sessionData, type) {
    const completionCard = document.getElementById("session-completion-card");
    const summaryElement = document.getElementById("completion-summary");
    const titleInput = document.getElementById("completion-title-input");

    // Populate summary
    summaryElement.innerHTML = `
      <div class="completion-header">
        <div class="completion-status ${type}">
          <span class="status-icon">${this.getStatusIcon(type)}</span>
          <span class="status-text">${this.formatCompletionStatus(type)}</span>
        </div>
        <h4>${sessionData.title || "Untitled Session"}</h4>
      </div>

      <div class="completion-stats">
        <div class="completion-stat">
          <span class="stat-label">Duration:</span>
          <span class="stat-value">${this.formatDuration(this.calculateDuration(sessionData.stats))}</span>
        </div>
        <div class="completion-stat">
          <span class="stat-label">Images Captured:</span>
          <span class="stat-value">${sessionData.stats?.shotsTaken || 0}</span>
        </div>
        <div class="completion-stat">
          <span class="stat-label">Success Rate:</span>
          <span class="stat-value">${sessionData.stats?.shotsTaken ? Math.round((sessionData.stats.shotsSuccessful / sessionData.stats.shotsTaken) * 100) : 0}%</span>
        </div>
      </div>

      <div class="completion-stats">
        <div class="completion-stat">
          <span class="stat-label">Interval:</span>
          <span class="stat-value">${sessionData.options?.interval || 0}s</span>
        </div>
        <div class="completion-stat">
          <span class="stat-label">Stop Criteria:</span>
          <span class="stat-value">${this.formatStopCriteria(sessionData.options)}</span>
        </div>
      </div>

      <div class="completion-reason">
        <strong>Reason:</strong> ${sessionData.reason || "Unknown"}
      </div>
    `;

    // Set title
    titleInput.value = sessionData.title || "";

    // Show the completion card and hide others
    this.hideAllCards();
    completionCard.style.display = "block";

    // Mark completion screen as visible
    this.isCompletionScreenVisible = true;
    console.log(
      "Completion screen displayed, isCompletionScreenVisible = true",
    );

    // Switch to this card in the menu
    this.switchToCard("session-completion");
  }

  /**
   * Handle completion done - navigate back to intervalometer
   * Note: Report is already auto-saved by backend, so no save action needed
   */
  handleCompletionDone() {
    const titleInput = document.getElementById("completion-title-input");
    const title = titleInput.value.trim();

    // If user edited the title, update it
    if (title && this.unsavedSession?.sessionId) {
      this.updateReportTitle(this.unsavedSession.sessionId, title);
    }

    // Clear unsaved session and navigate to intervalometer
    this.unsavedSession = null;
    this.hideSessionCompletion();

    if (window.CameraUI && window.CameraUI.switchToCard) {
      window.CameraUI.switchToCard("intervalometer");
    } else {
      // Fallback to showing the intervalometer card directly
      document.querySelectorAll(".function-card").forEach((card) => {
        card.style.display = "none";
      });
      const intervalometerCard = document.getElementById("intervalometer-card");
      if (intervalometerCard) {
        intervalometerCard.style.display = "block";
      }
    }
  }

  /**
   * Update report title (if user edited it after auto-save)
   */
  async updateReportTitle(sessionId, title) {
    try {
      if (this.wsManager && this.wsManager.isConnected()) {
        this.wsManager.send("update_report_title", { sessionId, title });
      } else {
        await fetch(`/api/timelapse/reports/${sessionId}/title`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title }),
        });
      }
    } catch (error) {
      console.error("Failed to update report title:", error);
      // Non-critical error - don't show to user
    }
  }

  /**
   * Save session as report (DEPRECATED - kept for backward compatibility)
   */
  async saveSession() {
    const titleInput = document.getElementById("completion-title-input");
    const title = titleInput.value.trim();

    if (!title) {
      Toast.error("Please enter a title for this session.");
      titleInput.focus();
      return;
    }

    try {
      const sessionId = this.unsavedSession?.sessionId;
      if (!sessionId) {
        throw new Error("No session data available");
      }

      if (this.wsManager && this.wsManager.isConnected()) {
        this.wsManager.send("save_session_as_report", { sessionId, title });
      } else {
        const response = await fetch(
          `/api/timelapse/sessions/${sessionId}/save`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title }),
          },
        );

        if (response.ok) {
          this.handleSessionSaved();
        }
      }
    } catch (error) {
      console.error("Failed to save session:", error);
      this.showError("Failed to save session report");
    }
  }

  /**
   * Discard session (DEPRECATED - kept for backward compatibility)
   */
  async discardSession() {
    if (
      !confirm(
        "Are you sure you want to discard this session? This action cannot be undone.",
      )
    ) {
      return;
    }

    try {
      const sessionId = this.unsavedSession?.sessionId;
      if (!sessionId) {
        throw new Error("No session data available");
      }

      if (this.wsManager && this.wsManager.isConnected()) {
        this.wsManager.send("discard_session", { sessionId });
      } else {
        const response = await fetch(
          `/api/timelapse/sessions/${sessionId}/discard`,
          {
            method: "POST",
          },
        );

        if (response.ok) {
          this.handleSessionDiscarded();
        }
      }
    } catch (error) {
      console.error("Failed to discard session:", error);
      this.showError("Failed to discard session");
    }
  }

  /**
   * Handle session saved
   */
  handleSessionSaved() {
    this.unsavedSession = null;
    this.hideSessionCompletion();
    this.loadReports(); // Refresh reports list
    // Navigate to timelapse reports page after saving
    if (window.CameraUI && window.CameraUI.switchToCard) {
      window.CameraUI.switchToCard("timelapse-reports");
    } else {
      // Fallback to showing the timelapse reports card directly
      document.querySelectorAll(".function-card").forEach((card) => {
        card.style.display = "none";
      });
      const reportsCard = document.getElementById("timelapse-reports-card");
      if (reportsCard) {
        reportsCard.style.display = "block";
      }
    }
    this.showSuccess("Session saved successfully");
  }

  /**
   * Handle session discarded
   */
  handleSessionDiscarded() {
    this.unsavedSession = null;
    this.hideSessionCompletion();
    // Return to intervalometer page after discarding
    if (window.CameraUI && window.CameraUI.switchToCard) {
      window.CameraUI.switchToCard("intervalometer");
    } else {
      // Fallback to showing the intervalometer card directly
      document.querySelectorAll(".function-card").forEach((card) => {
        card.style.display = "none";
      });
      const intervalometerCard = document.getElementById("intervalometer-card");
      if (intervalometerCard) {
        intervalometerCard.style.display = "block";
      }
    }
    this.showSuccess("Session discarded");
  }

  /**
   * Hide session completion screen
   */
  hideSessionCompletion() {
    const completionCard = document.getElementById("session-completion-card");
    completionCard.style.display = "none";

    // Mark completion screen as no longer visible
    this.isCompletionScreenVisible = false;
    console.log("Completion screen hidden, isCompletionScreenVisible = false");
  }

  /**
   * Check if completion screen should be shown based on session state
   * Returns true if completion screen is already visible or should be restored
   */
  shouldShowCompletionForSession(sessionState) {
    // If completion screen is already visible, keep it visible
    if (this.isCompletionScreenVisible) {
      console.log("Completion screen already visible, maintaining state");
      return true;
    }

    // If we have an unsaved session, we should show completion screen
    if (this.unsavedSession) {
      console.log("Unsaved session exists, should show completion screen");
      return true;
    }

    // Check if state indicates a completed/stopped session
    if (
      sessionState === "stopped" ||
      sessionState === "completed" ||
      sessionState === "error"
    ) {
      console.log(
        `Session state is ${sessionState}, should check for completion data`,
      );
      return true;
    }

    return false;
  }

  /**
   * Restore completion screen if there's an unsaved session
   * Called when navigating back to intervalometer card
   */
  restoreCompletionScreenIfNeeded() {
    if (this.unsavedSession && !this.isCompletionScreenVisible) {
      console.log(
        "Restoring completion screen for unsaved session:",
        this.unsavedSession,
      );
      // Determine type based on reason
      const type = this.unsavedSession.reason?.toLowerCase().includes("error")
        ? "error"
        : this.unsavedSession.reason?.toLowerCase().includes("stopped")
          ? "stopped"
          : "completed";

      this.showSessionCompletion(this.unsavedSession, type);
      return true;
    }
    return false;
  }

  // Helper methods for UI management
  hideAllCards() {
    document.querySelectorAll(".function-card").forEach((card) => {
      card.style.display = "none";
    });
  }

  switchToCard(cardName) {
    // Remove active class from all menu items
    document.querySelectorAll(".menu-item").forEach((item) => {
      item.classList.remove("active");
    });

    // Add active class to target menu item
    const menuItem = document.querySelector(`[data-card="${cardName}"]`);
    if (menuItem) {
      menuItem.classList.add("active");
    }
  }

  showReportsLoading() {
    const loadingElement = document.getElementById("reports-loading");
    const emptyElement = document.getElementById("reports-empty");
    const listElement = document.getElementById("reports-list");

    loadingElement.style.display = "block";
    emptyElement.style.display = "none";
    listElement.style.display = "none";
  }

  showReportsError(message) {
    const loadingElement = document.getElementById("reports-loading");
    loadingElement.textContent = message;
  }

  showError(message) {
    // Use existing log system if available
    if (window.cameraManager && window.cameraManager.log) {
      window.cameraManager.log(message, "error");
    } else {
      console.error(message);
      Toast.error(message);
    }
  }

  showSuccess(message) {
    // Use existing log system if available
    if (window.cameraManager && window.cameraManager.log) {
      window.cameraManager.log(message, "success");
    } else {
      console.log(message);
    }
  }

  // Utility methods
  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  formatDate(dateString) {
    return new Date(dateString).toLocaleDateString();
  }

  formatDateTime(dateString) {
    return new Date(dateString).toLocaleString();
  }

  formatTime(dateString) {
    return new Date(dateString).toLocaleTimeString();
  }

  /**
   * Calculate duration in milliseconds from stats
   */
  calculateDuration(stats) {
    if (!stats?.startTime || !stats?.endTime) {
      return 0;
    }
    const start = new Date(stats.startTime).getTime();
    const end = new Date(stats.endTime).getTime();
    return Math.max(0, end - start);
  }

  /**
   * Format stop criteria from options
   */
  formatStopCriteria(options) {
    if (!options) {
      return "ERROR: No options data";
    }

    if (!options.stopCondition) {
      return "ERROR: Missing stopCondition (legacy session)";
    }

    // Use the stored stopCondition to determine what to display
    switch (options.stopCondition) {
      case "stop-at":
        if (options.stopTime) {
          // Simplified format: Just show time without seconds (e.g., "5:13 PM" instead of "Stop at 5:13:00 PM")
          const stopDate = new Date(options.stopTime);
          return stopDate.toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
          });
        }
        return "ERROR: stop-at selected but no stopTime";

      case "stop-after":
        if (options.totalShots) {
          return `${options.totalShots} shots`;
        }
        return "ERROR: stop-after selected but no totalShots";

      case "unlimited":
        return "Unlimited (manual stop)";

      default:
        return `ERROR: Unknown stopCondition: ${options.stopCondition}`;
    }
  }

  formatDuration(ms) {
    const seconds = Math.floor(ms / 1000) % 60;
    const minutes = Math.floor(ms / 60000) % 60;
    const hours = Math.floor(ms / 3600000);

    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  }

  getStatusIcon(status) {
    switch (status) {
      case "completed":
        return "✅";
      case "stopped":
        return "⏹️";
      case "error":
        return "❌";
      default:
        return "📋";
    }
  }

  formatStatus(status) {
    return status.charAt(0).toUpperCase() + status.slice(1);
  }

  formatCompletionStatus(type) {
    switch (type) {
      case "completed":
        return "Session Completed";
      case "stopped":
        return "Session Stopped";
      case "error":
        return "Session Error";
      default:
        return "Session Ended";
    }
  }

  /**
   * Download current report as JSON
   */
  downloadReportAsJSON() {
    if (!this.currentReport) {
      this.showError("No report loaded");
      return;
    }

    try {
      // Create a formatted JSON string
      const jsonStr = JSON.stringify(this.currentReport, null, 2);

      // Create a blob and download link
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);

      // Generate filename with timestamp
      const timestamp = new Date(this.currentReport.startTime)
        .toISOString()
        .replace(/[:.]/g, "-")
        .slice(0, -5);
      const filename = `timelapse-report-${timestamp}.json`;

      // Create download link and click it
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      // Clean up the URL
      URL.revokeObjectURL(url);

      this.showSuccess("Report downloaded as JSON");
    } catch (error) {
      console.error("Failed to download JSON:", error);
      this.showError("Failed to download report");
    }
  }

  /**
   * Download current report as Markdown
   */
  async downloadReportAsMarkdown() {
    if (!this.currentReport) {
      this.showError("No report loaded");
      return;
    }

    try {
      // Generate Markdown content
      const markdown = this.generateMarkdownReport(this.currentReport);

      // Create a blob and download link
      const blob = new Blob([markdown], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);

      // Generate filename with timestamp
      const timestamp = new Date(this.currentReport.startTime)
        .toISOString()
        .replace(/[:.]/g, "-")
        .slice(0, -5);
      const filename = `timelapse-report-${timestamp}.md`;

      // Create download link and click it
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      // Clean up the URL
      URL.revokeObjectURL(url);

      this.showSuccess("Report downloaded as Markdown");
    } catch (error) {
      console.error("Failed to download Markdown:", error);
      this.showError("Failed to download report");
    }
  }

  /**
   * Generate Markdown report from report data
   */
  generateMarkdownReport(report) {
    const successRate = Math.round(
      (report.results.imagesSuccessful / report.results.imagesCaptured) * 100,
    );

    let markdown = `# ${report.title}\n\n`;
    markdown += `**Generated**: ${new Date().toLocaleString()}\n\n`;

    markdown += `## Summary\n\n`;
    markdown += `- **Status**: ${this.formatStatus(report.status)}\n`;
    markdown += `- **Start Time**: ${this.formatDateTime(report.startTime)}\n`;
    markdown += `- **End Time**: ${this.formatDateTime(report.endTime)}\n`;
    markdown += `- **Duration**: ${this.formatDuration(report.duration)}\n`;
    markdown += `- **Success Rate**: ${successRate}%\n\n`;

    markdown += `## Session Settings\n\n`;
    markdown += `- **Interval**: ${report.intervalometer?.interval || "Unknown"} seconds\n`;
    markdown += `- **Total Planned**: ${report.intervalometer?.numberOfShots || "Unlimited"}\n`;
    if (report.intervalometer?.stopAt) {
      markdown += `- **Stop Time**: ${report.intervalometer.stopAt}\n`;
    }
    if (report.intervalometer?.stopCondition) {
      markdown += `- **Stop Condition**: ${report.intervalometer.stopCondition}\n`;
    }
    markdown += `\n`;

    markdown += `## Results\n\n`;
    markdown += `- **Images Captured**: ${report.results.imagesCaptured}\n`;
    markdown += `- **Successful Images**: ${report.results.imagesSuccessful}\n`;
    markdown += `- **Failed Images**: ${report.results.imagesFailed}\n`;
    markdown += `- **Completion Reason**: ${report.metadata.completionReason}\n\n`;

    if (report.results.errors && report.results.errors.length > 0) {
      markdown += `## Errors\n\n`;
      markdown += `| Time | Shot # | Error |\n`;
      markdown += `|------|--------|-------|\n`;
      report.results.errors.forEach((error) => {
        const time = this.formatTime(error.timestamp);
        const shot = error.shotNumber;
        const message = error.error.replace(/\|/g, "\\|"); // Escape pipes in error messages
        markdown += `| ${time} | ${shot} | ${message} |\n`;
      });
      markdown += `\n`;
    }

    if (report.cameraInfo) {
      markdown += `## Camera Information\n\n`;
      markdown += `- **Model**: ${report.cameraInfo.productname || report.metadata?.cameraModel || "Unknown"}\n`;
      if (report.cameraInfo.serialnumber) {
        markdown += `- **Serial Number**: ${report.cameraInfo.serialnumber}\n`;
      }
      if (report.cameraInfo.firmwareversion) {
        markdown += `- **Firmware**: ${report.cameraInfo.firmwareversion}\n`;
      }
      markdown += `\n`;
    }

    // Add camera settings table if available
    if (
      report.cameraSettings &&
      Object.keys(report.cameraSettings).length > 0
    ) {
      markdown += `## Camera Settings\n\n`;
      markdown += `<table>\n`;
      markdown += `<tr><th>Setting</th><th>Value</th></tr>\n`;

      Object.entries(report.cameraSettings).forEach(([key, setting]) => {
        // Skip the 'values' array if present
        if (key === "values" && Array.isArray(setting)) {
          return;
        }

        // Get the display name (key)
        const name = key
          .replace(/_/g, " ")
          .replace(/\b\w/g, (l) => l.toUpperCase());

        // Format the value based on type
        let value = "";
        if (setting && typeof setting === "object") {
          if ("value" in setting) {
            // If it has a 'value' property, use that
            value = this.formatSettingValueForHTML(setting.value);
          } else {
            // Otherwise format the object
            value = this.formatSettingValueForHTML(setting);
          }
        } else {
          value = this.formatSettingValueForHTML(setting);
        }

        markdown += `<tr><td>${name}</td><td>${value}</td></tr>\n`;
      });
      markdown += `</table>\n\n`;
    }

    markdown += `## Metadata\n\n`;
    markdown += `- **Report ID**: ${report.id}\n`;
    markdown += `- **Session ID**: ${report.sessionId}\n`;
    markdown += `- **Saved At**: ${this.formatDateTime(report.metadata.savedAt)}\n`;
    markdown += `- **Version**: ${report.metadata.version}\n`;

    return markdown;
  }

  /**
   * Format camera setting value for markdown
   */
  formatSettingValue(value) {
    if (value === null || value === undefined) {
      return "`N/A`";
    }

    if (typeof value === "object") {
      // Check if it's a simple key-value object
      const keys = Object.keys(value);

      // Skip arrays named 'values'
      if (Array.isArray(value)) {
        const jsonStr = JSON.stringify(value);
        // If it's short, keep it on one line with backticks
        if (jsonStr.length < 50) {
          return "`" + jsonStr + "`";
        }
        // Otherwise format it nicely
        const formatted = JSON.stringify(value, null, 2);
        // Escape underscores and format with line breaks
        return this.escapeForMarkdownTable(formatted).replace(/\n/g, "<br>");
      }

      // For simple objects with just a few properties, format nicely
      if (keys.length <= 5 && keys.every((k) => typeof value[k] !== "object")) {
        // Single line for simple objects, wrapped in backticks
        const formatted = keys.map((k) => `${k}: ${value[k]}`).join(", ");
        return "`" + formatted + "`";
      }

      // For complex objects, format as readable JSON with line breaks
      const jsonStr = JSON.stringify(value, null, 2);
      // Escape underscores and use <br> for line breaks, preserve spaces
      return this.escapeForMarkdownTable(jsonStr)
        .replace(/\n/g, "<br>")
        .replace(/ /g, "&nbsp;");
    }

    // Wrap single values in backticks
    return "`" + String(value) + "`";
  }

  /**
   * Format camera setting value for HTML table
   */
  formatSettingValueForHTML(value) {
    if (value === null || value === undefined) {
      return "<code>N/A</code>";
    }

    if (typeof value === "object") {
      // Check if it's a simple key-value object
      const keys = Object.keys(value);

      // Skip arrays named 'values'
      if (Array.isArray(value)) {
        const jsonStr = JSON.stringify(value);
        // If it's short, keep it on one line
        if (jsonStr.length < 50) {
          return "<code>" + this.escapeHTML(jsonStr) + "</code>";
        }
        // Otherwise format it nicely with proper line breaks
        const formatted = JSON.stringify(value, null, 2);
        return "<pre><code>" + this.escapeHTML(formatted) + "</code></pre>";
      }

      // For simple objects with just a few properties, format nicely
      if (keys.length <= 5 && keys.every((k) => typeof value[k] !== "object")) {
        // Multi-line for simple objects using <br>
        const formatted = keys
          .map((k) => this.escapeHTML(`${k}: ${value[k]}`))
          .join("<br>");
        return "<code>" + formatted + "</code>";
      }

      // For complex objects, format as readable JSON with proper code block
      const jsonStr = JSON.stringify(value, null, 2);
      return "<pre><code>" + this.escapeHTML(jsonStr) + "</code></pre>";
    }

    // Wrap single values in code tags
    return "<code>" + this.escapeHTML(String(value)) + "</code>";
  }

  /**
   * Escape HTML special characters
   */
  escapeHTML(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * Escape special characters for markdown table cells
   */
  escapeForMarkdownTable(str) {
    // Escape underscores to prevent italic formatting
    // Escape pipes to prevent table issues
    return str.replace(/_/g, "\\_").replace(/\|/g, "\\|");
  }
}

// Export for use in main app
window.TimelapseUI = TimelapseUI;
