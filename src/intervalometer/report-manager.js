import { readFile, writeFile, readdir, mkdir, unlink, access, constants } from 'fs/promises';
import { join } from 'path';
// import { dirname } from 'path'; // Unused import - TODO: remove if not needed
import { randomUUID } from 'crypto';
import { logger } from '../utils/logger.js';

/**
 * Timelapse Report Manager
 * Handles persistent storage and retrieval of timelapse session reports
 * Supports cross-reboot recovery and CRUD operations
 */
export class TimelapseReportManager {
  constructor(options = {}) {
    // Storage configuration
    this.storageDir = options.storageDir || join(process.cwd(), 'data', 'timelapse-reports');
    this.reportsDir = join(this.storageDir, 'reports');
    this.unsavedSessionFile = join(this.storageDir, 'unsaved-session.json');
    
    // File extension
    this.reportExtension = '.json';
    
    // Cache for loaded reports
    this.reportCache = new Map();
    this.cacheTimeout = 300000; // 5 minutes
    this.lastCacheUpdate = null;
  }
  
  /**
   * Initialize the report manager
   */
  async initialize() {
    try {
      logger.info('Initializing TimelapseReportManager...');
      
      // Ensure storage directories exist
      await this.ensureDirectories();
      
      // Load existing reports into cache
      await this.loadReportsIntoCache();
      
      logger.info('TimelapseReportManager initialized successfully', {
        storageDir: this.storageDir,
        reportCount: this.reportCache.size
      });
      
      return true;
      
    } catch (error) {
      logger.error('TimelapseReportManager initialization failed:', error);
      throw error;
    }
  }
  
  /**
   * Ensure required directories exist
   */
  async ensureDirectories() {
    try {
      await mkdir(this.storageDir, { recursive: true });
      await mkdir(this.reportsDir, { recursive: true });
      logger.debug('Storage directories ensured', {
        storageDir: this.storageDir,
        reportsDir: this.reportsDir
      });
    } catch (error) {
      logger.error('Failed to create storage directories:', error);
      throw error;
    }
  }
  
  /**
   * Load all reports into cache
   */
  async loadReportsIntoCache() {
    try {
      const files = await readdir(this.reportsDir);
      const reportFiles = files.filter(file => file.endsWith(this.reportExtension));
      
      this.reportCache.clear();
      
      for (const file of reportFiles) {
        try {
          const filePath = join(this.reportsDir, file);
          const content = await readFile(filePath, 'utf8');
          const report = JSON.parse(content);
          
          // Validate report structure
          if (this.validateReport(report)) {
            this.reportCache.set(report.id, {
              report,
              filePath,
              lastModified: new Date()
            });
          } else {
            logger.warn('Invalid report file found:', file);
          }
        } catch (error) {
          logger.warn('Failed to load report file:', { file, error: error.message });
        }
      }
      
      this.lastCacheUpdate = new Date();
      
      logger.debug('Loaded reports into cache', {
        reportCount: this.reportCache.size,
        reportFiles: reportFiles.length
      });
      
    } catch (error) {
      logger.error('Failed to load reports into cache:', error);
      // Don't throw - we can continue without cache
    }
  }
  
  /**
   * Validate report structure
   */
  validateReport(report) {
    // Support both old and new report structures during transition
    const requiredFieldsV2 = ['id', 'sessionId', 'title', 'startTime', 'status', 'intervalometer', 'results', 'metadata'];
    const requiredFieldsV1 = ['id', 'sessionId', 'title', 'startTime', 'status', 'settings', 'results', 'metadata'];

    // Check for v2 structure first
    let isV2Valid = true;
    for (const field of requiredFieldsV2) {
      if (!report.hasOwnProperty(field)) {
        isV2Valid = false;
        break;
      }
    }

    if (isV2Valid) {
      return true;
    }

    // Fall back to v1 structure
    for (const field of requiredFieldsV1) {
      if (!report.hasOwnProperty(field)) {
        logger.debug('Report missing required field:', { field, reportId: report.id });
        return false;
      }
    }

    return true;
  }
  
  /**
   * Save a timelapse report
   */
  async saveReport(report) {
    try {
      // Generate unique ID if not provided
      if (!report.id) {
        report.id = `report-${randomUUID()}`;
      }
      
      // Add/update metadata
      report.metadata = {
        ...report.metadata,
        savedAt: new Date().toISOString(),
        version: report.metadata?.version || '1.0.0'
      };
      
      // Generate filename
      const filename = `${report.id}${this.reportExtension}`;
      const filePath = join(this.reportsDir, filename);
      
      // Save to disk
      await writeFile(filePath, JSON.stringify(report, null, 2), 'utf8');
      
      // Update cache
      this.reportCache.set(report.id, {
        report: { ...report },
        filePath,
        lastModified: new Date()
      });
      
      logger.info('Timelapse report saved', {
        reportId: report.id,
        title: report.title,
        filePath
      });
      
      return { ...report };
      
    } catch (error) {
      logger.error('Failed to save timelapse report:', error);
      throw error;
    }
  }
  
  /**
   * Load all reports
   */
  async loadReports() {
    try {
      // Refresh cache if it's stale
      if (!this.lastCacheUpdate || (Date.now() - this.lastCacheUpdate.getTime()) > this.cacheTimeout) {
        await this.loadReportsIntoCache();
      }
      
      // Convert cache to array
      const reports = Array.from(this.reportCache.values()).map(item => item.report);
      
      // Sort by creation time (newest first)
      reports.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
      
      logger.debug('Loaded reports', { count: reports.length });
      
      return reports;
      
    } catch (error) {
      logger.error('Failed to load reports:', error);
      return [];
    }
  }
  
  /**
   * Get report by ID
   */
  async getReport(reportId) {
    try {
      // Check cache first
      const cached = this.reportCache.get(reportId);
      if (cached) {
        return { ...cached.report };
      }
      
      // Try to load from disk if not in cache
      const filename = `${reportId}${this.reportExtension}`;
      const filePath = join(this.reportsDir, filename);
      
      try {
        await access(filePath, constants.R_OK);
        const content = await readFile(filePath, 'utf8');
        const report = JSON.parse(content);
        
        if (this.validateReport(report)) {
          // Add to cache
          this.reportCache.set(reportId, {
            report,
            filePath,
            lastModified: new Date()
          });
          
          return { ...report };
        }
      } catch {
        // File doesn't exist or is invalid
      }
      
      return null;
      
    } catch (error) {
      logger.error('Failed to get report:', { reportId, error });
      return null;
    }
  }
  
  /**
   * Update report title
   */
  async updateReportTitle(reportId, newTitle) {
    try {
      const report = await this.getReport(reportId);
      if (!report) {
        throw new Error(`Report ${reportId} not found`);
      }
      
      // Validate title
      if (!newTitle || newTitle.trim() === '') {
        throw new Error('Title cannot be empty');
      }
      
      // Update title
      report.title = newTitle.trim();
      report.metadata.savedAt = new Date().toISOString();
      
      // Save updated report
      const updatedReport = await this.saveReport(report);
      
      logger.info('Report title updated', {
        reportId,
        newTitle
      });
      
      return updatedReport;
      
    } catch (error) {
      logger.error('Failed to update report title:', { reportId, newTitle, error });
      throw error;
    }
  }
  
  /**
   * Delete report
   */
  async deleteReport(reportId) {
    try {
      const cached = this.reportCache.get(reportId);
      
      // Remove from disk
      const filename = `${reportId}${this.reportExtension}`;
      const filePath = cached?.filePath || join(this.reportsDir, filename);
      
      try {
        await unlink(filePath);
      } catch (error) {
        if (error.code !== 'ENOENT') {
          throw error;
        }
        // File doesn't exist, that's fine
      }
      
      // Remove from cache
      this.reportCache.delete(reportId);
      
      logger.info('Report deleted', { reportId });
      
      return true;
      
    } catch (error) {
      logger.error('Failed to delete report:', { reportId, error });
      throw error;
    }
  }
  
  /**
   * Save unsaved session data for cross-reboot recovery
   */
  async saveUnsavedSession(unsavedSessionData) {
    try {
      const data = {
        ...unsavedSessionData,
        savedAt: new Date().toISOString()
      };
      
      await writeFile(this.unsavedSessionFile, JSON.stringify(data, null, 2), 'utf8');
      
      logger.debug('Saved unsaved session data for recovery', {
        sessionId: data.sessionId,
        title: data.title
      });
      
      return true;
      
    } catch (error) {
      logger.error('Failed to save unsaved session data:', error);
      throw error;
    }
  }
  
  /**
   * Load unsaved session data for recovery
   */
  async loadUnsavedSession() {
    try {
      await access(this.unsavedSessionFile, constants.R_OK);
      const content = await readFile(this.unsavedSessionFile, 'utf8');
      const data = JSON.parse(content);
      
      logger.debug('Loaded unsaved session data for recovery', {
        sessionId: data.sessionId,
        title: data.title,
        savedAt: data.savedAt
      });
      
      return data;
      
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File doesn't exist, that's normal
        return null;
      }
      
      logger.error('Failed to load unsaved session data:', error);
      throw error;
    }
  }
  
  /**
   * Clear unsaved session data
   */
  async clearUnsavedSession() {
    try {
      await unlink(this.unsavedSessionFile);
      logger.debug('Cleared unsaved session data');
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File doesn't exist, that's fine
        return true;
      }
      
      logger.error('Failed to clear unsaved session data:', error);
      throw error;
    }
  }
  
  /**
   * Get storage statistics
   */
  async getStorageStats() {
    try {
      const reports = await this.loadReports();
      
      // Calculate storage usage
      let totalSize = 0;
      for (const cached of this.reportCache.values()) {
        try {
          const content = await readFile(cached.filePath, 'utf8');
          totalSize += Buffer.byteLength(content, 'utf8');
        } catch (error) {
          logger.debug('Could not get file size:', { filePath: cached.filePath });
        }
      }
      
      // Calculate date range
      let oldestReport = null;
      let newestReport = null;
      
      if (reports.length > 0) {
        const sortedReports = [...reports].sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
        oldestReport = sortedReports[0];
        newestReport = sortedReports[sortedReports.length - 1];
      }
      
      return {
        reportCount: reports.length,
        totalSizeBytes: totalSize,
        totalSizeMB: Math.round(totalSize / 1024 / 1024 * 100) / 100,
        oldestReport: oldestReport ? {
          id: oldestReport.id,
          title: oldestReport.title,
          startTime: oldestReport.startTime
        } : null,
        newestReport: newestReport ? {
          id: newestReport.id,
          title: newestReport.title,
          startTime: newestReport.startTime
        } : null,
        storageDir: this.storageDir
      };
      
    } catch (error) {
      logger.error('Failed to get storage stats:', error);
      return {
        reportCount: 0,
        totalSizeBytes: 0,
        totalSizeMB: 0,
        oldestReport: null,
        newestReport: null,
        storageDir: this.storageDir,
        error: error.message
      };
    }
  }
  
  /**
   * Export report data
   */
  async exportReport(reportId, format = 'json') {
    try {
      const report = await this.getReport(reportId);
      if (!report) {
        throw new Error(`Report ${reportId} not found`);
      }
      
      switch (format.toLowerCase()) {
        case 'json':
          return {
            data: JSON.stringify(report, null, 2),
            mimeType: 'application/json',
            filename: `timelapse-${report.title}-${report.id}.json`
          };
          
        // Could add CSV, PDF, etc. formats in the future
        default:
          throw new Error(`Unsupported export format: ${format}`);
      }
      
    } catch (error) {
      logger.error('Failed to export report:', { reportId, format, error });
      throw error;
    }
  }
  
  /**
   * Cleanup old reports based on age or count
   */
  async cleanupOldReports(options = {}) {
    const {
      maxAge = 90, // days
      maxCount = 100,
      dryRun = false
    } = options;
    
    try {
      const reports = await this.loadReports();
      
      // Filter reports for cleanup
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - maxAge);
      
      // Sort by date (oldest first)
      const sortedReports = [...reports].sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
      
      let reportsToDelete = [];
      
      // Delete by age
      reportsToDelete = reportsToDelete.concat(
        sortedReports.filter(report => new Date(report.startTime) < cutoffDate)
      );
      
      // Delete by count (keep only the newest maxCount reports)
      if (sortedReports.length > maxCount) {
        const excessCount = sortedReports.length - maxCount;
        reportsToDelete = reportsToDelete.concat(
          sortedReports.slice(0, excessCount)
        );
      }
      
      // Remove duplicates
      const uniqueReportsToDelete = Array.from(
        new Map(reportsToDelete.map(r => [r.id, r])).values()
      );
      
      if (dryRun) {
        logger.info('Cleanup dry run', {
          totalReports: reports.length,
          reportsToDelete: uniqueReportsToDelete.length,
          maxAge,
          maxCount
        });
        
        return {
          totalReports: reports.length,
          reportsToDelete: uniqueReportsToDelete.length,
          reports: uniqueReportsToDelete.map(r => ({ id: r.id, title: r.title, startTime: r.startTime }))
        };
      }
      
      // Actually delete reports
      let deletedCount = 0;
      for (const report of uniqueReportsToDelete) {
        try {
          await this.deleteReport(report.id);
          deletedCount++;
        } catch (error) {
          logger.warn('Failed to delete report during cleanup:', { reportId: report.id, error });
        }
      }
      
      logger.info('Cleanup completed', {
        totalReports: reports.length,
        deletedCount,
        remainingReports: reports.length - deletedCount
      });
      
      return {
        totalReports: reports.length,
        deletedCount,
        remainingReports: reports.length - deletedCount
      };
      
    } catch (error) {
      logger.error('Failed to cleanup old reports:', error);
      throw error;
    }
  }
  
  /**
   * Cleanup resources
   */
  async cleanup() {
    // Clear cache
    this.reportCache.clear();
    this.lastCacheUpdate = null;
    
    logger.info('TimelapseReportManager cleanup complete');
  }
}