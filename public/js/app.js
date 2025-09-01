class CameraControlApp {
  constructor() {
    this.initialized = false;
    this.statusUpdateInterval = null;
  }

  async initialize() {
    if (this.initialized) return;

    console.log('Initializing Camera Control App...');
    
    try {
      // Load theme preference
      cameraManager.loadTheme();
      
      // Initialize camera manager
      await cameraManager.initialize();
      
      // Connect WebSocket
      wsManager.connect();
      
      // Start periodic status updates (fallback if WebSocket fails)
      this.startStatusUpdates();
      
      // Hide loading overlay
      this.hideLoadingOverlay();
      
      // Initialize UI components
      this.initializeUI();
      
      this.initialized = true;
      cameraManager.log('Application initialized successfully', 'success');
      
    } catch (error) {
      console.error('Failed to initialize app:', error);
      cameraManager.log(`Initialization failed: ${error.message}`, 'error');
      this.showErrorMessage('Failed to initialize application');
    }
  }

  startStatusUpdates() {
    // Update status every 30 seconds via REST API (backup for WebSocket)
    this.statusUpdateInterval = setInterval(async () => {
      if (!wsManager.connected) {
        await cameraManager.updateCameraStatus();
        await this.updateSystemStatus();
      }
    }, 30000);
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
    // Update loading overlay to show error
    const overlay = document.getElementById('loading-overlay');
    const spinner = overlay.querySelector('.loading-spinner');
    const text = overlay.querySelector('p');
    
    spinner.style.display = 'none';
    text.textContent = `Error: ${message}`;
    text.style.color = '#fd5e53';
    
    // Hide after 5 seconds and try to continue
    setTimeout(() => {
      this.hideLoadingOverlay();
    }, 5000);
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
          
        case 'v': // V - validate interval
          if (!document.getElementById('validate-interval-btn').disabled) {
            cameraManager.validateInterval();
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
          
        case 't': // T - toggle theme
          cameraManager.toggleTheme();
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

  // Cleanup on page unload
  cleanup() {
    if (this.statusUpdateInterval) {
      clearInterval(this.statusUpdateInterval);
    }
    
    if (wsManager) {
      wsManager.disconnect();
    }
    
    this.hideTooltip();
  }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
  window.app = new CameraControlApp();
  
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