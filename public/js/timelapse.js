/**
 * Timelapse Reports UI Manager
 * Handles the user interface for timelapse report management and session completion
 */
class TimelapseUI {
  constructor(wsManager) {
    this.wsManager = wsManager;
    this.currentReport = null;
    this.unsavedSession = null;
    
    this.initialize();
  }

  initialize() {
    console.log('Initializing Timelapse UI...');
    
    // Bind event handlers
    this.setupEventHandlers();
    
    // Load initial data
    this.loadReports();
    this.checkForUnsavedSession();
    
    console.log('Timelapse UI initialized');
  }

  setupEventHandlers() {
    // Reports list handlers
    document.getElementById('refresh-reports-btn').addEventListener('click', () => {
      this.loadReports();
    });

    document.getElementById('back-to-reports-btn').addEventListener('click', () => {
      this.showReportsList();
    });

    // Report actions
    document.getElementById('edit-report-title-btn').addEventListener('click', () => {
      this.editReportTitle();
    });

    document.getElementById('delete-report-btn').addEventListener('click', () => {
      this.deleteReport();
    });

    // Session completion handlers
    document.getElementById('save-session-btn').addEventListener('click', () => {
      this.saveSession();
    });

    document.getElementById('discard-session-btn').addEventListener('click', () => {
      this.discardSession();
    });

    // WebSocket event handlers
    if (this.wsManager) {
      this.wsManager.on('timelapse_reports_response', (data) => {
        this.handleReportsResponse(data);
      });

      this.wsManager.on('timelapse_report_response', (data) => {
        this.handleReportResponse(data);
      });

      this.wsManager.on('session_completed', (data) => {
        this.handleSessionCompleted(data);
      });

      this.wsManager.on('session_stopped', (data) => {
        this.handleSessionStopped(data);
      });

      this.wsManager.on('session_error', (data) => {
        this.handleSessionError(data);
      });

      this.wsManager.on('unsaved_session_found', (data) => {
        this.handleUnsavedSessionFound(data);
      });
    }
  }

  /**
   * Load all saved reports
   */
  async loadReports() {
    try {
      this.showReportsLoading();
      
      if (this.wsManager && this.wsManager.isConnected()) {
        // Use WebSocket if available
        this.wsManager.send('get_timelapse_reports', {});
      } else {
        // Fallback to REST API
        const response = await fetch('/api/timelapse/reports');
        const data = await response.json();
        this.handleReportsResponse(data);
      }
    } catch (error) {
      console.error('Failed to load reports:', error);
      this.showReportsError('Failed to load reports');
    }
  }

  /**
   * Check for unsaved session from previous run
   */
  async checkForUnsavedSession() {
    try {
      if (this.wsManager && this.wsManager.isConnected()) {
        // Use WebSocket if available
        this.wsManager.send('get_unsaved_session', {});
      } else {
        // Fallback to REST API
        const response = await fetch('/api/timelapse/unsaved-session');
        const data = await response.json();
        if (data.unsavedSession) {
          this.handleUnsavedSessionFound(data.unsavedSession);
        }
      }
    } catch (error) {
      console.error('Failed to check for unsaved session:', error);
    }
  }

  /**
   * Handle reports response from API
   */
  handleReportsResponse(data) {
    const reportsContainer = document.getElementById('reports-container');
    const loadingElement = document.getElementById('reports-loading');
    const emptyElement = document.getElementById('reports-empty');
    const listElement = document.getElementById('reports-list');

    loadingElement.style.display = 'none';

    if (data.reports && data.reports.length > 0) {
      emptyElement.style.display = 'none';
      listElement.style.display = 'block';
      this.renderReportsList(data.reports);
    } else {
      emptyElement.style.display = 'block';
      listElement.style.display = 'none';
    }
  }

  /**
   * Render the reports list
   */
  renderReportsList(reports) {
    const listElement = document.getElementById('reports-list');
    
    listElement.innerHTML = reports.map(report => `
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
        </div>
      </div>
    `).join('');

    // Add click handlers for view buttons
    listElement.querySelectorAll('.view-report-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const reportId = e.currentTarget.dataset.reportId;
        this.viewReport(reportId);
      });
    });
  }

  /**
   * View a specific report
   */
  async viewReport(reportId) {
    try {
      if (this.wsManager && this.wsManager.isConnected()) {
        this.wsManager.send('get_timelapse_report', { reportId });
      } else {
        const response = await fetch(`/api/timelapse/reports/${reportId}`);
        const data = await response.json();
        this.handleReportResponse(data);
      }
    } catch (error) {
      console.error('Failed to load report:', error);
      this.showError('Failed to load report details');
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
    const listSection = document.getElementById('reports-list-section');
    const detailsSection = document.getElementById('report-details-section');
    const titleElement = document.getElementById('report-title');
    const contentElement = document.getElementById('report-content');

    listSection.style.display = 'none';
    detailsSection.style.display = 'block';
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
              <span class="info-value">${report.settings.interval} seconds</span>
            </div>
            <div class="info-item">
              <span class="info-label">Total Planned:</span>
              <span class="info-value">${report.settings.totalShots || 'Unlimited'}</span>
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
              <span class="info-value ${report.results.imagesFailed > 0 ? 'error' : 'success'}">${report.results.imagesFailed}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Completion:</span>
              <span class="info-value">${report.metadata.completionReason}</span>
            </div>
          </div>
        </div>
        
        ${report.results.errors && report.results.errors.length > 0 ? `
        <div class="report-section">
          <h5>Errors</h5>
          <div class="errors-list">
            ${report.results.errors.map(error => `
              <div class="error-item">
                <span class="error-time">${this.formatTime(error.timestamp)}</span>
                <span class="error-shot">Shot ${error.shotNumber}</span>
                <span class="error-message">${this.escapeHtml(error.error)}</span>
              </div>
            `).join('')}
          </div>
        </div>
        ` : ''}
        
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
  }

  /**
   * Show reports list view
   */
  showReportsList() {
    const listSection = document.getElementById('reports-list-section');
    const detailsSection = document.getElementById('report-details-section');

    detailsSection.style.display = 'none';
    listSection.style.display = 'block';
    this.currentReport = null;
  }

  /**
   * Edit report title
   */
  editReportTitle() {
    if (!this.currentReport) return;

    const newTitle = prompt('Enter new title:', this.currentReport.title);
    if (newTitle && newTitle.trim() && newTitle.trim() !== this.currentReport.title) {
      this.updateReportTitle(this.currentReport.id, newTitle.trim());
    }
  }

  /**
   * Update report title
   */
  async updateReportTitle(reportId, newTitle) {
    try {
      if (this.wsManager && this.wsManager.isConnected()) {
        this.wsManager.send('update_report_title', { reportId, title: newTitle });
      } else {
        const response = await fetch(`/api/timelapse/reports/${reportId}/title`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: newTitle })
        });
        
        if (response.ok) {
          this.currentReport.title = newTitle;
          document.getElementById('report-title').textContent = newTitle;
          this.loadReports(); // Refresh the list
        }
      }
    } catch (error) {
      console.error('Failed to update report title:', error);
      this.showError('Failed to update title');
    }
  }

  /**
   * Delete current report
   */
  deleteReport() {
    if (!this.currentReport) return;

    if (confirm(`Are you sure you want to delete "${this.currentReport.title}"? This action cannot be undone.`)) {
      this.deleteReportById(this.currentReport.id);
    }
  }

  /**
   * Delete report by ID
   */
  async deleteReportById(reportId) {
    try {
      if (this.wsManager && this.wsManager.isConnected()) {
        this.wsManager.send('delete_timelapse_report', { reportId });
      } else {
        const response = await fetch(`/api/timelapse/reports/${reportId}`, {
          method: 'DELETE'
        });
        
        if (response.ok) {
          this.showReportsList();
          this.loadReports(); // Refresh the list
        }
      }
    } catch (error) {
      console.error('Failed to delete report:', error);
      this.showError('Failed to delete report');
    }
  }

  /**
   * Handle session completed event
   */
  handleSessionCompleted(data) {
    this.showSessionCompletion(data, 'completed');
  }

  /**
   * Handle session stopped event
   */
  handleSessionStopped(data) {
    this.showSessionCompletion(data, 'stopped');
  }

  /**
   * Handle session error event
   */
  handleSessionError(data) {
    this.showSessionCompletion(data, 'error');
  }

  /**
   * Handle unsaved session found
   */
  handleUnsavedSessionFound(sessionData) {
    console.log('Unsaved session found:', sessionData);
    this.unsavedSession = sessionData;
    this.showSessionCompletion(sessionData.completionData, sessionData.completionData.reason.includes('error') ? 'error' : 'completed');
  }

  /**
   * Show session completion screen
   */
  showSessionCompletion(sessionData, type) {
    const completionCard = document.getElementById('session-completion-card');
    const summaryElement = document.getElementById('completion-summary');
    const titleInput = document.getElementById('completion-title-input');

    // Populate summary
    summaryElement.innerHTML = `
      <div class="completion-header">
        <div class="completion-status ${type}">
          <span class="status-icon">${this.getStatusIcon(type)}</span>
          <span class="status-text">${this.formatCompletionStatus(type)}</span>
        </div>
        <h4>${sessionData.title || 'Untitled Session'}</h4>
      </div>
      
      <div class="completion-stats">
        <div class="completion-stat">
          <span class="stat-label">Duration:</span>
          <span class="stat-value">${this.formatDuration(sessionData.stats?.endTime - sessionData.stats?.startTime || 0)}</span>
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
      
      <div class="completion-reason">
        <strong>Reason:</strong> ${sessionData.reason || 'Unknown'}
      </div>
    `;

    // Set title
    titleInput.value = sessionData.title || '';

    // Show the completion card and hide others
    this.hideAllCards();
    completionCard.style.display = 'block';
    
    // Switch to this card in the menu
    this.switchToCard('session-completion');
  }

  /**
   * Save session as report
   */
  async saveSession() {
    const titleInput = document.getElementById('completion-title-input');
    const title = titleInput.value.trim();

    if (!title) {
      alert('Please enter a title for this session.');
      titleInput.focus();
      return;
    }

    try {
      const sessionId = this.unsavedSession?.sessionId;
      if (!sessionId) {
        throw new Error('No session data available');
      }

      if (this.wsManager && this.wsManager.isConnected()) {
        this.wsManager.send('save_session_as_report', { sessionId, title });
      } else {
        const response = await fetch(`/api/timelapse/sessions/${sessionId}/save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title })
        });
        
        if (response.ok) {
          this.handleSessionSaved();
        }
      }
    } catch (error) {
      console.error('Failed to save session:', error);
      this.showError('Failed to save session report');
    }
  }

  /**
   * Discard session
   */
  async discardSession() {
    if (!confirm('Are you sure you want to discard this session? This action cannot be undone.')) {
      return;
    }

    try {
      const sessionId = this.unsavedSession?.sessionId;
      if (!sessionId) {
        throw new Error('No session data available');
      }

      if (this.wsManager && this.wsManager.isConnected()) {
        this.wsManager.send('discard_session', { sessionId });
      } else {
        const response = await fetch(`/api/timelapse/sessions/${sessionId}/discard`, {
          method: 'POST'
        });
        
        if (response.ok) {
          this.handleSessionDiscarded();
        }
      }
    } catch (error) {
      console.error('Failed to discard session:', error);
      this.showError('Failed to discard session');
    }
  }

  /**
   * Handle session saved
   */
  handleSessionSaved() {
    this.unsavedSession = null;
    this.hideSessionCompletion();
    this.loadReports(); // Refresh reports list
    this.switchToCard('timelapse-reports');
    this.showSuccess('Session saved successfully');
  }

  /**
   * Handle session discarded
   */
  handleSessionDiscarded() {
    this.unsavedSession = null;
    this.hideSessionCompletion();
    this.switchToCard('controller-status');
    this.showSuccess('Session discarded');
  }

  /**
   * Hide session completion screen
   */
  hideSessionCompletion() {
    const completionCard = document.getElementById('session-completion-card');
    completionCard.style.display = 'none';
  }

  // Helper methods for UI management
  hideAllCards() {
    document.querySelectorAll('.function-card').forEach(card => {
      card.style.display = 'none';
    });
  }

  switchToCard(cardName) {
    // Remove active class from all menu items
    document.querySelectorAll('.menu-item').forEach(item => {
      item.classList.remove('active');
    });

    // Add active class to target menu item
    const menuItem = document.querySelector(`[data-card="${cardName}"]`);
    if (menuItem) {
      menuItem.classList.add('active');
    }
  }

  showReportsLoading() {
    const loadingElement = document.getElementById('reports-loading');
    const emptyElement = document.getElementById('reports-empty');
    const listElement = document.getElementById('reports-list');

    loadingElement.style.display = 'block';
    emptyElement.style.display = 'none';
    listElement.style.display = 'none';
  }

  showReportsError(message) {
    const loadingElement = document.getElementById('reports-loading');
    loadingElement.textContent = message;
  }

  showError(message) {
    // Use existing log system if available
    if (window.cameraManager && window.cameraManager.log) {
      window.cameraManager.log(message, 'error');
    } else {
      console.error(message);
      alert(message);
    }
  }

  showSuccess(message) {
    // Use existing log system if available
    if (window.cameraManager && window.cameraManager.log) {
      window.cameraManager.log(message, 'success');
    } else {
      console.log(message);
    }
  }

  // Utility methods
  escapeHtml(text) {
    const div = document.createElement('div');
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
      case 'completed': return '✅';
      case 'stopped': return '⏹️';
      case 'error': return '❌';
      default: return '📋';
    }
  }

  formatStatus(status) {
    return status.charAt(0).toUpperCase() + status.slice(1);
  }

  formatCompletionStatus(type) {
    switch (type) {
      case 'completed': return 'Session Completed';
      case 'stopped': return 'Session Stopped';
      case 'error': return 'Session Error';
      default: return 'Session Ended';
    }
  }
}

// Export for use in main app
window.TimelapseUI = TimelapseUI;