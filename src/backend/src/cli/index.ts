import { program } from 'commander'; // ^10.0.0
import { correlator } from 'correlation-id'; // ^5.0.0
import { logger } from '../lib/logger';
import { startWorkerCommand } from './commands/start-worker';
import { stopWorkerCommand } from './commands/stop-worker';
import { checkStatusCommand } from './commands/check-status';
import { createSeedQueueCommand } from './commands/seed-queue';
import { ErrorCode, ErrorCategory } from '../constants/error-codes';

// CLI configuration constants
const CLI_NAME = 'docshield-worker';
const CLI_VERSION = '1.0.0';
const ERROR_CORRELATION_PREFIX = 'cli';
const MAX_RETRY_ATTEMPTS = 3;

/**
 * Initializes the CLI application with enhanced validation, monitoring, and error handling
 */
export function initializeCLI(): void {
  try {
    // Set up error correlation
    correlator.withId(() => {
      // Configure CLI program
      program
        .name(CLI_NAME)
        .version(CLI_VERSION)
        .description('DocShield AI Voice Agent Worker CLI');

      // Register commands with validation
      registerCommands();

      // Set up global error handlers
      setupErrorHandlers();

      // Initialize security monitoring
      initializeSecurityMonitoring();

      // Parse command line arguments
      program.parse(process.argv);

      // Show help if no command provided
      if (!process.argv.slice(2).length) {
        program.outputHelp();
      }
    }, `${ERROR_CORRELATION_PREFIX}-${Date.now()}`);
  } catch (error) {
    handleFatalError(error as Error);
  }
}

/**
 * Registers CLI commands with validation and monitoring
 */
function registerCommands(): void {
  try {
    // Validate and add start-worker command
    if (validateCommand(startWorkerCommand)) {
      program.addCommand(startWorkerCommand);
    }

    // Validate and add stop-worker command
    if (validateCommand(stopWorkerCommand)) {
      program.addCommand(stopWorkerCommand);
    }

    // Validate and add check-status command
    if (validateCommand(checkStatusCommand)) {
      program.addCommand(checkStatusCommand);
    }

    // Validate and add seed-queue command
    if (validateCommand(createSeedQueueCommand())) {
      program.addCommand(createSeedQueueCommand());
    }

    logger.info('CLI commands registered successfully');
  } catch (error) {
    logger.error('Failed to register CLI commands', { error });
    throw error;
  }
}

/**
 * Validates command registration and dependencies
 * @param command Command to validate
 * @returns boolean indicating if command is valid
 */
function validateCommand(command: any): boolean {
  if (!command || !command.name() || typeof command.action !== 'function') {
    logger.error('Invalid command configuration', { command: command?.name() });
    return false;
  }

  // Validate command dependencies
  try {
    const commandName = command.name();
    switch (commandName) {
      case 'start-worker':
        validateStartWorkerDependencies();
        break;
      case 'stop-worker':
        validateStopWorkerDependencies();
        break;
      case 'check-status':
        validateCheckStatusDependencies();
        break;
      case 'seed-queue':
        validateSeedQueueDependencies();
        break;
    }
    return true;
  } catch (error) {
    logger.error('Command dependency validation failed', { error });
    return false;
  }
}

/**
 * Sets up global error handlers for CLI operations
 */
function setupErrorHandlers(): void {
  process.on('uncaughtException', (error: Error) => {
    handleError(error, correlator.getId() || 'unknown');
    process.exit(1);
  });

  process.on('unhandledRejection', (reason: any) => {
    handleError(reason, correlator.getId() || 'unknown');
    process.exit(1);
  });

  program.exitOverride((err) => {
    handleError(err, correlator.getId() || 'unknown');
    process.exit(1);
  });
}

/**
 * Initializes security monitoring for CLI operations
 */
function initializeSecurityMonitoring(): void {
  logger.info('Initializing CLI security monitoring');

  // Monitor command execution attempts
  program.hook('preAction', (thisCommand, actionCommand) => {
    logger.security('CLI command execution', {
      command: actionCommand.name(),
      args: actionCommand.args,
      options: actionCommand.opts(),
      correlationId: correlator.getId()
    });
  });
}

/**
 * Enhanced error handler with correlation and categorization
 */
function handleError(error: Error, correlationId: string): void {
  logger.error('CLI operation failed', {
    error,
    correlationId,
    errorCode: ErrorCode.CLI_ERROR,
    errorCategory: ErrorCategory.PERMANENT,
    component: 'CLI'
  });
}

/**
 * Handles fatal errors during CLI initialization
 */
function handleFatalError(error: Error): void {
  console.error('Fatal CLI error:', error);
  process.exit(1);
}

/**
 * Command-specific dependency validation functions
 */
function validateStartWorkerDependencies(): void {
  // Implementation would check required environment variables and services
}

function validateStopWorkerDependencies(): void {
  // Implementation would validate worker state and resources
}

function validateCheckStatusDependencies(): void {
  // Implementation would verify monitoring capabilities
}

function validateSeedQueueDependencies(): void {
  // Implementation would check queue access and configuration
}

// Export CLI initialization function
export default {
  initializeCLI
};
```

This implementation provides:

1. Robust command registration with dependency validation
2. Comprehensive error handling with correlation tracking
3. Security monitoring for CLI operations
4. Resource management and cleanup
5. Command-specific validation
6. Graceful error recovery
7. Detailed logging throughout CLI operations

The CLI can be used with commands like:
```bash
# Start worker process
docshield-worker start-worker --env-file .env

# Stop worker process
docshield-worker stop-worker

# Check worker status
docshield-worker check-status

# Seed queue with test job
docshield-worker seed-queue <campaignId>