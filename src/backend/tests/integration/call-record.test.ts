import { describe, beforeAll, afterAll, it, expect } from '@jest/globals'; // v29.0.0
import { container } from 'tsyringe'; // v4.7.0
import { Types } from 'mongoose'; // v7.0.0
import { CallRecordService } from '../../src/services/call-record.service';
import CallRecordModel from '../../src/db/models/call-record.model';
import { S3Service } from '../../src/integrations/s3/s3.service';
import { 
  CallOutcome, 
  CallRecordCreateInput 
} from '../../src/types/call-record.types';
import { 
  AudioFormat,
  ServerSideEncryption,
  StorageClass 
} from '../../src/integrations/s3/types';
import { ErrorHandler } from '../../src/lib/error-handler';
import { logger } from '../../src/lib/logger';

describe('Call Record Integration Tests', () => {
  let callRecordService: CallRecordService;
  let s3Service: S3Service;
  let testCampaignId: Types.ObjectId;
  let testRecordingBuffer: Buffer;

  beforeAll(async () => {
    // Connect to test database
    await mongoose.connect(process.env.TEST_DB_URI!, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    // Register services in container
    container.register('ErrorHandler', {
      useValue: new ErrorHandler({
        maxRetries: 3,
        backoffMs: 1000,
        circuitBreakerConfig: {
          failureThreshold: 3,
          resetTimeout: 30000,
          monitoredServices: ['S3', 'MongoDB']
        }
      })
    });

    container.register('S3Service', {
      useClass: S3Service
    });

    container.register('CallRecordService', {
      useClass: CallRecordService
    });

    // Get service instances
    s3Service = container.resolve(S3Service);
    callRecordService = container.resolve(CallRecordService);

    // Generate test campaign ID
    testCampaignId = new Types.ObjectId();

    // Create test audio buffer with correct specifications
    testRecordingBuffer = await generateTestAudioBuffer();

    // Clear test data
    await CallRecordModel.deleteMany({});
  });

  afterAll(async () => {
    // Clean up test data
    await CallRecordModel.deleteMany({});

    // Delete test recordings from S3
    const records = await CallRecordModel.find({});
    for (const record of records) {
      try {
        await s3Service.deleteFile(record.recordingUrl);
      } catch (error) {
        logger.error('Failed to delete test recording', { error });
      }
    }

    // Disconnect from test database
    await mongoose.disconnect();
  });

  describe('Call Record Creation', () => {
    it('should create call record with proper audio format and security', async () => {
      // Prepare test input
      const input: CallRecordCreateInput = {
        campaignId: testCampaignId,
        callTime: new Date(),
        duration: 120,
        outcome: CallOutcome.MEETING_SCHEDULED,
        declineReason: null
      };

      // Create call record
      const record = await callRecordService.createCallRecord(input, testRecordingBuffer);

      // Verify record creation
      expect(record).toBeDefined();
      expect(record.campaignId).toEqual(testCampaignId);
      expect(record.outcome).toBe(CallOutcome.MEETING_SCHEDULED);

      // Verify audio format specifications
      expect(record.audioFormat).toBe('WAV');
      expect(record.channels).toBe(2);
      expect(record.sampleRate).toBe(48000);
      expect(record.bitDepth).toBe(16);

      // Verify S3 storage and security
      const s3Object = await s3Service.getObjectMetadata(record.recordingUrl);
      expect(s3Object.ServerSideEncryption).toBe(ServerSideEncryption.KMS);
      expect(s3Object.StorageClass).toBe(StorageClass.STANDARD);
      expect(s3Object.Metadata['x-amz-meta-service']).toBe('docshield-voice-agent');
    });

    it('should reject invalid audio format', async () => {
      const invalidBuffer = Buffer.from('invalid audio data');
      const input: CallRecordCreateInput = {
        campaignId: testCampaignId,
        callTime: new Date(),
        duration: 60,
        outcome: CallOutcome.DECLINED,
        declineReason: 'Not interested'
      };

      await expect(
        callRecordService.createCallRecord(input, invalidBuffer)
      ).rejects.toThrow('Invalid audio format or specifications');
    });
  });

  describe('Call Record Retrieval', () => {
    it('should retrieve call records by campaign with secure URLs', async () => {
      // Create multiple test records
      const records = await createTestCallRecords(3);

      // Retrieve records
      const retrievedRecords = await callRecordService.getCallRecordsByCampaign(
        testCampaignId,
        { userId: 'test-user' }
      );

      // Verify retrieval
      expect(retrievedRecords).toHaveLength(3);
      
      // Verify secure URLs
      for (const record of retrievedRecords) {
        expect(record.recordingUrl).toMatch(/^https:\/\/.+\.s3\.amazonaws\.com\/.+/);
        expect(record.recordingUrl).toMatch(/X-Amz-Algorithm=AWS4-HMAC-SHA256/);
        expect(record.recordingUrl).toMatch(/X-Amz-Expires=3600/);
      }
    });

    it('should filter records by date range with pagination', async () => {
      const startDate = new Date('2023-01-01');
      const endDate = new Date('2023-12-31');
      
      const records = await CallRecordModel.findByDateRange(startDate, endDate, 1);
      
      expect(records).toBeDefined();
      expect(Array.isArray(records)).toBe(true);
      expect(records.length).toBeLessThanOrEqual(50); // Default page size
    });
  });

  describe('Security and Access Control', () => {
    it('should enforce encryption on all stored recordings', async () => {
      const record = await createTestCallRecord();
      const s3Object = await s3Service.getObjectMetadata(record.recordingUrl);
      
      expect(s3Object.ServerSideEncryption).toBeDefined();
      expect(s3Object.SSEKMSKeyId).toBeDefined();
    });

    it('should generate time-limited signed URLs', async () => {
      const record = await createTestCallRecord();
      const signedUrl = await callRecordService.getSignedRecordingUrl(record._id);
      
      expect(signedUrl).toMatch(/X-Amz-Expires=3600/); // 1 hour expiry
      expect(signedUrl).toMatch(/X-Amz-SignedHeaders=host/);
    });
  });
});

/**
 * Helper function to generate test audio buffer with correct specifications
 */
async function generateTestAudioBuffer(): Promise<Buffer> {
  // In a real implementation, this would generate actual WAV audio data
  // For testing, we'll create a buffer with WAV header
  const header = Buffer.from('RIFF    WAVEfmt ');
  const data = Buffer.alloc(1024); // Simulated audio data
  return Buffer.concat([header, data]);
}

/**
 * Helper function to create a test call record
 */
async function createTestCallRecord(): Promise<any> {
  const input: CallRecordCreateInput = {
    campaignId: testCampaignId,
    callTime: new Date(),
    duration: 60,
    outcome: CallOutcome.MEETING_SCHEDULED,
    declineReason: null
  };

  return await callRecordService.createCallRecord(input, testRecordingBuffer);
}

/**
 * Helper function to create multiple test call records
 */
async function createTestCallRecords(count: number): Promise<any[]> {
  const records = [];
  for (let i = 0; i < count; i++) {
    records.push(await createTestCallRecord());
  }
  return records;
}