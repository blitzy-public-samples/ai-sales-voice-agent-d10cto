import { EventEmitter } from 'events';
import { Queue } from 'bull';
import { VoiceAgentStateMachine } from './state-machine';
import { CallConsumer } from '../queue/consumers/call.consumer';
import { VoiceAgentService } from '../services/voice-agent.service';
import { logger } from '../lib/logger';
import { CircuitBreaker } from '../lib/circuit-breaker';
import { MetricsCollector } from 'prom-client';
import { ErrorCode, ErrorCategory } from '../constants/error-codes';
import { JobData, JobResult, MAX_RETRIES, JOB_TIMEOUT } from '../types';

// Constants from JSON specification
const WORKER_SHUTDOWN_TIMEOUT_MS = 30000;
const MAX_CONCURRENT_CALLS = 1;
const HEALTH_CHECK_INTERVAL_MS = 60000;
const CIRCUIT_BREAKER_THRESHOLD = 5;
const CIRCUIT_BREAKER_TIMEOUT_MS = 30000;
const MAX_MEMORY_USAGE_MB = 450;

/**
 * Enum defining possible worker states
 */
export enum WorkerState {
  STARTING = 'STARTING',
  RUNNING = 'RUNNING',
  SHUTTING_DOWN = 'SHUTTING_DOWN',
  STOPPED = 'STOPPED'
}

/**
 * Core worker service that orchestrates the DocShield AI Voice Agent's outbound call processing.
 * Implements robust error handling, comprehensive monitoring, and graceful lifecycle management.
 */
export class WorkerService {
  private readonly jobQueue: Queue;
  private readonly callConsumer: CallConsumer;
  private readonly voiceAgentService: VoiceAgentService;
  private readonly stateMachine: VoiceAgentStateMachine;
  private readonly eventEmitter: EventEmitter;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly metricsCollector: MetricsCollector;
  private currentState: WorkerState;
  private activeCallCount: number;
  private healthCheckInterval: NodeJS.Timer | null;
  private readonly workerId: string;

  constructor(
    jobQueue: Queue,
    voiceAgentService: VoiceAgentService,
    metricsCollector: MetricsCollector
  ) {
    this.jobQueue = jobQueue;
    this.voiceAgentService = voiceAgentService;
    this.metricsCollector = metricsCollector;
    this.workerId = `worker-${Date.now()}`;
    this.currentState = WorkerState.STARTING;
    this.activeCallCount = 0;
    this.healthCheckInterval = null;

    // Initialize event emitter for internal events
    this.eventEmitter = new EventEmitter();

    // Initialize circuit breaker for external service calls
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: CIRCUIT_BREAKER_THRESHOLD,
      resetTimeout: CIRCUIT_BREAKER_TIMEOUT_MS,
      monitoredServices: ['voice-agent', 'queue', 'calendar'],
      retryStrategy: {
        maxRetries: MAX_RETRIES,
        backoffType: 'exponential',
        baseDelay: 1000,
        maxDelay: 8000,
        jitter: true
      }
    });

    // Initialize call consumer with dependencies
    this.callConsumer = new CallConsumer(voiceAgentService, this.circuitBreaker);

    // Initialize state machine
    this.stateMachine = new VoiceAgentStateMachine(voiceAgentService, logger);

    // Set up event listeners
    this.setupEventListeners();
  }

  /**
   * Starts the worker service with enhanced monitoring and reliability
   */
  public async start(): Promise<void> {
    try {
      logger.info('Starting worker service', { workerId: this.workerId });

      // Validate environment and dependencies
      this.validateEnvironment();

      // Initialize metrics collection
      this.initializeMetrics();

      // Set up queue processor with circuit breaker protection
      this.jobQueue.process(MAX_CONCURRENT_CALLS, async (job) => {
        return await this.processJob(job);
      });

      // Set up health check monitoring
      this.startHealthCheck();

      // Set up signal handlers
      this.setupSignalHandlers();

      // Update worker state
      this.currentState = WorkerState.RUNNING;

      logger.info('Worker service started successfully', { workerId: this.workerId });
    } catch (error) {
      logger.error('Failed to start worker service', { error });
      throw error;
    }
  }

  /**
   * Gracefully stops the worker service with resource cleanup
   */
  public async stop(): Promise<void> {
    try {
      logger.info('Stopping worker service', { workerId: this.workerId });

      // Update state to prevent new jobs
      this.currentState = WorkerState.SHUTTING_DOWN;

      // Stop accepting new jobs
      await this.jobQueue.pause(true);

      // Wait for active calls to complete with timeout
      const shutdownTimeout = new Promise<void>((resolve) => {
        setTimeout(resolve, WORKER_SHUTDOWN_TIMEOUT_MS);
      });

      await Promise.race([
        this.waitForActiveCalls(),
        shutdownTimeout
      ]);

      // Clean up resources
      this.cleanup();

      // Update state
      this.currentState = WorkerState.STOPPED;

      logger.info('Worker service stopped successfully', { workerId: this.workerId });
    } catch (error) {
      logger.error('Error stopping worker service', { error });
      throw error;
    }
  }

  /**
   * Processes a single outbound call job with enhanced reliability
   */
  private async processJob(job: Queue.Job<JobData>): Promise<JobResult> {
    const startTime = Date.now();
    const correlationId = `job-${job.id}-${Date.now()}`;

    try {
      // Check concurrent call limit
      if (this.activeCallCount >= MAX_CONCURRENT_CALLS) {
        throw new Error('Maximum concurrent calls reached');
      }

      // Increment active call counter
      this.activeCallCount++;

      // Update metrics
      this.metricsCollector.inc('docshield_active_calls', 1);

      logger.info('Processing job', {
        jobId: job.id,
        campaignId: job.data.campaignId,
        correlationId
      });

      // Process call using consumer with circuit breaker
      const result = await this.circuitBreaker.executeFunction(
        async () => await this.callConsumer.processJob(job),
        'voice-agent'
      );

      // Log completion metrics
      const duration = Date.now() - startTime;
      logger.info('Job completed', {
        jobId: job.id,
        duration,
        outcome: result.outcome,
        correlationId
      });

      return result;
    } catch (error) {
      logger.error('Job processing failed', {
        jobId: job.id,
        error,
        correlationId
      });
      throw error;
    } finally {
      // Decrement active call counter
      this.activeCallCount--;
      this.metricsCollector.dec('docshield_active_calls', 1);
    }
  }

  /**
   * Performs comprehensive system health checks
   */
  public async healthCheck(): Promise<boolean> {
    try {
      // Check queue connection
      const queueHealth = await this.jobQueue.isReady();

      // Check voice agent service
      const voiceAgentHealth = await this.voiceAgentService.healthCheck();

      // Check memory usage
      const memoryUsage = process.memoryUsage().heapUsed / 1024 / 1024;
      const memoryHealth = memoryUsage < MAX_MEMORY_USAGE_MB;

      // Check circuit breaker status
      const circuitBreakerHealth = this.circuitBreaker.getState('voice-agent') !== 'open';

      // Update metrics
      this.metricsCollector.gauge('docshield_worker_health', 1);
      this.metricsCollector.gauge('docshield_memory_usage', memoryUsage);

      const isHealthy = queueHealth && voiceAgentHealth && memoryHealth && circuitBreakerHealth;

      logger.info('Health check completed', {
        isHealthy,
        memoryUsage,
        activeCallCount: this.activeCallCount
      });

      return isHealthy;
    } catch (error) {
      logger.error('Health check failed', { error });
      return false;
    }
  }

  /**
   * Sets up event listeners for monitoring
   */
  private setupEventListeners(): void {
    this.eventEmitter.on('error', (error) => {
      logger.error('Worker service error', { error });
    });

    this.jobQueue.on('error', (error) => {
      logger.error('Queue error', { error });
    });

    this.jobQueue.on('failed', (job, error) => {
      logger.error('Job failed', { jobId: job.id, error });
    });
  }

  /**
   * Initializes metrics collection
   */
  private initializeMetrics(): void {
    // Define metrics
    new this.metricsCollector.Gauge({
      name: 'docshield_active_calls',
      help: 'Number of active calls'
    });

    new this.metricsCollector.Gauge({
      name: 'docshield_worker_health',
      help: 'Worker health status'
    });

    new this.metricsCollector.Gauge({
      name: 'docshield_memory_usage',
      help: 'Worker memory usage in MB'
    });
  }

  /**
   * Validates environment and dependencies
   */
  private validateEnvironment(): void {
    if (!process.env.REDIS_URL) {
      throw new Error('REDIS_URL environment variable not set');
    }

    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable not set');
    }
  }

  /**
   * Sets up signal handlers for graceful shutdown
   */
  private setupSignalHandlers(): void {
    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM signal');
      await this.stop();
    });

    process.on('SIGINT', async () => {
      logger.info('Received SIGINT signal');
      await this.stop();
    });
  }

  /**
   * Starts periodic health checks
   */
  private startHealthCheck(): void {
    this.healthCheckInterval = setInterval(
      async () => {
        await this.healthCheck();
      },
      HEALTH_CHECK_INTERVAL_MS
    );
  }

  /**
   * Waits for active calls to complete
   */
  private async waitForActiveCalls(): Promise<void> {
    while (this.activeCallCount > 0) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  /**
   * Cleans up resources and connections
   */
  private cleanup(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.voiceAgentService.cleanup();
    this.jobQueue.close();
  }

  /**
   * Gets current worker state
   */
  public getCurrentState(): WorkerState {
    return this.currentState;
  }
}