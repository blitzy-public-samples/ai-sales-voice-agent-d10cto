// @ts-check
import { Types } from 'mongoose'; // ^7.0.0
import { CallOutcome } from './call-record.types';
import { ContactType } from './contact.types';

/**
 * Enumeration of possible campaign statuses.
 * Represents the high-level state of a sales outreach campaign.
 */
export enum CampaignStatus {
  /** Campaign is created but not yet started */
  PENDING = 'PENDING',
  
  /** Campaign is actively making calls */
  IN_PROGRESS = 'IN_PROGRESS',
  
  /** Campaign has finished successfully */
  COMPLETED = 'COMPLETED',
  
  /** Campaign has terminated due to errors */
  FAILED = 'FAILED'
}

/**
 * Interface representing a message in the campaign history
 */
export interface CampaignMessage {
  /** Timestamp when the message was recorded */
  timestamp: Date;
  
  /** Content of the message */
  message: string;
}

/**
 * Main interface defining the complete structure of campaign documents in MongoDB.
 * Represents an AI-driven sales outreach campaign with all tracking and state information.
 */
export interface CampaignType {
  /** MongoDB ObjectId for unique campaign identification */
  _id: Types.ObjectId;
  
  /** Reference to the contact this campaign is targeting */
  contactId: Types.ObjectId;
  
  /** Current status of the campaign */
  status: CampaignStatus;
  
  /** History of messages and interactions during the campaign */
  messageHistory: CampaignMessage[];
  
  /** Last completed step in the sales process (0-based index) */
  lastCompletedStep: number;
  
  /** Outcome of the most recent call attempt */
  lastCallOutcome: CallOutcome;
  
  /** Date/time of the most recent call attempt */
  lastCallDate: Date;
  
  /** Scheduled date/time for next call attempt (null if no next call planned) */
  nextCallDate: Date | null;
  
  /** OpenAI conversation thread ID for context continuity */
  threadId: string;
  
  /** Timestamp of campaign creation */
  createdAt: Date;
  
  /** Timestamp of last campaign update */
  updatedAt: Date;
}

/**
 * Interface for creating new campaigns.
 * Contains required fields for campaign initialization.
 */
export interface CampaignCreateInput {
  /** ID of the contact to target */
  contactId: Types.ObjectId;
  
  /** Initial campaign status (typically PENDING) */
  status: CampaignStatus;
  
  /** Scheduled date/time for first call attempt */
  nextCallDate: Date;
}

/**
 * Interface for updating campaign information.
 * Supports partial updates of mutable campaign fields.
 */
export interface CampaignUpdateInput {
  /** Updated campaign status */
  status?: CampaignStatus;
  
  /** Updated last completed step */
  lastCompletedStep?: number;
  
  /** Updated last call outcome */
  lastCallOutcome?: CallOutcome;
  
  /** Updated next call date */
  nextCallDate?: Date | null;
}

/**
 * Type guard to check if a value is a valid CampaignStatus
 * @param value - The value to check
 * @returns boolean indicating if the value is a valid CampaignStatus
 */
export const isCampaignStatus = (value: any): value is CampaignStatus => {
  return Object.values(CampaignStatus).includes(value as CampaignStatus);
};

/**
 * Interface for campaign search/filter criteria
 */
export interface CampaignSearchCriteria {
  contactId?: Types.ObjectId;
  status?: CampaignStatus;
  lastCallOutcome?: CallOutcome;
  nextCallDateStart?: Date;
  nextCallDateEnd?: Date;
}

/**
 * Interface for campaign list sorting options
 */
export interface CampaignSortOptions {
  field: keyof Omit<CampaignType, '_id'>;
  order: 'asc' | 'desc';
}

/**
 * Interface for paginated campaign list responses
 */
export interface PaginatedCampaignResponse {
  campaigns: CampaignType[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}