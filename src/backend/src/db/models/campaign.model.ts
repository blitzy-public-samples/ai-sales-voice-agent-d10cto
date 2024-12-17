import { model, Model, Document, Types, FilterQuery } from 'mongoose'; // ^7.0.0
import CampaignSchema from '../schemas/campaign.schema';
import { 
  CampaignType, 
  CampaignCreateInput, 
  CampaignUpdateInput,
  CampaignStatus,
  CampaignSearchCriteria,
  PaginatedCampaignResponse
} from '../../types/campaign.types';
import { CallOutcome } from '../../types/call-record.types';

/**
 * Interface for Campaign document with Mongoose Document methods
 */
interface CampaignDocument extends CampaignType, Document {}

/**
 * Interface for Campaign model with static methods
 */
interface CampaignModel extends Model<CampaignDocument> {
  createCampaign(data: CampaignCreateInput): Promise<CampaignDocument>;
  findByContactId(contactId: Types.ObjectId): Promise<CampaignDocument[]>;
  updateCampaignStatus(campaignId: Types.ObjectId, status: CampaignStatus): Promise<CampaignDocument>;
  findActiveCampaigns(criteria: CampaignSearchCriteria): Promise<CampaignDocument[]>;
  getPaginatedCampaigns(
    criteria: CampaignSearchCriteria,
    page: number,
    limit: number
  ): Promise<PaginatedCampaignResponse>;
}

/**
 * Add static methods to the Campaign model
 */
CampaignSchema.statics.createCampaign = async function(
  campaignData: CampaignCreateInput
): Promise<CampaignDocument> {
  try {
    // Generate OpenAI thread ID
    const threadId = `thread_${new Types.ObjectId().toString()}`;

    // Create new campaign with default values
    const campaign = new this({
      ...campaignData,
      threadId,
      status: CampaignStatus.PENDING,
      messageHistory: [],
      lastCompletedStep: 0,
      lastCallOutcome: null,
      lastCallDate: null
    });

    // Save and return the new campaign
    await campaign.save();
    return campaign;
  } catch (error) {
    if (error.code === 11000) { // Duplicate key error
      throw new Error('Campaign with this contact already exists');
    }
    throw error;
  }
};

CampaignSchema.statics.findByContactId = async function(
  contactId: Types.ObjectId
): Promise<CampaignDocument[]> {
  return this.find({ contactId })
    .sort({ createdAt: -1 })
    .lean()
    .exec();
};

CampaignSchema.statics.updateCampaignStatus = async function(
  campaignId: Types.ObjectId,
  newStatus: CampaignStatus
): Promise<CampaignDocument> {
  const campaign = await this.findById(campaignId);
  if (!campaign) {
    throw new Error('Campaign not found');
  }

  campaign.status = newStatus;
  
  // Handle terminal states
  if ([CampaignStatus.COMPLETED, CampaignStatus.FAILED].includes(newStatus)) {
    campaign.nextCallDate = null;
  }

  await campaign.save();
  return campaign;
};

CampaignSchema.statics.findActiveCampaigns = async function(
  criteria: CampaignSearchCriteria
): Promise<CampaignDocument[]> {
  const query: FilterQuery<CampaignDocument> = {
    status: CampaignStatus.IN_PROGRESS
  };

  if (criteria.nextCallDateStart) {
    query.nextCallDate = { $gte: criteria.nextCallDateStart };
  }
  if (criteria.nextCallDateEnd) {
    query.nextCallDate = { ...query.nextCallDate, $lte: criteria.nextCallDateEnd };
  }
  if (criteria.lastCallOutcome) {
    query.lastCallOutcome = criteria.lastCallOutcome;
  }

  return this.find(query)
    .sort({ nextCallDate: 1 })
    .lean()
    .exec();
};

CampaignSchema.statics.getPaginatedCampaigns = async function(
  criteria: CampaignSearchCriteria,
  page: number = 1,
  limit: number = 10
): Promise<PaginatedCampaignResponse> {
  const query: FilterQuery<CampaignDocument> = {};

  // Build query based on criteria
  if (criteria.contactId) query.contactId = criteria.contactId;
  if (criteria.status) query.status = criteria.status;
  if (criteria.lastCallOutcome) query.lastCallOutcome = criteria.lastCallOutcome;

  // Calculate skip value for pagination
  const skip = (page - 1) * limit;

  // Execute queries in parallel
  const [campaigns, total] = await Promise.all([
    this.find(query)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean()
      .exec(),
    this.countDocuments(query)
  ]);

  return {
    campaigns,
    total,
    page,
    limit,
    hasMore: total > skip + campaigns.length
  };
};

/**
 * Instance method to update call outcome
 */
CampaignSchema.methods.updateCallOutcome = async function(
  outcome: CallOutcome,
  declineReason?: string
): Promise<void> {
  this.lastCallOutcome = outcome;
  this.lastCallDate = new Date();
  
  // Handle specific outcomes
  switch (outcome) {
    case CallOutcome.MEETING_SCHEDULED:
      this.status = CampaignStatus.COMPLETED;
      this.nextCallDate = null;
      break;
    case CallOutcome.DECLINED:
      if (declineReason) {
        this.messageHistory.push({
          timestamp: new Date(),
          message: `Call declined: ${declineReason}`,
          type: 'SYSTEM'
        });
      }
      break;
    case CallOutcome.FAILED:
      this.status = CampaignStatus.FAILED;
      this.nextCallDate = null;
      break;
  }

  await this.save();
};

// Create and export the Campaign model
const CampaignModel = model<CampaignDocument, CampaignModel>('Campaign', CampaignSchema);

export default CampaignModel;