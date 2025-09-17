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
    const getTimeBtn = document.getElementById('get-time-btn');
    const syncTimeBtn = document.getElementById('sync-time-btn');
    
    if (getTimeBtn) {
      getTimeBtn.addEventListener('click', () => {
        this.getCurrentTime();
      });
    }
    
    if (syncTimeBtn) {
      syncTimeBtn.addEventListener('click', () => {
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
    const clientTimeElement = document.getElementById('client-current-time');
    if (clientTimeElement) {
      const now = new Date();
      const clientTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      clientTimeElement.textContent = now.toLocaleString('en-US', {
        timeZone: clientTimezone,
        timeZoneName: 'short'
      });
    }
  }

  async getCurrentTime() {
    try {
      // Use UIStateManager for consistent state handling
      window.uiStateManager.setInProgress('get-time-btn', {
        progressText: 'Getting Time...',
        timeout: 15000
      });

      const response = await fetch('/api/system/time');
      const data = await response.json();

      if (response.ok) {
        const piTimeElement = document.getElementById('pi-current-time');
        const timeDifferenceElement = document.getElementById('time-difference');

        if (piTimeElement) {
          // Always display Pi time in the client's local timezone for consistency
          const piTime = new Date(data.currentTime);
          const clientTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
          piTimeElement.textContent = piTime.toLocaleString('en-US', {
            timeZone: clientTimezone,
            timeZoneName: 'short'
          });
        }

        // Calculate time difference in UTC to avoid timezone confusion
        const piTime = new Date(data.currentTime);
        const clientTime = new Date();
        this.timeDifference = clientTime.getTime() - piTime.getTime();

        if (timeDifferenceElement) {
          if (Math.abs(this.timeDifference) < 1000) {
            timeDifferenceElement.textContent = 'In sync (< 1 second)';
            timeDifferenceElement.style.color = 'var(--accent-success)';
          } else {
            const diffSeconds = Math.round(this.timeDifference / 1000);
            const absSeconds = Math.abs(diffSeconds);
            const direction = diffSeconds > 0 ? 'ahead' : 'behind';

            let timeText;
            if (absSeconds < 60) {
              timeText = `${absSeconds} second${absSeconds !== 1 ? 's' : ''}`;
            } else if (absSeconds < 3600) {
              const minutes = Math.round(absSeconds / 60);
              timeText = `${minutes} minute${minutes !== 1 ? 's' : ''}`;
            } else {
              const hours = Math.round(absSeconds / 3600);
              timeText = `${hours} hour${hours !== 1 ? 's' : ''}`;
            }

            timeDifferenceElement.textContent = `Client ${timeText} ${direction}`;
            timeDifferenceElement.style.color = absSeconds > 300 ? 'var(--accent-danger)' : 'var(--accent-warning)';
          }
        }

        // Display timezone information
        const piTimezoneElement = document.getElementById('pi-timezone');
        if (piTimezoneElement) {
          piTimezoneElement.textContent = `Pi timezone: ${data.timezone || 'Unknown'}`;
        }

        this.log('Time information retrieved successfully', 'success');
      } else {
        throw new Error(data.error || 'Failed to get time information');
      }
    } catch (error) {
      console.error('Failed to get time:', error);
      this.log(`Failed to get time: ${error.message}`, 'error');
    } finally {
      window.uiStateManager.restore('get-time-btn');
    }
  }

  async syncTimeToServer() {
    try {
      // Use UIStateManager for consistent state handling
      window.uiStateManager.setInProgress('sync-time-btn', {
        progressText: 'Syncing...',
        timeout: 20000  // Time sync can take longer
      });

      const clientTime = new Date();
      const clientTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

      this.log(`Syncing time and timezone to Pi...`, 'info');
      this.log(`Client time: ${clientTime.toLocaleString('en-US', { timeZone: clientTimezone, timeZoneName: 'short' })}`, 'info');

      const response = await fetch('/api/system/time', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          timestamp: clientTime.toISOString(),
          timezone: clientTimezone
        })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        this.log('Time synchronized successfully to Pi', 'success');

        // Log timezone sync result
        if (data.timezoneSync) {
          if (data.timezoneSync.success) {
            this.log(`Timezone synchronized to: ${data.timezoneSync.timezone}`, 'success');
          } else {
            this.log(`Timezone sync failed: ${data.timezoneSync.error}`, 'warning');
          }
        }

        // Refresh the time display after sync
        setTimeout(() => {
          this.getCurrentTime();
        }, 1000);
      } else {
        throw new Error(data.error || 'Failed to synchronize time');
      }
    } catch (error) {
      console.error('Failed to sync time:', error);
      this.log(`Failed to sync time: ${error.message}`, 'error');
    } finally {
      window.uiStateManager.restore('sync-time-btn');
    }
  }

  log(message, type = 'info') {
    // Use the existing camera log system if available
    if (window.cameraManager && window.cameraManager.log) {
      window.cameraManager.log(message, type);
    } else {
      console.log(`[Utilities] ${message}`);
    }
  }

  cleanup() {
    this.stopTimeUpdates();
  }
}

// Initialize the utilities manager when the page loads
document.addEventListener('DOMContentLoaded', () => {
  window.utilitiesManager = new UtilitiesManager();
});