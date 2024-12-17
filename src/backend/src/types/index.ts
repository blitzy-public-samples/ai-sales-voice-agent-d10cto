/**
 * @fileoverview Central export file for all TypeScript type definitions used in the DocShield AI Voice Agent system.
 * Aggregates and re-exports types from campaign, call record, contact, and queue modules.
 * 
 * @version 1.0.0
 * @license MIT
 */

// Campaign-related type exports
export {
  CampaignStatus,
  CampaignType,
  CampaignCreateInput,
  CampaignUpdateInput,
  CampaignMessage,
  isCampaignStatus,
  CampaignSearchCriteria,
  CampaignSortOptions,
  PaginatedCampaignResponse
} from './campaign.types';

// Call record type exports
export {
  CallOutcome,
  CallRecordType,
  CallRecordCreateInput
} from './call-record.types';

// Contact-related type exports
export {
  ContactRole,
  ContactType,
  ContactCreateInput,
  ContactUpdateInput,
  isContactRole,
  ContactSearchCriteria,
  ContactSortOptions,
  PaginatedContactResponse
} from './contact.types';

// Queue and job-related type exports
export {
  JobType,
  JobData,
  JobResult,
  JobOptions,
  QueueJob,
  isJobType,
  JobProgress,
  MAX_RETRIES,
  RETRY_DELAY,
  JOB_TIMEOUT,
  DEFAULT_JOB_OPTIONS
} from './queue.types';

/**
 * Re-export mongoose Types for convenience
 * This allows consumers to import Types along with our custom types
 * without needing to import mongoose directly
 */
export { Types } from 'mongoose';

/**
 * @remarks
 * This file serves as the central hub for all TypeScript type definitions used in the DocShield AI Voice Agent system.
 * It re-exports all types from their respective modules to provide a single, organized entry point for type imports.
 * 
 * Usage example:
 * ```typescript
 * import { CampaignType, CallOutcome, ContactRole, JobData } from '@types';
 * ```
 * 
 * The types are organized into logical groups:
 * - Campaign types: For managing outbound sales campaigns
 * - Call record types: For tracking individual call attempts and outcomes
 * - Contact types: For managing medical practice contacts
 * - Queue types: For managing the job queue and worker processes
 */