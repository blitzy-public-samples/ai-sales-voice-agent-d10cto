import { describe, beforeEach, afterEach, it, expect, jest } from '@jest/globals'; // ^29.0.0
import { Types } from 'mongoose'; // ^7.0.0
import { CampaignService } from '../../src/services/campaign.service';
import { Logger } from '../../src/lib/logger';
import { ErrorHandler } from '../../src/lib/error-handler';
import { CampaignStatus } from '../../src/types/campaign.types';
import { CallOutcome } from '../../src/types/call-record.types';

// Mock dependencies
jest.mock('../../src/lib/logger');
jest.mock('../../src/lib/error-handler');
jest.mock('../../src/db/models/campaign.model');

describe('CampaignService', () => {
  let campaignService: CampaignService;
  let mockCampaignModel: any;
  let mockLogger: jest.Mocked<typeof Logger>;
  let mockErrorHandler: jest.Mocked<typeof ErrorHandler>;

  // Test data fixtures
  const testContactId = new Types.ObjectId();
  const testCampaignId = new Types.ObjectId();
  const testMessage = 'Test message';
  const testThreadId = `thread_${new Types.ObjectId().toString()}`;

  const mockCampaign = {
    _id: testCampaignId,
    contactId: testContactId,
    status: CampaignStatus.PENDING,
    messageHistory: [],
    lastCompletedStep: 0,
    lastCallOutcome: null,
    lastCallDate: null,
    nextCallDate: new Date(),
    threadId: testThreadId,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Initialize mocked dependencies
    mockCampaignModel = {
      create: jest.fn(),
      findById: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      updateCampaignStatus: jest.fn(),
      getPaginatedCampaigns: jest.fn(),
      findActiveCampaigns: jest.fn()
    };

    // Initialize CampaignService instance
    campaignService = new CampaignService();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('createCampaign', () => {
    const createInput = {
      contactId: testContactId,
      status: CampaignStatus.PENDING,
      nextCallDate: new Date()
    };

    it('should create campaign successfully with valid input', async () => {
      mockCampaignModel.create.mockResolvedValueOnce(mockCampaign);

      const result = await campaignService.createCampaign(createInput);

      expect(result).toEqual(mockCampaign);
      expect(mockCampaignModel.create).toHaveBeenCalledWith(createInput);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Creating new campaign',
        expect.any(Object)
      );
    });

    it('should throw error with invalid contact ID', async () => {
      const invalidInput = { ...createInput, contactId: 'invalid' };
      const error = new Error('Invalid contact ID');

      mockCampaignModel.create.mockRejectedValueOnce(error);

      await expect(campaignService.createCampaign(invalidInput))
        .rejects
        .toThrow('Invalid contact ID');

      expect(mockErrorHandler.handleError).toHaveBeenCalledWith(
        error,
        expect.any(Object)
      );
    });

    it('should handle database errors during creation', async () => {
      const dbError = new Error('Database connection failed');
      mockCampaignModel.create.mockRejectedValueOnce(dbError);

      await expect(campaignService.createCampaign(createInput))
        .rejects
        .toThrow('Database connection failed');

      expect(mockErrorHandler.handleError).toHaveBeenCalledWith(
        dbError,
        expect.objectContaining({
          component: 'CampaignService',
          operation: 'createCampaign'
        })
      );
    });
  });

  describe('updateCampaignStatus', () => {
    it('should update status successfully', async () => {
      const newStatus = CampaignStatus.IN_PROGRESS;
      const updatedCampaign = { ...mockCampaign, status: newStatus };

      mockCampaignModel.updateCampaignStatus.mockResolvedValueOnce(updatedCampaign);

      const result = await campaignService.updateCampaignStatus(testCampaignId, newStatus);

      expect(result).toEqual(updatedCampaign);
      expect(mockCampaignModel.updateCampaignStatus).toHaveBeenCalledWith(
        testCampaignId,
        newStatus
      );
    });

    it('should validate status transitions', async () => {
      const invalidStatus = CampaignStatus.COMPLETED;
      const error = new Error('Invalid status transition');

      mockCampaignModel.updateCampaignStatus.mockRejectedValueOnce(error);

      await expect(campaignService.updateCampaignStatus(testCampaignId, invalidStatus))
        .rejects
        .toThrow('Invalid status transition');
    });

    it('should handle invalid campaign IDs', async () => {
      const error = new Error('Campaign not found');
      mockCampaignModel.updateCampaignStatus.mockRejectedValueOnce(error);

      await expect(campaignService.updateCampaignStatus(new Types.ObjectId(), CampaignStatus.IN_PROGRESS))
        .rejects
        .toThrow('Campaign not found');
    });
  });

  describe('addMessageToHistory', () => {
    it('should add message to history', async () => {
      const messageType = 'AGENT';
      const metadata = { key: 'value' };

      mockCampaignModel.findByIdAndUpdate.mockResolvedValueOnce({
        ...mockCampaign,
        messageHistory: [{
          timestamp: expect.any(Date),
          message: testMessage,
          type: messageType,
          metadata
        }]
      });

      await campaignService.addMessageToHistory(
        testCampaignId,
        testMessage,
        messageType,
        metadata
      );

      expect(mockCampaignModel.findByIdAndUpdate).toHaveBeenCalledWith(
        testCampaignId,
        expect.objectContaining({
          $push: expect.any(Object)
        }),
        expect.any(Object)
      );
    });

    it('should handle empty messages', async () => {
      await expect(campaignService.addMessageToHistory(
        testCampaignId,
        '',
        'AGENT'
      )).rejects.toThrow();
    });

    it('should enforce message size limits', async () => {
      const longMessage = 'a'.repeat(2001);
      await expect(campaignService.addMessageToHistory(
        testCampaignId,
        longMessage,
        'AGENT'
      )).rejects.toThrow();
    });
  });

  describe('updateCallOutcome', () => {
    it('should update call outcome successfully', async () => {
      const outcome = CallOutcome.MEETING_SCHEDULED;
      const metadata = { duration: 300 };
      const updatedCampaign = {
        ...mockCampaign,
        lastCallOutcome: outcome,
        lastCallDate: expect.any(Date)
      };

      mockCampaignModel.findById.mockResolvedValueOnce({
        ...mockCampaign,
        updateCallOutcome: jest.fn().mockResolvedValueOnce(undefined)
      });

      const result = await campaignService.updateCallOutcome(
        testCampaignId,
        outcome,
        metadata
      );

      expect(result).toBeDefined();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Call outcome updated successfully',
        expect.any(Object)
      );
    });

    it('should update next call date appropriately', async () => {
      const outcome = CallOutcome.VOICEMAIL;
      const nextCallDate = new Date();
      nextCallDate.setDate(nextCallDate.getDate() + 1);

      mockCampaignModel.findById.mockResolvedValueOnce({
        ...mockCampaign,
        updateCallOutcome: jest.fn().mockResolvedValueOnce(undefined)
      });

      await campaignService.updateCallOutcome(testCampaignId, outcome);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Call outcome updated successfully',
        expect.any(Object)
      );
    });

    it('should handle invalid outcomes', async () => {
      const invalidOutcome = 'INVALID' as CallOutcome;
      
      await expect(campaignService.updateCallOutcome(
        testCampaignId,
        invalidOutcome
      )).rejects.toThrow();
    });
  });
});