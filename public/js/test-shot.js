/**
 * Test Shot UI Manager
 * Handles live view capture and image gallery
 */
class TestShotUI {
  constructor(wsManager) {
    this.wsManager = wsManager;
    this.captures = [];

    console.log('TestShotUI: Constructor called');

    // Safe initialization - don't call initialize yet
    // Will be called after DOM is fully ready
  }

  initialize() {
    console.log('TestShotUI: Initialize called');

    try {
      // Setup event handlers
      this.setupEventHandlers();

      console.log('TestShotUI: Initialized successfully');
    } catch (error) {
      console.error('TestShotUI: Initialization failed:', error);
    }
  }

  setupEventHandlers() {
    console.log('TestShotUI: Setting up event handlers');

    // Capture button
    const captureBtn = document.getElementById('capture-liveview-btn');
    if (captureBtn) {
      captureBtn.addEventListener('click', () => this.captureLiveView());
      console.log('TestShotUI: Capture button handler attached');
    } else {
      console.log('TestShotUI: Capture button not found (OK if not on page yet)');
    }

    // Clear button
    const clearBtn = document.getElementById('clear-liveview-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => this.clearAll());
      console.log('TestShotUI: Clear button handler attached');
    }
  }

  async captureLiveView() {
    console.log('TestShotUI: Capture live view clicked');

    const btn = document.getElementById('capture-liveview-btn');
    if (!btn) return;

    try {
      // Disable button and show loading
      btn.disabled = true;
      const originalText = btn.querySelector('.btn-text').textContent;
      btn.querySelector('.btn-text').textContent = 'Capturing...';

      // Call API
      const response = await fetch('/api/camera/liveview/capture', {
        method: 'POST'
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const capture = await response.json();
      console.log('TestShotUI: Capture successful:', capture);

      // Add to captures list
      this.captures.push(capture);
      this.renderGallery();

    } catch (error) {
      console.error('TestShotUI: Capture failed:', error);
      alert(`Failed to capture: ${error.message}`);
    } finally {
      // Restore button
      btn.disabled = false;
      btn.querySelector('.btn-text').textContent = 'Capture Live View';
    }
  }

  async clearAll() {
    console.log('TestShotUI: Clear all clicked');

    if (!confirm('Clear all captured images?')) {
      return;
    }

    try {
      const response = await fetch('/api/camera/liveview/clear', {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      this.captures = [];
      this.renderGallery();
      console.log('TestShotUI: All captures cleared');

    } catch (error) {
      console.error('TestShotUI: Clear failed:', error);
      alert(`Failed to clear: ${error.message}`);
    }
  }

  renderGallery() {
    console.log('TestShotUI: Rendering gallery with', this.captures.length, 'images');

    const gallery = document.getElementById('liveview-gallery');
    if (!gallery) {
      console.log('TestShotUI: Gallery element not found');
      return;
    }

    if (this.captures.length === 0) {
      gallery.innerHTML = '<p style="text-align: center; padding: 2rem; color: #666;">No images captured yet. Click "Capture Live View" to start.</p>';
      return;
    }

    // Simple list of images
    gallery.innerHTML = this.captures.map(capture => `
      <div style="margin-bottom: 1rem; padding: 1rem; border: 1px solid #ddd; border-radius: 4px;">
        <img src="/api/camera/liveview/images/${capture.id}/file"
             style="max-width: 100%; height: auto; cursor: pointer;"
             onclick="window.open(this.src, '_blank')"
             alt="Live view ${capture.id}">
        <p style="margin-top: 0.5rem; font-size: 0.875rem; color: #666;">
          ID: ${capture.id} | ${new Date(capture.timestamp).toLocaleString()}
        </p>
      </div>
    `).join('');
  }
}

// Export for use in app.js
if (typeof window !== 'undefined') {
  window.TestShotUI = TestShotUI;
}
