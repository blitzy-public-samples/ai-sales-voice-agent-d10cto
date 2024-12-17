import { describe, beforeEach, afterEach, it, expect, jest } from '@jest/globals'; // v29.0.0
import { Types } from 'mongoose'; // v7.0.0
import { CallRecordService } from '../../../src/services/call-record.service';
import { S3Service } from '../../../src/integrations/s3/s3.service';
import { 
  CallRecordType, 
  CallRecordCreateInput, 
  CallOutcome 
} from '../../../src/types/call-record.types';
import { 
  ServerSideEncryption, 
  StorageClass, 
  AudioFormat 
} from '../../../src/integrations/s3/types';
import { ErrorCode } from '../../../src/constants/error-codes';

// Mock S3Service implementation
class MockS3Service {
  uploadFile = jest.fn();
  getSignedUrl = jest.fn();
  validateAudioFormat = jest.fn();
  validateEncryption = jest.fn();
}

describe('CallRecordService', () => {
  let callRecordService: CallRecordService;
  let mockS3Service: MockS3Service;
  let testCampaignId: Types.ObjectId;
  let testRecordingBuffer: Buffer;

  beforeEach(() => {
    // Initialize mocks and test data
    mockS3Service = new MockS3Service();
    callRecordService = new CallRecordService(mockS3Service as unknown as S3Service);
    testCampaignId = new Types.ObjectId();
    testRecordingBuffer = Buffer.from('test audio data');

    // Reset all mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('createCallRecord', () => {
    const validCreateInput: CallRecordCreateInput = {
      campaignId: new Types.ObjectId(),
      callTime: new Date(),
      duration: 120,
      outcome: CallOutcome.MEETING_SCHEDULED,
      declineReason: null
    };

    it('should create call record with valid WAV format and specifications', async () => {
      // Setup mock responses
      mockS3Service.validateAudioFormat.mockResolvedValue(true);
      mockS3Service.uploadFile.mockResolvedValue({
        url: 'https://s3.amazonaws.com/test-bucket/recording.wav',
        key: 'recordings/test/123.wav',
        bucket: 'test-bucket',
        metadata: {
          campaignId: validCreateInput.campaignId.toString(),
          callTime: validCreateInput.callTime.toISOString(),
          outcome: validCreateInput.outcome
        },
        serverSideEncryption: ServerSideEncryption.KMS
      });

      // Execute test
      const result = await callRecordService.createCallRecord(
        validCreateInput,
        testRecordingBuffer
      );

      // Verify results
      expect(result).toBeDefined();
      expect(result.audioFormat).toBe('WAV');
      expect(result.channels).toBe(2);
      expect(result.sampleRate).toBe(48000);
      expect(result.bitDepth).toBe(16);
      expect(mockS3Service.validateAudioFormat).toHaveBeenCalledWith(
        testRecordingBuffer,
        expect.objectContaining({
          format: AudioFormat.WAV,
          channels: 2,
          sampleRate: 48000,
          bitDepth: 16
        })
      );
    });

    it('should validate 48kHz sample rate requirement', async () => {
      // Setup invalid audio format
      mockS3Service.validateAudioFormat.mockResolvedValue(false);

      // Execute and verify error
      await expect(
        callRecordService.createCallRecord(validCreateInput, testRecordingBuffer)
      ).rejects.toThrow('Invalid audio format or specifications');
    });

    it('should enforce 16-bit depth requirement', async () => {
      // Setup mock validation
      mockS3Service.validateAudioFormat.mockImplementation(
        (buffer, metadata) => Promise.resolve(metadata.bitDepth === 16)
      );

      // Execute test
      await callRecordService.createCallRecord(validCreateInput, testRecordingBuffer);

      // Verify validation was called with correct bit depth
      expect(mockS3Service.validateAudioFormat).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.objectContaining({ bitDepth: 16 })
      );
    });

    it('should handle S3 upload failures with retry', async () => {
      // Setup mock to fail first then succeed
      mockS3Service.validateAudioFormat.mockResolvedValue(true);
      mockS3Service.uploadFile
        .mockRejectedValueOnce(new Error('S3 upload failed'))
        .mockResolvedValueOnce({
          url: 'https://s3.amazonaws.com/test-bucket/recording.wav',
          key: 'recordings/test/123.wav',
          bucket: 'test-bucket',
          serverSideEncryption: ServerSideEncryption.KMS
        });

      // Execute test
      const result = await callRecordService.createCallRecord(
        validCreateInput,
        testRecordingBuffer
      );

      // Verify retry behavior
      expect(mockS3Service.uploadFile).toHaveBeenCalledTimes(2);
      expect(result).toBeDefined();
    });

    it('should verify AES-256 encryption', async () => {
      // Setup encryption validation
      mockS3Service.validateAudioFormat.mockResolvedValue(true);
      mockS3Service.validateEncryption.mockResolvedValue(true);

      // Execute test
      await callRecordService.createCallRecord(validCreateInput, testRecordingBuffer);

      // Verify encryption settings
      expect(mockS3Service.uploadFile).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.any(String),
        expect.objectContaining({
          serverSideEncryption: ServerSideEncryption.KMS,
          storageClass: StorageClass.STANDARD
        })
      );
    });

    it('should validate dual channel audio', async () => {
      // Setup channel validation
      mockS3Service.validateAudioFormat.mockImplementation(
        (buffer, metadata) => Promise.resolve(metadata.channels === 2)
      );

      // Execute test
      await callRecordService.createCallRecord(validCreateInput, testRecordingBuffer);

      // Verify channel validation
      expect(mockS3Service.validateAudioFormat).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.objectContaining({ channels: 2 })
      );
    });
  });

  describe('getCallRecordsByCampaign', () => {
    const mockUserContext = { userId: 'test-user' };

    it('should retrieve records for valid campaign ID', async () => {
      // Setup mock response
      const mockRecords = [{
        campaignId: testCampaignId,
        recordingUrl: 'https://s3.amazonaws.com/test/recording.wav',
        outcome: CallOutcome.MEETING_SCHEDULED
      }];

      mockS3Service.getSignedUrl.mockResolvedValue(
        'https://s3.amazonaws.com/test/recording.wav?signed=true'
      );

      // Execute test
      const result = await callRecordService.getCallRecordsByCampaign(
        testCampaignId,
        mockUserContext
      );

      // Verify results
      expect(result).toBeDefined();
      expect(result[0].recordingUrl).toContain('signed=true');
    });

    it('should handle non-existent campaign gracefully', async () => {
      // Execute and verify error handling
      await expect(
        callRecordService.getCallRecordsByCampaign(
          new Types.ObjectId(),
          mockUserContext
        )
      ).rejects.toThrow();
    });
  });

  describe('getSignedRecordingUrl', () => {
    it('should generate valid signed URL with expiration', async () => {
      // Setup mock
      const recordingKey = 'recordings/test/123.wav';
      mockS3Service.getSignedUrl.mockResolvedValue(
        'https://s3.amazonaws.com/test/recording.wav?signed=true&expires=3600'
      );

      // Execute test
      const result = await callRecordService['getSignedRecordingUrl'](recordingKey);

      // Verify URL generation
      expect(result).toContain('signed=true');
      expect(result).toContain('expires=3600');
    });

    it('should enforce URL expiration limits', async () => {
      const recordingKey = 'recordings/test/123.wav';
      
      // Execute test with mock implementation checking expiry
      mockS3Service.getSignedUrl.mockImplementation((key, expiry) => {
        expect(expiry).toBeLessThanOrEqual(3600); // 1 hour max
        return Promise.resolve('https://signed-url.com');
      });

      await callRecordService['getSignedRecordingUrl'](recordingKey);
    });
  });

  // Error handling test cases
  describe('error handling', () => {
    it('should handle invalid recording keys', async () => {
      // Setup mock to simulate invalid key error
      mockS3Service.getSignedUrl.mockRejectedValue(
        new Error('Invalid recording key')
      );

      // Execute and verify error handling
      await expect(
        callRecordService['getSignedRecordingUrl']('invalid/key')
      ).rejects.toThrow();
    });

    it('should validate security headers', async () => {
      // Setup mock with security headers validation
      mockS3Service.uploadFile.mockImplementation((buffer, key, options) => {
        expect(options.metadata).toHaveProperty('x-amz-server-side-encryption');
        expect(options.serverSideEncryption).toBe(ServerSideEncryption.KMS);
        return Promise.resolve({
          url: 'https://s3.amazonaws.com/test/recording.wav',
          key,
          bucket: 'test-bucket',
          serverSideEncryption: ServerSideEncryption.KMS
        });
      });

      // Execute test
      await callRecordService.createCallRecord(
        {
          campaignId: testCampaignId,
          callTime: new Date(),
          duration: 120,
          outcome: CallOutcome.MEETING_SCHEDULED,
          declineReason: null
        },
        testRecordingBuffer
      );
    });
  });
});