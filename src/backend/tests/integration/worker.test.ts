import { describe, it, beforeEach, afterEach, jest, expect } from '@jest/globals';
import { Queue } from 'bull';
import { MockRedis } from 'ioredis-mock';
import { WorkerService, WorkerState } from '../../src/worker/worker.service';
import { VoiceAgentService } from '../../src/services/voice-agent.service';
import { CallConsumer } from '../../src/queue/consumers/call.consumer';
import { JobData, JobResult, CallOutcome } from '../../types';
import { MetricsCollector } from 'prom-client';

// Test constants
const TEST_TIMEOUT = 30000;
const MOCK_PHONE_NUMBER = '+1234567890';
const MOCK_CAMPAIGN_ID = 'mock_campaign_123';
const PERFORMANCE_THRESHOLD_MS = 1500;
const MAX_RETRY_ATTEMPTS = 3;

// Test context interface
interface TestContext {
  worker: WorkerService;
  queue: Queue;
  voiceAgent: VoiceAgentService;
  metrics: MetricsCollector;
  redis: MockRedis;
}

// Test options interface
interface WorkerTestOptions {
  mockRedisConfig?: any;
  mockVoiceAgentConfig?: any;
  mockMetricsConfig?: any;
}

/**
 * Sets up a clean test environment for each test
 */
async function setupTestWorker(options: WorkerTestOptions = {}): Promise<TestContext> {
  // Initialize mock Redis
  const redis = new MockRedis();
  
  // Create test queue
  const queue = new Queue('test-queue', {
    createClient: () => redis as any
  });

  // Initialize mock voice agent service
  const voiceAgent = {
    startCall: jest.fn(),
    endCall: jest.fn(),
    getMetrics: jest.fn(),
    healthCheck: jest.fn().mockResolvedValue(true),
    cleanup: jest.fn()
  } as unknown as VoiceAgentService;

  // Initialize metrics collector
  const metrics = new MetricsCollector();

  // Create worker service instance
  const worker = new WorkerService(queue, voiceAgent, metrics);

  return {
    worker,
    queue,
    voiceAgent,
    metrics,
    redis
  };
}

/**
 * Cleans up test resources
 */
async function cleanupTestWorker(context: TestContext): Promise<void> {
  await context.worker.stop();
  await context.queue.close();
  context.voiceAgent.cleanup();
  await context.redis.quit();
}

describe('Worker Service Integration Tests', () => {
  let context: TestContext;

  beforeEach(async () => {
    context = await setupTestWorker();
  });

  afterEach(async () => {
    await cleanupTestWorker(context);
  });

  describe('Worker Lifecycle Tests', () => {
    it('should start worker and transition through correct states', async () => {
      // Test worker startup
      expect(context.worker.getCurrentState()).toBe(WorkerState.STARTING);
      await context.worker.start();
      expect(context.worker.getCurrentState()).toBe(WorkerState.RUNNING);

      // Test health check
      const healthStatus = await context.worker.healthCheck();
      expect(healthStatus).toBe(true);

      // Test graceful shutdown
      await context.worker.stop();
      expect(context.worker.getCurrentState()).toBe(WorkerState.STOPPED);
    }, TEST_TIMEOUT);

    it('should handle concurrent operations safely', async () => {
      // Start multiple operations concurrently
      const operations = [
        context.worker.start(),
        context.worker.healthCheck(),
        context.worker.stop()
      ];

      await expect(Promise.all(operations)).resolves.not.toThrow();
    });

    it('should maintain worker health under load', async () => {
      await context.worker.start();

      // Monitor health checks under load
      const healthChecks = Array(10).fill(null).map(() => context.worker.healthCheck());
      const results = await Promise.all(healthChecks);
      
      expect(results.every(status => status === true)).toBe(true);
    });
  });

  describe('Job Processing Tests', () => {
    it('should process outbound call job successfully', async () => {
      await context.worker.start();

      // Mock successful call outcome
      (context.voiceAgent.startCall as jest.Mock).mockResolvedValue(true);

      // Create test job
      const jobData: JobData = {
        campaignId: MOCK_CAMPAIGN_ID as any,
        step: 0,
        type: 'OUTBOUND_CALL',
        retryCount: 0
      };

      // Add job to queue
      const job = await context.queue.add(jobData);

      // Wait for job completion
      const result = await job.finished() as JobResult;

      expect(result.success).toBe(true);
      expect(result.outcome).toBe(CallOutcome.MEETING_SCHEDULED);
    }, TEST_TIMEOUT);

    it('should handle job failures with retry mechanism', async () => {
      await context.worker.start();

      // Mock initial failure then success
      (context.voiceAgent.startCall as jest.Mock)
        .mockRejectedValueOnce(new Error('API Error'))
        .mockResolvedValue(true);

      const jobData: JobData = {
        campaignId: MOCK_CAMPAIGN_ID as any,
        step: 0,
        type: 'OUTBOUND_CALL',
        retryCount: 0
      };

      const job = await context.queue.add(jobData);
      const result = await job.finished() as JobResult;

      expect(job.attemptsMade).toBeLessThanOrEqual(MAX_RETRY_ATTEMPTS);
      expect(result.success).toBe(true);
    });

    it('should maintain job processing performance within thresholds', async () => {
      await context.worker.start();

      // Mock quick successful response
      (context.voiceAgent.startCall as jest.Mock).mockResolvedValue(true);

      const startTime = Date.now();
      const job = await context.queue.add({
        campaignId: MOCK_CAMPAIGN_ID as any,
        step: 0,
        type: 'OUTBOUND_CALL',
        retryCount: 0
      });

      await job.finished();
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLD_MS);
    });
  });

  describe('Error Handling Tests', () => {
    it('should handle voice agent failures gracefully', async () => {
      await context.worker.start();

      // Mock voice agent failure
      (context.voiceAgent.startCall as jest.Mock).mockRejectedValue(
        new Error('Voice processing failed')
      );

      const job = await context.queue.add({
        campaignId: MOCK_CAMPAIGN_ID as any,
        step: 0,
        type: 'OUTBOUND_CALL',
        retryCount: 0
      });

      const result = await job.finished() as JobResult;

      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
      expect(result.outcome).toBe(CallOutcome.FAILED);
    });

    it('should recover from temporary Redis failures', async () => {
      await context.worker.start();

      // Simulate Redis disconnect/reconnect
      await context.redis.disconnect();
      await context.redis.connect();

      const healthStatus = await context.worker.healthCheck();
      expect(healthStatus).toBe(true);
    });

    it('should handle multiple concurrent failures', async () => {
      await context.worker.start();

      // Mock multiple failing calls
      (context.voiceAgent.startCall as jest.Mock).mockRejectedValue(
        new Error('Service unavailable')
      );

      const jobs = await Promise.all(
        Array(5).fill(null).map(() => context.queue.add({
          campaignId: MOCK_CAMPAIGN_ID as any,
          step: 0,
          type: 'OUTBOUND_CALL',
          retryCount: 0
        }))
      );

      const results = await Promise.all(jobs.map(job => job.finished()));
      
      results.forEach(result => {
        expect(result).toHaveProperty('success', false);
        expect(result).toHaveProperty('outcome', CallOutcome.FAILED);
      });
    });
  });

  describe('Performance Metrics Tests', () => {
    it('should track and report worker metrics', async () => {
      await context.worker.start();

      // Mock successful metrics collection
      (context.voiceAgent.getMetrics as jest.Mock).mockResolvedValue({
        activeCallCount: 1,
        memoryUsage: 200,
        cpuUsage: 30
      });

      const healthStatus = await context.worker.healthCheck();
      
      expect(healthStatus).toBe(true);
      expect(context.metrics.register.getMetricsAsJSON()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: expect.stringContaining('docshield_')
          })
        ])
      );
    });

    it('should maintain performance under sustained load', async () => {
      await context.worker.start();

      // Generate sustained load
      const startTime = Date.now();
      const loadTests = Array(20).fill(null).map(async () => {
        const job = await context.queue.add({
          campaignId: MOCK_CAMPAIGN_ID as any,
          step: 0,
          type: 'OUTBOUND_CALL',
          retryCount: 0
        });
        return job.finished();
      });

      await Promise.all(loadTests);
      const duration = Date.now() - startTime;

      // Verify performance metrics
      const metrics = await context.metrics.register.getMetricsAsJSON();
      expect(metrics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'docshield_worker_health',
            value: 1
          })
        ])
      );
      expect(duration / 20).toBeLessThan(PERFORMANCE_THRESHOLD_MS);
    });
  });
});