import Queue from 'bull'; // ^4.10.0
import { Types } from 'mongoose'; // ^7.0.0
import { JobType, JobData, JobOptions } from '../types';
import { queueConfig } from '../../config/queue.config';
import { logger } from '../../lib/logger';

/**
 * Constants for queue configuration and error handling
 */
const QUEUE_NAME = 'outbound-calls';

/**
 * Default job options based on technical specifications
 * Implements retry strategy with exponential backoff
 */
const DEFAULT_JOB_OPTIONS: JobOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 60000 // 1 minute base delay
  },
  timeout: 300000, // 5 minutes
  removeOnComplete: true,
  removeOnFail: false
};

/**
 * Circuit breaker configuration for queue operations
 */
const CIRCUIT_BREAKER_OPTIONS = {
  failureThreshold: 5,
  resetTimeout: 60000 // 1 minute
};

/**
 * CallProducer class manages the creation and enqueueing of outbound call jobs
 * with enhanced error handling and monitoring capabilities.
 */
export class CallProducer {
  private queue: Queue.Queue;
  private readonly queueName: string;
  private circuitBreaker: {
    failures: number;
    lastFailure: number;
    isOpen: boolean;
  };

  constructor() {
    this.queueName = QUEUE_NAME;
    this.queue = queueConfig.createQueue(this.queueName);
    this.circuitBreaker = {
      failures: 0,
      lastFailure: 0,
      isOpen: false
    };

    // Set up queue error handlers with security logging
    this.queue.on('error', (error: Error) => {
      logger.error('Queue error occurred', {
        error,
        component: 'CallProducer',
        queueName: this.queueName
      });
      this.handleCircuitBreaker(error);
    });

    // Monitor queue health
    this.queue.on('failed', (job: Queue.Job, error: Error) => {
      logger.error('Job failed', {
        error,
        jobId: job.id,
        campaignId: job.data.campaignId,
        component: 'CallProducer'
      });
    });

    // Initialize queue metrics monitoring
    this.startMetricsCollection();
  }

  /**
   * Creates and enqueues a new outbound call job
   * @param campaignId - MongoDB ObjectId of the campaign
   * @param step - Current step in the campaign sequence
   * @returns Promise resolving to the created job
   */
  async enqueueCall(campaignId: Types.ObjectId, step: number): Promise<Queue.Job<JobData>> {
    // Check circuit breaker state
    if (this.circuitBreaker.isOpen) {
      const error = new Error('Circuit breaker is open');
      logger.error('Job creation blocked', {
        error,
        campaignId,
        step,
        component: 'CallProducer'
      });
      throw error;
    }

    try {
      // Validate input parameters
      if (!Types.ObjectId.isValid(campaignId)) {
        throw new Error('Invalid campaign ID');
      }
      if (typeof step !== 'number' || step < 0) {
        throw new Error('Invalid step number');
      }

      // Create job data with type checking
      const jobData: JobData = {
        type: JobType.OUTBOUND_CALL,
        campaignId,
        step
      };

      // Add job to queue with monitoring
      const job = await this.queue.add(jobData, {
        ...DEFAULT_JOB_OPTIONS,
        jobId: `${campaignId}-${step}`,
        timestamp: Date.now()
      });

      logger.info('Call job created', {
        jobId: job.id,
        campaignId: campaignId.toString(),
        step,
        component: 'CallProducer'
      });

      return job;
    } catch (error) {
      logger.error('Failed to create call job', {
        error,
        campaignId: campaignId.toString(),
        step,
        component: 'CallProducer'
      });
      this.handleCircuitBreaker(error as Error);
      throw error;
    }
  }

  /**
   * Removes a job from the queue
   * @param jobId - ID of the job to remove
   */
  async removeJob(jobId: string): Promise<void> {
    try {
      const job = await this.queue.getJob(jobId);
      if (job) {
        await job.remove();
        logger.info('Job removed', {
          jobId,
          component: 'CallProducer'
        });
      }
    } catch (error) {
      logger.error('Failed to remove job', {
        error,
        jobId,
        component: 'CallProducer'
      });
      throw error;
    }
  }

  /**
   * Performs health check on queue connection
   * @returns Promise resolving to queue health status
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Check Redis connection
      await this.queue.client.ping();
      
      // Check queue operations
      const counts = await Promise.all([
        this.queue.getJobCounts(),
        this.queue.getActiveCount(),
        this.queue.getDelayedCount()
      ]);

      logger.info('Queue health check passed', {
        counts,
        component: 'CallProducer'
      });

      return true;
    } catch (error) {
      logger.error('Queue health check failed', {
        error,
        component: 'CallProducer'
      });
      return false;
    }
  }

  /**
   * Handles circuit breaker logic for queue operations
   * @param error - Error that triggered circuit breaker
   */
  private handleCircuitBreaker(error: Error): void {
    this.circuitBreaker.failures++;
    this.circuitBreaker.lastFailure = Date.now();

    if (this.circuitBreaker.failures >= CIRCUIT_BREAKER_OPTIONS.failureThreshold) {
      this.circuitBreaker.isOpen = true;
      logger.warn('Circuit breaker opened', {
        failures: this.circuitBreaker.failures,
        component: 'CallProducer'
      });

      // Schedule circuit breaker reset
      setTimeout(() => {
        this.circuitBreaker.isOpen = false;
        this.circuitBreaker.failures = 0;
        logger.info('Circuit breaker reset', {
          component: 'CallProducer'
        });
      }, CIRCUIT_BREAKER_OPTIONS.resetTimeout);
    }
  }

  /**
   * Starts collection of queue metrics
   */
  private startMetricsCollection(): void {
    setInterval(async () => {
      try {
        const metrics = await this.queue.getJobCounts();
        logger.info('Queue metrics', {
          metrics,
          component: 'CallProducer'
        });
      } catch (error) {
        logger.error('Failed to collect metrics', {
          error,
          component: 'CallProducer'
        });
      }
    }, 15000); // Every 15 seconds
  }
}

export default CallProducer;