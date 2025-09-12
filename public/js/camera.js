class CameraManager {
  constructor() {
    this.status = {
      connected: false,
      ip: null,
      settings: null,
      lastUpdate: null
    };
    this.intervalometerState = {
      running: false,
      paused: false,
      stats: null,
      options: null
    };
    this.statusUpdateInterval = null;
  }

  async initialize() {
    // Set up button event listeners
    this.setupEventListeners();
    
    // Set up WebSocket event listeners
    this.setupWebSocketListeners();
    
    // Initialize card system
    this.initializeCardSystem();
    
    // Initial status check via REST API (fallback if WebSocket fails)
    await this.updateCameraStatus();
    
    // Get intervalometer status immediately on startup
    await this.refreshIntervalometerStatus();
  }

  initializeCardSystem() {
    // Show default card (Controller Status)
    this.switchToCard('controller-status');
    
    // Initialize menu states
    this.updateMenuItemStates();
  }

  setupEventListeners() {
    // Camera control buttons
    document.getElementById('take-photo-btn').addEventListener('click', () => {
      this.takePhoto();
    });

    document.getElementById('get-settings-btn').addEventListener('click', () => {
      this.getCameraSettings();
    });

    document.getElementById('update-camera-config-btn').addEventListener('click', () => {
      this.updateCameraConfiguration();
    });

    // Intervalometer controls
    document.getElementById('validate-interval-btn').addEventListener('click', () => {
      this.validateInterval();
    });

    document.getElementById('start-intervalometer-btn').addEventListener('click', () => {
      this.startIntervalometer();
    });

    document.getElementById('stop-intervalometer-btn').addEventListener('click', () => {
      this.stopIntervalometer();
    });


    // Connection indicator click (removed from UI, but keeping method for debugging)

    // Manual connect button
    document.getElementById('manual-connect-btn').addEventListener('click', () => {
      this.showManualConnectModal();
    });

    // Manual connect modal event listeners
    document.getElementById('cancel-manual-connect-btn').addEventListener('click', () => {
      this.hideManualConnectModal();
    });

    document.getElementById('confirm-manual-connect-btn').addEventListener('click', () => {
      this.performManualConnect();
    });

    // Close modal when clicking the X
    document.querySelector('#manual-connect-modal .modal-close').addEventListener('click', () => {
      this.hideManualConnectModal();
    });

    // Close modal when clicking outside
    document.getElementById('manual-connect-modal').addEventListener('click', (e) => {
      if (e.target.id === 'manual-connect-modal') {
        this.hideManualConnectModal();
      }
    });

    // Function menu toggle
    const menuToggle = document.getElementById('function-menu-toggle');
    if (menuToggle) {
      menuToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleFunctionMenu();
      });
    } else {
      console.error('Function menu toggle button not found!');
    }

    // Function menu items
    document.querySelectorAll('.menu-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (!item.disabled) {
          this.switchToCard(item.dataset.card);
          this.hideFunctionMenu();
        }
      });
    });

    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.function-menu-container')) {
        this.hideFunctionMenu();
      }
    });

    // Radio button logic for stop conditions
    this.setupStopConditionRadios();
  }

  setupStopConditionRadios() {
    const radios = document.querySelectorAll('input[name="stop-condition"]');
    const shotsInput = document.getElementById('shots-input');
    const timeInput = document.getElementById('stop-time-input');

    radios.forEach(radio => {
      radio.addEventListener('change', () => {
        // Enable/disable inputs based on selection
        shotsInput.disabled = radio.value !== 'shots';
        timeInput.disabled = radio.value !== 'time';
        
        // Clear disabled inputs
        if (shotsInput.disabled) shotsInput.value = '';
        if (timeInput.disabled) timeInput.value = '';
      });
    });

    // Initialize state
    shotsInput.disabled = true;
    timeInput.disabled = true;
  }

  setupWebSocketListeners() {
    // WebSocket connection events
    wsManager.on('connected', () => {
      this.updateConnectionStatus('connected', 'Connected');
      this.enableControls();
      // Update header status indicators when controller connection changes
      this.updateHeaderStatusIndicators(this.status || { connected: false });
    });

    wsManager.on('disconnected', () => {
      this.updateConnectionStatus('disconnected', 'Disconnected');
      this.disableControls();
      // Update header status indicators when controller connection changes
      this.updateHeaderStatusIndicators(this.status || { connected: false });
    });

    wsManager.on('connecting', () => {
      this.updateConnectionStatus('connecting', 'Connecting...');
    });

    wsManager.on('reconnecting', (data) => {
      this.updateConnectionStatus('connecting', `Reconnecting... (${data.attempt})`);
    });

    // Camera events
    wsManager.on('status_update', (data) => {
      this.handleStatusUpdate(data);
    });

    wsManager.on('photo_taken', (data) => {
      this.handlePhotoTaken(data);
    });

    wsManager.on('camera_settings', (data) => {
      this.handleCameraSettings(data);
    });

    wsManager.on('interval_validation', (data) => {
      this.handleIntervalValidation(data);
    });

    wsManager.on('error_response', (data) => {
      this.handleError(data.message);
    });

    // Intervalometer events (API responses)
    wsManager.on('intervalometer_start', (data) => {
      this.log('Intervalometer started successfully', 'success');
      this.updateIntervalometerUI(data.status);
    });

    // Intervalometer broadcast events (for all clients)
    wsManager.on('intervalometer_started', (data) => {
      this.log('Intervalometer started successfully', 'success');
      // Get full status from server
      this.refreshIntervalometerStatus();
    });

    wsManager.on('intervalometer_stopped', (data) => {
      this.log('Intervalometer stopped', 'info');
      this.refreshIntervalometerStatus();
    });

    wsManager.on('intervalometer_completed', (data) => {
      const reason = data.reason || 'Session completed';
      this.log(`Intervalometer completed: ${reason}`, 'success');
      this.refreshIntervalometerStatus();
    });

    wsManager.on('intervalometer_photo', (data) => {
      
      // Create concise activity log message
      let logMessage = `Shot #${data.shotNumber}`;
      if (data.stats && data.stats.shotsTaken && data.stats.shotsFailed > 0) {
        logMessage += ` (${data.stats.shotsFailed} of ${data.stats.shotsTaken} failed)`;
      }
      
      this.log(logMessage, 'success');
      // Don't call updateIntervalometerUI here - let the periodic updates handle it
    });

    wsManager.on('intervalometer_error', (data) => {
      if (data.shotNumber) {
        // Create concise error log message
        let logMessage = `Shot #${data.shotNumber} failed: ${data.error}`;
        if (data.stats && data.stats.shotsTaken && data.stats.shotsFailed > 1) {
          logMessage += ` (${data.stats.shotsFailed} of ${data.stats.shotsTaken} failed)`;
        }
        
        this.log(logMessage, 'error');
      } else {
        this.log(`Intervalometer error: ${data.reason || data.message}`, 'error');
      }
      // Don't call updateIntervalometerUI here - let the periodic updates handle it
    });

    wsManager.on('intervalometer_completed', (data) => {
      // Create detailed completion message
      let logMessage = `Intervalometer completed: ${data.reason}`;
      if (data.stats) {
        const { shotsTaken, shotsSuccessful, shotsFailed } = data.stats;
        const successRate = shotsTaken > 0 ? ((shotsSuccessful / shotsTaken) * 100).toFixed(1) : 100;
        logMessage += ` (${shotsTaken} total shots, ${shotsSuccessful} successful, ${successRate}% success rate)`;
      }
      this.log(logMessage, 'info');
      
      // Stop the periodic updates first
      this.stopIntervalometerStatusUpdates();
      // Then update UI to completed state
      this.updateIntervalometerUI({ state: 'completed', stats: data.stats });
    });

    wsManager.on('intervalometer_stop', (data) => {
      // Create detailed stop message
      let logMessage = 'Intervalometer stopped';
      if (data.status && data.status.stats) {
        const { shotsTaken, shotsSuccessful } = data.status.stats;
        const successRate = shotsTaken > 0 ? ((shotsSuccessful / shotsTaken) * 100).toFixed(1) : 100;
        logMessage += ` (${shotsTaken} shots taken, ${successRate}% success rate)`;
      }
      this.log(logMessage, 'info');
      
      this.updateIntervalometerUI(data.status || { state: 'stopped', ...data });
    });

    // Welcome message
    wsManager.on('welcome', (data) => {
      this.log('Connected to camera control server', 'success');
      this.handleStatusUpdate(data);
    });
  }

  async updateCameraStatus() {
    try {
      console.log('Fetching camera status...');
      const response = await fetch('/api/camera/status');
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const status = await response.json();
      console.log('Camera status received:', status);
      
      this.status.connected = status.connected;
      this.status.ip = status.ip;
      this.status.lastUpdate = new Date().toISOString();
      
      // Update UI immediately
      this.updateCameraStatusDisplay(status);
      this.updateUI();
      
    } catch (error) {
      console.error('Failed to get camera status:', error);
      this.handleError('Failed to connect to server');
      
      // Update UI to show disconnected state
      this.status.connected = false;
      this.updateCameraStatusDisplay({ connected: false, ip: 'Unknown' });
      this.updateUI();
    }
  }

  updateCameraStatusDisplay(status) {
    // Update camera IP
    const ipElement = document.getElementById('camera-ip');
    if (ipElement) {
      ipElement.textContent = status.ip || '-';
    }
    
    // Update camera status indicator
    const statusDot = document.querySelector('.camera-status .status-dot');
    if (statusDot) {
      statusDot.className = `status-dot ${status.connected ? 'connected' : 'disconnected'}`;
    }
    
    // Update camera status text and manual connect button based on connection status
    const statusText = document.getElementById('camera-status-text');
    const manualConnectRow = document.getElementById('manual-connect-row');
    
    if (status.connected) {
      // Connected: hide manual connect button, show connected status
      statusText.textContent = 'Connected';
      manualConnectRow.style.display = 'none';
    } else {
      // Disconnected: show manual connect button with disconnected status
      manualConnectRow.style.display = 'flex';
      statusText.textContent = 'Disconnected';
    }
    
    // Update header status indicators
    this.updateHeaderStatusIndicators(status);
    
    // Update menu item states when camera connection changes
    this.updateMenuItemStates();
    
    // If camera disconnected while on a camera-dependent card, switch to Controller Status
    if (!status.connected || status.reconnectAttempts > 0) {
      const currentCard = this.getCurrentCard();
      if (['test-shot', 'camera-settings', 'intervalometer'].includes(currentCard)) {
        this.switchToCard('controller-status');
      }
    }
    
    // Get camera settings and battery when connected
    if (status.connected && !this.settingsRequested) {
      this.settingsRequested = true;
      setTimeout(() => {
        this.getCameraSettingsForMode();
        this.getCameraBatteryStatus();
      }, 1000);
    } else if (!status.connected) {
      document.getElementById('camera-mode').textContent = '-';
      document.getElementById('camera-battery').textContent = '-';
      this.settingsRequested = false;
    }
    
    console.log('Camera status display updated:', status);
  }

  updateHeaderStatusIndicators(status) {
    // Get all status indicator elements
    const controllerStatus = document.getElementById('controller-status');
    const cameraStatus = document.getElementById('camera-status-header');
    const batteryStatus = document.getElementById('battery-status-header');
    const storageStatus = document.getElementById('storage-status-header');
    const timerStatus = document.getElementById('timer-status-header');
    
    const controllerConnected = wsManager && wsManager.connected;
    const cameraConnected = status.connected && !status.reconnectAttempts;
    const timerRunning = this.intervalometerState && this.intervalometerState.running;
    
    // If controller not connected, hide all status indicators
    if (!controllerConnected) {
      if (controllerStatus) controllerStatus.style.display = 'none';
      if (cameraStatus) cameraStatus.style.display = 'none';
      if (batteryStatus) batteryStatus.style.display = 'none';
      if (storageStatus) storageStatus.style.display = 'none';
      if (timerStatus) timerStatus.style.display = 'none';
      return;
    }
    
    // Controller is connected, show controller
    if (controllerStatus) {
      controllerStatus.style.display = 'flex';
    }
    
    // If camera not connected, only show controller
    if (!cameraConnected) {
      if (cameraStatus) cameraStatus.style.display = 'none';
      if (batteryStatus) batteryStatus.style.display = 'none';
      if (storageStatus) storageStatus.style.display = 'none';
      if (timerStatus) timerStatus.style.display = 'none';
      return;
    }
    
    // Camera is connected, show camera, battery, and storage
    if (cameraStatus) {
      cameraStatus.style.display = 'flex';
    }
    
    if (batteryStatus) {
      batteryStatus.style.display = 'flex';
    }
    
    if (storageStatus) {
      storageStatus.style.display = 'flex';
      const storageLevelHeader = document.getElementById('storage-level-header');
      if (storageLevelHeader) {
        // TODO: Get actual storage info from camera
        storageLevelHeader.textContent = '8GB';
      }
    }
    
    // Only show timer if timelapse is running
    if (timerStatus) {
      if (timerRunning) {
        timerStatus.style.display = 'flex';
      } else {
        timerStatus.style.display = 'none';
      }
    }
  }

  async getCameraSettingsForMode() {
    try {
      const response = await fetch('/api/camera/settings');
      if (response.ok) {
        const settings = await response.json();
        this.updateCameraModeFromSettings(settings);
      }
    } catch (error) {
      console.log('Could not get camera settings for mode display:', error.message);
    }
  }

  updateCameraModeFromSettings(settings) {
    const modeElement = document.getElementById('camera-mode');
    if (settings?.shootingmodedial?.value) {
      modeElement.textContent = settings.shootingmodedial.value.toUpperCase();
    } else if (settings?.mode) {
      modeElement.textContent = settings.mode.toUpperCase();
    } else {
      modeElement.textContent = 'Unknown';
    }
  }

  async getCameraBatteryStatus() {
    try {
      const response = await fetch('/api/camera/battery');
      if (response.ok) {
        const batteryData = await response.json();
        this.updateCameraBatteryDisplay(batteryData);
      }
    } catch (error) {
      console.log('Could not get camera battery status:', error.message);
    }
  }

  updateCameraBatteryDisplay(batteryData) {
    const batteryElement = document.getElementById('camera-battery');
    
    if (batteryData?.batterylist && batteryData.batterylist.length > 0) {
      const battery = batteryData.batterylist[0];
      let displayText = '';
      
      // Show battery level
      if (battery.level) {
        if (typeof battery.level === 'number') {
          displayText = `${battery.level}%`;
        } else {
          // Check if it's a numeric string
          const numericLevel = parseInt(battery.level);
          if (!isNaN(numericLevel)) {
            displayText = `${numericLevel}%`;
          } else {
            // Convert text levels to approximate percentages
            const levelMap = {
              'full': '100%',
              'high': '75%', 
              'medium': '50%',
              'low': '25%',
              'critical': '10%'
            };
            displayText = levelMap[battery.level.toLowerCase()] || battery.level;
          }
        }
      }
      
      // Add quality indicator if available
      if (battery.quality && battery.quality !== 'good') {
        displayText += ` (${battery.quality})`;
      }
      
      // Add battery type if available
      if (battery.name && battery.name !== 'battery') {
        displayText += ` ${battery.name}`;
      }
      
      batteryElement.textContent = displayText || 'Unknown';
      
      // Update header battery level
      const batteryLevelHeader = document.getElementById('battery-level-header');
      if (batteryLevelHeader) {
        // Show compact version in header (just percentage)
        if (typeof battery.level === 'number') {
          batteryLevelHeader.textContent = `${battery.level}%`;
        } else {
          const numericLevel = parseInt(battery.level);
          if (!isNaN(numericLevel)) {
            batteryLevelHeader.textContent = `${numericLevel}%`;
          } else {
            const levelMap = { 'full': '100%', 'high': '75%', 'medium': '50%', 'low': '25%', 'critical': '10%' };
            batteryLevelHeader.textContent = levelMap[battery.level.toLowerCase()] || battery.level;
          }
        }
      }
      
      // Update color based on battery level
      const levelValue = typeof battery.level === 'number' ? battery.level : parseInt(battery.level);
      if (!isNaN(levelValue)) {
        if (levelValue < 20) {
          batteryElement.className = 'text-danger';
        } else if (levelValue < 50) {
          batteryElement.className = 'text-warning';
        } else {
          batteryElement.className = 'text-success';
        }
      } else if (battery.level === 'low' || battery.level === 'critical') {
        batteryElement.className = 'text-danger';
      } else {
        // Default to success for unknown levels
        batteryElement.className = 'text-success';
      }
      
    } else {
      batteryElement.textContent = 'No battery info';
      const batteryLevelHeader = document.getElementById('battery-level-header');
      if (batteryLevelHeader) {
        batteryLevelHeader.textContent = '-';
      }
    }
  }

  async takePhoto() {
    this.log('Taking photo...', 'info');
    this.setButtonLoading('take-photo-btn', true);

    try {
      if (wsManager.connected) {
        wsManager.takePhoto();
      } else {
        const response = await fetch('/api/camera/photo', { method: 'POST' });
        const result = await response.json();
        
        if (result.success) {
          this.handlePhotoTaken(result);
        } else {
          throw new Error(result.error || 'Photo failed');
        }
      }
    } catch (error) {
      this.handleError(`Photo failed: ${error.message}`);
    } finally {
      this.setButtonLoading('take-photo-btn', false);
    }
  }

  async getCameraSettings() {
    this.log('Getting camera settings...', 'info');
    this.setButtonLoading('get-settings-btn', true);

    try {
      if (wsManager.connected) {
        wsManager.getCameraSettings();
      } else {
        const response = await fetch('/api/camera/settings');
        const settings = await response.json();
        
        if (response.ok) {
          this.handleCameraSettings(settings);
        } else {
          throw new Error(settings.error || 'Failed to get settings');
        }
      }
    } catch (error) {
      this.handleError(`Settings failed: ${error.message}`);
    } finally {
      this.setButtonLoading('get-settings-btn', false);
    }
  }

  async updateCameraConfiguration() {
    const ipInput = document.getElementById('camera-ip');
    const portInput = document.getElementById('camera-port');
    
    const ip = ipInput.value.trim();
    const port = portInput.value.trim() || '443';
    
    if (!ip) {
      this.handleError('Please enter a camera IP address');
      return;
    }
    
    // Basic IP validation
    const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    if (!ipRegex.test(ip)) {
      this.handleError('Please enter a valid IP address (e.g., 192.168.1.100)');
      return;
    }
    
    this.log(`Updating camera configuration to ${ip}:${port}...`, 'info');
    this.setButtonLoading('update-camera-config-btn', true);
    
    try {
      const response = await fetch('/api/camera/configure', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ip, port })
      });
      
      const result = await response.json();
      
      if (result.success) {
        this.log(`Camera configuration updated successfully: ${ip}:${port}`, 'success');
        // Clear form validation states
        ipInput.setCustomValidity('');
        portInput.setCustomValidity('');
      } else {
        this.handleError(`Configuration update failed: ${result.error}`);
      }
    } catch (error) {
      this.handleError(`Configuration update failed: ${error.message}`);
    } finally {
      this.setButtonLoading('update-camera-config-btn', false);
    }
  }

  populateCameraConfigForm() {
    // Get current camera status to populate form with current IP
    const ipInput = document.getElementById('camera-ip');
    const portInput = document.getElementById('camera-port');
    
    if (this.status && this.status.ip) {
      ipInput.value = this.status.ip;
    } else {
      ipInput.placeholder = '192.168.12.98';
    }
    
    // Port is typically 443 for Canon cameras
    if (!portInput.value) {
      portInput.value = '443';
    }
  }

  async validateInterval() {
    const interval = parseFloat(document.getElementById('interval-input').value);
    
    if (!interval || interval <= 0) {
      this.handleError('Please enter a valid interval');
      return;
    }

    this.log(`Validating interval: ${interval}s`, 'info');
    this.setButtonLoading('validate-interval-btn', true);

    try {
      if (wsManager.connected) {
        wsManager.validateInterval(interval);
      } else {
        const response = await fetch('/api/camera/validate-interval', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ interval })
        });
        const result = await response.json();
        this.handleIntervalValidation(result);
      }
    } catch (error) {
      this.handleError(`Validation failed: ${error.message}`);
    } finally {
      this.setButtonLoading('validate-interval-btn', false);
    }
  }

  async startIntervalometer() {
    const interval = parseFloat(document.getElementById('interval-input').value);
    const stopCondition = document.querySelector('input[name="stop-condition"]:checked').value;
    const title = document.getElementById('session-title-input').value.trim();
    
    const options = { interval };
    
    // Add title if provided
    if (title) {
      options.title = title;
    }
    let logMessage = `Starting intervalometer: ${interval}s intervals`;
    
    // Handle stop condition based on radio selection
    if (stopCondition === 'shots') {
      const shots = document.getElementById('shots-input').value;
      if (!shots || shots <= 0) {
        this.handleError('Please enter a valid number of shots');
        return;
      }
      options.shots = parseInt(shots);
      logMessage += ` for ${shots} shots`;
    } else if (stopCondition === 'time') {
      const stopTime = document.getElementById('stop-time-input').value;
      if (!stopTime) {
        this.handleError('Please enter a stop time');
        return;
      }
      options.stopTime = stopTime;
      
      // Determine if it's today or tomorrow for display
      const [hours, minutes] = stopTime.split(':').map(Number);
      const now = new Date();
      const stopDate = new Date();
      stopDate.setHours(hours, minutes, 0, 0);
      const isNextDay = stopDate <= now;
      
      logMessage += ` until ${stopTime}${isNextDay ? ' tomorrow' : ''}`;
    } else {
      logMessage += ' (unlimited)';
    }

    this.log(logMessage, 'info');
    this.setButtonLoading('start-intervalometer-btn', true);

    try {
      console.log('WebSocket connected:', wsManager.connected);
      if (wsManager.connected) {
        console.log('Using WebSocket path');
        wsManager.startIntervalometer(options);
      } else {
        console.log('Using REST API path');
        const response = await fetch('/api/intervalometer/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(options)
        });
        const result = await response.json();
        console.log('REST API result:', result);
        
        if (result.success) {
          this.log('Intervalometer started successfully', 'success');
          this.updateIntervalometerUI(result.status);
        } else {
          throw new Error(result.error || 'Failed to start intervalometer');
        }
      }
    } catch (error) {
      this.handleError(`Start failed: ${error.message}`);
    } finally {
      this.setButtonLoading('start-intervalometer-btn', false);
    }
  }

  async stopIntervalometer() {
    // Show confirmation dialog with current session info
    const stats = this.intervalometerState?.stats || {};
    const shotsTaken = stats.shotsTaken || 0;
    const shotsSuccessful = stats.shotsSuccessful || 0;
    const totalShots = this.intervalometerState?.options?.totalShots;
    
    let confirmMessage = 'Are you sure you want to stop the intervalometer?';
    if (shotsTaken > 0) {
      confirmMessage += `\n\nCurrent progress: ${shotsTaken} shots taken`;
      if (shotsSuccessful < shotsTaken) {
        confirmMessage += ` (${shotsSuccessful} successful)`;
      }
      if (totalShots && totalShots > 0) {
        const progress = ((shotsTaken / totalShots) * 100).toFixed(1);
        confirmMessage += ` - ${progress}% complete`;
      }
    }
    
    if (!confirm(confirmMessage)) {
      return; // User cancelled
    }

    this.log('Stopping intervalometer...', 'info');
    this.setButtonLoading('stop-intervalometer-btn', true);

    try {
      if (wsManager.connected) {
        wsManager.stopIntervalometer();
      } else {
        const response = await fetch('/api/intervalometer/stop', { method: 'POST' });
        const result = await response.json();
        if (result.success) {
          this.log('Intervalometer stopped successfully', 'info');
          this.updateIntervalometerUI(result.status);
        } else {
          throw new Error(result.error || 'Failed to stop intervalometer');
        }
      }
    } catch (error) {
      this.handleError(`Stop failed: ${error.message}`);
    } finally {
      this.setButtonLoading('stop-intervalometer-btn', false);
    }
  }

  showManualConnectModal() {
    const modal = document.getElementById('manual-connect-modal');
    const ipInput = document.getElementById('manual-ip-input');
    const portInput = document.getElementById('manual-port-input');
    
    // Clear any previous values
    ipInput.value = '';
    portInput.value = '443';
    
    modal.style.display = 'flex';
    ipInput.focus();
  }

  hideManualConnectModal() {
    const modal = document.getElementById('manual-connect-modal');
    modal.style.display = 'none';
  }

  async performManualConnect() {
    const ipInput = document.getElementById('manual-ip-input');
    const portInput = document.getElementById('manual-port-input');
    const connectBtn = document.getElementById('confirm-manual-connect-btn');
    
    const ip = ipInput.value.trim();
    const port = portInput.value.trim() || '443';
    
    if (!ip) {
      this.handleError('Please enter a camera IP address');
      return;
    }
    
    // Basic IP validation
    const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    if (!ipRegex.test(ip)) {
      this.handleError('Please enter a valid IP address (e.g., 192.168.4.3)');
      return;
    }
    
    this.log(`Connecting to camera at ${ip}:${port}...`, 'info');
    connectBtn.disabled = true;
    connectBtn.textContent = 'Connecting...';
    
    try {
      const response = await fetch('/api/discovery/connect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ip, port })
      });
      
      const result = await response.json();
      
      if (result.success) {
        this.log(`Successfully connected to camera at ${ip}:${port}`, 'success');
        this.hideManualConnectModal();
        // Status will be updated via WebSocket or next status check
      } else {
        this.handleError(`Connection failed: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      this.handleError(`Connection failed: ${error.message}`);
    } finally {
      connectBtn.disabled = false;
      connectBtn.textContent = 'Connect';
    }
  }
  async refreshIntervalometerStatus() {
    try {
      const response = await fetch('/api/intervalometer/status');
      const result = await response.json();
      
      if (result.running && result.state) {
        this.updateIntervalometerUI(result);
      } else {
        // No active session - hide progress UI
        this.updateIntervalometerUI(null);
      }
    } catch (error) {
      console.error('Failed to refresh intervalometer status:', error);
    }
  }

  // WebSocket event handlers
  handleStatusUpdate(data) {
    console.log('Status update received:', data);
    
    // Handle different data structures
    let cameraData = null;
    let powerData = null;
    let networkData = null;
    
    if (data && typeof data === 'object') {
      console.log('Processing status update, data type:', data.type, 'keys:', Object.keys(data));
      
      // Welcome messages and status updates both have camera/power/network properties
      if (data.camera || data.power || data.network) {
        cameraData = data.camera;
        powerData = data.power;
        networkData = data.network;
        console.log('Extracted data:', { cameraData: !!cameraData, powerData: !!powerData, networkData: !!networkData });
      }
      // Or if data IS the camera data directly
      else if (data.connected !== undefined) {
        cameraData = data;
      }
    }
    
    // Update camera status if we have camera data
    if (cameraData) {
      this.status.connected = cameraData.connected;
      this.status.ip = cameraData.ip;
      this.status.lastUpdate = data.timestamp || new Date().toISOString();
      
      this.updateCameraStatusDisplay(cameraData);
    }

    // Update power status if we have power data
    if (powerData) {
      this.updatePowerStatus(powerData);
    }

    // Update network status if we have network data
    if (networkData && window.networkUI) {
      console.log('Calling NetworkUI.updateNetworkStatus with:', networkData);
      window.networkUI.updateNetworkStatus(networkData);
    } else if (networkData) {
      console.log('NetworkData available but NetworkUI not ready, retrying in 1000ms:', networkData);
      // Retry after NetworkUI is initialized
      setTimeout(() => {
        if (window.networkUI) {
          console.log('Retry: Calling NetworkUI.updateNetworkStatus with:', networkData);
          window.networkUI.updateNetworkStatus(networkData);
        } else {
          console.log('Retry failed: NetworkUI still not available');
        }
      }, 1000);
    }

    // Update intervalometer status if we have intervalometer data
    if (data && data.intervalometer) {
      console.log('Updating intervalometer status from welcome/status message:', data.intervalometer);
      console.log('Intervalometer state detected:', data.intervalometer.state);
      this.updateIntervalometerUI(data.intervalometer);
    } else {
      console.log('No intervalometer data in welcome/status message. Data keys:', Object.keys(data || {}));
    }

    this.updateUI();
  }

  handlePhotoTaken(data) {
    if (data.success) {
      this.log('Photo taken successfully', 'success');
    } else {
      this.log('Photo failed', 'error');
    }
  }

  handleCameraSettings(settings) {
    this.status.settings = settings;
    this.log('Camera settings retrieved', 'success');
    this.showSettingsModal(settings);
  }

  handleIntervalValidation(result) {
    if (result.valid) {
      this.log('Interval validation passed', 'success');
    } else {
      this.log(`Interval validation failed: ${result.error}`, 'error');
    }
    
    if (result.warning) {
      this.log(`Warning: ${result.warning}`, 'warning');
    }
  }

  handleError(message) {
    this.log(message, 'error');
  }

  // UI update methods
  updateConnectionStatus(status, text) {
    const indicator = document.getElementById('connection-indicator');
    const statusDot = indicator.querySelector('.status-dot');
    const statusText = indicator.querySelector('.status-text');
    
    statusDot.className = `status-dot ${status}`;
    statusText.textContent = text;
    
    // Update camera status card
    const cameraStatusDot = document.querySelector('.camera-status .status-dot');
    if (cameraStatusDot) {
      cameraStatusDot.className = `status-dot ${status}`;
    }
  }

  updatePowerStatus(powerData) {
    console.log('Power data received:', powerData);
    
    // Update temperature
    const tempElement = document.getElementById('pi-temperature');
    if (powerData?.thermal?.temperature) {
      tempElement.textContent = `${powerData.thermal.temperature.toFixed(1)}°C`;
    } else {
      tempElement.textContent = '-';
    }

    // Update uptime - check multiple possible locations
    const uptimeElement = document.getElementById('pi-uptime');
    let uptime = null;
    
    // Prefer system uptime over process uptime
    if (powerData?.battery?.systemUptime) {
      uptime = powerData.battery.systemUptime;
    } else if (powerData?.battery?.uptime) {
      uptime = powerData.battery.uptime;
    } else if (powerData?.uptime) {
      uptime = powerData.uptime;
    }
    
    if (uptime && typeof uptime === 'number') {
      uptimeElement.textContent = this.formatUptime(uptime);
    } else {
      uptimeElement.textContent = '-';
    }

    // Update power warnings
    const warningsElement = document.getElementById('power-warnings');
    if (powerData?.recommendations?.length > 0) {
      warningsElement.textContent = powerData.recommendations[0];
      warningsElement.className = 'power-warnings text-warning';
    } else {
      warningsElement.textContent = '';
    }
  }

  updateUI() {
    const connected = this.status.connected;
    
    // Enable/disable camera controls based on connection
    if (connected) {
      this.enableControls();
    } else {
      this.disableControls();
    }
    
    // Update camera mode if we have settings
    if (this.status.settings?.shootingmodedial?.value) {
      document.getElementById('camera-mode').textContent = 
        this.status.settings.shootingmodedial.value.toUpperCase();
    }
  }

  enableControls() {
    // Enable individual buttons
    document.getElementById('take-photo-btn').disabled = false;
    document.getElementById('get-settings-btn').disabled = false;
    document.getElementById('validate-interval-btn').disabled = false;
    document.getElementById('start-intervalometer-btn').disabled = false;
    
    // Remove disabled styling from control groups
    const controlGroups = document.querySelectorAll('.controls-section .control-group');
    controlGroups.forEach(group => {
      group.classList.remove('disabled');
    });
  }

  disableControls() {
    // Disable individual buttons
    document.getElementById('take-photo-btn').disabled = true;
    document.getElementById('get-settings-btn').disabled = true;
    document.getElementById('validate-interval-btn').disabled = true;
    document.getElementById('start-intervalometer-btn').disabled = true;
    document.getElementById('stop-intervalometer-btn').disabled = true;
    
    // Add disabled styling to control groups
    const controlGroups = document.querySelectorAll('.controls-section .control-group');
    controlGroups.forEach(group => {
      group.classList.add('disabled');
    });
  }

  setButtonLoading(buttonId, loading) {
    const button = document.getElementById(buttonId);
    const icon = button.querySelector('.btn-icon');
    
    if (loading) {
      button.disabled = true;
      icon.textContent = '⏳';
    } else {
      button.disabled = false;
      // Restore original icon based on button
      const iconMap = {
        'take-photo-btn': '📷',
        'get-settings-btn': '⚙️',
        'validate-interval-btn': '✓',
        'start-intervalometer-btn': '▶️',
        'stop-intervalometer-btn': '⏹️',
        'manual-connect-btn': '🔗'
      };
      icon.textContent = iconMap[buttonId] || '•';
    }
  }

  // Utility methods
  formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (days > 0) {
      return `${days}d ${hours}h`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  }

  getCurrentTime() {
    return new Date().toLocaleTimeString('en-US', { hour12: false });
  }

  log(message, type = 'info') {
    const logContainer = document.getElementById('activity-log');
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry ${type}`;
    
    logEntry.innerHTML = `
      <span class="log-time">${this.getCurrentTime()}</span>
      <span class="log-message">${message}</span>
    `;
    
    logContainer.insertBefore(logEntry, logContainer.firstChild);
    
    // Keep only last 50 entries
    while (logContainer.children.length > 50) {
      logContainer.removeChild(logContainer.lastChild);
    }
  }


  showConnectionDetails() {
    const details = `
Camera Status: ${this.status.connected ? 'Connected' : 'Disconnected'}
Camera IP: ${this.status.ip || 'Unknown'}
Last Update: ${this.status.lastUpdate ? new Date(this.status.lastUpdate).toLocaleTimeString() : 'Never'}
WebSocket: ${wsManager.connected ? 'Connected' : 'Disconnected'}
    `.trim();
    
    alert(details);
  }

  toggleFunctionMenu() {
    const dropdown = document.getElementById('function-menu-dropdown');
    console.log('Toggling menu, dropdown element:', dropdown);
    
    if (!dropdown) {
      console.error('Menu dropdown element not found!');
      return;
    }
    
    const isVisible = dropdown.style.display !== 'none';
    console.log('Menu currently visible:', isVisible);
    
    if (isVisible) {
      this.hideFunctionMenu();
    } else {
      this.showFunctionMenu();
    }
  }

  showFunctionMenu() {
    const dropdown = document.getElementById('function-menu-dropdown');
    console.log('Showing menu, dropdown element:', dropdown);
    
    if (!dropdown) {
      console.error('Menu dropdown element not found in showFunctionMenu!');
      return;
    }
    
    dropdown.style.display = 'block';
    console.log('Menu display style set to block');
    
    // Update menu item states based on camera connection
    this.updateMenuItemStates();
  }

  hideFunctionMenu() {
    const dropdown = document.getElementById('function-menu-dropdown');
    dropdown.style.display = 'none';
  }

  updateMenuItemStates() {
    try {
      const cameraConnected = this.status && this.status.connected && !this.status.reconnectAttempts;
      
      // Enable/disable camera-dependent menu items
      const testShotItem = document.querySelector('[data-card="test-shot"]');
      const cameraSettingsItem = document.querySelector('[data-card="camera-settings"]');
      const intervalometerItem = document.querySelector('[data-card="intervalometer"]');
      
      if (testShotItem) testShotItem.disabled = !cameraConnected;
      if (cameraSettingsItem) cameraSettingsItem.disabled = !cameraConnected;
      if (intervalometerItem) intervalometerItem.disabled = !cameraConnected;
      
      // Update active state
      const currentCard = this.getCurrentCard();
      document.querySelectorAll('.menu-item').forEach(item => {
        if (item.dataset && item.dataset.card) {
          item.classList.toggle('active', item.dataset.card === currentCard);
        }
      });
    } catch (error) {
      console.error('Error updating menu item states:', error);
    }
  }

  getCurrentCard() {
    const cards = document.querySelectorAll('.function-card');
    for (const card of cards) {
      if (card.style.display !== 'none') {
        return card.id.replace('-card', '');
      }
    }
    return 'controller-status';
  }

  switchToCard(cardName) {
    // Hide all cards
    document.querySelectorAll('.function-card').forEach(card => {
      card.style.display = 'none';
    });
    
    // Show selected card
    const targetCard = document.getElementById(`${cardName}-card`);
    if (targetCard) {
      targetCard.style.display = 'block';
    }
    
    // Handle special cases
    if (cardName === 'intervalometer') {
      this.updateIntervalometerView();
    } else if (cardName === 'network-settings') {
      this.populateCameraConfigForm();
    } else if (cardName === 'utilities') {
      if (window.utilitiesManager) {
        window.utilitiesManager.initialize();
      }
    }
    
    // Update menu active states
    this.updateMenuItemStates();
  }

  showSettingsModal(settings) {
    const modal = document.getElementById('settings-modal');
    const content = document.getElementById('settings-content');
    
    // Format settings for display
    let html = '<div class="settings-grid">';
    
    for (const [key, value] of Object.entries(settings)) {
      if (typeof value === 'object' && value.value !== undefined) {
        html += `
          <div class="setting-item">
            <span class="setting-label">${key}:</span>
            <span class="setting-value">${value.value}</span>
          </div>
        `;
      }
    }
    
    html += '</div>';
    content.innerHTML = html;
    modal.style.display = 'flex';
    
    // Close modal handlers
    const closeBtn = modal.querySelector('.modal-close');
    closeBtn.onclick = () => modal.style.display = 'none';
    
    modal.onclick = (e) => {
      if (e.target === modal) {
        modal.style.display = 'none';
      }
    };
  }


  // Intervalometer status management
  updateIntervalometerUI(status) {
    console.log('updateIntervalometerUI called with status:', status);
    
    // Update header status indicators when intervalometer state changes
    this.updateHeaderStatusIndicators(this.status || { connected: false });
    
    if (!status) {
      console.log('No status provided, showing setup view');
      this.showIntervalometerSetup();
      this.stopIntervalometerStatusUpdates();
      return;
    }

    this.intervalometerState = {
      running: status.state === 'running',
      paused: status.state === 'paused',
      stats: status.stats,
      options: status.options
    };

    if (status.state === 'running' || status.state === 'paused') {
      console.log('Showing intervalometer progress view');
      this.showIntervalometerProgress();
      this.startIntervalometerStatusUpdates();
    } else {
      console.log('Showing intervalometer setup view');
      this.showIntervalometerSetup();
      this.stopIntervalometerStatusUpdates();
    }

    this.updateProgressDisplay(status);
  }

  updateIntervalometerView() {
    // Update the intervalometer card based on current state
    if (this.intervalometerState && this.intervalometerState.running) {
      this.showIntervalometerProgress();
    } else {
      this.showIntervalometerSetup();
    }
  }

  showIntervalometerSetup() {
    const setupSection = document.getElementById('intervalometer-setup');
    const progressSection = document.getElementById('intervalometer-progress');
    
    if (setupSection) setupSection.style.display = 'block';
    if (progressSection) progressSection.style.display = 'none';
    
    // Disable stop button when not running
    const stopButton = document.getElementById('stop-intervalometer-btn');
    if (stopButton) {
      stopButton.disabled = true;
    }
  }

  showIntervalometerProgress() {
    const setupSection = document.getElementById('intervalometer-setup');
    const progressSection = document.getElementById('intervalometer-progress');
    
    if (setupSection) setupSection.style.display = 'none';
    if (progressSection) progressSection.style.display = 'block';
    
    // Enable stop button when intervalometer is running
    const stopButton = document.getElementById('stop-intervalometer-btn');
    if (stopButton) {
      stopButton.disabled = false;
    }
  }

  updateProgressDisplay(status) {
    try {
      console.log('updateProgressDisplay called with:', status);
      
      // Safely get values with fallbacks
      const stats = status.stats || {};
      const options = status.options || {};
      const shotsTaken = stats.shotsTaken || 0;
      const totalShots = options.totalShots;
      const successRate = status.successRate || 1;
      const duration = status.duration || 0;

      // Update shots taken
      const shotsTakenEl = document.getElementById('shots-taken');
      if (totalShots) {
        shotsTakenEl.textContent = `${shotsTaken} of ${totalShots}`;
      } else {
        shotsTakenEl.textContent = `${shotsTaken} of ∞`;
      }

      // Update success rate
      const successRatePercent = successRate * 100;
      document.getElementById('success-rate').textContent = `${successRatePercent.toFixed(1)}%`;

      // Update duration
      const durationSeconds = Math.floor(duration / 1000);
      document.getElementById('session-duration').textContent = this.formatDuration(durationSeconds);

      // Update progress bar
      const progressFill = document.getElementById('progress-fill');
      if (totalShots) {
        const progress = (shotsTaken / totalShots) * 100;
        progressFill.style.width = `${Math.min(progress, 100)}%`;
        progressFill.style.animation = ''; // Remove animation
      } else {
        // For unlimited sessions, show a pulsing animation
        progressFill.style.width = '100%';
        progressFill.style.animation = 'pulse 2s infinite';
      }

      // Calculate next shot countdown using exact timestamp
      if (status.state === 'running' && status.nextShotTime) {
        const nextShotTime = new Date(status.nextShotTime).getTime();
        const now = Date.now();
        const nextShotIn = Math.max(0, nextShotTime - now);
        
        if (nextShotIn <= 1000) {
          document.getElementById('next-shot-countdown').textContent = 'Taking shot...';
        } else {
          document.getElementById('next-shot-countdown').textContent = `${Math.ceil(nextShotIn / 1000)}s`;
        }
      } else {
        document.getElementById('next-shot-countdown').textContent = '-';
      }
    } catch (error) {
      console.error('Error in updateProgressDisplay:', error);
      // Don't crash the UI, just log the error
    }
  }

  formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    } else {
      return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }
  }

  startIntervalometerStatusUpdates() {
    if (this.statusUpdateInterval) return;
    
    this.statusUpdateInterval = setInterval(async () => {
      if (this.intervalometerState.running) {
        try {
          const response = await fetch('/api/intervalometer/status');
          const status = await response.json();
          if (status.running) {
            this.updateProgressDisplay(status);
          } else {
            this.updateIntervalometerUI(status);
          }
        } catch (error) {
          console.warn('Failed to update intervalometer status:', error);
        }
      }
    }, 1000); // Update every second
  }

  stopIntervalometerStatusUpdates() {
    if (this.statusUpdateInterval) {
      clearInterval(this.statusUpdateInterval);
      this.statusUpdateInterval = null;
    }
  }

}

// Add CSS animation for unlimited progress bar
const style = document.createElement('style');
style.textContent = `
  @keyframes pulse {
    0%, 100% { opacity: 0.6; }
    50% { opacity: 1; }
  }
`;
document.head.appendChild(style);

// Global camera manager instance
window.cameraManager = new CameraManager();