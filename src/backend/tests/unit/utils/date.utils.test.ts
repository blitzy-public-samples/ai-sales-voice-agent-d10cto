/**
 * @fileoverview Unit tests for date utility functions
 * Tests business hours validation, date formatting, and timezone handling
 * @version 1.0.0
 */

import {
  isBusinessHours,
  formatCallDate,
  isValidDateRange,
  getNextBusinessDay,
  calculateCallDuration,
} from '../../../src/utils/date.utils';

describe('Date Utilities', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    process.env.TZ = 'UTC';
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('isBusinessHours', () => {
    it('should return true for time within business hours (9 AM - 5 PM)', () => {
      const date = new Date('2024-01-15T14:30:00Z'); // 2:30 PM UTC
      expect(isBusinessHours(date, 'UTC')).toBe(true);
    });

    it('should return false for time outside business hours', () => {
      const date = new Date('2024-01-15T06:30:00Z'); // 6:30 AM UTC
      expect(isBusinessHours(date, 'UTC')).toBe(false);
    });

    it('should handle timezone conversions correctly', () => {
      const date = new Date('2024-01-15T14:30:00Z'); // 9:30 AM EST
      expect(isBusinessHours(date, 'America/New_York')).toBe(true);
    });

    it('should handle DST transitions correctly', () => {
      const dstDate = new Date('2024-03-10T14:30:00Z'); // During DST
      expect(isBusinessHours(dstDate, 'America/New_York')).toBe(true);
    });

    it('should throw error for invalid date', () => {
      expect(() => isBusinessHours(new Date('invalid'), 'UTC')).toThrow('Invalid date input provided');
    });

    it('should throw error for invalid timezone', () => {
      const date = new Date();
      expect(() => isBusinessHours(date, 'Invalid/Timezone')).toThrow('Invalid timezone identifier provided');
    });
  });

  describe('formatCallDate', () => {
    it('should format date in ISO8601 format with milliseconds', () => {
      const date = new Date('2024-01-15T14:30:00.123Z');
      const formatted = formatCallDate(date);
      expect(formatted).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$/);
    });

    it('should preserve millisecond precision', () => {
      const date = new Date('2024-01-15T14:30:00.123Z');
      const formatted = formatCallDate(date);
      expect(formatted).toContain('.123');
    });

    it('should include timezone offset', () => {
      const date = new Date('2024-01-15T14:30:00Z');
      const formatted = formatCallDate(date);
      expect(formatted).toMatch(/[+-]\d{2}:\d{2}$/);
    });

    it('should throw error for invalid date', () => {
      expect(() => formatCallDate(new Date('invalid'))).toThrow('Invalid date input provided');
    });
  });

  describe('isValidDateRange', () => {
    it('should return true for date within range', () => {
      const date = new Date('2024-01-15T14:30:00Z');
      const start = new Date('2024-01-01T00:00:00Z');
      const end = new Date('2024-01-31T23:59:59Z');
      expect(isValidDateRange(date, start, end)).toBe(true);
    });

    it('should return false for date outside range', () => {
      const date = new Date('2024-02-15T14:30:00Z');
      const start = new Date('2024-01-01T00:00:00Z');
      const end = new Date('2024-01-31T23:59:59Z');
      expect(isValidDateRange(date, start, end)).toBe(false);
    });

    it('should handle exact boundary conditions', () => {
      const date = new Date('2024-01-01T00:00:00Z');
      const start = new Date('2024-01-01T00:00:00Z');
      const end = new Date('2024-01-31T23:59:59Z');
      expect(isValidDateRange(date, start, end)).toBe(true);
    });

    it('should throw error for invalid range (start after end)', () => {
      const date = new Date('2024-01-15T14:30:00Z');
      const start = new Date('2024-01-31T00:00:00Z');
      const end = new Date('2024-01-01T00:00:00Z');
      expect(() => isValidDateRange(date, start, end)).toThrow('Invalid date range: start date must be before end date');
    });
  });

  describe('getNextBusinessDay', () => {
    it('should return next day for weekday', () => {
      const date = new Date('2024-01-15T14:30:00Z'); // Tuesday
      const nextDay = getNextBusinessDay(date, 'UTC');
      expect(nextDay.getDate()).toBe(16); // Wednesday
    });

    it('should skip weekends', () => {
      const friday = new Date('2024-01-19T14:30:00Z'); // Friday
      const nextDay = getNextBusinessDay(friday, 'UTC');
      expect(nextDay.getDate()).toBe(22); // Monday
    });

    it('should handle month transitions', () => {
      const lastDay = new Date('2024-01-31T14:30:00Z'); // Wednesday
      const nextDay = getNextBusinessDay(lastDay, 'UTC');
      expect(nextDay.getMonth()).toBe(1); // February
      expect(nextDay.getDate()).toBe(1);
    });

    it('should handle timezone transitions', () => {
      const date = new Date('2024-01-15T23:30:00Z');
      const nextDay = getNextBusinessDay(date, 'America/New_York');
      expect(nextDay.getUTCDate()).toBe(17); // Accounts for timezone
    });

    it('should throw error for invalid date', () => {
      expect(() => getNextBusinessDay(new Date('invalid'), 'UTC')).toThrow('Invalid date input provided');
    });
  });

  describe('calculateCallDuration', () => {
    it('should calculate duration in seconds', () => {
      const start = new Date('2024-01-15T14:30:00.000Z');
      const end = new Date('2024-01-15T14:35:30.000Z');
      expect(calculateCallDuration(start, end)).toBe(330); // 5m30s = 330s
    });

    it('should handle millisecond precision', () => {
      const start = new Date('2024-01-15T14:30:00.123Z');
      const end = new Date('2024-01-15T14:30:01.234Z');
      expect(calculateCallDuration(start, end)).toBe(1); // Rounds to nearest second
    });

    it('should handle zero duration', () => {
      const date = new Date('2024-01-15T14:30:00.000Z');
      expect(calculateCallDuration(date, date)).toBe(0);
    });

    it('should throw error for negative duration', () => {
      const start = new Date('2024-01-15T14:30:00Z');
      const end = new Date('2024-01-15T14:29:00Z');
      expect(() => calculateCallDuration(end, start)).toThrow('Invalid duration calculation: end time before start time');
    });

    it('should throw error for invalid timestamps', () => {
      const validDate = new Date('2024-01-15T14:30:00Z');
      expect(() => calculateCallDuration(new Date('invalid'), validDate)).toThrow('Invalid date input provided');
      expect(() => calculateCallDuration(validDate, new Date('invalid'))).toThrow('Invalid date input provided');
    });
  });
});