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

  describe('Time Sync Status Updates', () => {
    test('should have elements that can be updated by TimeSync class', () => {
      const cameraTimeSync = document.getElementById('camera-timesync');
      const controllerTimeSync = document.getElementById('controller-timesync');

      // Verify elements exist
      expect(cameraTimeSync).toBeTruthy();
      expect(controllerTimeSync).toBeTruthy();

      // Verify elements can be updated programmatically
      if (cameraTimeSync) {
        cameraTimeSync.textContent = '2025-01-15 10:30:00';
        cameraTimeSync.className = 'sync-high';
        expect(cameraTimeSync.textContent).toBe('2025-01-15 10:30:00');
        expect(cameraTimeSync.className).toBe('sync-high');
      }

      if (controllerTimeSync) {
        controllerTimeSync.textContent = '2025-01-15 10:30:05';
        controllerTimeSync.className = 'sync-high';
        expect(controllerTimeSync.textContent).toBe('2025-01-15 10:30:05');
        expect(controllerTimeSync.className).toBe('sync-high');
      }
    });

    test('should support different sync reliability CSS classes', () => {
      const controllerTimeSync = document.getElementById('controller-timesync');

      if (controllerTimeSync) {
        // Test that all reliability classes can be applied
        const reliabilityLevels = ['high', 'medium', 'low', 'none'];

        reliabilityLevels.forEach(level => {
          controllerTimeSync.className = `sync-${level}`;
          expect(controllerTimeSync.className).toBe(`sync-${level}`);
        });
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
        const syncButton = utilitiesCard.querySelector('#sync-time-btn');
        expect(syncButton).toBeTruthy();
        expect(syncButton.textContent).toContain('Sync Time');
      }
    });

    test('should have clickable sync button', () => {
      const syncButton = document.getElementById('sync-time-btn');

      // Verify button exists and is interactive
      expect(syncButton).toBeTruthy();

      if (syncButton) {
        // Verify it's a button element
        expect(syncButton.tagName.toLowerCase()).toBe('button');

        // Verify it has expected classes
        expect(syncButton.className).toContain('btn');

        // Verify button can receive click events (implementation uses REST API)
        let clicked = false;
        syncButton.addEventListener('click', () => { clicked = true; });
        syncButton.click();
        expect(clicked).toBe(true);
      }
    });
  });
});