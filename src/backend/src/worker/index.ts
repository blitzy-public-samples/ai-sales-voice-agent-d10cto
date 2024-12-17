/**
 * @fileoverview Main entry point for DocShield AI Voice Agent worker process.
 * Implements worker lifecycle management, state tracking, and configuration handling
 * for autonomous sales outreach calls.
 * 
 * @version 1.0.0
 * @license MIT
 */

import { WorkerService } from './worker.service';
import { VoiceAgentStateMachine, VoiceAgentState } from './state-machine';
import { Logger } from '@logtail/node';

// Constants from technical specifications
const DEFAULT_WORKER_OPTIONS = {
  maxConcurrentCalls: 1,           // Single call per worker for quality
  healthCheckIntervalMs: 60000,    // 1-minute health check interval
  shutdownTimeoutMs: 30000,        // 30-second graceful shutdown
  retryAttempts: 3,               // Max retry attempts per job
  circuitBreakerThreshold: 5,     // Circuit breaker failure threshold
  monitoringEnabled: true,        // Enable LogTail monitoring
  logLevel: 'info'                // Default log level
};

/**
 * Enum defining possible worker states with error handling
 */
export enum WorkerState {
  STARTING = 'STARTING',
  RUNNING = 'RUNNING',
  SHUTTING_DOWN = 'SHUTTING_DOWN',
  STOPPED = 'STOPPED',
  ERROR = 'ERROR'
}

/**
 * Main worker class that manages the DocShield AI Voice Agent process lifecycle
 */
class DocShieldWorker {
  private readonly workerService: WorkerService;
  private readonly logger: Logger;
  private currentState: WorkerState;
  private readonly workerId: string;
  private healthCheckInterval: NodeJS.Timer | null;

  constructor() {
    this.workerId = `worker-${Date.now()}`;
    this.currentState = WorkerState.STARTING;
    this.healthCheckInterval = null;

    // Initialize logger with worker ID
    this.logger = new Logger({
      sourceToken: process.env.LOGTAIL_SOURCE_TOKEN,
      meta: {
        workerId: this.workerId,
        service: 'docshield-voice-agent'
      }
    });

    // Initialize worker service
    this.workerService = new WorkerService();

    // Set up signal handlers for graceful shutdown
    this.setupSignalHandlers();
  }

  /**
   * Starts the worker process with enhanced monitoring
   */
  public async start(): Promise<void> {
    try {
      this.logger.info('Starting DocShield Voice Agent worker', {
        workerId: this.workerId,
        options: DEFAULT_WORKER_OPTIONS
      });

      // Validate environment variables
      this.validateEnvironment();

      // Start worker service
      await this.workerService.start();

      // Start health check monitoring
      this.startHealthCheck();

      // Update worker state
      this.updateState(WorkerState.RUNNING);

      this.logger.info('Worker started successfully', {
        workerId: this.workerId,
        state: this.currentState
      });
    } catch (error) {
      this.handleError('Failed to start worker', error as Error);
      throw error;
    }
  }

  /**
   * Gracefully stops the worker process
   */
  public async stop(): Promise<void> {
    try {
      this.logger.info('Stopping worker', { workerId: this.workerId });

      // Update state to prevent new jobs
      this.updateState(WorkerState.SHUTTING_DOWN);

      // Stop health check monitoring
      this.stopHealthCheck();

      // Stop worker service with timeout
      await Promise.race([
        this.workerService.stop(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Shutdown timeout')), 
          DEFAULT_WORKER_OPTIONS.shutdownTimeoutMs)
        )
      ]);

      // Update state
      this.updateState(WorkerState.STOPPED);

      this.logger.info('Worker stopped successfully', {
        workerId: this.workerId
      });
    } catch (error) {
      this.handleError('Failed to stop worker', error as Error);
      throw error;
    }
  }

  /**
   * Validates required environment variables
   */
  private validateEnvironment(): void {
    const requiredEnvVars = [
      'REDIS_URL',
      'OPENAI_API_KEY',
      'LOGTAIL_SOURCE_TOKEN',
      'MONGODB_URI'
    ];

    const missing = requiredEnvVars.filter(v => !process.env[v]);
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
  }

  /**
   * Sets up signal handlers for graceful shutdown
   */
  private setupSignalHandlers(): void {
    process.on('SIGTERM', async () => {
      this.logger.info('Received SIGTERM signal');
      await this.stop();
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      this.logger.info('Received SIGINT signal');
      await this.stop();
      process.exit(0);
    });

    process.on('uncaughtException', (error) => {
      this.handleError('Uncaught exception', error);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason) => {
      this.handleError('Unhandled rejection', reason as Error);
      process.exit(1);
    });
  }

  /**
   * Starts periodic health checks
   */
  private startHealthCheck(): void {
    this.healthCheckInterval = setInterval(
      async () => {
        try {
          const isHealthy = await this.workerService.healthCheck();
          if (!isHealthy) {
            this.logger.warn('Worker health check failed', {
              workerId: this.workerId,
              state: this.currentState
            });
          }
        } catch (error) {
          this.handleError('Health check error', error as Error);
        }
      },
      DEFAULT_WORKER_OPTIONS.healthCheckIntervalMs
    );
  }

  /**
   * Stops health check interval
   */
  private stopHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  /**
   * Updates worker state with logging
   */
  private updateState(newState: WorkerState): void {
    const oldState = this.currentState;
    this.currentState = newState;

    this.logger.info('Worker state changed', {
      workerId: this.workerId,
      oldState,
      newState
    });
  }

  /**
   * Handles and logs errors with correlation
   */
  private handleError(message: string, error: Error): void {
    this.updateState(WorkerState.ERROR);
    
    this.logger.error(message, {
      workerId: this.workerId,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack
      },
      state: this.currentState
    });
  }

  /**
   * Gets current worker state
   */
  public getCurrentState(): WorkerState {
    return this.currentState;
  }
}

// Export worker class and types
export { DocShieldWorker, WorkerState, VoiceAgentState };

// Create and export default worker instance
const worker = new DocShieldWorker();
export default worker;