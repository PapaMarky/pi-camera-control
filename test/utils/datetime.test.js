/**
 * Tests for Date/Time Utility Functions
 */

import { toLocalISOString, toFilenameFormat, toReportFormat } from '../../src/utils/datetime.js';

describe('DateTime Utilities', () => {
  describe('toLocalISOString', () => {
    test('formats Date object with timezone offset', () => {
      const date = new Date('2024-01-15T10:30:45.123Z');
      const result = toLocalISOString(date);

      // Should match format: YYYY-MM-DDTHH:mm:ss.sss+HH:mm
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$/);

      // Should include milliseconds
      expect(result).toContain('.123');

      // Should include timezone offset
      expect(result).toMatch(/[+-]\d{2}:\d{2}$/);
    });

    test('handles string input and converts to Date', () => {
      const dateString = '2024-01-15T10:30:45.123Z';
      const result = toLocalISOString(dateString);

      // Should successfully parse and format
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$/);
    });

    test('handles timestamp number input', () => {
      const timestamp = Date.parse('2024-01-15T10:30:45.123Z');
      const result = toLocalISOString(timestamp);

      // Should successfully parse and format
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$/);
    });

    test('preserves local timezone information', () => {
      const date = new Date('2024-01-15T10:30:45.123Z');
      const result = toLocalISOString(date);

      // Extract timezone from result
      const tzMatch = result.match(/([+-]\d{2}:\d{2})$/);
      expect(tzMatch).toBeTruthy();

      // Calculate expected timezone
      const tzOffset = -date.getTimezoneOffset();
      const tzSign = tzOffset >= 0 ? '+' : '-';
      const tzHours = String(Math.floor(Math.abs(tzOffset) / 60)).padStart(2, '0');
      const tzMinutes = String(Math.abs(tzOffset) % 60).padStart(2, '0');
      const expectedTz = `${tzSign}${tzHours}:${tzMinutes}`;

      expect(tzMatch[1]).toBe(expectedTz);
    });

    test('uses local time not UTC', () => {
      const date = new Date('2024-01-15T10:30:45.123Z');
      const result = toLocalISOString(date);

      // Extract time components
      const localHours = date.getHours();
      const localMinutes = date.getMinutes();

      // Result should contain local hours and minutes, not UTC
      expect(result).toContain(`${String(localHours).padStart(2, '0')}:${String(localMinutes).padStart(2, '0')}`);
    });

    test('pads single-digit values with zeros', () => {
      const date = new Date('2024-01-05T08:05:03.007Z');
      const result = toLocalISOString(date);

      // Check that date portion is properly formatted
      expect(result).toContain('2024-01-05');

      // Milliseconds should be padded to 3 digits
      const msMatch = result.match(/\.(\d{3})/);
      expect(msMatch).toBeTruthy();
      expect(msMatch[1].length).toBe(3);
    });

    test('handles dates with zero milliseconds', () => {
      const date = new Date('2024-01-15T10:30:45.000Z');
      const result = toLocalISOString(date);

      // Should still include .000
      expect(result).toContain('.000');
    });

    test('handles negative timezone offsets', () => {
      // Create a date and check the result includes a valid timezone
      const date = new Date('2024-01-15T10:30:45.123Z');
      const result = toLocalISOString(date);

      // Timezone should be either + or -
      expect(result).toMatch(/[+-]\d{2}:\d{2}$/);
    });
  });

  describe('toFilenameFormat', () => {
    test('creates filename-safe timestamp', () => {
      const date = new Date('2024-01-15T10:30:45.123Z');
      const result = toFilenameFormat(date);

      // Should match format: YYYYMMDD-HHmmss
      expect(result).toMatch(/^\d{8}-\d{6}$/);

      // Should not contain colons, spaces, or other unsafe characters
      expect(result).not.toContain(':');
      expect(result).not.toContain(' ');
      expect(result).not.toContain('.');
    });

    test('uses local time not UTC', () => {
      const date = new Date('2024-01-15T10:30:45.123Z');
      const result = toFilenameFormat(date);

      // Extract expected local time components
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const seconds = String(date.getSeconds()).padStart(2, '0');

      const expected = `${year}${month}${day}-${hours}${minutes}${seconds}`;
      expect(result).toBe(expected);
    });

    test('handles Date object input', () => {
      const date = new Date('2024-01-15T10:30:45.123Z');
      const result = toFilenameFormat(date);

      expect(result).toMatch(/^\d{8}-\d{6}$/);
    });

    test('handles string input and converts to Date', () => {
      const dateString = '2024-01-15T10:30:45.123Z';
      const result = toFilenameFormat(dateString);

      expect(result).toMatch(/^\d{8}-\d{6}$/);
    });

    test('handles timestamp number input', () => {
      const timestamp = Date.parse('2024-01-15T10:30:45.123Z');
      const result = toFilenameFormat(timestamp);

      expect(result).toMatch(/^\d{8}-\d{6}$/);
    });

    test('pads single-digit values with zeros', () => {
      const date = new Date(2024, 0, 5, 8, 5, 3); // Jan 5, 2024, 08:05:03
      const result = toFilenameFormat(date);

      // Should be: 20240105-080503
      expect(result).toBe('20240105-080503');
    });

    test('does not include milliseconds', () => {
      const date = new Date('2024-01-15T10:30:45.999Z');
      const result = toFilenameFormat(date);

      // Should not contain milliseconds
      expect(result).not.toContain('999');
      expect(result).not.toContain('.');
    });

    test('does not include timezone information', () => {
      const date = new Date('2024-01-15T10:30:45.123Z');
      const result = toFilenameFormat(date);

      // Should not contain + or -
      expect(result).not.toContain('+');
      expect(result).not.toContain('-Z');
    });
  });

  describe('toReportFormat', () => {
    test('delegates to toLocalISOString', () => {
      const date = new Date('2024-01-15T10:30:45.123Z');
      const reportResult = toReportFormat(date);
      const isoResult = toLocalISOString(date);

      // Should produce identical output
      expect(reportResult).toBe(isoResult);
    });

    test('maintains timezone for report persistence', () => {
      const date = new Date('2024-01-15T10:30:45.123Z');
      const result = toReportFormat(date);

      // Should include timezone offset
      expect(result).toMatch(/[+-]\d{2}:\d{2}$/);
    });

    test('handles Date object input', () => {
      const date = new Date('2024-01-15T10:30:45.123Z');
      const result = toReportFormat(date);

      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$/);
    });

    test('handles string input', () => {
      const dateString = '2024-01-15T10:30:45.123Z';
      const result = toReportFormat(dateString);

      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$/);
    });

    test('handles timestamp number input', () => {
      const timestamp = Date.parse('2024-01-15T10:30:45.123Z');
      const result = toReportFormat(timestamp);

      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$/);
    });
  });

  describe('Edge Cases', () => {
    test('all functions handle invalid date strings gracefully', () => {
      const invalidDate = 'not-a-date';

      // These should create Invalid Date objects but not crash
      expect(() => toLocalISOString(invalidDate)).not.toThrow();
      expect(() => toFilenameFormat(invalidDate)).not.toThrow();
      expect(() => toReportFormat(invalidDate)).not.toThrow();

      // Results should contain NaN for invalid dates
      expect(toLocalISOString(invalidDate)).toContain('NaN');
      expect(toFilenameFormat(invalidDate)).toContain('NaN');
    });

    test('all functions handle null input', () => {
      // Should handle null by creating Invalid Date
      expect(() => toLocalISOString(null)).not.toThrow();
      expect(() => toFilenameFormat(null)).not.toThrow();
      expect(() => toReportFormat(null)).not.toThrow();
    });

    test('all functions handle undefined input', () => {
      // Should handle undefined by creating Invalid Date
      expect(() => toLocalISOString(undefined)).not.toThrow();
      expect(() => toFilenameFormat(undefined)).not.toThrow();
      expect(() => toReportFormat(undefined)).not.toThrow();
    });

    test('functions maintain consistency for same input', () => {
      const date = new Date('2024-01-15T10:30:45.123Z');

      // Multiple calls should return same result
      const result1 = toLocalISOString(date);
      const result2 = toLocalISOString(date);
      expect(result1).toBe(result2);

      const filename1 = toFilenameFormat(date);
      const filename2 = toFilenameFormat(date);
      expect(filename1).toBe(filename2);

      const report1 = toReportFormat(date);
      const report2 = toReportFormat(date);
      expect(report1).toBe(report2);
    });

    test('functions handle dates far in the past', () => {
      const oldDate = new Date('1970-01-01T00:00:00.000Z');

      expect(() => toLocalISOString(oldDate)).not.toThrow();
      expect(() => toFilenameFormat(oldDate)).not.toThrow();
      expect(() => toReportFormat(oldDate)).not.toThrow();

      // Should produce valid formats (may show 1969 or 1970 depending on timezone)
      const isoResult = toLocalISOString(oldDate);
      expect(isoResult).toMatch(/^(1969|1970)-/);
      const filenameResult = toFilenameFormat(oldDate);
      expect(filenameResult).toMatch(/^(1969|1970)/);
    });

    test('functions handle dates far in the future', () => {
      const futureDate = new Date('2099-12-31T23:59:59.999Z');

      expect(() => toLocalISOString(futureDate)).not.toThrow();
      expect(() => toFilenameFormat(futureDate)).not.toThrow();
      expect(() => toReportFormat(futureDate)).not.toThrow();

      // Should produce valid formats
      expect(toLocalISOString(futureDate)).toContain('2099');
      expect(toFilenameFormat(futureDate)).toContain('2099');
    });
  });

  describe('Integration Tests', () => {
    test('toFilenameFormat output is sortable chronologically', () => {
      const dates = [
        new Date('2024-01-15T10:30:45Z'),
        new Date('2024-01-15T09:30:45Z'),
        new Date('2024-01-16T10:30:45Z'),
        new Date('2023-12-31T23:59:59Z')
      ];

      const filenames = dates.map(d => toFilenameFormat(d));
      const sorted = [...filenames].sort();

      // When sorted as strings, should maintain chronological order
      // (at least for same timezone)
      expect(sorted[0]).toContain('2023');
      expect(sorted[sorted.length - 1]).toContain('20240116');
    });

    test('toLocalISOString can be parsed back to Date', () => {
      const originalDate = new Date('2024-01-15T10:30:45.123Z');
      const formatted = toLocalISOString(originalDate);
      const parsedDate = new Date(formatted);

      // Parsed date should represent the same moment in time
      expect(parsedDate.getTime()).toBe(originalDate.getTime());
    });

    test('all three functions work with current date', () => {
      const now = new Date();

      expect(() => toLocalISOString(now)).not.toThrow();
      expect(() => toFilenameFormat(now)).not.toThrow();
      expect(() => toReportFormat(now)).not.toThrow();

      // All should produce valid output
      expect(toLocalISOString(now)).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$/);
      expect(toFilenameFormat(now)).toMatch(/^\d{8}-\d{6}$/);
      expect(toReportFormat(now)).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$/);
    });
  });
});
