import { injectable } from 'tsyringe'; // v4.7.0
import { Types } from 'mongoose'; // v7.0.0
import CircuitBreaker from 'opossum'; // v6.0.0
import { logger } from '../lib/logger';
import CallRecordModel from '../db/models/call-record.model';
import { S3Service } from '../integrations/s3/s3.service';
import { 
  CallRecordType, 
  CallRecordCreateInput, 
  CallOutcome 
} from '../types/call-record.types';
import { 
  ErrorCode, 
  ErrorCategory, 
  ErrorSeverity 
} from '../constants/error-codes';
import { 
  S3StorageOptions, 
  ServerSideEncryption, 
  StorageClass,
  AudioFormat 
} from '../integrations/s3/types';

/**
 * Service class implementing secure call record management functionality
 * Handles creation, retrieval, and management of call recordings with enhanced security
 */
@injectable()
export class CallRecordService {
  private readonly s3CircuitBreaker: CircuitBreaker;
  private readonly dbCircuitBreaker: CircuitBreaker;

  constructor(private readonly s3Service: S3Service) {
    // Initialize circuit breakers for external services
    this.s3CircuitBreaker = new CircuitBreaker(this.s3Service.uploadFile, {
      timeout: 10000, // 10 second timeout
      errorThresholdPercentage: 50,
      resetTimeout: 30000 // 30 second reset
    });

    this.dbCircuitBreaker = new CircuitBreaker(CallRecordModel.findByCampaignId, {
      timeout: 5000, // 5 second timeout
      errorThresholdPercentage: 50,
      resetTimeout: 30000
    });

    // Set up circuit breaker event handlers
    this.setupCircuitBreakerEvents();
  }

  /**
   * Creates a new call record with secure storage of recording
   * @param input Call record creation input
   * @param recordingBuffer Audio recording buffer
   * @returns Created call record with secure URLs
   */
  public async createCallRecord(
    input: CallRecordCreateInput,
    recordingBuffer: Buffer
  ): Promise<CallRecordType> {
    try {
      // Validate input parameters
      this.validateCreateInput(input);

      // Validate audio format and specifications
      const isValidAudio = await this.s3Service.validateAudioFormat(recordingBuffer, {
        format: AudioFormat.WAV,
        channels: 2,
        sampleRate: 48000,
        bitDepth: 16,
        compression: 'opus',
        duration: 0,
        fileSize: recordingBuffer.length
      });

      if (!isValidAudio) {
        throw new Error('Invalid audio format or specifications');
      }

      // Generate secure file keys
      const recordingKey = `recordings/${input.campaignId}/${Date.now()}.wav`;
      const transcriptKey = `transcripts/${input.campaignId}/${Date.now()}.txt`;

      // Configure storage options with encryption
      const storageOptions: S3StorageOptions = {
        contentType: 'audio/wav',
        metadata: {
          campaignId: input.campaignId.toString(),
          callTime: input.callTime.toISOString(),
          outcome: input.outcome
        },
        serverSideEncryption: ServerSideEncryption.KMS,
        storageClass: StorageClass.STANDARD,
        tagging: {
          service: 'docshield',
          environment: process.env.NODE_ENV || 'development',
          dataType: 'call-recording'
        }
      };

      // Upload recording with circuit breaker protection
      const uploadResult = await this.s3CircuitBreaker.fire(
        recordingBuffer,
        recordingKey,
        storageOptions
      );

      // Create call record in database
      const callRecord = await this.dbCircuitBreaker.fire(async () => {
        return await CallRecordModel.create({
          ...input,
          recordingUrl: uploadResult.url,
          transcriptUrl: '', // Will be updated after transcription
          audioFormat: 'WAV',
          channels: 2,
          sampleRate: 48000,
          bitDepth: 16
        });
      });

      // Log successful creation
      logger.info('Call record created successfully', {
        campaignId: input.campaignId,
        recordId: callRecord._id,
        outcome: input.outcome
      });

      return callRecord;

    } catch (error) {
      logger.error('Failed to create call record', {
        error,
        campaignId: input.campaignId,
        outcome: input.outcome
      });

      throw this.handleServiceError(error as Error, 'createCallRecord');
    }
  }

  /**
   * Retrieves call records for a campaign with security validation
   * @param campaignId Campaign identifier
   * @param userContext User context for access control
   * @returns Array of authorized call records
   */
  public async getCallRecordsByCampaign(
    campaignId: Types.ObjectId,
    userContext: any
  ): Promise<CallRecordType[]> {
    try {
      // Validate campaign ID
      if (!Types.ObjectId.isValid(campaignId)) {
        throw new Error('Invalid campaign ID format');
      }

      // Retrieve records with circuit breaker protection
      const records = await this.dbCircuitBreaker.fire(async () => {
        return await CallRecordModel.findByCampaignId(campaignId);
      });

      // Generate temporary secure URLs for recordings
      const recordsWithUrls = await Promise.all(
        records.map(async (record) => {
          const secureUrl = await this.s3Service.getSignedUrlWithExpiry(
            record.recordingUrl,
            3600 // 1 hour expiry
          );
          return { ...record, recordingUrl: secureUrl };
        })
      );

      // Log access event
      logger.info('Call records retrieved', {
        campaignId,
        recordCount: records.length,
        userId: userContext.userId
      });

      return recordsWithUrls;

    } catch (error) {
      logger.error('Failed to retrieve call records', {
        error,
        campaignId
      });

      throw this.handleServiceError(error as Error, 'getCallRecordsByCampaign');
    }
  }

  /**
   * Validates call record creation input
   * @param input Call record input to validate
   * @throws Error if validation fails
   */
  private validateCreateInput(input: CallRecordCreateInput): void {
    if (!Types.ObjectId.isValid(input.campaignId)) {
      throw new Error('Invalid campaign ID format');
    }

    if (!(input.callTime instanceof Date)) {
      throw new Error('Invalid call time format');
    }

    if (input.duration < 0) {
      throw new Error('Duration cannot be negative');
    }

    if (!Object.values(CallOutcome).includes(input.outcome)) {
      throw new Error('Invalid call outcome value');
    }
  }

  /**
   * Sets up circuit breaker event handlers
   */
  private setupCircuitBreakerEvents(): void {
    // S3 circuit breaker events
    this.s3CircuitBreaker.on('open', () => {
      logger.warn('S3 circuit breaker opened');
    });

    this.s3CircuitBreaker.on('halfOpen', () => {
      logger.info('S3 circuit breaker half-opened');
    });

    this.s3CircuitBreaker.on('close', () => {
      logger.info('S3 circuit breaker closed');
    });

    // Database circuit breaker events
    this.dbCircuitBreaker.on('open', () => {
      logger.warn('Database circuit breaker opened');
    });

    this.dbCircuitBreaker.on('halfOpen', () => {
      logger.info('Database circuit breaker half-opened');
    });

    this.dbCircuitBreaker.on('close', () => {
      logger.info('Database circuit breaker closed');
    });
  }

  /**
   * Handles service errors with appropriate categorization
   * @param error Error to handle
   * @param operation Operation that caused the error
   * @returns Categorized error
   */
  private handleServiceError(error: Error, operation: string): Error {
    const enhancedError = new Error(error.message);
    
    if (error.message.includes('S3')) {
      Object.assign(enhancedError, {
        code: ErrorCode.STORAGE_ERROR,
        category: ErrorCategory.RETRYABLE,
        severity: ErrorSeverity.HIGH
      });
    } else if (error.message.includes('database')) {
      Object.assign(enhancedError, {
        code: ErrorCode.DATABASE_ERROR,
        category: ErrorCategory.RETRYABLE,
        severity: ErrorSeverity.HIGH
      });
    } else {
      Object.assign(enhancedError, {
        code: ErrorCode.VOICE_PROCESSING_ERROR,
        category: ErrorCategory.TRANSIENT,
        severity: ErrorSeverity.MEDIUM
      });
    }

    return enhancedError;
  }
}

export default CallRecordService;