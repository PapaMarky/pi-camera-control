import { EventEmitter } from 'events';
import cron from 'node-cron';
import { logger } from '../utils/logger.js';

export class IntervalometerSession extends EventEmitter {
  constructor(cameraController, options = {}) {
    super();
    
    this.cameraController = cameraController;
    this.options = {
      interval: 10, // seconds
      totalShots: null, // infinite if null
      stopTime: null, // Date object
      ...options
    };
    
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
  
  async start() {
    if (this.state === 'running') {
      throw new Error('Session is already running');
    }
    
    // Validate camera connection
    const cameraStatus = this.cameraController.getConnectionStatus();
    if (!cameraStatus.connected) {
      throw new Error('Camera is not connected');
    }
    
    // Validate interval against camera settings
    const validation = await this.cameraController.validateInterval(this.options.interval);
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

    // Pause camera info polling during intervalometer session to avoid interference
    this.cameraController.pauseInfoPolling();
    
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
    this.scheduleNextShot();
    
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
    
    // Resume camera info polling after intervalometer session ends
    this.cameraController.resumeInfoPolling();
    
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
    
    this.scheduleNextShot();
    
    return true;
  }
  
  scheduleNextShot() {
    if (this.shouldStop || this.state !== 'running') {
      return;
    }
    
    // Check if we've reached the shot limit
    if (this.options.totalShots && this.stats.shotsTaken >= this.options.totalShots) {
      this.complete('Shot limit reached');
      return;
    }
    
    // Check if we've reached the stop time
    if (this.options.stopTime && new Date() >= this.options.stopTime) {
      this.complete('Stop time reached');
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
      this.scheduleNextShot();
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
      await this.cameraController.takePhoto();
      
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
  
  complete(reason = 'Session completed normally') {
    logger.info(`Intervalometer session completed: ${reason}`);
    
    this.state = 'completed';
    this.stats.endTime = new Date();
    
    if (this.intervalId) {
      clearTimeout(this.intervalId);
      this.intervalId = null;
    }
    
    // Resume camera info polling after intervalometer session completes
    this.cameraController.resumeInfoPolling();
    
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