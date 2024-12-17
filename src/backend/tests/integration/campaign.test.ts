import { describe, it, beforeAll, beforeEach, afterAll, afterEach, jest } from '@jest/globals'; // ^29.0.0
import { expect } from '@jest/globals'; // ^29.0.0
import { Types } from 'mongoose'; // ^7.0.0
import { CampaignService } from '../../src/services/campaign.service';
import CampaignModel from '../../src/db/models/campaign.model';
import { CampaignStatus } from '../../src/types/campaign.types';
import { CallOutcome } from '../../src/types/call-record.types';
import { ErrorCode } from '../../src/constants/error-codes';
import { logger } from '../../src/lib/logger';

/**
 * Integration test suite for campaign functionality
 * Tests complete campaign lifecycle including creation, updates, and error handling
 */
describe('Campaign Integration Tests', () => {
  let campaignService: CampaignService;
  let testCampaignId: Types.ObjectId;
  let testContactId: Types.ObjectId;

  // Mock data for tests
  const mockContactId = new Types.ObjectId();
  const mockThreadId = `thread_${new Types.ObjectId().toString()}`;

  beforeAll(async () => {
    // Initialize test database connection
    process.env.NODE_ENV = 'test';
    process.env.MONGODB_URI = 'mongodb://localhost:27017/docshield-test';
    
    // Disable logging during tests
    jest.spyOn(logger, 'info').mockImplementation(() => {});
    jest.spyOn(logger, 'error').mockImplementation(() => {});
    jest.spyOn(logger, 'warn').mockImplementation(() => {});
    jest.spyOn(logger, 'debug').mockImplementation(() => {});
  });

  beforeEach(async () => {
    // Clear test database before each test
    await CampaignModel.deleteMany({});
    
    // Initialize campaign service
    campaignService = new CampaignService();
    
    // Create test contact ID
    testContactId = new Types.ObjectId();
  });

  afterEach(async () => {
    // Clean up test data
    await CampaignModel.deleteMany({});
    jest.clearAllMocks();
  });

  afterAll(async () => {
    // Close database connections
    await mongoose.disconnect();
  });

  /**
   * Helper function to create test campaign
   */
  async function createTestCampaign(status: CampaignStatus = CampaignStatus.PENDING) {
    const campaign = await campaignService.createCampaign({
      contactId: testContactId,
      status,
      nextCallDate: new Date(Date.now() + 3600000) // 1 hour from now
    });
    return campaign;
  }

  describe('Campaign Creation', () => {
    it('should create a new campaign with valid data', async () => {
      const campaign = await createTestCampaign();
      
      expect(campaign).toBeDefined();
      expect(campaign.contactId).toEqual(testContactId);
      expect(campaign.status).toBe(CampaignStatus.PENDING);
      expect(campaign.messageHistory).toHaveLength(0);
      expect(campaign.lastCompletedStep).toBe(0);
      expect(campaign.threadId).toMatch(/^thread_[a-f0-9]{24}$/);
    });

    it('should validate required fields on creation', async () => {
      await expect(campaignService.createCampaign({
        contactId: testContactId,
        status: CampaignStatus.PENDING,
        nextCallDate: new Date(Date.now() - 3600000) // Invalid past date
      })).rejects.toThrow('Next call date must be in the future');
    });

    it('should prevent duplicate campaigns for same contact', async () => {
      await createTestCampaign();
      
      await expect(createTestCampaign())
        .rejects.toThrow('Campaign with this contact already exists');
    });
  });

  describe('Campaign Status Management', () => {
    it('should update campaign status following valid transitions', async () => {
      const campaign = await createTestCampaign();
      testCampaignId = campaign._id;

      // Test valid transition: PENDING -> IN_PROGRESS
      const updatedCampaign = await campaignService.updateCampaignStatus(
        testCampaignId,
        CampaignStatus.IN_PROGRESS
      );
      expect(updatedCampaign.status).toBe(CampaignStatus.IN_PROGRESS);

      // Test valid transition: IN_PROGRESS -> COMPLETED
      const completedCampaign = await campaignService.updateCampaignStatus(
        testCampaignId,
        CampaignStatus.COMPLETED
      );
      expect(completedCampaign.status).toBe(CampaignStatus.COMPLETED);
      expect(completedCampaign.nextCallDate).toBeNull();
    });

    it('should prevent invalid status transitions', async () => {
      const campaign = await createTestCampaign(CampaignStatus.COMPLETED);
      testCampaignId = campaign._id;

      // Test invalid transition: COMPLETED -> IN_PROGRESS
      await expect(campaignService.updateCampaignStatus(
        testCampaignId,
        CampaignStatus.IN_PROGRESS
      )).rejects.toThrow('Invalid campaign status transition');
    });

    it('should handle concurrent status updates correctly', async () => {
      const campaign = await createTestCampaign();
      testCampaignId = campaign._id;

      // Attempt concurrent updates
      const updates = [
        campaignService.updateCampaignStatus(testCampaignId, CampaignStatus.IN_PROGRESS),
        campaignService.updateCampaignStatus(testCampaignId, CampaignStatus.IN_PROGRESS)
      ];

      await expect(Promise.all(updates)).resolves.toBeDefined();
      const finalCampaign = await campaignService.getCampaignById(testCampaignId);
      expect(finalCampaign?.status).toBe(CampaignStatus.IN_PROGRESS);
    });
  });

  describe('Message History Management', () => {
    it('should add messages to campaign history', async () => {
      const campaign = await createTestCampaign();
      testCampaignId = campaign._id;

      await campaignService.addMessageToHistory(
        testCampaignId,
        'Test message',
        'AGENT',
        { sentiment: 'positive' }
      );

      const updatedCampaign = await campaignService.getCampaignById(testCampaignId);
      expect(updatedCampaign?.messageHistory).toHaveLength(1);
      expect(updatedCampaign?.messageHistory[0].message).toBe('Test message');
      expect(updatedCampaign?.messageHistory[0].type).toBe('AGENT');
      expect(updatedCampaign?.messageHistory[0].metadata).toEqual({ sentiment: 'positive' });
    });

    it('should enforce message history size limits', async () => {
      const campaign = await createTestCampaign();
      testCampaignId = campaign._id;

      // Add maximum allowed messages
      const promises = Array(1000).fill(null).map((_, i) => 
        campaignService.addMessageToHistory(
          testCampaignId,
          `Message ${i}`,
          'SYSTEM'
        )
      );
      await Promise.all(promises);

      // Attempt to add one more message
      await expect(campaignService.addMessageToHistory(
        testCampaignId,
        'Overflow message',
        'SYSTEM'
      )).rejects.toThrow('Message history cannot exceed 1000 entries');
    });
  });

  describe('Call Outcome Management', () => {
    it('should update campaign with successful call outcome', async () => {
      const campaign = await createTestCampaign(CampaignStatus.IN_PROGRESS);
      testCampaignId = campaign._id;

      const updatedCampaign = await campaignService.updateCallOutcome(
        testCampaignId,
        CallOutcome.MEETING_SCHEDULED,
        { meetingTime: new Date() }
      );

      expect(updatedCampaign.status).toBe(CampaignStatus.COMPLETED);
      expect(updatedCampaign.lastCallOutcome).toBe(CallOutcome.MEETING_SCHEDULED);
      expect(updatedCampaign.nextCallDate).toBeNull();
    });

    it('should handle declined call outcomes with reason', async () => {
      const campaign = await createTestCampaign(CampaignStatus.IN_PROGRESS);
      testCampaignId = campaign._id;

      const updatedCampaign = await campaignService.updateCallOutcome(
        testCampaignId,
        CallOutcome.DECLINED,
        { declineReason: 'Not interested' }
      );

      expect(updatedCampaign.lastCallOutcome).toBe(CallOutcome.DECLINED);
      expect(updatedCampaign.messageHistory).toHaveLength(1);
      expect(updatedCampaign.messageHistory[0].message).toContain('Not interested');
    });

    it('should handle failed call attempts with retry logic', async () => {
      const campaign = await createTestCampaign(CampaignStatus.IN_PROGRESS);
      testCampaignId = campaign._id;

      // Simulate failed call attempt
      await campaignService.updateCallOutcome(
        testCampaignId,
        CallOutcome.NO_ANSWER
      );

      const updatedCampaign = await campaignService.getCampaignById(testCampaignId);
      expect(updatedCampaign?.lastCallOutcome).toBe(CallOutcome.NO_ANSWER);
      expect(updatedCampaign?.status).toBe(CampaignStatus.IN_PROGRESS);
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle database connection errors', async () => {
      // Force database error
      jest.spyOn(CampaignModel, 'create').mockRejectedValueOnce(new Error('Database connection failed'));

      await expect(createTestCampaign()).rejects.toThrow('Database connection failed');
    });

    it('should implement retry logic for transient errors', async () => {
      const mockError = new Error('Transient error');
      mockError.code = ErrorCode.API_TIMEOUT_ERROR;

      jest.spyOn(CampaignModel, 'findById')
        .mockRejectedValueOnce(mockError)
        .mockResolvedValueOnce(await createTestCampaign());

      const campaign = await campaignService.getCampaignById(new Types.ObjectId());
      expect(campaign).toBeDefined();
    });

    it('should handle concurrent campaign updates', async () => {
      const campaign = await createTestCampaign();
      testCampaignId = campaign._id;

      // Simulate concurrent updates
      const updates = Array(5).fill(null).map(() =>
        campaignService.addMessageToHistory(
          testCampaignId,
          'Concurrent message',
          'SYSTEM'
        )
      );

      await expect(Promise.all(updates)).resolves.toBeDefined();
      const finalCampaign = await campaignService.getCampaignById(testCampaignId);
      expect(finalCampaign?.messageHistory).toHaveLength(5);
    });
  });
});