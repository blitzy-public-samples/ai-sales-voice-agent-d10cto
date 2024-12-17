import { Types } from 'mongoose'; // ^7.0.0
import { Job } from 'bull'; // ^4.10.0
import { CampaignType } from '../types/campaign.types';
import { CallOutcome } from '../types/call-record.types';

/**
 * Enumeration of job types supported by the queue system.
 * Currently only supports outbound calls as per technical specification.
 */
export enum JobType {
  OUTBOUND_CALL = 'OUTBOUND_CALL'
}

/**
 * Maximum number of retry attempts for failed jobs
 * Based on Technical Specifications/Appendices/A.2/Error Recovery Patterns
 */
export const MAX_RETRIES = 3;

/**
 * Retry delay in milliseconds (1 minute)
 * Implements exponential backoff: 2^n * RETRY_DELAY
 */
export const RETRY_DELAY = 60000;

/**
 * Job timeout in milliseconds (5 minutes)
 * Based on maximum expected call duration including phone tree navigation
 */
export const JOB_TIMEOUT = 300000;

/**
 * Interface defining the structure of job data in the queue.
 * Contains all necessary information for processing an outbound call.
 */
export interface JobData {
  /** Type of job to be processed */
  type: JobType;
  
  /** Reference to the campaign this job belongs to */
  campaignId: Types.ObjectId;
  
  /** Current step in the campaign sequence (0-based) */
  step: number;
  
  /** Number of times this job has been retried */
  retryCount: number;
  
  /** Optional metadata for job processing */
  metadata?: {
    /** Last error message if job previously failed */
    lastError?: string;
    
    /** Timestamp of last attempt */
    lastAttempt?: Date;
  };
}

/**
 * Interface defining the structure of job processing results.
 * Captures the outcome of a call attempt and determines next steps.
 */
export interface JobResult {
  /** Indicates if job completed successfully */
  success: boolean;
  
  /** Specific outcome of the call attempt */
  outcome: CallOutcome;
  
  /** Error object if job failed */
  error: Error | null;
  
  /** Next step number if campaign should continue, null if complete */
  nextStep: number | null;
  
  /** Additional result metadata */
  metadata?: {
    /** Duration of call in seconds */
    callDuration?: number;
    
    /** URL of call recording in S3 */
    recordingUrl?: string;
    
    /** URL of call transcript in S3 */
    transcriptUrl?: string;
  };
}

/**
 * Interface defining Bull queue job processing options.
 * Implements retry and timeout configurations from technical specifications.
 */
export interface JobOptions {
  /** Maximum number of retry attempts */
  attempts: number;
  
  /** Backoff delay between retries in ms */
  backoff: number;
  
  /** Job timeout in ms */
  timeout: number;
  
  /** Whether to remove job on completion */
  removeOnComplete: boolean;
  
  /** Job priority (higher = more important) */
  priority?: number;
  
  /** Delay before job becomes active */
  delay?: number;
}

/**
 * Type definition for job processor function
 * Processes a Bull queue job and returns a JobResult
 */
export type JobProcessor = (job: Job<JobData>) => Promise<JobResult>;

/**
 * Type definition for job failure handler function
 * Handles cleanup and logging when a job fails
 */
export type JobFailureHandler = (job: Job<JobData>, error: Error) => Promise<void>;

/**
 * Type definition for job completion handler function
 * Handles post-processing after successful job completion
 */
export type JobCompletionHandler = (job: Job<JobData>, result: JobResult) => Promise<void>;