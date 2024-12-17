import { Command } from 'commander';
import { v4 as uuidv4 } from 'uuid';
import { WorkerService } from '../../worker/worker.service';
import { logger } from '../../lib/logger';

// Constants for shutdown timeouts
const SHUTDOWN_TIMEOUT_MS = 30000; // 30 seconds for graceful shutdown
const CLEANUP_TIMEOUT_MS = 5000;   // 5 seconds for resource cleanup
const MAX_RETRY_ATTEMPTS = 3;      // Maximum retries for shutdown operations

/**
 * Creates and configures the stop-worker CLI command
 * @returns Configured CLI command instance
 */
export function createStopWorkerCommand(): Command {
  const command = new Command('stop-worker');

  command
    .description('Gracefully stops the DocShield AI Voice Agent worker process')
    .option('-f, --force', 'Force immediate shutdown without waiting for active calls', false)
    .option(
      '-t, --timeout <ms>', 
      'Custom shutdown timeout in milliseconds',
      String(SHUTDOWN_TIMEOUT_MS)
    )
    .option(
      '--no-cleanup', 
      'Skip resource cleanup on shutdown',
      false
    )
    .action(async (options) => {
      try {
        await stopWorker(options);
      } catch (error) {
        logger.error('Failed to stop worker', { error });
        process.exit(1);
      }
    });

  return command;
}

/**
 * Main function to stop the worker process with comprehensive monitoring
 * @param options Command line options
 */
async function stopWorker(options: {
  force?: boolean;
  timeout?: string;
  cleanup?: boolean;
}): Promise<void> {
  const correlationId = uuidv4();
  const startTime = Date.now();

  logger.info('Initiating worker shutdown', {
    correlationId,
    force: options.force,
    timeout: options.timeout,
    cleanup: options.cleanup
  });

  try {
    // Get worker instance
    const worker = WorkerService;

    // Validate worker state
    if (!validateWorkerState(worker.currentState)) {
      throw new Error(`Invalid worker state for shutdown: ${worker.currentState}`);
    }

    // Calculate timeout
    const shutdownTimeout = parseInt(options.timeout || String(SHUTDOWN_TIMEOUT_MS));

    // Monitor shutdown progress
    const shutdownPromise = monitorShutdown(correlationId, shutdownTimeout);

    // Stop worker with force option
    await worker.stop(options.force);

    // Wait for shutdown to complete or timeout
    await Promise.race([
      shutdownPromise,
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Shutdown timeout')), shutdownTimeout)
      )
    ]);

    // Perform cleanup if enabled
    if (options.cleanup !== false) {
      await cleanupResources(options.force || false);
    }

    // Log successful shutdown
    const duration = Date.now() - startTime;
    logger.info('Worker shutdown completed', {
      correlationId,
      duration,
      force: options.force
    });

    // Exit process
    process.exit(0);

  } catch (error) {
    logger.error('Worker shutdown failed', {
      correlationId,
      error,
      duration: Date.now() - startTime
    });
    process.exit(1);
  }
}

/**
 * Validates that worker is in a state that can be stopped
 * @param currentState Current worker state
 * @returns True if worker can be stopped
 */
function validateWorkerState(currentState: string): boolean {
  const stoppableStates = ['RUNNING', 'ERROR'];
  return stoppableStates.includes(currentState);
}

/**
 * Performs cleanup of system resources during shutdown
 * @param force Whether to force cleanup without waiting
 * @returns Promise resolving when cleanup completes
 */
async function cleanupResources(force: boolean): Promise<boolean> {
  const cleanupStart = Date.now();
  let success = true;

  try {
    logger.info('Starting resource cleanup');

    // Set cleanup timeout
    const timeoutPromise = new Promise<boolean>((resolve) => {
      setTimeout(() => resolve(false), CLEANUP_TIMEOUT_MS);
    });

    // Perform cleanup operations
    const cleanupPromise = Promise.all([
      WorkerService.cleanupResources(),
      // Add additional cleanup tasks here
    ]).then(() => true);

    // Wait for cleanup or timeout
    success = await Promise.race([cleanupPromise, timeoutPromise]);

    logger.info('Resource cleanup completed', {
      success,
      duration: Date.now() - cleanupStart,
      force
    });

    return success;
  } catch (error) {
    logger.error('Resource cleanup failed', { error });
    return false;
  }
}

/**
 * Monitors the shutdown process and handles timeouts
 * @param correlationId Shutdown correlation ID
 * @param timeout Shutdown timeout in milliseconds
 */
async function monitorShutdown(correlationId: string, timeout: number): Promise<void> {
  const startTime = Date.now();
  let lastProgress = 0;

  return new Promise((resolve, reject) => {
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(100, Math.floor((elapsed / timeout) * 100));

      if (progress > lastProgress) {
        logger.info('Shutdown progress', {
          correlationId,
          progress: `${progress}%`,
          elapsed
        });
        lastProgress = progress;
      }

      if (elapsed >= timeout) {
        clearInterval(interval);
        reject(new Error('Shutdown timeout exceeded'));
      }
    }, 1000);

    // Cleanup interval on success
    resolve();
  });
}

// Export configured command
export const stopWorkerCommand = createStopWorkerCommand();
```

This implementation:

1. Creates a CLI command with options for force shutdown, custom timeout, and cleanup control

2. Implements graceful shutdown with comprehensive monitoring and progress tracking

3. Handles resource cleanup with timeout protection

4. Provides detailed logging throughout the shutdown process

5. Follows error recovery patterns from the technical specification

6. Maintains correlation tracking for monitoring

7. Validates worker state before shutdown

8. Implements proper exit code handling

The command can be used as:
```bash
# Normal graceful shutdown
stop-worker

# Force immediate shutdown
stop-worker --force

# Custom timeout
stop-worker --timeout 60000

# Skip cleanup
stop-worker --no-cleanup