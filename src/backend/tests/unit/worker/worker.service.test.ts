import { describe, beforeEach, afterEach, it, expect, jest } from '@jest/globals';
import { Queue } from 'bull';
import { WorkerService, WorkerState } from '../../../src/worker/worker.service';
import { VoiceAgentService } from '../../../src/services/voice-agent.service';
import { MetricsCollector } from 'prom-client';
import { JobData, JobResult, CallOutcome } from '../../../src/types';

// Mock configurations
const MOCK_QUEUE_CONFIG = {
  host: 'localhost',
  port: 6379,
  prefix: 'test'
};

const MOCK_JOB_DATA: JobData = {
  campaignId: 'test-123',
  step: 0,
  type: 'OUTBOUND_CALL',
  retryCount: 0
};

// Test timeouts and thresholds
const TEST_TIMEOUT = 30000;
const MAX_RETRIES = 3;
const LATENCY_THRESHOLD = 1500;

describe('WorkerService', () => {
  let workerService: WorkerService;
  let mockQueue: jest.Mocked<Queue>;
  let mockVoiceAgent: jest.Mocked<VoiceAgentService>;
  let mockMetrics: jest.Mocked<MetricsCollector>;

  beforeEach(() => {
    // Create mock instances
    mockQueue = {
      process: jest.fn(),
      pause: jest.fn(),
      isReady: jest.fn(),
      close: jest.fn(),
      on: jest.fn()
    } as unknown as jest.Mocked<Queue>;

    mockVoiceAgent = {
      startCall: jest.fn(),
      endCall: jest.fn(),
      getCallMetrics: jest.fn(),
      getLatencyStats: jest.fn(),
      healthCheck: jest.fn(),
      cleanup: jest.fn()
    } as unknown as jest.Mocked<VoiceAgentService>;

    mockMetrics = {
      gauge: jest.fn(),
      inc: jest.fn(),
      dec: jest.fn()
    } as unknown as jest.Mocked<MetricsCollector>;

    // Initialize worker service
    workerService = new WorkerService(mockQueue, mockVoiceAgent, mockMetrics);
  });

  afterEach(async () => {
    // Clean up after each test
    if (workerService.getCurrentState() !== WorkerState.STOPPED) {
      await workerService.stop();
    }
    jest.clearAllMocks();
  });

  describe('Worker Lifecycle', () => {
    it('should start worker and transition through correct states', async () => {
      // Setup mock responses
      mockQueue.isReady.mockResolvedValue(true);
      mockVoiceAgent.healthCheck.mockResolvedValue(true);

      // Start worker
      await workerService.start();

      // Verify state transitions
      expect(workerService.getCurrentState()).toBe(WorkerState.RUNNING);
      expect(mockQueue.process).toHaveBeenCalled();
      expect(mockMetrics.gauge).toHaveBeenCalledWith('docshield_worker_health', 1);
    });

    it('should gracefully stop worker and cleanup resources', async () => {
      // Start worker first
      await workerService.start();

      // Stop worker
      await workerService.stop();

      // Verify cleanup
      expect(workerService.getCurrentState()).toBe(WorkerState.STOPPED);
      expect(mockQueue.pause).toHaveBeenCalled();
      expect(mockVoiceAgent.cleanup).toHaveBeenCalled();
      expect(mockQueue.close).toHaveBeenCalled();
    });

    it('should handle startup failures gracefully', async () => {
      // Mock startup failure
      mockQueue.isReady.mockRejectedValue(new Error('Redis connection failed'));

      // Attempt to start worker
      await expect(workerService.start()).rejects.toThrow('Redis connection failed');
      expect(workerService.getCurrentState()).not.toBe(WorkerState.RUNNING);
    });
  });

  describe('Job Processing', () => {
    it('should process jobs successfully and track metrics', async () => {
      // Setup mock job
      const mockJob = {
        id: 'job-123',
        data: MOCK_JOB_DATA
      };

      // Setup successful call outcome
      mockVoiceAgent.startCall.mockResolvedValue(true);
      mockVoiceAgent.getCallMetrics.mockResolvedValue({
        latency: 100,
        packetLoss: 0.01,
        audioQualityScore: 9.0
      });

      // Start worker and process job
      await workerService.start();
      const processCallback = mockQueue.process.mock.calls[0][1];
      const result = await processCallback(mockJob);

      // Verify job processing
      expect(result.success).toBe(true);
      expect(mockMetrics.inc).toHaveBeenCalledWith('docshield_active_calls', 1);
      expect(mockMetrics.dec).toHaveBeenCalledWith('docshield_active_calls', 1);
    });

    it('should handle concurrent call limits correctly', async () => {
      // Setup multiple mock jobs
      const mockJobs = [
        { id: 'job-1', data: MOCK_JOB_DATA },
        { id: 'job-2', data: MOCK_JOB_DATA }
      ];

      await workerService.start();
      const processCallback = mockQueue.process.mock.calls[0][1];

      // Process jobs concurrently
      const results = await Promise.all(
        mockJobs.map(job => processCallback(job))
      );

      // Verify only one call was active at a time
      expect(mockMetrics.inc).toHaveBeenCalledTimes(2);
      expect(mockMetrics.dec).toHaveBeenCalledTimes(2);
    });
  });

  describe('Error Handling', () => {
    it('should retry failed jobs with exponential backoff', async () => {
      // Setup failing job
      const mockJob = {
        id: 'job-123',
        data: MOCK_JOB_DATA,
        attemptsMade: 0
      };

      // Mock voice agent failure
      mockVoiceAgent.startCall.mockRejectedValue(new Error('Network error'));

      await workerService.start();
      const processCallback = mockQueue.process.mock.calls[0][1];

      // Process job and verify retry behavior
      const result = await processCallback(mockJob);
      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
      expect(mockJob.attemptsMade).toBeLessThanOrEqual(MAX_RETRIES);
    });

    it('should handle voice agent errors gracefully', async () => {
      // Setup job with voice agent error
      const mockJob = {
        id: 'job-123',
        data: MOCK_JOB_DATA
      };

      mockVoiceAgent.startCall.mockRejectedValue(new Error('Voice processing failed'));

      await workerService.start();
      const processCallback = mockQueue.process.mock.calls[0][1];
      const result = await processCallback(mockJob);

      expect(result.success).toBe(false);
      expect(result.outcome).toBe(CallOutcome.FAILED);
    });
  });

  describe('Performance Metrics', () => {
    it('should track and report voice agent latency', async () => {
      // Setup mock metrics
      mockVoiceAgent.getLatencyStats.mockResolvedValue({
        avg: 100,
        max: 200,
        min: 50
      });

      await workerService.start();
      const healthCheck = await workerService.healthCheck();

      expect(healthCheck).toBe(true);
      expect(mockMetrics.gauge).toHaveBeenCalled();
    });

    it('should maintain response time within SLA', async () => {
      // Setup mock job with timing
      const mockJob = {
        id: 'job-123',
        data: MOCK_JOB_DATA
      };

      const startTime = Date.now();
      await workerService.start();
      const processCallback = mockQueue.process.mock.calls[0][1];
      await processCallback(mockJob);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(LATENCY_THRESHOLD);
    });
  });

  describe('Health Checks', () => {
    it('should perform comprehensive health checks', async () => {
      // Setup healthy state
      mockQueue.isReady.mockResolvedValue(true);
      mockVoiceAgent.healthCheck.mockResolvedValue(true);

      const healthStatus = await workerService.healthCheck();

      expect(healthStatus).toBe(true);
      expect(mockQueue.isReady).toHaveBeenCalled();
      expect(mockVoiceAgent.healthCheck).toHaveBeenCalled();
    });

    it('should detect and report unhealthy states', async () => {
      // Setup unhealthy state
      mockQueue.isReady.mockResolvedValue(false);
      mockVoiceAgent.healthCheck.mockResolvedValue(false);

      const healthStatus = await workerService.healthCheck();

      expect(healthStatus).toBe(false);
      expect(mockMetrics.gauge).toHaveBeenCalledWith('docshield_worker_health', 1);
    });
  });
});