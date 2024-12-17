/**
 * @file Calendar Integration Entry Point
 * @version 1.0.0
 * @description Exports Google Calendar service and related types for DocShield's automated meeting scheduling
 */

import { GoogleCalendarService } from './google-calendar.service';
import {
  CalendarServiceConfig,
  MeetingSlot,
  MeetingRequest,
  MeetingResponse,
  CalendarError,
  CalendarEvent,
  CalendarEventDateTime,
  CalendarAttendee,
  CalendarServiceInterface
} from './types';

// Re-export all calendar-related types for external use
export {
  // Main service class
  GoogleCalendarService,
  
  // Configuration and interface types
  CalendarServiceConfig,
  CalendarServiceInterface,
  
  // Meeting-related types
  MeetingSlot,
  MeetingRequest,
  MeetingResponse,
  
  // Calendar event types
  CalendarEvent,
  CalendarEventDateTime,
  CalendarAttendee,
  
  // Error types
  CalendarError
};

/**
 * Creates a new instance of the Google Calendar service with the provided configuration
 * @param config Calendar service configuration including OAuth credentials
 * @returns Configured GoogleCalendarService instance
 */
export function createCalendarService(config: CalendarServiceConfig): GoogleCalendarService {
  return new GoogleCalendarService(config);
}

/**
 * Default configuration factory for development environment
 * @returns CalendarServiceConfig with development defaults
 */
export function createDevConfig(): CalendarServiceConfig {
  if (process.env.NODE_ENV !== 'development') {
    throw new Error('Development configuration can only be used in development environment');
  }

  return {
    clientId: process.env.GOOGLE_CALENDAR_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET || '',
    calendarId: process.env.GOOGLE_CALENDAR_ID || '',
    timeZone: process.env.DEFAULT_TIMEZONE || 'America/New_York',
    refreshToken: process.env.GOOGLE_CALENDAR_REFRESH_TOKEN || ''
  };
}

/**
 * Validates a calendar service configuration
 * @param config Configuration to validate
 * @returns True if configuration is valid
 * @throws Error if configuration is invalid
 */
export function validateConfig(config: CalendarServiceConfig): boolean {
  if (!config.clientId || !config.clientSecret) {
    throw new Error(CalendarError.AUTH_FAILED);
  }
  if (!config.calendarId) {
    throw new Error(CalendarError.INVALID_REQUEST);
  }
  if (!config.timeZone) {
    throw new Error(CalendarError.TIMEZONE_MISMATCH);
  }
  if (!config.refreshToken) {
    throw new Error(CalendarError.AUTH_FAILED);
  }
  return true;
}

/**
 * Default business hours configuration
 * Used for filtering available meeting slots
 */
export const DEFAULT_BUSINESS_HOURS = {
  start: 9, // 9 AM
  end: 17,  // 5 PM
  timezone: 'America/New_York',
  excludeWeekends: true
};

/**
 * Default meeting duration in minutes
 */
export const DEFAULT_MEETING_DURATION = 30;

/**
 * Calendar API version information
 */
export const CALENDAR_API_VERSION = {
  googleapis: '3.0.0',
  googleAuthLibrary: '8.0.0',
  implementation: '1.0.0'
};

/**
 * Calendar service error codes mapped to HTTP status codes
 */
export const CALENDAR_ERROR_STATUS_CODES = {
  [CalendarError.AUTH_FAILED]: 401,
  [CalendarError.SLOT_UNAVAILABLE]: 409,
  [CalendarError.INVALID_REQUEST]: 400,
  [CalendarError.API_ERROR]: 500,
  [CalendarError.RATE_LIMIT_EXCEEDED]: 429,
  [CalendarError.TIMEZONE_MISMATCH]: 400
};

// Export default instance for convenience
export default GoogleCalendarService;