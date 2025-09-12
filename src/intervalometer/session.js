import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';
import { TimelapseSession } from './timelapse-session.js';

/**
 * IntervalometerSession - Legacy Compatibility Layer
 * Maintains existing API while delegating to new centralized architecture
 * Ensures zero breaking changes during migration to centralized system
 */
export class IntervalometerSession extends EventEmitter {
  constructor(getCameraController, options = {}) {
    super();
    
    // Store original parameters for delegation
    this.getCameraController = getCameraController;
    this.originalOptions = { ...options };
    
    // Create underlying timelapse session
    this.timelapseSession = null;
    this.initialized = false;
    
    // Legacy state properties for backward compatibility
    this.state = 'stopped';
    this.stats = {
      startTime: null,
      endTime: null,
      shotsTaken: 0,
      shotsSuccessful: 0,
      shotsFailed: 0,
      currentShot: 0,
      errors: []
    };
    this.options = {
      interval: 10,
      totalShots: null,
      stopTime: null,
      ...options
    };
    
    // Legacy properties
    this.intervalId = null;
    this.cronJob = null;
    this.shouldStop = false;
    this.nextShotTime = null;
    
    // Initialize lazily to maintain compatibility
    this.initializeLazy();
  }
  
  /**
   * Lazy initialization to maintain compatibility
   */
  async initializeLazy() {
    if (this.initialized) return;
    
    try {
      // Create the underlying timelapse session
      this.timelapseSession = new TimelapseSession(this.getCameraController, this.originalOptions);
      
      // Forward all events to maintain compatibility
      this.bindTimelapseEvents();
      
      this.initialized = true;
      
      logger.debug('IntervalometerSession compatibility layer initialized', {
        sessionId: this.timelapseSession.id,
        title: this.timelapseSession.title
      });
      
    } catch (error) {
      logger.error('Failed to initialize IntervalometerSession compatibility layer:', error);
      throw error;
    }
  }
  
  /**
   * Bind events from timelapse session for compatibility
   */
  bindTimelapseEvents() {
    if (!this.timelapseSession) return;
    
    // Forward all events to maintain existing API
    this.timelapseSession.on('started', (data) => {
      this.updateLegacyState(data);
      this.emit('started', data);
    });
    
    this.timelapseSession.on('stopped', (data) => {
      this.updateLegacyState(data);
      this.emit('stopped', data);
    });
    
    this.timelapseSession.on('completed', (data) => {
      this.updateLegacyState(data);
      this.emit('completed', data);
    });
    
    this.timelapseSession.on('error', (data) => {
      this.updateLegacyState(data);
      this.emit('error', data);
    });
    
    this.timelapseSession.on('paused', (data) => {
      this.updateLegacyState(data);
      this.emit('paused', data);
    });
    
    this.timelapseSession.on('resumed', (data) => {
      this.updateLegacyState(data);
      this.emit('resumed', data);
    });
    
    // Photo events
    this.timelapseSession.on('photo_taken', (data) => {
      this.updateLegacyState(data);
      this.emit('photo_taken', data);
    });
    
    this.timelapseSession.on('photo_failed', (data) => {
      this.updateLegacyState(data);
      this.emit('photo_failed', data);
    });
  }
  
  /**
   * Update legacy state properties from timelapse session
   */
  updateLegacyState(data) {
    if (!this.timelapseSession) return;
    
    const status = this.timelapseSession.getStatus();
    
    // Update legacy state
    this.state = status.state;
    this.stats = { ...status.stats };
    this.options = { ...status.options };
    this.nextShotTime = status.nextShotTime;
  }
  
  /**
   * Legacy method: getCurrentCameraController
   */
  async getCurrentCameraController(retryCount = 3) {
    await this.initializeLazy();
    return this.timelapseSession.getCurrentCameraController(retryCount);
  }
  
  /**
   * Legacy method: start
   */
  async start() {
    await this.initializeLazy();
    
    logger.debug('Starting intervalometer session via compatibility layer', {
      sessionId: this.timelapseSession.id,
      title: this.timelapseSession.title
    });
    
    const result = await this.timelapseSession.start();
    this.updateLegacyState({});
    return result;
  }
  
  /**
   * Legacy method: stop
   */
  async stop() {
    if (!this.initialized || !this.timelapseSession) {
      return false;
    }
    
    logger.debug('Stopping intervalometer session via compatibility layer', {
      sessionId: this.timelapseSession.id,
      title: this.timelapseSession.title
    });
    
    const result = await this.timelapseSession.stop();
    this.updateLegacyState({});
    return result;
  }
  
  /**
   * Legacy method: pause
   */
  async pause() {
    if (!this.initialized || !this.timelapseSession) {
      return false;
    }
    
    const result = await this.timelapseSession.pause();
    this.updateLegacyState({});
    return result;
  }
  
  /**
   * Legacy method: resume
   */
  async resume() {
    if (!this.initialized || !this.timelapseSession) {
      return false;
    }
    
    const result = await this.timelapseSession.resume();
    this.updateLegacyState({});
    return result;
  }
  
  /**
   * Legacy method: scheduleNextShot (internal method, maintain for compatibility)
   */
  async scheduleNextShot() {
    // This is now handled internally by TimelapseSession
    // Just update legacy state
    if (this.timelapseSession) {
      this.updateLegacyState({});
    }
  }
  
  /**
   * Legacy method: takeShot (internal method, maintain for compatibility)  
   */
  async takeShot() {
    // This is now handled internally by TimelapseSession
    // Just update legacy state
    if (this.timelapseSession) {
      this.updateLegacyState({});
    }
  }
  
  /**
   * Legacy method: complete (internal method, maintain for compatibility)
   */
  async complete(reason = 'Session completed normally') {
    if (!this.initialized || !this.timelapseSession) {
      return;
    }
    
    await this.timelapseSession.complete(reason);
    this.updateLegacyState({});
  }
  
  /**
   * Legacy method: error (internal method, maintain for compatibility)
   */
  error(reason) {
    if (!this.initialized || !this.timelapseSession) {
      return;
    }
    
    this.timelapseSession.error(reason);
    this.updateLegacyState({});
  }
  
  /**
   * Legacy method: getStatus
   */
  getStatus() {
    if (!this.initialized || !this.timelapseSession) {
      // Return legacy default status
      return {
        state: this.state,
        options: { ...this.options },
        stats: { ...this.stats },
        duration: 0,
        remainingShots: null,
        estimatedEndTime: null,
        nextShotTime: this.nextShotTime,
        successRate: 1
      };
    }
    
    // Get status from underlying timelapse session
    const status = this.timelapseSession.getStatus();
    
    // Convert to legacy format (remove new fields that might break existing clients)
    return {
      state: status.state,
      options: status.options,
      stats: status.stats,
      duration: status.duration,
      remainingShots: status.remainingShots,
      estimatedEndTime: status.estimatedEndTime,
      nextShotTime: status.nextShotTime,
      successRate: status.successRate
    };
  }
  
  /**
   * Legacy method: cleanup
   */
  cleanup() {
    if (this.timelapseSession && typeof this.timelapseSession.cleanup === 'function') {
      this.timelapseSession.cleanup();
    }
    
    // Clean up legacy properties
    if (this.intervalId) {
      clearTimeout(this.intervalId);
      this.intervalId = null;
    }
    
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
    }
    
    logger.debug('IntervalometerSession compatibility layer cleanup completed');
  }
  
  /**
   * New methods - Access to enhanced functionality (optional, backward compatible)
   */
  
  /**
   * Get the underlying timelapse session for enhanced functionality
   */
  getTimelapseSession() {
    return this.timelapseSession;
  }
  
  /**
   * Get session metadata (new functionality)
   */
  getMetadata() {
    if (!this.initialized || !this.timelapseSession) {
      return {
        id: 'unknown',
        title: 'Unknown Session',
        createdAt: new Date(),
        state: this.state,
        options: { ...this.options },
        stats: { ...this.stats }
      };
    }
    
    return this.timelapseSession.getMetadata();
  }
  
  /**
   * Update session title (new functionality)
   */
  updateTitle(newTitle) {
    if (!this.initialized || !this.timelapseSession) {
      throw new Error('Session not initialized');
    }
    
    return this.timelapseSession.updateTitle(newTitle);
  }
  
  /**
   * Get session ID (new functionality)
   */
  getSessionId() {
    if (!this.initialized || !this.timelapseSession) {
      return 'unknown';
    }
    
    return this.timelapseSession.id;
  }
  
  /**
   * Get session title (new functionality)
   */
  getTitle() {
    if (!this.initialized || !this.timelapseSession) {
      return 'Unknown Session';
    }
    
    return this.timelapseSession.title;
  }
}