/**
 * @fileoverview Index file for queue consumer implementations in the DocShield AI Voice Agent system.
 * Centralizes access to queue consumers while maintaining extensibility and implementing
 * single-threaded event loop architecture through proper consumer exports.
 * 
 * @version 1.0.0
 * @license MIT
 */

import { Job } from 'bull'; // ^4.10.0
import { CallConsumer } from './call.consumer';
import { JobType, JobData, JobResult } from '../types';
import { logger } from '../../lib/logger';

/**
 * Interface defining required methods for queue consumers
 * Ensures consistent implementation across different consumer types
 */
export interface QueueConsumer {
  /**
   * Process a job from the queue
   * @param job Bull queue job containing campaign data
   * @returns Promise resolving to job processing result
   */
  processJob(job: Job<JobData>): Promise<JobResult>;

  /**
   * Handle job processing errors
   * @param error Error that occurred during processing
   * @param job Bull queue job that failed
   */
  handleError(error: Error, job: Job<JobData>): Promise<void>;

  /**
   * Validate job data before processing
   * @param job Bull queue job to validate
   * @returns Promise resolving to boolean indicating validity
   */
  validateJob(job: Job<JobData>): Promise<boolean>;
}

/**
 * Registry of available queue consumers mapped by job type
 * Allows for easy addition of new consumer types while maintaining type safety
 */
const consumerRegistry: Record<JobType, QueueConsumer> = {
  [JobType.OUTBOUND_CALL]: new CallConsumer()
};

/**
 * Get appropriate consumer for a job type
 * @param jobType Type of job to get consumer for
 * @returns Queue consumer instance for the job type
 * @throws Error if no consumer exists for job type
 */
export function getConsumer(jobType: JobType): QueueConsumer {
  const consumer = consumerRegistry[jobType];
  
  if (!consumer) {
    const error = new Error(`No consumer registered for job type: ${jobType}`);
    logger.error('Consumer lookup failed', { error, jobType });
    throw error;
  }

  return consumer;
}

/**
 * Process a job using the appropriate consumer
 * @param job Bull queue job to process
 * @returns Promise resolving to job processing result
 */
export async function processJob(job: Job<JobData>): Promise<JobResult> {
  const startTime = Date.now();
  const consumer = getConsumer(job.data.type);

  try {
    // Log job processing start
    logger.info('Starting job processing', {
      jobId: job.id,
      type: job.data.type,
      campaignId: job.data.campaignId
    });

    // Validate job data
    const isValid = await consumer.validateJob(job);
    if (!isValid) {
      throw new Error('Invalid job data');
    }

    // Process job
    const result = await consumer.processJob(job);

    // Log successful completion
    logger.info('Job processing completed', {
      jobId: job.id,
      duration: Date.now() - startTime,
      result
    });

    return result;

  } catch (error) {
    // Handle and log error
    await consumer.handleError(error as Error, job);
    
    logger.error('Job processing failed', {
      jobId: job.id,
      error,
      duration: Date.now() - startTime
    });

    throw error;
  }
}

/**
 * Export consumer implementations for direct access
 * Allows for dependency injection and testing
 */
export {
  CallConsumer
};

/**
 * Export consumer interface for implementing new consumers
 */
export type {
  QueueConsumer
};