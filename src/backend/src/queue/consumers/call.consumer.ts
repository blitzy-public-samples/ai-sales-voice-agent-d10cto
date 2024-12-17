import { Job } from 'bull';
import { Types } from 'mongoose';
import { VoiceAgentService } from '../../services/voice-agent.service';
import { CircuitBreaker } from '../../lib/circuit-breaker';
import { logger } from '../../lib/logger';
import { 
  JobData, 
  JobResult, 
  JobProgress,
  MAX_RETRIES 
} from '../types';
import { 
  CampaignStatus,
  CallOutcome 
} from '../../types';
import { ErrorCode, ErrorCategory } from '../../constants/error-codes';

/**
 * Constants for call processing timeouts and thresholds
 */
const CALL_TIMEOUT = 300000; // 5 minutes
const PHONE_TREE_TIMEOUT = 60000; // 1 minute
const QUALITY_CHECK_INTERVAL = 5000; // 5 seconds
const MIN_VOICE_QUALITY_SCORE = 8.0;

/**
 * Enhanced consumer class for processing outbound call jobs with comprehensive
 * error handling, monitoring, and circuit breaker patterns.
 */
export class CallConsumer {
  private readonly voiceAgentService: VoiceAgentService;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly correlationId: string;
  private qualityCheckInterval: NodeJS.Timer | null = null;

  constructor(
    voiceAgentService: VoiceAgentService,
    circuitBreaker: CircuitBreaker
  ) {
    this.voiceAgentService = voiceAgentService;
    this.circuitBreaker = circuitBreaker;
    this.correlationId = `call-consumer-${Date.now()}`;

    // Set up cleanup handlers
    this.setupCleanupHandlers();
  }

  /**
   * Main job processing method with enhanced error handling and monitoring
   * @param job Bull queue job containing campaign data
   * @returns Promise resolving to job processing result
   */
  public async processJob(job: Job<JobData>): Promise<JobResult> {
    const startTime = Date.now();
    
    try {
      logger.info('Starting call job processing', {
        jobId: job.id,
        campaignId: job.data.campaignId,
        step: job.data.step,
        correlationId: this.correlationId
      });

      // Validate job data
      this.validateJobData(job.data);

      // Start quality monitoring
      this.startQualityMonitoring();

      // Update job progress
      await this.updateJobProgress(job, {
        stage: 'initializing',
        percentage: 10,
        message: 'Initializing call'
      });

      // Initialize voice agent
      const contact = await this.getContactInfo(job.data.campaignId);
      
      // Start call with circuit breaker protection
      const callStarted = await this.circuitBreaker.executeFunction(
        async () => await this.voiceAgentService.startCall(contact.phone, contact),
        'voice-agent'
      );

      if (!callStarted) {
        throw new Error('Failed to start call');
      }

      // Update progress for dialing
      await this.updateJobProgress(job, {
        stage: 'dialing',
        percentage: 30,
        message: 'Dialing contact'
      });

      // Handle phone tree navigation if extension exists
      if (contact.extension) {
        await this.handlePhoneTreeNavigation(contact.extension);
      }

      // Update progress for conversation
      await this.updateJobProgress(job, {
        stage: 'conversing',
        percentage: 60,
        message: 'In conversation'
      });

      // Conduct sales conversation with monitoring
      const conversationResult = await this.conductSalesConversation(job);

      // Process call outcome
      const result = await this.processCallOutcome(
        conversationResult,
        job.data.campaignId
      );

      // Calculate job duration
      const duration = (Date.now() - startTime) / 1000;

      logger.info('Call job completed successfully', {
        jobId: job.id,
        duration,
        outcome: result.outcome,
        correlationId: this.correlationId
      });

      return result;

    } catch (error) {
      return await this.handleJobError(job, error as Error);
    } finally {
      this.cleanup();
    }
  }

  /**
   * Validates incoming job data structure
   */
  private validateJobData(data: JobData): void {
    if (!data.campaignId || !Types.ObjectId.isValid(data.campaignId)) {
      throw new Error('Invalid campaign ID in job data');
    }

    if (typeof data.step !== 'number' || data.step < 0) {
      throw new Error('Invalid step number in job data');
    }
  }

  /**
   * Handles phone tree navigation with timeout protection
   */
  private async handlePhoneTreeNavigation(extension: string): Promise<void> {
    try {
      const navigationTimeout = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Phone tree navigation timeout')), PHONE_TREE_TIMEOUT);
      });

      await Promise.race([
        this.voiceAgentService.handlePhoneTree(extension.split('')),
        navigationTimeout
      ]);
    } catch (error) {
      logger.error('Phone tree navigation failed', {
        error,
        extension,
        correlationId: this.correlationId
      });
      throw error;
    }
  }

  /**
   * Conducts sales conversation with quality monitoring
   */
  private async conductSalesConversation(job: Job<JobData>): Promise<CallOutcome> {
    const conversationTimeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Conversation timeout')), CALL_TIMEOUT);
    });

    try {
      const conversationPromise = this.circuitBreaker.executeFunction(
        async () => {
          return await this.voiceAgentService.conductConversation({
            campaignId: job.data.campaignId,
            step: job.data.step
          });
        },
        'voice-agent'
      );

      // Race between conversation and timeout
      const outcome = await Promise.race([
        conversationPromise,
        conversationTimeout
      ]);

      return outcome;
    } catch (error) {
      logger.error('Sales conversation failed', {
        error,
        jobId: job.id,
        correlationId: this.correlationId
      });
      throw error;
    }
  }

  /**
   * Processes call outcome and updates campaign status
   */
  private async processCallOutcome(
    outcome: CallOutcome,
    campaignId: Types.ObjectId
  ): Promise<JobResult> {
    const result: JobResult = {
      success: false,
      outcome,
      error: null,
      nextStep: null
    };

    switch (outcome) {
      case CallOutcome.MEETING_SCHEDULED:
        result.success = true;
        result.nextStep = null; // Campaign complete
        await this.updateCampaignStatus(campaignId, CampaignStatus.COMPLETED);
        break;

      case CallOutcome.DECLINED:
        result.success = true;
        result.nextStep = null; // Campaign complete
        await this.updateCampaignStatus(campaignId, CampaignStatus.COMPLETED);
        break;

      case CallOutcome.VOICEMAIL:
      case CallOutcome.NO_ANSWER:
        result.success = true;
        result.nextStep = 1; // Schedule retry
        break;

      case CallOutcome.FAILED:
        result.success = false;
        result.error = 'Call failed due to technical issues';
        break;

      default:
        result.success = false;
        result.error = 'Unknown call outcome';
    }

    return result;
  }

  /**
   * Handles job errors with retry logic
   */
  private async handleJobError(job: Job<JobData>, error: Error): Promise<JobResult> {
    logger.error('Call job failed', {
      jobId: job.id,
      error,
      attempt: job.attemptsMade,
      correlationId: this.correlationId
    });

    const shouldRetry = job.attemptsMade < MAX_RETRIES;

    return {
      success: false,
      outcome: CallOutcome.FAILED,
      error: error.message,
      nextStep: shouldRetry ? job.data.step : null
    };
  }

  /**
   * Updates job progress in queue
   */
  private async updateJobProgress(
    job: Job<JobData>,
    progress: JobProgress
  ): Promise<void> {
    try {
      await job.progress(progress);
      logger.debug('Job progress updated', {
        jobId: job.id,
        progress,
        correlationId: this.correlationId
      });
    } catch (error) {
      logger.warn('Failed to update job progress', {
        error,
        jobId: job.id,
        correlationId: this.correlationId
      });
    }
  }

  /**
   * Starts voice quality monitoring interval
   */
  private startQualityMonitoring(): void {
    this.qualityCheckInterval = setInterval(
      async () => {
        try {
          const metrics = await this.voiceAgentService.monitorCallQuality();
          if (metrics.quality < MIN_VOICE_QUALITY_SCORE) {
            logger.warn('Voice quality below threshold', {
              quality: metrics.quality,
              threshold: MIN_VOICE_QUALITY_SCORE,
              correlationId: this.correlationId
            });
          }
        } catch (error) {
          logger.error('Quality monitoring failed', {
            error,
            correlationId: this.correlationId
          });
        }
      },
      QUALITY_CHECK_INTERVAL
    );
  }

  /**
   * Sets up cleanup handlers for graceful shutdown
   */
  private setupCleanupHandlers(): void {
    process.on('SIGTERM', () => this.cleanup());
    process.on('SIGINT', () => this.cleanup());
  }

  /**
   * Cleans up resources and connections
   */
  private cleanup(): void {
    if (this.qualityCheckInterval) {
      clearInterval(this.qualityCheckInterval);
      this.qualityCheckInterval = null;
    }
    this.voiceAgentService.cleanup();
  }

  // Mock methods that would be implemented in actual service
  private async getContactInfo(campaignId: Types.ObjectId): Promise<any> {
    // Implementation would fetch contact info from database
    return { phone: '', extension: '' };
  }

  private async updateCampaignStatus(
    campaignId: Types.ObjectId,
    status: CampaignStatus
  ): Promise<void> {
    // Implementation would update campaign status in database
  }
}