// @googleapis/calendar v3.0.0 - Google Calendar API type definitions
import { calendar_v3 } from '@googleapis/calendar';

/**
 * Configuration interface for Google Calendar service integration
 * Includes OAuth2.0 credentials and calendar settings
 */
export interface CalendarServiceConfig {
  clientId: string;
  clientSecret: string;
  calendarId: string;
  timeZone: string;
  refreshToken: string;
}

/**
 * Represents an available meeting time slot with timezone support
 * Used for presenting available meeting options to prospects
 */
export interface MeetingSlot {
  startTime: Date;
  endTime: Date;
  available: boolean;
  timeZone: string;
}

/**
 * Comprehensive meeting request interface for scheduling
 * Contains all necessary details for creating a calendar event
 */
export interface MeetingRequest {
  contactName: string;
  contactEmail: string;
  practiceName: string;
  startTime: Date;
  duration: number; // Duration in minutes
  timeZone: string;
  virtualMeeting: boolean;
  notes: string;
}

/**
 * Meeting scheduling response interface
 * Contains confirmation details and meeting access information
 */
export interface MeetingResponse {
  eventId: string;
  meetingUrl: string;
  startTime: Date;
  endTime: Date;
  timeZone: string;
  attendees: string[];
  status: string;
}

/**
 * Enumeration of possible calendar operation errors
 * Used for comprehensive error handling across the calendar service
 */
export enum CalendarError {
  AUTH_FAILED = 'Authentication failed or token expired',
  SLOT_UNAVAILABLE = 'Requested time slot is not available',
  INVALID_REQUEST = 'Invalid meeting request parameters',
  API_ERROR = 'Google Calendar API error',
  RATE_LIMIT_EXCEEDED = 'Calendar API rate limit exceeded',
  TIMEZONE_MISMATCH = 'Timezone conflict in meeting request'
}

/**
 * Calendar service interface defining core operations
 * Implements Google Calendar integration functionality
 */
export interface CalendarServiceInterface {
  /**
   * Retrieves available meeting slots within a date range
   * @param startDate Beginning of the search range
   * @param endDate End of the search range
   * @param timeZone Timezone for the slots
   * @returns Promise resolving to array of available meeting slots
   */
  getAvailableSlots(
    startDate: Date,
    endDate: Date,
    timeZone: string
  ): Promise<MeetingSlot[]>;

  /**
   * Schedules a meeting based on the provided request
   * @param request Meeting request details
   * @returns Promise resolving to meeting confirmation
   */
  scheduleMeeting(request: MeetingRequest): Promise<MeetingResponse>;

  /**
   * Cancels a previously scheduled meeting
   * @param eventId Google Calendar event ID
   * @returns Promise resolving when cancellation is complete
   */
  cancelMeeting(eventId: string): Promise<void>;

  /**
   * Refreshes OAuth2.0 authentication token
   * @param refreshToken Valid refresh token
   * @returns Promise resolving when token is refreshed
   */
  refreshAuth(refreshToken: string): Promise<void>;
}

// Export calendar_v3 types for use in implementation
export type CalendarEvent = calendar_v3.Schema$Event;
export type CalendarEventDateTime = calendar_v3.Schema$EventDateTime;
export type CalendarAttendee = calendar_v3.Schema$EventAttendee;