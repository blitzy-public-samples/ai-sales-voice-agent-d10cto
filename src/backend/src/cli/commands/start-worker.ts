import { Command } from 'commander'; // v10.0.0
import dotenv from 'dotenv'; // v16.0.0
import { WorkerService } from '../../worker/worker.service';
import { logger } from '../../lib/logger';
import { queueConfig } from '../../config/queue.config';
import { v4 as uuidv4 } from 'uuid';
import { ErrorCode, ErrorCategory } from '../../constants/error-codes';

// Constants for worker configuration
const REQUIRED_ENV_VARS = [
  'REDIS_URL',
  'LIVEKIT_API_KEY',
  'LIVEKIT_API_SECRET',
  'OPENAI_API_KEY',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'MONGODB_URI',
  'LOGTAIL_TOKEN',
  'S3_BUCKET_NAME'
];

const DEFAULT_LOG_LEVEL = 'info';
const SHUTDOWN_TIMEOUT_MS = 30000;
const HEALTH_CHECK_INTERVAL_MS = 60000;

/**
 * Creates and configures the start-worker CLI command
 * @returns Configured Command instance
 */
export const createStartWorkerCommand = (): Command => {
  const command = new Command('start-worker');

  command
    .description('Start the DocShield AI Voice Agent worker process')
    .option(
      '-e, --env-file <path>',
      'Path to environment file',
      '.env'
    )
    .option(
      '-l, --log-level <level>',
      'Logging level (error, warn, info, debug)',
      DEFAULT_LOG_LEVEL
    )
    .option(
      '-w, --worker-count <number>',
      'Number of worker processes to start',
      '1'
    )
    .action(async (options) => {
      try {
        await startWorker(options);
      } catch (error) {
        logger.error('Failed to start worker', { error });
        process.exit(1);
      }
    });

  return command;
};

/**
 * Main worker startup function with comprehensive initialization and monitoring
 * @param options CLI options for worker configuration
 */
async function startWorker(options: {
  envFile: string;
  logLevel: string;
  workerCount: string;
}): Promise<void> {
  const workerId = uuidv4();
  const startTime = Date.now();

  try {
    // Load environment configuration
    dotenv.config({ path: options.envFile });

    // Initialize logger with correlation ID
    logger.info('Initializing worker process', {
      workerId,
      logLevel: options.logLevel,
      nodeEnv: process.env.NODE_ENV
    });

    // Validate environment
    await validateEnvironment();

    // Create and validate queue configuration
    const queue = await initializeQueue();

    // Initialize worker service
    const workerService = new WorkerService(
      queue,
      workerId
    );

    // Set up signal handlers for graceful shutdown
    setupSignalHandlers(workerService);

    // Start worker service with health monitoring
    await startWorkerWithMonitoring(workerService);

    // Log successful startup
    const startupDuration = (Date.now() - startTime) / 1000;
    logger.info('Worker started successfully', {
      workerId,
      startupDuration,
      memoryUsage: process.memoryUsage()
    });

  } catch (error) {
    handleStartupError(error as Error, workerId);
    throw error;
  }
}

/**
 * Validates all required environment variables and configurations
 */
async function validateEnvironment(): Promise<void> {
  logger.info('Validating environment configuration');

  // Check required environment variables
  const missingVars = REQUIRED_ENV_VARS.filter(
    varName => !process.env[varName]
  );

  if (missingVars.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingVars.join(', ')}`
    );
  }

  // Validate Redis configuration
  await queueConfig.validateQueueConfig();

  logger.info('Environment validation completed');
}

/**
 * Initializes queue with configuration validation
 */
async function initializeQueue() {
  logger.info('Initializing job queue');

  try {
    const queue = queueConfig.createQueue('outbound-calls');
    await queue.isReady();
    return queue;
  } catch (error) {
    logger.error('Queue initialization failed', { error });
    throw error;
  }
}

/**
 * Sets up process signal handlers for graceful shutdown
 */
function setupSignalHandlers(workerService: WorkerService): void {
  // Handle SIGTERM
  process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM signal');
    await gracefulShutdown(workerService);
  });

  // Handle SIGINT
  process.on('SIGINT', async () => {
    logger.info('Received SIGINT signal');
    await gracefulShutdown(workerService);
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', async (error) => {
    logger.error('Uncaught exception', { error });
    await gracefulShutdown(workerService);
  });

  // Handle unhandled rejections
  process.on('unhandledRejection', async (reason) => {
    logger.error('Unhandled rejection', { reason });
    await gracefulShutdown(workerService);
  });
}

/**
 * Starts worker service with health monitoring
 */
async function startWorkerWithMonitoring(
  workerService: WorkerService
): Promise<void> {
  // Start worker service
  await workerService.start();

  // Set up health check interval
  const healthCheckInterval = setInterval(async () => {
    try {
      const isHealthy = await workerService.healthCheck();
      if (!isHealthy) {
        logger.error('Worker health check failed');
        await gracefulShutdown(workerService);
      }
    } catch (error) {
      logger.error('Health check error', { error });
    }
  }, HEALTH_CHECK_INTERVAL_MS);

  // Clean up interval on worker stop
  workerService.on('stopped', () => {
    clearInterval(healthCheckInterval);
  });
}

/**
 * Handles graceful shutdown of worker process
 */
async function gracefulShutdown(workerService: WorkerService): Promise<void> {
  logger.info('Initiating graceful shutdown');

  try {
    const shutdownTimeout = new Promise<void>((resolve) => {
      setTimeout(() => {
        logger.warn('Shutdown timeout reached, forcing exit');
        resolve();
      }, SHUTDOWN_TIMEOUT_MS);
    });

    // Race between graceful shutdown and timeout
    await Promise.race([
      workerService.stop(),
      shutdownTimeout
    ]);

    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', { error });
    process.exit(1);
  }
}

/**
 * Handles startup errors with detailed logging
 */
function handleStartupError(error: Error, workerId: string): void {
  logger.error('Worker startup failed', {
    error,
    workerId,
    errorCode: ErrorCode.QUEUE_ERROR,
    errorCategory: ErrorCategory.PERMANENT,
    memoryUsage: process.memoryUsage()
  });
}

export const startWorkerCommand = createStartWorkerCommand();