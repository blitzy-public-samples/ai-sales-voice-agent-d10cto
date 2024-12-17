import { z } from 'zod'; // ^3.0.0
import { Types } from 'mongoose';
import { CampaignType, CampaignStatus } from '../types/campaign.types';
import { ContactType, ContactRole } from '../types/contact.types';
import { CallRecordType, CallOutcome } from '../types/call-record.types';

// Global validation constants
const PHONE_REGEX = /^\+[1-9]\d{1,14}$/;
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const TIMEZONE_REGEX = /^[A-Za-z_]+\/[A-Za-z_]+$/;
const THREAD_ID_REGEX = /^thread_[a-zA-Z0-9]{24}$/;
const URL_REGEX = /^https:\/\/[\w\-\.]+\.[a-zA-Z]{2,}[\/\w\-\.]*$/;
const MIN_CALL_DURATION = 5000; // 5 seconds minimum
const SUPPORTED_AUDIO_FORMATS = ['WAV', 'MP3', 'OPUS'];

/**
 * Enhanced custom error class for validation failures
 * Provides detailed context and suggestions for fixing validation issues
 */
export class ValidationError extends Error {
  public readonly details: Record<string, any>;
  public readonly validationPath: string[];
  public readonly suggestions: string[];
  public readonly context: Record<string, any>;

  constructor(
    message: string,
    details: Record<string, any>,
    context: Record<string, any>
  ) {
    super(message);
    this.name = 'ValidationError';
    this.details = details;
    this.validationPath = [];
    this.suggestions = [];
    this.context = context;

    // Generate helpful suggestions based on validation context
    this.generateSuggestions();
    
    // Ensure the error is properly captured in stack traces
    Error.captureStackTrace(this, ValidationError);
  }

  private generateSuggestions(): void {
    const { field, value, constraint } = this.details;
    
    if (field === 'phone' && !PHONE_REGEX.test(value)) {
      this.suggestions.push('Phone number must be in E.164 format (e.g., +12125551234)');
    }
    
    if (field === 'timezone' && !TIMEZONE_REGEX.test(value)) {
      this.suggestions.push('Timezone must be in IANA format (e.g., America/New_York)');
    }
    
    // Add more specific suggestions based on validation context
  }
}

/**
 * Validates campaign data with enhanced status transition and date sequence validation
 * @param campaign - Campaign data to validate
 * @throws ValidationError if validation fails
 * @returns true if validation passes
 */
export const validateCampaign = (campaign: CampaignType): boolean => {
  const campaignSchema = z.object({
    _id: z.instanceof(Types.ObjectId),
    contactId: z.instanceof(Types.ObjectId),
    status: z.nativeEnum(CampaignStatus),
    messageHistory: z.array(z.object({
      timestamp: z.date(),
      message: z.string().min(1)
    })),
    lastCompletedStep: z.number().min(0),
    lastCallOutcome: z.nativeEnum(CallOutcome),
    lastCallDate: z.date(),
    nextCallDate: z.date().nullable(),
    threadId: z.string().regex(THREAD_ID_REGEX),
    createdAt: z.date(),
    updatedAt: z.date()
  });

  try {
    // Validate basic schema
    campaignSchema.parse(campaign);

    // Validate date sequence
    if (campaign.lastCallDate < campaign.createdAt) {
      throw new ValidationError(
        'Invalid date sequence',
        { field: 'lastCallDate', value: campaign.lastCallDate },
        { constraint: 'must be after createdAt' }
      );
    }

    // Validate status transitions
    validateStatusTransition(campaign.status, campaign.lastCallOutcome);

    return true;
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError(
        'Campaign validation failed',
        error.errors[0],
        { schema: 'campaign' }
      );
    }
    throw error;
  }
};

/**
 * Validates contact data with enhanced phone, timezone, and availability validation
 * @param contact - Contact data to validate
 * @throws ValidationError if validation fails
 * @returns true if validation passes
 */
export const validateContact = (contact: ContactType): boolean => {
  const contactSchema = z.object({
    _id: z.instanceof(Types.ObjectId),
    practiceName: z.string().min(1),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    role: z.nativeEnum(ContactRole),
    phone: z.string().regex(PHONE_REGEX),
    extension: z.string().nullable(),
    email: z.string().regex(EMAIL_REGEX),
    timezone: z.string().regex(TIMEZONE_REGEX),
    bestTimeToCall: z.array(z.string().regex(/^\d{2}:\d{2}-\d{2}:\d{2}$/)),
    createdAt: z.date(),
    updatedAt: z.date()
  });

  try {
    // Validate basic schema
    contactSchema.parse(contact);

    // Validate best time to call ranges
    validateTimeRanges(contact.bestTimeToCall);

    return true;
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError(
        'Contact validation failed',
        error.errors[0],
        { schema: 'contact' }
      );
    }
    throw error;
  }
};

/**
 * Validates call record data with enhanced audio specification and security validation
 * @param callRecord - Call record data to validate
 * @throws ValidationError if validation fails
 * @returns true if validation passes
 */
export const validateCallRecord = (callRecord: CallRecordType): boolean => {
  const callRecordSchema = z.object({
    campaignId: z.instanceof(Types.ObjectId),
    transcriptUrl: z.string().regex(URL_REGEX),
    recordingUrl: z.string().regex(URL_REGEX),
    callTime: z.date(),
    duration: z.number().min(MIN_CALL_DURATION),
    outcome: z.nativeEnum(CallOutcome),
    declineReason: z.string().nullable(),
    audioFormat: z.enum(SUPPORTED_AUDIO_FORMATS),
    channels: z.number().min(1).max(2),
    sampleRate: z.number().min(8000).max(48000),
    bitDepth: z.number().min(8).max(32)
  });

  try {
    // Validate basic schema
    callRecordSchema.parse(callRecord);

    // Validate audio specifications
    validateAudioSpecs(callRecord);

    return true;
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError(
        'Call record validation failed',
        error.errors[0],
        { schema: 'callRecord' }
      );
    }
    throw error;
  }
};

/**
 * Helper function to validate campaign status transitions
 */
const validateStatusTransition = (status: CampaignStatus, outcome: CallOutcome): void => {
  const validTransitions: Record<CampaignStatus, CallOutcome[]> = {
    [CampaignStatus.PENDING]: [CallOutcome.NO_ANSWER],
    [CampaignStatus.IN_PROGRESS]: Object.values(CallOutcome),
    [CampaignStatus.COMPLETED]: [CallOutcome.MEETING_SCHEDULED],
    [CampaignStatus.FAILED]: [CallOutcome.FAILED]
  };

  if (!validTransitions[status].includes(outcome)) {
    throw new ValidationError(
      'Invalid status transition',
      { status, outcome },
      { validTransitions: validTransitions[status] }
    );
  }
};

/**
 * Helper function to validate time ranges
 */
const validateTimeRanges = (timeRanges: string[]): void => {
  for (const range of timeRanges) {
    const [start, end] = range.split('-');
    const startTime = new Date(`1970-01-01T${start}`);
    const endTime = new Date(`1970-01-01T${end}`);

    if (endTime <= startTime) {
      throw new ValidationError(
        'Invalid time range',
        { range, start, end },
        { message: 'End time must be after start time' }
      );
    }
  }
};

/**
 * Helper function to validate audio specifications
 */
const validateAudioSpecs = (callRecord: CallRecordType): void => {
  const { audioFormat, channels, sampleRate, bitDepth } = callRecord;

  // Validate format-specific requirements
  if (audioFormat === 'WAV' && channels !== 2) {
    throw new ValidationError(
      'Invalid audio specification',
      { field: 'channels', value: channels },
      { required: 2, format: 'WAV' }
    );
  }

  // Validate sample rate for high-quality audio
  if (sampleRate < 44100 && audioFormat !== 'OPUS') {
    throw new ValidationError(
      'Invalid sample rate',
      { field: 'sampleRate', value: sampleRate },
      { minimum: 44100, format: audioFormat }
    );
  }
};