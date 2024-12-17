import { Types } from 'mongoose'; // ^7.0.0
import CampaignModel from '../db/models/campaign.model';
import { 
  CampaignType, 
  CampaignCreateInput, 
  CampaignStatus,
  CampaignSearchCriteria,
  PaginatedCampaignResponse
} from '../types/campaign.types';
import { CallOutcome } from '../types/call-record.types';
import { ErrorHandler } from '../lib/error-handler';
import { logger } from '../lib/logger';
import { ErrorCode, ErrorCategory } from '../constants/error-codes';
import { CircuitBreaker, CircuitBreakerConfig } from '../lib/circuit-breaker';

/**
 * Service class for managing campaign operations with comprehensive error handling and logging
 */
export class CampaignService {
  private readonly errorHandler: ErrorHandler;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly maxRetries: number = 3;
  private readonly retryDelay: number = 1000;

  constructor() {
    // Initialize error handler with configuration
    this.errorHandler = new ErrorHandler({
      maxRetries: this.maxRetries,
      backoffMs: this.retryDelay,
      circuitBreakerConfig: {
        failureThreshold: 5,
        resetTimeout: 60000,
        monitoredServices: ['database', 'storage']
      },
      errorMetricsEnabled: true
    });

    // Initialize circuit breaker for database operations
    const circuitBreakerConfig: CircuitBreakerConfig = {
      failureThreshold: 5,
      resetTimeout: 60000,
      monitoredServices: ['database', 'storage']
    };
    this.circuitBreaker = new CircuitBreaker(circuitBreakerConfig);
  }

  /**
   * Creates a new campaign with validation and error handling
   */
  async createCampaign(campaignData: CampaignCreateInput): Promise<CampaignType> {
    try {
      logger.info('Creating new campaign', { 
        contactId: campaignData.contactId,
        metadata: { operation: 'createCampaign' }
      });

      const campaign = await this.circuitBreaker.executeFunction(
        async () => CampaignModel.createCampaign(campaignData),
        'database'
      );

      logger.info('Campaign created successfully', { 
        campaignId: campaign._id,
        status: campaign.status
      });

      return campaign;
    } catch (error) {
      await this.errorHandler.handleError(error, {
        component: 'CampaignService',
        operation: 'createCampaign',
        metadata: { campaignData },
        stackTrace: error.stack,
        sensitiveFields: ['contactId']
      });
      throw error;
    }
  }

  /**
   * Retrieves a campaign by ID with error handling
   */
  async getCampaignById(campaignId: Types.ObjectId): Promise<CampaignType | null> {
    try {
      logger.debug('Fetching campaign by ID', { campaignId });

      const campaign = await this.circuitBreaker.executeFunction(
        async () => CampaignModel.findById(campaignId).lean().exec(),
        'database'
      );

      if (!campaign) {
        logger.warn('Campaign not found', { campaignId });
        return null;
      }

      return campaign;
    } catch (error) {
      await this.errorHandler.handleError(error, {
        component: 'CampaignService',
        operation: 'getCampaignById',
        metadata: { campaignId },
        stackTrace: error.stack,
        sensitiveFields: []
      });
      throw error;
    }
  }

  /**
   * Updates campaign status with state machine validation
   */
  async updateCampaignStatus(
    campaignId: Types.ObjectId, 
    newStatus: CampaignStatus
  ): Promise<CampaignType> {
    try {
      logger.info('Updating campaign status', { 
        campaignId, 
        newStatus,
        metadata: { operation: 'updateCampaignStatus' }
      });

      const campaign = await this.circuitBreaker.executeFunction(
        async () => CampaignModel.updateCampaignStatus(campaignId, newStatus),
        'database'
      );

      logger.info('Campaign status updated successfully', {
        campaignId,
        oldStatus: campaign.status,
        newStatus
      });

      return campaign;
    } catch (error) {
      await this.errorHandler.handleError(error, {
        component: 'CampaignService',
        operation: 'updateCampaignStatus',
        metadata: { campaignId, newStatus },
        stackTrace: error.stack,
        sensitiveFields: []
      });
      throw error;
    }
  }

  /**
   * Adds a message to campaign history with validation
   */
  async addMessageToHistory(
    campaignId: Types.ObjectId,
    message: string,
    type: 'AGENT' | 'CONTACT' | 'SYSTEM',
    metadata?: Record<string, unknown>
  ): Promise<void> {
    try {
      logger.debug('Adding message to campaign history', { 
        campaignId, 
        type,
        metadata: { operation: 'addMessageToHistory' }
      });

      const messageEntry = {
        timestamp: new Date(),
        message: message.trim(),
        type,
        metadata: metadata || null
      };

      await this.circuitBreaker.executeFunction(
        async () => CampaignModel.findByIdAndUpdate(
          campaignId,
          { $push: { messageHistory: messageEntry } },
          { new: true, runValidators: true }
        ),
        'database'
      );

      logger.info('Message added to campaign history', { campaignId, type });
    } catch (error) {
      await this.errorHandler.handleError(error, {
        component: 'CampaignService',
        operation: 'addMessageToHistory',
        metadata: { campaignId, type },
        stackTrace: error.stack,
        sensitiveFields: ['message']
      });
      throw error;
    }
  }

  /**
   * Updates campaign with call outcome and schedules follow-up
   */
  async updateCallOutcome(
    campaignId: Types.ObjectId,
    outcome: CallOutcome,
    metadata?: Record<string, unknown>
  ): Promise<CampaignType> {
    try {
      logger.info('Updating call outcome', { 
        campaignId, 
        outcome,
        metadata: { operation: 'updateCallOutcome' }
      });

      const campaign = await this.circuitBreaker.executeFunction(
        async () => {
          const campaign = await CampaignModel.findById(campaignId);
          if (!campaign) {
            throw new Error('Campaign not found');
          }
          await campaign.updateCallOutcome(outcome);
          return campaign;
        },
        'database'
      );

      // Add system message for outcome
      await this.addMessageToHistory(
        campaignId,
        `Call completed with outcome: ${outcome}`,
        'SYSTEM',
        metadata
      );

      logger.info('Call outcome updated successfully', {
        campaignId,
        outcome,
        newStatus: campaign.status
      });

      return campaign;
    } catch (error) {
      await this.errorHandler.handleError(error, {
        component: 'CampaignService',
        operation: 'updateCallOutcome',
        metadata: { campaignId, outcome },
        stackTrace: error.stack,
        sensitiveFields: []
      });
      throw error;
    }
  }

  /**
   * Retrieves paginated campaigns with filtering
   */
  async getPaginatedCampaigns(
    criteria: CampaignSearchCriteria,
    page: number = 1,
    limit: number = 10
  ): Promise<PaginatedCampaignResponse> {
    try {
      logger.debug('Fetching paginated campaigns', { 
        criteria,
        page,
        limit,
        metadata: { operation: 'getPaginatedCampaigns' }
      });

      const result = await this.circuitBreaker.executeFunction(
        async () => CampaignModel.getPaginatedCampaigns(criteria, page, limit),
        'database'
      );

      logger.info('Retrieved paginated campaigns', {
        total: result.total,
        page,
        limit
      });

      return result;
    } catch (error) {
      await this.errorHandler.handleError(error, {
        component: 'CampaignService',
        operation: 'getPaginatedCampaigns',
        metadata: { criteria, page, limit },
        stackTrace: error.stack,
        sensitiveFields: []
      });
      throw error;
    }
  }

  /**
   * Finds active campaigns based on criteria
   */
  async findActiveCampaigns(
    criteria: CampaignSearchCriteria
  ): Promise<CampaignType[]> {
    try {
      logger.debug('Finding active campaigns', { 
        criteria,
        metadata: { operation: 'findActiveCampaigns' }
      });

      const campaigns = await this.circuitBreaker.executeFunction(
        async () => CampaignModel.findActiveCampaigns(criteria),
        'database'
      );

      logger.info('Retrieved active campaigns', {
        count: campaigns.length
      });

      return campaigns;
    } catch (error) {
      await this.errorHandler.handleError(error, {
        component: 'CampaignService',
        operation: 'findActiveCampaigns',
        metadata: { criteria },
        stackTrace: error.stack,
        sensitiveFields: []
      });
      throw error;
    }
  }
}

// Export singleton instance
export const campaignService = new CampaignService();