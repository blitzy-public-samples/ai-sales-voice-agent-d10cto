/**
 * @file Database Models Index
 * @description Central export file for all MongoDB models in the DocShield AI Voice Agent system.
 * Provides a single point of access for database models with comprehensive type definitions.
 * @version 1.0.0
 */

// Import models with their types
import CampaignModel from './campaign.model';
import CallRecordModel from './call-record.model';
import Contact from './contact.model';

// Import types for external usage
import { 
  CampaignType, 
  CampaignStatus, 
  CampaignCreateInput, 
  CampaignUpdateInput,
  CampaignSearchCriteria,
  PaginatedCampaignResponse 
} from '../../types/campaign.types';

import {
  CallRecordType,
  CallOutcome,
  CallRecordCreateInput
} from '../../types/call-record.types';

import {
  ContactType,
  ContactRole,
  ContactCreateInput,
  ContactUpdateInput,
  ContactSearchCriteria,
  ContactSortOptions,
  PaginatedContactResponse
} from '../../types/contact.types';

/**
 * Campaign Management Models and Types
 * @namespace Campaign
 */
export {
  CampaignModel,
  CampaignType,
  CampaignStatus,
  CampaignCreateInput,
  CampaignUpdateInput,
  CampaignSearchCriteria,
  PaginatedCampaignResponse
};

/**
 * Call Record Management Models and Types
 * @namespace CallRecord
 */
export {
  CallRecordModel,
  CallRecordType,
  CallOutcome,
  CallRecordCreateInput
};

/**
 * Contact Management Models and Types
 * @namespace Contact
 */
export {
  Contact,
  ContactType,
  ContactRole,
  ContactCreateInput,
  ContactUpdateInput,
  ContactSearchCriteria,
  ContactSortOptions,
  PaginatedContactResponse
};

/**
 * Database Models Object
 * Provides a consolidated object containing all models for convenience
 */
export const Models = {
  Campaign: CampaignModel,
  CallRecord: CallRecordModel,
  Contact: Contact
} as const;

/**
 * Type definition for the Models object to ensure type safety when accessing models
 */
export type ModelTypes = {
  Campaign: typeof CampaignModel;
  CallRecord: typeof CallRecordModel;
  Contact: typeof Contact;
};

// Default export of all models
export default Models;