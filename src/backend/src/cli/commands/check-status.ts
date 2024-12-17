import { Command } from 'commander'; // ^10.0.0
import chalk from 'chalk'; // ^4.1.2
import { logger } from '../../lib/logger';
import { WorkerService, WorkerState } from '../../worker/worker.service';
import { CircuitBreaker } from '../../lib/circuit-breaker';
import { v4 as uuidv4 } from 'uuid';

// Constants for command configuration
const COMMAND_NAME = 'check-status';
const COMMAND_DESCRIPTION = 'View worker process status, health metrics, and resource utilization';
const WORKER_ID_OPTION = '--worker-id <id>';
const WORKER_ID_DESCRIPTION = 'Optional worker ID to check specific worker';

// Constants for health check configuration
const HEALTH_CHECK_TIMEOUT = 3000;
const CIRCUIT_BREAKER_OPTIONS = {
  failureThreshold: 3,
  resetTimeout: 30000,
  monitoredServices: ['worker-status']
};

/**
 * Creates and configures the check-status CLI command
 * @returns Configured Command instance
 */
export function createCheckStatusCommand(): Command {
  const command = new Command(COMMAND_NAME);
  command
    .description(COMMAND_DESCRIPTION)
    .option(WORKER_ID_OPTION, WORKER_ID_DESCRIPTION)
    .action(async (options) => {
      const correlationId = uuidv4();
      try {
        await checkWorkerStatus(options.workerId, correlationId);
      } catch (error) {
        logger.error('Status check failed', {
          error,
          workerId: options.workerId,
          correlationId
        });
        process.exit(1);
      }
    });

  return command;
}

/**
 * Retrieves and displays worker status with enhanced monitoring
 * @param workerId Optional worker ID to check
 * @param correlationId Correlation ID for request tracking
 */
async function checkWorkerStatus(
  workerId?: string,
  correlationId?: string
): Promise<void> {
  // Initialize circuit breaker for API call protection
  const circuitBreaker = new CircuitBreaker(CIRCUIT_BREAKER_OPTIONS);

  try {
    logger.info('Checking worker status', { workerId, correlationId });

    // Get worker service instance
    const workerService = WorkerService.getInstance();

    // Get current state with timeout protection
    const statePromise = circuitBreaker.executeFunction(
      async () => workerService.getCurrentState(),
      'worker-status'
    );
    const state = await Promise.race([
      statePromise,
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Status check timeout')), HEALTH_CHECK_TIMEOUT)
      )
    ]);

    // Get health metrics
    const healthCheck = await workerService.healthCheck();

    // Get resource metrics
    const metrics = await workerService.getMetrics();

    // Format and display status
    const output = formatStatusOutput({
      state,
      healthCheck,
      metrics,
      workerId,
      timestamp: new Date()
    });

    console.log(output);

    logger.info('Status check completed', {
      state,
      healthCheck,
      workerId,
      correlationId
    });

  } catch (error) {
    logger.error('Failed to check worker status', {
      error,
      workerId,
      correlationId
    });
    throw error;
  }
}

/**
 * Formats worker status information with color coding
 * @param statusData Status data to format
 * @returns Formatted status string
 */
function formatStatusOutput(statusData: {
  state: WorkerState;
  healthCheck: boolean;
  metrics: any;
  workerId?: string;
  timestamp: Date;
}): string {
  const { state, healthCheck, metrics, workerId, timestamp } = statusData;

  // Color coding based on state
  const stateColor = {
    [WorkerState.RUNNING]: chalk.green,
    [WorkerState.STARTING]: chalk.yellow,
    [WorkerState.SHUTTING_DOWN]: chalk.red,
    [WorkerState.STOPPED]: chalk.gray
  };

  // Build status sections
  const sections = [
    '\nDocShield AI Voice Agent Worker Status',
    '=====================================',
    '',
    `Worker ID: ${chalk.blue(workerId || 'default')}`,
    `State: ${stateColor[state](state)}`,
    `Health: ${healthCheck ? chalk.green('✓ Healthy') : chalk.red('✗ Unhealthy')}`,
    '',
    'Active Calls:',
    `  Current: ${chalk.yellow(metrics.activeCalls)}`,
    `  Total: ${metrics.totalCalls}`,
    '',
    'Resource Utilization:',
    `  Memory: ${formatMemoryUsage(metrics.memoryUsage)}`,
    `  CPU: ${formatCpuUsage(metrics.cpuUsage)}`,
    '',
    'Circuit Breaker Status:',
    `  Voice Agent: ${formatCircuitStatus(metrics.circuitBreaker.voiceAgent)}`,
    `  Queue: ${formatCircuitStatus(metrics.circuitBreaker.queue)}`,
    `  Calendar: ${formatCircuitStatus(metrics.circuitBreaker.calendar)}`,
    '',
    `Last Updated: ${timestamp.toISOString()}`
  ];

  return sections.join('\n');
}

/**
 * Formats memory usage with color coding
 */
function formatMemoryUsage(memoryMB: number): string {
  const color = memoryMB > 450 ? chalk.red : 
                memoryMB > 350 ? chalk.yellow : 
                chalk.green;
  return color(`${memoryMB.toFixed(1)} MB`);
}

/**
 * Formats CPU usage with color coding
 */
function formatCpuUsage(cpuPercent: number): string {
  const color = cpuPercent > 80 ? chalk.red :
                cpuPercent > 60 ? chalk.yellow :
                chalk.green;
  return color(`${cpuPercent.toFixed(1)}%`);
}

/**
 * Formats circuit breaker status with color coding
 */
function formatCircuitStatus(status: string): string {
  const color = status === 'open' ? chalk.red :
                status === 'half-open' ? chalk.yellow :
                chalk.green;
  return color(status);
}

// Export configured command
export const checkStatusCommand = createCheckStatusCommand();
```

This implementation provides a robust CLI command for checking worker status with the following features:

1. Comprehensive status monitoring including worker state, health metrics, and resource utilization
2. Circuit breaker protection for API calls
3. Color-coded output for better visibility
4. Detailed logging with correlation tracking
5. Timeout protection for health checks
6. Resource utilization monitoring with thresholds
7. Circuit breaker status monitoring for all services

The command can be used with or without a specific worker ID:
```bash
# Check all workers
check-status

# Check specific worker
check-status --worker-id worker1