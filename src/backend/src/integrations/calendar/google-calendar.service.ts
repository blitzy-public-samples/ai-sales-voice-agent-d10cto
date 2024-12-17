import { calendar_v3 } from '@googleapis/calendar'; // v3.0.0
import { OAuth2Client } from 'google-auth-library'; // v8.0.0
import { 
  CalendarServiceConfig, 
  MeetingSlot, 
  MeetingRequest, 
  MeetingResponse,
  CalendarError,
  CalendarEvent,
  CalendarEventDateTime
} from './types';
import { CircuitBreaker, CircuitState } from '../../lib/circuit-breaker';
import { logger } from '../../lib/logger';
import { ErrorCode, ErrorCategory, BackoffType } from '../../constants/error-codes';

/**
 * Rate limiter configuration for Google Calendar API
 */
interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  tokensPerInterval: number;
}

/**
 * Token bucket implementation for rate limiting
 */
class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRate: number;

  constructor(maxTokens: number, refillRate: number) {
    this.tokens = maxTokens;
    this.maxTokens = maxTokens;
    this.refillRate = refillRate;
    this.lastRefill = Date.now();
  }

  async consumeToken(): Promise<boolean> {
    this.refill();
    if (this.tokens > 0) {
      this.tokens--;
      return true;
    }
    return false;
  }

  private refill(): void {
    const now = Date.now();
    const timePassed = now - this.lastRefill;
    const tokensToAdd = Math.floor(timePassed * this.refillRate);
    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }
}

/**
 * Enhanced Google Calendar service implementation with comprehensive error handling,
 * rate limiting, and security features for DocShield AI Voice Agent
 */
export class GoogleCalendarService {
  private readonly calendarClient: calendar_v3.Calendar;
  private readonly authClient: OAuth2Client;
  private readonly calendarId: string;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly rateLimiter: TokenBucket;
  private readonly businessHours = {
    start: 9, // 9 AM
    end: 17   // 5 PM
  };

  constructor(config: CalendarServiceConfig) {
    // Validate configuration
    this.validateConfig(config);

    // Initialize OAuth client
    this.authClient = new OAuth2Client({
      clientId: config.clientId,
      clientSecret: config.clientSecret
    });
    this.authClient.setCredentials({ refresh_token: config.refreshToken });

    // Initialize calendar client
    this.calendarClient = new calendar_v3.Calendar({
      auth: this.authClient,
      retry: true,
      retryConfig: {
        retries: 3,
        statusCodes: [408, 429, 500, 502, 503, 504]
      }
    });

    this.calendarId = config.calendarId;

    // Initialize circuit breaker
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      resetTimeout: 60000,
      monitoredServices: ['google-calendar'],
      retryStrategy: {
        maxRetries: 3,
        backoffType: BackoffType.EXPONENTIAL,
        baseDelay: 1000,
        maxDelay: 8000,
        jitter: true
      }
    });

    // Initialize rate limiter (1000 requests per 100 seconds)
    this.rateLimiter = new TokenBucket(1000, 10);

    // Set up token refresh monitoring
    this.monitorTokenRefresh();
  }

  /**
   * Retrieves available meeting slots within a date range
   */
  async getAvailableSlots(
    startDate: Date,
    endDate: Date,
    timezone: string
  ): Promise<MeetingSlot[]> {
    try {
      // Check rate limit
      if (!(await this.rateLimiter.consumeToken())) {
        throw new Error(CalendarError.RATE_LIMIT_EXCEEDED);
      }

      // Use circuit breaker to make API call
      const freeBusy = await this.circuitBreaker.executeFunction(
        async () => {
          return await this.calendarClient.freebusy.query({
            requestBody: {
              timeMin: startDate.toISOString(),
              timeMax: endDate.toISOString(),
              timeZone: timezone,
              items: [{ id: this.calendarId }]
            }
          });
        },
        'google-calendar'
      );

      const busySlots = freeBusy.data.calendars?.[this.calendarId]?.busy || [];
      const availableSlots = this.generateAvailableSlots(
        startDate,
        endDate,
        busySlots,
        timezone
      );

      logger.info('Retrieved available calendar slots', {
        startDate,
        endDate,
        timezone,
        slotsCount: availableSlots.length
      });

      return availableSlots;
    } catch (error) {
      logger.error('Failed to retrieve available slots', {
        error,
        startDate,
        endDate,
        timezone
      });
      throw this.handleCalendarError(error);
    }
  }

  /**
   * Schedules a meeting with comprehensive validation and security
   */
  async scheduleMeeting(request: MeetingRequest): Promise<MeetingResponse> {
    try {
      // Validate request
      this.validateMeetingRequest(request);

      // Check rate limit
      if (!(await this.rateLimiter.consumeToken())) {
        throw new Error(CalendarError.RATE_LIMIT_EXCEEDED);
      }

      // Verify slot availability
      const isAvailable = await this.verifySlotAvailability(
        request.startTime,
        request.duration,
        request.timeZone
      );

      if (!isAvailable) {
        throw new Error(CalendarError.SLOT_UNAVAILABLE);
      }

      // Create calendar event
      const event = await this.circuitBreaker.executeFunction(
        async () => {
          return await this.calendarClient.events.insert({
            calendarId: this.calendarId,
            requestBody: this.createEventRequestBody(request)
          });
        },
        'google-calendar'
      );

      const response: MeetingResponse = {
        eventId: event.data.id!,
        meetingUrl: event.data.hangoutLink || '',
        startTime: new Date(event.data.start!.dateTime!),
        endTime: new Date(event.data.end!.dateTime!),
        timeZone: request.timeZone,
        attendees: event.data.attendees?.map(a => a.email!) || [],
        status: event.data.status!
      };

      logger.info('Meeting scheduled successfully', {
        eventId: response.eventId,
        startTime: response.startTime,
        attendees: response.attendees
      });

      return response;
    } catch (error) {
      logger.error('Failed to schedule meeting', {
        error,
        request: {
          ...request,
          contactEmail: '****' // Mask sensitive data
        }
      });
      throw this.handleCalendarError(error);
    }
  }

  /**
   * Validates calendar service configuration
   */
  private validateConfig(config: CalendarServiceConfig): void {
    if (!config.clientId || !config.clientSecret) {
      throw new Error('Missing OAuth credentials');
    }
    if (!config.calendarId) {
      throw new Error('Missing calendar ID');
    }
    if (!config.refreshToken) {
      throw new Error('Missing refresh token');
    }
  }

  /**
   * Monitors and handles OAuth token refresh
   */
  private monitorTokenRefresh(): void {
    this.authClient.on('tokens', (tokens) => {
      logger.info('OAuth tokens refreshed', {
        hasAccessToken: !!tokens.access_token,
        expiryDate: tokens.expiry_date
      });
    });
  }

  /**
   * Generates available meeting slots
   */
  private generateAvailableSlots(
    startDate: Date,
    endDate: Date,
    busySlots: calendar_v3.Schema$TimePeriod[],
    timezone: string
  ): MeetingSlot[] {
    const slots: MeetingSlot[] = [];
    let currentTime = new Date(startDate);

    while (currentTime < endDate) {
      const hour = currentTime.getHours();
      
      // Check business hours
      if (hour >= this.businessHours.start && hour < this.businessHours.end) {
        const slotEnd = new Date(currentTime.getTime() + 30 * 60000); // 30-minute slots
        
        const isAvailable = !busySlots.some(busy => 
          new Date(busy.start!) <= currentTime && 
          new Date(busy.end!) > currentTime
        );

        slots.push({
          startTime: new Date(currentTime),
          endTime: slotEnd,
          available: isAvailable,
          timeZone: timezone
        });
      }

      currentTime = new Date(currentTime.getTime() + 30 * 60000);
    }

    return slots;
  }

  /**
   * Creates calendar event request body
   */
  private createEventRequestBody(request: MeetingRequest): CalendarEvent {
    const endTime = new Date(request.startTime);
    endTime.setMinutes(endTime.getMinutes() + request.duration);

    return {
      summary: `DocShield Insurance Consultation - ${request.practiceName}`,
      description: `Insurance consultation meeting with ${request.contactName}\n\n${request.notes}`,
      start: {
        dateTime: request.startTime.toISOString(),
        timeZone: request.timeZone
      },
      end: {
        dateTime: endTime.toISOString(),
        timeZone: request.timeZone
      },
      attendees: [
        { email: request.contactEmail }
      ],
      conferenceData: request.virtualMeeting ? {
        createRequest: {
          requestId: Date.now().toString(),
          conferenceSolutionKey: { type: 'hangoutsMeet' }
        }
      } : undefined,
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 },
          { method: 'popup', minutes: 10 }
        ]
      }
    };
  }

  /**
   * Handles calendar-specific errors
   */
  private handleCalendarError(error: any): Error {
    const baseError = error instanceof Error ? error : new Error(error.message);
    
    if (error.code === 401) {
      return new Error(CalendarError.AUTH_FAILED);
    }
    if (error.code === 429) {
      return new Error(CalendarError.RATE_LIMIT_EXCEEDED);
    }
    
    return baseError;
  }

  /**
   * Validates meeting request parameters
   */
  private validateMeetingRequest(request: MeetingRequest): void {
    if (!request.contactEmail || !request.contactName) {
      throw new Error('Missing contact information');
    }
    if (!request.startTime || !request.duration) {
      throw new Error('Invalid meeting time parameters');
    }
    if (!request.timeZone) {
      throw new Error('Missing timezone information');
    }
  }

  /**
   * Verifies slot availability before scheduling
   */
  private async verifySlotAvailability(
    startTime: Date,
    duration: number,
    timezone: string
  ): Promise<boolean> {
    const endTime = new Date(startTime);
    endTime.setMinutes(endTime.getMinutes() + duration);

    const slots = await this.getAvailableSlots(startTime, endTime, timezone);
    return slots.every(slot => slot.available);
  }
}