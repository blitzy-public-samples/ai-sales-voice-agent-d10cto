// @ts-check

import { Types } from 'mongoose'; // ^7.0.0
import { Job } from 'bull'; // ^4.10.0
import { CampaignType } from './campaign.types';
import { CallOutcome } from './call-record.types';

/**
 * Maximum number of retry attempts for failed jobs
 */
export const MAX_RETRIES = 3;

/**
 * Base delay in milliseconds between retry attempts
 */
export const RETRY_DELAY = 60000; // 1 minute

/**
 * Job timeout in milliseconds before considering it failed
 */
export const JOB_TIMEOUT = 300000; // 5 minutes

/**
 * Enumeration of supported job types in the system.
 * Currently focused on outbound call processing as per technical specifications.
 */
export enum JobType {
  OUTBOUND_CALL = 'OUTBOUND_CALL'
}

/**
 * Interface defining the structure of job data passed to Bull queue workers.
 * Contains all necessary information for processing an outbound call job.
 */
export interface JobData {
  /** MongoDB ObjectId reference to the campaign */
  campaignId: Types.ObjectId;
  
  /** Current step in the campaign sequence (0-based index) */
  step: number;
  
  /** Type of job to be processed */
  type: JobType;
  
  /** Number of times this job has been retried */
  retryCount: number;
}

/**
 * Interface defining the structure of job processing results.
 * Captures the outcome and any relevant information for campaign updates.
 */
export interface JobResult {
  /** Indicates if the job completed successfully */
  success: boolean;
  
  /** Final outcome of the call attempt */
  outcome: CallOutcome;
  
  /** Error message if job failed, null otherwise */
  error: string | null;
  
  /** Next step number if campaign should continue, null if complete */
  nextStep: number | null;
}

/**
 * Interface defining Bull queue job configuration options.
 * Implements retry and timeout strategies from technical specifications.
 */
export interface JobOptions {
  /** Maximum number of retry attempts */
  attempts: number;
  
  /** Backoff strategy for retries */
  backoff: {
    /** Type of backoff strategy */
    type: 'exponential' | 'fixed';
    /** Delay between retries in milliseconds */
    delay: number;
  };
  
  /** Timeout for job processing in milliseconds */
  timeout: number;
  
  /** Whether to remove the job on completion */
  removeOnComplete: boolean;
}

/**
 * Type definition for a complete Bull job including data and result.
 * Used for type-safe job processing in worker implementations.
 */
export type QueueJob = Job<JobData, JobResult>;

/**
 * Type guard to check if a value is a valid JobType
 * @param value - The value to check
 * @returns boolean indicating if the value is a valid JobType
 */
export const isJobType = (value: any): value is JobType => {
  return Object.values(JobType).includes(value as JobType);
};

/**
 * Default job options based on system configuration
 */
export const DEFAULT_JOB_OPTIONS: JobOptions = {
  attempts: MAX_RETRIES,
  backoff: {
    type: 'exponential',
    delay: RETRY_DELAY
  },
  timeout: JOB_TIMEOUT,
  removeOnComplete: true
};

/**
 * Interface for job progress updates during processing
 */
export interface JobProgress {
  /** Current stage of job processing */
  stage: 'initializing' | 'dialing' | 'navigating' | 'conversing' | 'scheduling' | 'completing';
  
  /** Percentage of completion (0-100) */
  percentage: number;
  
  /** Optional status message */
  message?: string;
}