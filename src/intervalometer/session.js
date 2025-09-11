import { EventEmitter } from 'events';
import cron from 'node-cron';
import { logger } from '../utils/logger.js';

export class IntervalometerSession extends EventEmitter {
  constructor(getCameraController, options = {}) {
    super();
    
    this.getCameraController = getCameraController;
    this.options = {
      interval: 10, // seconds
      totalShots: null, // infinite if null
      stopTime: null, // Date object
      ...options
    };

    // Calculate totalShots if we have stopTime but no explicit totalShots
    if (this.options.stopTime && !this.options.totalShots) {
      const now = new Date();
      const durationMs = this.options.stopTime.getTime() - now.getTime();
      const intervalMs = this.options.interval * 1000;
      if (durationMs > 0) {
        this.options.totalShots = Math.ceil(durationMs / intervalMs);
        logger.info(`Calculated totalShots: ${this.options.totalShots} based on stopTime and interval`);
      }
    }
    
    this.state = 'stopped'; // stopped, running, paused, completed, error
    this.stats = {
      startTime: null,
      endTime: null,
      shotsTaken: 0,
      shotsSuccessful: 0,
      shotsFailed: 0,
      currentShot: 0,
      errors: []
    };
    
    this.intervalId = null;
    this.cronJob = null;
    this.shouldStop = false;
    this.nextShotTime = null;
  }
  
  async getCurrentCameraController(retryCount = 3) {
    for (let attempt = 1; attempt <= retryCount; attempt++) {
      const controller = this.getCameraController();
      if (controller) {
        return controller;
      }
      
      logger.warn(`Camera controller not available (attempt ${attempt}/${retryCount})`);
      
      if (attempt < retryCount) {
        // Wait a bit before retrying
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    logger.error('No camera controller available after retries during intervalometer session');
    throw new Error('No camera controller available');
  }
  
  async start() {
    if (this.state === 'running') {
      throw new Error('Session is already running');
    }
    
    // Validate camera connection
    const cameraController = await this.getCurrentCameraController();
    const cameraStatus = cameraController.getConnectionStatus();
    if (!cameraStatus.connected) {
      throw new Error('Camera is not connected');
    }
    
    // Validate interval against camera settings
    const validation = await cameraController.validateInterval(this.options.interval);
    if (!validation.valid) {
      throw new Error(validation.error || 'Invalid interval settings');
    }
    
    // Reset state
    this.shouldStop = false;
    this.state = 'running';
    this.stats = {
      startTime: new Date(),
      endTime: null,
      shotsTaken: 0,
      shotsSuccessful: 0,
      shotsFailed: 0,
      currentShot: 0,
      errors: []
    };

    // Recalculate totalShots based on actual start time if using stopTime
    if (this.options.stopTime && !this.options.totalShots) {
      const durationMs = this.options.stopTime.getTime() - this.stats.startTime.getTime();
      const intervalMs = this.options.interval * 1000;
      if (durationMs > 0) {
        this.options.totalShots = Math.ceil(durationMs / intervalMs);
        logger.info(`Recalculated totalShots: ${this.options.totalShots} based on actual startTime`);
      }
    }

    // Pause camera info polling during intervalometer session to avoid interference
    cameraController.pauseInfoPolling();
    
    // COMPLETELY disable connection monitoring during intervalometer session
    // Connection monitoring conflicts with long exposures and photo operations
    cameraController.pauseConnectionMonitoring();
    
    logger.info('Starting intervalometer session', {
      interval: this.options.interval,
      totalShots: this.options.totalShots,
      stopTime: this.options.stopTime
    });
    
    this.emit('started', { 
      options: this.options, 
      stats: { ...this.stats } 
    });
    
    // Start the shooting interval
    await this.scheduleNextShot();
    
    return true;
  }
  
  async stop() {
    logger.info('Stopping intervalometer session');
    
    this.shouldStop = true;
    
    if (this.intervalId) {
      clearTimeout(this.intervalId);
      this.intervalId = null;
    }
    
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
    }
    
    this.state = 'stopped';
    this.stats.endTime = new Date();
    
    // Resume camera info polling and connection monitoring after intervalometer session ends
    try {
      const cameraController = await this.getCurrentCameraController();
      cameraController.resumeInfoPolling();
      cameraController.resumeConnectionMonitoring();
    } catch (error) {
      logger.warn('Could not resume camera monitoring, camera controller not available:', error.message);
    }
    
    this.emit('stopped', { stats: { ...this.stats } });
    
    return true;
  }
  
  async pause() {
    if (this.state !== 'running') {
      return false;
    }
    
    logger.info('Pausing intervalometer session');
    
    if (this.intervalId) {
      clearTimeout(this.intervalId);
      this.intervalId = null;
    }
    
    this.state = 'paused';
    this.emit('paused', { stats: { ...this.stats } });
    
    return true;
  }
  
  async resume() {
    if (this.state !== 'paused') {
      return false;
    }
    
    logger.info('Resuming intervalometer session');
    
    this.state = 'running';
    this.emit('resumed', { stats: { ...this.stats } });
    
    await this.scheduleNextShot();
    
    return true;
  }
  
  async scheduleNextShot() {
    if (this.shouldStop || this.state !== 'running') {
      return;
    }
    
    // Check if we've reached the shot limit
    if (this.options.totalShots && this.stats.shotsTaken >= this.options.totalShots) {
      await this.complete('Shot limit reached');
      return;
    }
    
    // Check if we've reached the stop time
    if (this.options.stopTime && new Date() >= this.options.stopTime) {
      await this.complete('Stop time reached');
      return;
    }
    
    // Calculate the exact time for the next shot
    const now = new Date();
    if (!this.nextShotTime) {
      // First shot - take it immediately, then schedule the next
      this.nextShotTime = now;
    } else {
      // Subsequent shots - calculate based on interval from start time
      // shotsTaken has already been incremented in takeShot(), so use it directly
      const nextShotInterval = this.stats.shotsTaken;
      this.nextShotTime = new Date(this.stats.startTime.getTime() + (nextShotInterval * this.options.interval * 1000));
    }
    
    // Calculate delay until next shot time
    const delayMs = Math.max(0, this.nextShotTime.getTime() - now.getTime());
    
    // Schedule the next shot
    this.intervalId = setTimeout(async () => {
      await this.takeShot();
      await this.scheduleNextShot();
    }, delayMs);
  }
  
  async takeShot() {
    if (this.shouldStop || this.state !== 'running') {
      return;
    }
    
    this.stats.currentShot++;
    const shotNumber = this.stats.currentShot;
    
    logger.debug(`Taking shot ${shotNumber}`);
    
    try {
      const cameraController = await this.getCurrentCameraController();
      await cameraController.takePhoto();
      
      this.stats.shotsTaken++;
      this.stats.shotsSuccessful++;
      
      logger.info(`Shot ${shotNumber} completed successfully`);
      
      const photoData = {
        shotNumber,
        success: true,
        timestamp: new Date().toISOString(),
        stats: { ...this.stats }
      };
      
      logger.info('Emitting photo_taken event:', photoData);
      this.emit('photo_taken', photoData);
      
    } catch (error) {
      this.stats.shotsTaken++;
      this.stats.shotsFailed++;
      this.stats.errors.push({
        shotNumber,
        error: error.message,
        timestamp: new Date().toISOString()
      });
      
      logger.error(`Shot ${shotNumber} failed:`, error);
      
      this.emit('photo_failed', {
        shotNumber,
        error: error.message,
        timestamp: new Date().toISOString(),
        stats: { ...this.stats }
      });
      
      // Check if we should abort due to too many failures
      const failureRate = this.stats.shotsFailed / this.stats.shotsTaken;
      if (this.stats.shotsTaken > 5 && failureRate > 0.5) {
        logger.error('High failure rate detected, stopping session');
        this.error('High failure rate detected');
        return;
      }
    }
  }
  
  async complete(reason = 'Session completed normally') {
    logger.info(`Intervalometer session completed: ${reason}`);
    
    this.state = 'completed';
    this.stats.endTime = new Date();
    
    if (this.intervalId) {
      clearTimeout(this.intervalId);
      this.intervalId = null;
    }
    
    // Resume camera info polling and connection monitoring after intervalometer session completes
    try {
      const cameraController = await this.getCurrentCameraController();
      cameraController.resumeInfoPolling();
      cameraController.resumeConnectionMonitoring();
    } catch (error) {
      logger.warn('Could not resume camera monitoring on completion, camera controller not available:', error.message);
    }
    
    this.emit('completed', {
      reason,
      stats: { ...this.stats }
    });
  }
  
  error(reason) {
    logger.error(`Intervalometer session error: ${reason}`);
    
    this.state = 'error';
    this.stats.endTime = new Date();
    
    if (this.intervalId) {
      clearTimeout(this.intervalId);
      this.intervalId = null;
    }
    
    this.emit('error', {
      reason,
      stats: { ...this.stats }
    });
  }
  
  getStatus() {
    const duration = this.stats.startTime ? 
      (this.stats.endTime || new Date()) - this.stats.startTime : 0;
    
    const remainingShots = this.options.totalShots ? 
      Math.max(0, this.options.totalShots - this.stats.shotsTaken) : null;
    
    const estimatedEndTime = this.options.totalShots && this.state === 'running' ?
      new Date(this.stats.startTime.getTime() + (this.options.totalShots * this.options.interval * 1000)) : null;
    
    return {
      state: this.state,
      options: { ...this.options },
      stats: { ...this.stats },
      duration,
      remainingShots,
      estimatedEndTime,
      nextShotTime: this.nextShotTime,
      successRate: this.stats.shotsTaken > 0 ? 
        (this.stats.shotsSuccessful / this.stats.shotsTaken) : 1
    };
  }
  
  cleanup() {
    if (this.state === 'running') {
      this.stop();
    }
  }
}