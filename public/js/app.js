class CameraControlApp {
  constructor() {
    this.initialized = false;
    this.statusUpdateInterval = null;
  }

  async initialize() {
    if (this.initialized) return;

    console.log('Initializing Camera Control App...');
    
    // Update loading message to show connecting state
    this.updateLoadingMessage('Connecting to server...', 'connecting');
    
    try {
      
      // Initialize UI components first (non-blocking)
      this.initializeUI();

      // Initialize camera manager BEFORE WebSocket connects so listeners are ready
      this.updateLoadingMessage('Connecting...', 'connecting');
      await this.initializeCameraWithRetry();

      // Connect WebSocket AFTER listeners are registered
      this.updateLoadingMessage('Connecting...', 'connecting');
      wsManager.connect();

      // Give WebSocket time to connect
      await this.delay(1000);

      // Initialize network UI
      this.networkUI = new NetworkUI(wsManager);
      window.networkUI = this.networkUI;

      // Initialize timelapse UI
      this.timelapseUI = new TimelapseUI(wsManager);
      window.timelapseUI = this.timelapseUI;

      // Initialize time sync
      this.timeSync = new TimeSync(wsManager);
      window.timeSync = this.timeSync;
      
      // Start periodic status updates (fallback if WebSocket fails)
      this.startStatusUpdates();
      
      // Hide loading overlay after short delay
      await this.delay(500);
      this.hideLoadingOverlay();
      
      this.initialized = true;
      cameraManager.log('Application initialized successfully', 'success');
      
    } catch (error) {
      console.error('Failed to initialize app:', error);
      // Only show error after reasonable connection attempts
      this.showErrorMessage('Connection failed. Retrying...');
    }
  }

  async initializeCameraWithRetry() {
    try {
      // Try to initialize camera, but don't fail if camera is not ready
      await cameraManager.initialize();
    } catch (error) {
      console.warn('Camera not immediately available:', error.message);
      // Don't throw error - let the app continue and retry later
      cameraManager.log('Camera not ready, will retry automatically', 'warning');
    }
  }

  updateLoadingMessage(message, type = 'connecting') {
    const overlay = document.getElementById('loading-overlay');
    const text = overlay?.querySelector('p');
    const spinner = overlay?.querySelector('.loading-spinner');
    
    if (text) {
      text.textContent = message;
      
      // Update color based on type
      if (type === 'connecting') {
        text.style.color = '#ffc107'; // Warning yellow
      } else if (type === 'error') {
        text.style.color = '#fd5e53'; // Error red
      } else {
        text.style.color = 'white'; // Default
      }
    }
    
    if (spinner && type === 'error') {
      spinner.style.display = 'none';
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  startStatusUpdates() {
    // Update status every 10 seconds via REST API (primary for camera detection, backup for WebSocket)
    this.statusUpdateInterval = setInterval(async () => {
      await cameraManager.updateCameraStatus();
      if (!wsManager.connected) {
        await this.updateSystemStatus();
      }
    }, 10000);
  }

  async updateSystemStatus() {
    try {
      const response = await fetch('/api/system/status');
      const systemData = await response.json();
      
      // Create power data with system uptime
      const powerData = {
        ...systemData.power,
        uptime: systemData.uptime
      };
      
      cameraManager.updatePowerStatus(powerData);
    } catch (error) {
      console.warn('Failed to update system status:', error);
    }
  }

  hideLoadingOverlay() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
      overlay.style.display = 'none';
    }
  }

  showErrorMessage(message) {
    // Update loading overlay to show error with retry indication
    this.updateLoadingMessage(message, 'error');
    
    // Hide after 3 seconds and let the app continue
    setTimeout(() => {
      this.hideLoadingOverlay();
      // Continue attempting to connect in background
      if (!this.initialized) {
        cameraManager.log('Continuing in background...', 'info');
      }
    }, 3000);
  }

  initializeUI() {
    // Set up keyboard shortcuts
    this.setupKeyboardShortcuts();

    // Set up service worker for PWA (if available)
    this.registerServiceWorker();

    // Set up visual feedback
    this.setupVisualFeedback();

    // Set up responsive behavior
    this.setupResponsiveBehavior();

    // Initialize tooltips and help text
    this.initializeTooltips();

    // Initialize password toggle functionality
    this.initializePasswordToggles();
  }

  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (event) => {
      // Only handle shortcuts when not typing in inputs
      if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
        return;
      }

      switch (event.key.toLowerCase()) {
        case ' ': // Spacebar - take photo
        case 'enter':
          event.preventDefault();
          if (!document.getElementById('take-photo-btn').disabled) {
            cameraManager.takePhoto();
          }
          break;
          
        case 's': // S - get settings
          if (!document.getElementById('get-settings-btn').disabled) {
            cameraManager.getCameraSettings();
          }
          break;

        case 'i': // I - start intervalometer
          if (!document.getElementById('start-intervalometer-btn').disabled) {
            cameraManager.startIntervalometer();
          }
          break;
          
        case 'escape': // Escape - close modals
          const modal = document.getElementById('settings-modal');
          if (modal && modal.style.display !== 'none') {
            modal.style.display = 'none';
          }
          break;
          
      }
    });
  }

  setupVisualFeedback() {
    // Add click feedback to buttons
    const buttons = document.querySelectorAll('button');
    buttons.forEach(button => {
      button.addEventListener('click', () => {
        button.style.transform = 'scale(0.95)';
        setTimeout(() => {
          button.style.transform = '';
        }, 100);
      });
    });

    // Add focus indicators for keyboard navigation
    const focusableElements = document.querySelectorAll('button, input, [tabindex]');
    focusableElements.forEach(element => {
      element.addEventListener('focus', () => {
        element.classList.add('focused');
      });
      
      element.addEventListener('blur', () => {
        element.classList.remove('focused');
      });
    });
  }

  setupResponsiveBehavior() {
    // Handle orientation changes on mobile
    window.addEventListener('orientationchange', () => {
      setTimeout(() => {
        // Trigger a resize to recalculate layouts
        window.dispatchEvent(new Event('resize'));
      }, 100);
    });

    // Handle viewport height changes (mobile browser address bars)
    const setVH = () => {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
    };
    
    setVH();
    window.addEventListener('resize', setVH);
    window.addEventListener('orientationchange', () => setTimeout(setVH, 100));
  }

  initializeTooltips() {
    const tooltipElements = document.querySelectorAll('[title]');
    
    tooltipElements.forEach(element => {
      // Store original title
      const title = element.getAttribute('title');
      element.removeAttribute('title'); // Remove to prevent browser tooltip
      element.setAttribute('data-tooltip', title);
      
      // Add tooltip behavior for touch devices
      if ('ontouchstart' in window) {
        element.addEventListener('touchstart', () => {
          this.showTooltip(element, title);
        });
        
        element.addEventListener('touchend', () => {
          this.hideTooltip();
        });
      } else {
        // Mouse hover for desktop
        element.addEventListener('mouseenter', () => {
          this.showTooltip(element, title);
        });
        
        element.addEventListener('mouseleave', () => {
          this.hideTooltip();
        });
      }
    });
  }

  showTooltip(element, text) {
    // Remove existing tooltip
    this.hideTooltip();
    
    const tooltip = document.createElement('div');
    tooltip.className = 'custom-tooltip';
    tooltip.textContent = text;
    document.body.appendChild(tooltip);
    
    // Position tooltip
    const rect = element.getBoundingClientRect();
    tooltip.style.position = 'fixed';
    tooltip.style.top = `${rect.bottom + 8}px`;
    tooltip.style.left = `${rect.left + rect.width / 2}px`;
    tooltip.style.transform = 'translateX(-50%)';
    tooltip.style.background = 'var(--bg-card)';
    tooltip.style.color = 'var(--text-primary)';
    tooltip.style.padding = '0.5rem 0.75rem';
    tooltip.style.borderRadius = '6px';
    tooltip.style.fontSize = '0.875rem';
    tooltip.style.boxShadow = 'var(--shadow)';
    tooltip.style.zIndex = '10000';
    tooltip.style.pointerEvents = 'none';
    tooltip.style.opacity = '0';
    tooltip.style.transition = 'opacity 0.2s';
    
    // Animate in
    requestAnimationFrame(() => {
      tooltip.style.opacity = '1';
    });
    
    // Store reference for cleanup
    this.currentTooltip = tooltip;
  }

  hideTooltip() {
    if (this.currentTooltip) {
      this.currentTooltip.remove();
      this.currentTooltip = null;
    }
  }

  initializePasswordToggles() {
    // Find all password toggle buttons
    const toggleButtons = document.querySelectorAll('.password-toggle-btn');

    toggleButtons.forEach(button => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        this.togglePasswordVisibility(button);
      });
    });
  }

  togglePasswordVisibility(toggleButton) {
    const targetId = toggleButton.getAttribute('data-target');
    const passwordInput = document.getElementById(targetId);
    const toggleIcon = toggleButton.querySelector('.toggle-icon');

    if (!passwordInput || !toggleIcon) {
      console.warn('Password toggle: target input or icon not found');
      return;
    }

    const isPasswordVisible = passwordInput.type === 'text';

    if (isPasswordVisible) {
      // Hide password
      passwordInput.type = 'password';
      toggleIcon.textContent = '👁️';
      toggleButton.classList.remove('password-visible');
      toggleButton.setAttribute('title', 'Show password');
      toggleButton.setAttribute('aria-label', 'Show password');
    } else {
      // Show password
      passwordInput.type = 'text';
      toggleIcon.textContent = '👁️‍🗨️';
      toggleButton.classList.add('password-visible');
      toggleButton.setAttribute('title', 'Hide password');
      toggleButton.setAttribute('aria-label', 'Hide password');
    }
  }

  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', async () => {
        try {
          const registration = await navigator.serviceWorker.register('/sw.js');
          console.log('Service Worker registered:', registration);
        } catch (error) {
          console.log('Service Worker registration failed:', error);
        }
      });
    }
  }

  // PWA install handling
  handlePWAInstall() {
    let deferredPrompt;

    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      deferredPrompt = event;
      
      // Show install button (could add this to UI)
      console.log('PWA install available');
    });

    window.addEventListener('appinstalled', () => {
      console.log('PWA installed successfully');
      cameraManager.log('App installed successfully', 'success');
    });
  }

  // Network status monitoring
  setupNetworkMonitoring() {
    const updateOnlineStatus = () => {
      if (navigator.onLine) {
        cameraManager.log('Network connection restored', 'success');
        // Attempt to reconnect WebSocket if needed
        if (!wsManager.connected) {
          wsManager.connect();
        }
      } else {
        cameraManager.log('Network connection lost', 'warning');
      }
    };

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
  }

  // Toast notification system
  showToast(message, type = 'info') {
    // Remove existing toast
    const existingToast = document.querySelector('.toast-notification');
    if (existingToast) {
      existingToast.remove();
    }

    // Create toast element
    const toast = document.createElement('div');
    toast.className = `toast-notification toast-${type}`;
    
    // Set icon based on type
    const icons = {
      success: '✓',
      error: '✗',
      warning: '⚠',
      info: 'ℹ'
    };
    
    toast.innerHTML = `
      <span class="toast-icon">${icons[type] || icons.info}</span>
      <span class="toast-message">${message}</span>
    `;
    
    // Style the toast
    Object.assign(toast.style, {
      position: 'fixed',
      top: '20px',
      right: '20px',
      padding: '12px 16px',
      borderRadius: '8px',
      color: 'white',
      fontSize: '14px',
      fontWeight: '500',
      zIndex: '10001',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      minWidth: '200px',
      maxWidth: '400px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
      transform: 'translateX(100%)',
      transition: 'transform 0.3s ease-out',
      pointerEvents: 'auto'
    });
    
    // Set background color based on type
    const colors = {
      success: '#28a745',
      error: '#dc3545', 
      warning: '#ffc107',
      info: '#007bff'
    };
    toast.style.backgroundColor = colors[type] || colors.info;
    
    // Add to DOM and animate in
    document.body.appendChild(toast);
    requestAnimationFrame(() => {
      toast.style.transform = 'translateX(0)';
    });
    
    // Auto-remove after 4 seconds
    setTimeout(() => {
      if (toast.parentNode) {
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
      }
    }, 4000);
    
    // Allow manual dismissal
    toast.addEventListener('click', () => {
      toast.style.transform = 'translateX(100%)';
      setTimeout(() => toast.remove(), 300);
    });
  }

  // Cleanup on page unload
  cleanup() {
    if (this.statusUpdateInterval) {
      clearInterval(this.statusUpdateInterval);
    }
    
    if (wsManager) {
      wsManager.disconnect();
    }
    
    this.hideTooltip();
    
    // Remove any toasts
    const toasts = document.querySelectorAll('.toast-notification');
    toasts.forEach(toast => toast.remove());
  }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
  window.app = new CameraControlApp();
  window.appInstance = window.app; // Also provide as appInstance for compatibility
  
  try {
    await app.initialize();
  } catch (error) {
    console.error('Failed to start application:', error);
  }
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (window.app) {
    app.cleanup();
  }
});

// Handle back/forward navigation
window.addEventListener('popstate', () => {
  // Could implement routing here if needed for multiple pages
});

// Global error handler
window.addEventListener('error', (event) => {
  console.error('Global error:', event.error);
  if (window.cameraManager) {
    cameraManager.log(`Application error: ${event.error?.message || 'Unknown error'}`, 'error');
  }
});

// Handle unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
  if (window.cameraManager) {
    cameraManager.log(`Promise rejection: ${event.reason?.message || 'Unknown error'}`, 'error');
  }
});

// Export for debugging
window.debugApp = {
  wsManager: () => window.wsManager,
  cameraManager: () => window.cameraManager,
  app: () => window.app,
  status: () => ({
    initialized: window.app?.initialized,
    wsConnected: window.wsManager?.connected,
    cameraConnected: window.cameraManager?.status?.connected
  })
};