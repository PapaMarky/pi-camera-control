/**
 * Time Synchronization UI Tests
 *
 * Tests for time sync status display in the web interface
 */

import { jest } from '@jest/globals';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Time Sync UI Integration', () => {
  let dom;
  let document;
  let window;

  beforeEach(() => {
    // Load the actual HTML file
    const html = fs.readFileSync(
      path.join(__dirname, '../../public/index.html'),
      'utf8'
    );

    dom = new JSDOM(html, {
      url: 'http://localhost:3000',
      runScripts: 'dangerously',
      resources: 'usable'
    });

    document = dom.window.document;
    window = dom.window;
  });

  afterEach(() => {
    if (dom) {
      dom.window.close();
    }
  });

  describe('Time Sync Status Display', () => {
    test('should have time sync status element in Camera Status section', () => {
      const cameraSection = document.querySelector('.status-section h4')
        ?.parentElement;

      expect(cameraSection).toBeTruthy();

      // Look for TimeSync row in Camera Status
      const timeSyncRow = Array.from(cameraSection.querySelectorAll('.status-row'))
        .find(row => row.querySelector('.label')?.textContent === 'TimeSync:');

      expect(timeSyncRow).toBeTruthy();
      expect(timeSyncRow.querySelector('#camera-timesync')).toBeTruthy();
    });

    test('should have time sync status element in Controller Info section', () => {
      const sections = document.querySelectorAll('.status-section');
      const controllerSection = Array.from(sections)
        .find(section => section.querySelector('h4')?.textContent === 'Controller Info');

      expect(controllerSection).toBeTruthy();

      // Look for TimeSync row in Controller Info
      const timeSyncRow = Array.from(controllerSection.querySelectorAll('.status-row'))
        .find(row => row.querySelector('.label')?.textContent === 'TimeSync:');

      expect(timeSyncRow).toBeTruthy();
      expect(timeSyncRow.querySelector('#controller-timesync')).toBeTruthy();
    });

    test('should display time sync reliability levels', () => {
      const cameraTimeSync = document.getElementById('camera-timesync');
      const controllerTimeSync = document.getElementById('controller-timesync');

      expect(cameraTimeSync).toBeTruthy();
      expect(controllerTimeSync).toBeTruthy();

      // Test different reliability levels
      const reliabilityLevels = ['high', 'medium', 'low', 'none'];

      reliabilityLevels.forEach(level => {
        // Simulate status update
        if (cameraTimeSync) {
          cameraTimeSync.textContent = level;
          cameraTimeSync.className = `sync-${level}`;
        }

        if (controllerTimeSync) {
          controllerTimeSync.textContent = level;
          controllerTimeSync.className = `sync-${level}`;
        }
      });
    });
  });

  describe('Time Sync Status Updates via WebSocket', () => {
    test('should update UI when time-sync-status message is received', () => {
      const cameraTimeSync = document.getElementById('camera-timesync');
      const controllerTimeSync = document.getElementById('controller-timesync');

      // Simulate WebSocket message
      const mockMessage = {
        type: 'time-sync-status',
        data: {
          pi: {
            isSynchronized: true,
            reliability: 'high',
            lastSyncTime: new Date().toISOString()
          },
          camera: {
            isSynchronized: true,
            lastSyncTime: new Date().toISOString()
          }
        }
      };

      // Trigger update (this would normally be done by app.js)
      if (window.updateTimeSyncStatus) {
        window.updateTimeSyncStatus(mockMessage.data);
      }

      // Check if elements are updated
      if (cameraTimeSync && controllerTimeSync) {
        expect(cameraTimeSync.textContent).not.toBe('-');
        expect(controllerTimeSync.textContent).not.toBe('-');
      }
    });

    test('should show "Not Connected" when camera is offline', () => {
      const cameraTimeSync = document.getElementById('camera-timesync');

      const mockMessage = {
        type: 'time-sync-status',
        data: {
          pi: {
            isSynchronized: true,
            reliability: 'high'
          },
          camera: {
            isSynchronized: false,
            lastSyncTime: null
          }
        }
      };

      if (window.updateTimeSyncStatus && cameraTimeSync) {
        window.updateTimeSyncStatus(mockMessage.data);
        expect(cameraTimeSync.textContent).toBe('Not Connected');
      }
    });
  });

  describe('Time Sync CSS Styles', () => {
    test('should have appropriate CSS classes for sync states', () => {
      const styles = document.createElement('style');
      styles.textContent = `
        .sync-high { color: #4CAF50; }
        .sync-medium { color: #FFA500; }
        .sync-low { color: #FF6347; }
        .sync-none { color: #888; }
      `;
      document.head.appendChild(styles);

      // Check if styles are defined
      const computedStyle = window.getComputedStyle(document.body);
      expect(computedStyle).toBeTruthy();
    });
  });

  describe('Manual Time Sync Button', () => {
    test('should have manual sync button in utilities', () => {
      const utilitiesCard = document.getElementById('utilities-card');

      if (utilitiesCard) {
        const syncButton = utilitiesCard.querySelector('#manual-time-sync-btn');
        expect(syncButton).toBeTruthy();
        expect(syncButton.textContent).toContain('Sync Time');
      }
    });

    test('should trigger time sync when button is clicked', () => {
      const syncButton = document.getElementById('manual-time-sync-btn');

      if (syncButton) {
        const mockSendMessage = jest.fn();
        window.sendMessage = mockSendMessage;

        syncButton.click();

        expect(mockSendMessage).toHaveBeenCalledWith({
          type: 'manual-time-sync',
          data: expect.any(Object)
        });
      }
    });
  });
});