/**
 * @fileoverview Date utility functions for DocShield AI Voice Agent system
 * Handles business hours validation, date formatting, and timezone conversions
 * @version 1.0.0
 */

import { format, isWithinInterval, isWeekend } from 'date-fns'; // v2.30.0
import { zonedTimeToUtc } from 'date-fns-tz'; // v2.0.0
import { Logger } from 'winston';

// Initialize logger (assuming winston logger is configured elsewhere)
const logger: Logger = require('./logger').getLogger('date.utils');

/**
 * Error messages for date utilities
 */
const ERROR_MESSAGES = {
  INVALID_DATE: 'Invalid date input provided',
  INVALID_TIMEZONE: 'Invalid timezone identifier provided',
  INVALID_DATE_RANGE: 'Invalid date range: start date must be before end date',
  NEGATIVE_DURATION: 'Invalid duration calculation: end time before start time',
} as const;

/**
 * Business hours configuration
 */
const BUSINESS_HOURS = {
  START: 9, // 9 AM
  END: 17, // 5 PM
} as const;

/**
 * Validates if the current time falls within business hours (9 AM - 5 PM)
 * in the specified timezone
 * 
 * @param {Date} date - Date object to validate
 * @param {string} timezone - IANA timezone identifier (e.g., 'America/New_York')
 * @returns {boolean} True if within business hours, false otherwise
 * @throws {Error} If invalid date or timezone provided
 */
export function isBusinessHours(date: Date, timezone: string): boolean {
  try {
    // Validate inputs
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
      throw new Error(ERROR_MESSAGES.INVALID_DATE);
    }

    if (!timezone || typeof timezone !== 'string') {
      throw new Error(ERROR_MESSAGES.INVALID_TIMEZONE);
    }

    // Convert to timezone-aware date
    const zonedDate = zonedTimeToUtc(date, timezone);
    const hours = zonedDate.getHours();

    // Check if within business hours
    const isWithinHours = hours >= BUSINESS_HOURS.START && hours < BUSINESS_HOURS.END;

    logger.debug(`Business hours check: ${isWithinHours}`, {
      date: date.toISOString(),
      timezone,
      hours,
    });

    return isWithinHours;
  } catch (error) {
    logger.error('Error in isBusinessHours:', {
      error: error.message,
      date: date?.toISOString(),
      timezone,
    });
    throw error;
  }
}

/**
 * Formats dates for call records using ISO format with timezone information
 * 
 * @param {Date} date - Date to format
 * @returns {string} ISO formatted date string with timezone
 * @throws {Error} If invalid date provided
 */
export function formatCallDate(date: Date): string {
  try {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
      throw new Error(ERROR_MESSAGES.INVALID_DATE);
    }

    const formattedDate = format(date, "yyyy-MM-dd'T'HH:mm:ss.SSSxxx");

    logger.debug(`Formatted call date: ${formattedDate}`, {
      originalDate: date.toISOString(),
    });

    return formattedDate;
  } catch (error) {
    logger.error('Error in formatCallDate:', {
      error: error.message,
      date: date?.toISOString(),
    });
    throw error;
  }
}

/**
 * Validates if a date falls within a specified range with timezone awareness
 * 
 * @param {Date} date - Date to validate
 * @param {Date} startDate - Start of date range
 * @param {Date} endDate - End of date range
 * @returns {boolean} True if date is within range, false otherwise
 * @throws {Error} If invalid dates provided or invalid range
 */
export function isValidDateRange(date: Date, startDate: Date, endDate: Date): boolean {
  try {
    // Validate all inputs are valid dates
    [date, startDate, endDate].forEach(d => {
      if (!d || !(d instanceof Date) || isNaN(d.getTime())) {
        throw new Error(ERROR_MESSAGES.INVALID_DATE);
      }
    });

    // Ensure start date is before end date
    if (startDate >= endDate) {
      throw new Error(ERROR_MESSAGES.INVALID_DATE_RANGE);
    }

    const isWithinRange = isWithinInterval(date, { start: startDate, end: endDate });

    logger.debug(`Date range validation: ${isWithinRange}`, {
      date: date.toISOString(),
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    });

    return isWithinRange;
  } catch (error) {
    logger.error('Error in isValidDateRange:', {
      error: error.message,
      date: date?.toISOString(),
      startDate: startDate?.toISOString(),
      endDate: endDate?.toISOString(),
    });
    throw error;
  }
}

/**
 * Calculates the next available business day, accounting for weekends
 * 
 * @param {Date} currentDate - Current date
 * @param {string} timezone - IANA timezone identifier
 * @returns {Date} Next available business day
 * @throws {Error} If invalid date or timezone provided
 */
export function getNextBusinessDay(currentDate: Date, timezone: string): Date {
  try {
    if (!currentDate || !(currentDate instanceof Date) || isNaN(currentDate.getTime())) {
      throw new Error(ERROR_MESSAGES.INVALID_DATE);
    }

    if (!timezone || typeof timezone !== 'string') {
      throw new Error(ERROR_MESSAGES.INVALID_TIMEZONE);
    }

    // Convert to timezone-aware date
    let nextDay = zonedTimeToUtc(currentDate, timezone);
    nextDay.setDate(nextDay.getDate() + 1);

    // Skip weekends
    while (isWeekend(nextDay)) {
      nextDay.setDate(nextDay.getDate() + 1);
    }

    logger.debug(`Next business day calculated`, {
      currentDate: currentDate.toISOString(),
      nextBusinessDay: nextDay.toISOString(),
      timezone,
    });

    return nextDay;
  } catch (error) {
    logger.error('Error in getNextBusinessDay:', {
      error: error.message,
      currentDate: currentDate?.toISOString(),
      timezone,
    });
    throw error;
  }
}

/**
 * Calculates the duration between two timestamps in seconds
 * 
 * @param {Date} startTime - Call start timestamp
 * @param {Date} endTime - Call end timestamp
 * @returns {number} Duration in seconds
 * @throws {Error} If invalid timestamps provided or negative duration
 */
export function calculateCallDuration(startTime: Date, endTime: Date): number {
  try {
    // Validate inputs
    [startTime, endTime].forEach(time => {
      if (!time || !(time instanceof Date) || isNaN(time.getTime())) {
        throw new Error(ERROR_MESSAGES.INVALID_DATE);
      }
    });

    // Calculate duration
    const durationMs = endTime.getTime() - startTime.getTime();

    if (durationMs < 0) {
      throw new Error(ERROR_MESSAGES.NEGATIVE_DURATION);
    }

    const durationSeconds = Math.round(durationMs / 1000);

    logger.debug(`Call duration calculated: ${durationSeconds}s`, {
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      durationSeconds,
    });

    return durationSeconds;
  } catch (error) {
    logger.error('Error in calculateCallDuration:', {
      error: error.message,
      startTime: startTime?.toISOString(),
      endTime: endTime?.toISOString(),
    });
    throw error;
  }
}