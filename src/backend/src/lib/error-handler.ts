/**
 * @file Centralized error handling module for DocShield AI Voice Agent
 * @version 1.0.0
 */

import { EventEmitter } from 'events';
import retry from 'retry'; // v0.13.0
import { v4 as uuidv4 } from 'uuid';
import { 
  ErrorCode, 
  ErrorCategory, 
  ErrorSeverity,
  ErrorDetail,
  ErrorContext,
  DEFAULT_RECOVERY_PATTERNS
} from '../constants/error-codes';
import { logger } from './logger';
import { CircuitBreaker, CircuitBreakerConfig, CircuitState } from './circuit-breaker';

/**
 * Configuration interface for error handler
 */
export interface ErrorHandlerConfig {
  maxRetries: number;
  backoffMs: number;
  circuitBreakerConfig: CircuitBreakerConfig;
  monitoredServices?: string[];
  errorMetricsEnabled?: boolean;
}

/**
 * Interface for retryable errors
 */
export interface RetryableError extends Error {
  code: ErrorCode;
  retryCount: number;
  context: ErrorContext;
  correlationId: string;
  timestamp: Date;
}

/**
 * Default configuration values
 */
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BACKOFF_MS = 1000;
const FATAL_ERROR_CODES = [ErrorCode.DATABASE_ERROR];

/**
 * Centralized error handling implementation with retry logic and circuit breaker pattern
 */
export class ErrorHandler {
  private readonly config: ErrorHandlerConfig;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly eventEmitter: EventEmitter;
  private readonly errorMetrics: Map<ErrorCode, number>;
  private readonly activeRetries: Map<string, retry.RetryOperation>;

  /**
   * Initialize error handler with configuration
   */
  constructor(config: ErrorHandlerConfig) {
    this.config = {
      maxRetries: config.maxRetries || DEFAULT_MAX_RETRIES,
      backoffMs: config.backoffMs || DEFAULT_BACKOFF_MS,
      circuitBreakerConfig: config.circuitBreakerConfig,
      monitoredServices: config.monitoredServices || [],
      errorMetricsEnabled: config.errorMetricsEnabled || true
    };

    this.circuitBreaker = new CircuitBreaker(config.circuitBreakerConfig);
    this.eventEmitter = new EventEmitter();
    this.errorMetrics = new Map();
    this.activeRetries = new Map();

    this.setupEventListeners();
  }

  /**
   * Main error handling function
   */
  async handleError(error: Error, context: ErrorContext): Promise<void> {
    const correlationId = uuidv4();
    const timestamp = new Date();

    // Enhance error with metadata
    const enhancedError: RetryableError = Object.assign(error, {
      correlationId,
      timestamp,
      context,
      retryCount: 0
    });

    // Log error with context
    logger.error('Error occurred in worker process', {
      error: enhancedError,
      context,
      correlationId
    });

    // Update error metrics
    if (this.config.errorMetricsEnabled) {
      this.updateErrorMetrics(enhancedError.code as ErrorCode);
    }

    // Handle based on error type
    if (this.isFatalError(enhancedError)) {
      await this.handleFatalError(enhancedError);
    } else {
      await this.handleRetryableError(enhancedError);
    }

    // Emit error event for monitoring
    this.eventEmitter.emit('error', enhancedError);
  }

  /**
   * Handle retryable errors with exponential backoff
   */
  private async handleRetryableError(error: RetryableError): Promise<void> {
    const operation = retry.operation({
      retries: this.config.maxRetries,
      factor: 2,
      minTimeout: this.config.backoffMs,
      maxTimeout: this.config.backoffMs * Math.pow(2, this.config.maxRetries),
      randomize: true
    });

    this.activeRetries.set(error.correlationId, operation);

    return new Promise((resolve, reject) => {
      operation.attempt(async (currentAttempt) => {
        try {
          // Check circuit breaker state
          const serviceName = error.context.component;
          if (this.circuitBreaker.getState(serviceName) === CircuitState.OPEN) {
            operation.stop();
            reject(new Error(`Circuit breaker is open for service ${serviceName}`));
            return;
          }

          // Update retry count
          error.retryCount = currentAttempt - 1;

          // Log retry attempt
          logger.warn(`Retrying operation`, {
            correlationId: error.correlationId,
            attempt: currentAttempt,
            maxRetries: this.config.maxRetries,
            error: error.message
          });

          // Execute retry logic through circuit breaker
          await this.circuitBreaker.executeFunction(
            async () => {
              // Implement retry logic here
              throw error; // Temporary throw for testing
            },
            serviceName
          );

          this.activeRetries.delete(error.correlationId);
          resolve();
        } catch (retryError) {
          if (operation.retry(retryError as Error)) {
            return;
          }
          this.activeRetries.delete(error.correlationId);
          reject(operation.mainError());
        }
      });
    });
  }

  /**
   * Handle fatal errors that cannot be retried
   */
  private async handleFatalError(error: RetryableError): Promise<void> {
    logger.error('Fatal error occurred', {
      error,
      correlationId: error.correlationId,
      context: error.context
    });

    // Emit critical error event
    this.eventEmitter.emit('fatalError', error);

    // Update circuit breaker state if applicable
    const serviceName = error.context.component;
    if (this.config.monitoredServices?.includes(serviceName)) {
      this.circuitBreaker.reset(serviceName);
    }

    // Implement graceful shutdown logic if needed
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
  }

  /**
   * Check if error is fatal based on error code
   */
  private isFatalError(error: RetryableError): boolean {
    return FATAL_ERROR_CODES.includes(error.code as ErrorCode);
  }

  /**
   * Update error metrics for monitoring
   */
  private updateErrorMetrics(errorCode: ErrorCode): void {
    const currentCount = this.errorMetrics.get(errorCode) || 0;
    this.errorMetrics.set(errorCode, currentCount + 1);
  }

  /**
   * Set up event listeners for monitoring
   */
  private setupEventListeners(): void {
    this.eventEmitter.on('error', (error: RetryableError) => {
      // Implement error monitoring logic
    });

    this.eventEmitter.on('fatalError', (error: RetryableError) => {
      // Implement critical error monitoring logic
    });
  }

  /**
   * Cancel active retry operations
   */
  public cancelRetries(correlationId?: string): void {
    if (correlationId) {
      const operation = this.activeRetries.get(correlationId);
      if (operation) {
        operation.stop();
        this.activeRetries.delete(correlationId);
      }
    } else {
      this.activeRetries.forEach((operation) => operation.stop());
      this.activeRetries.clear();
    }
  }

  /**
   * Get error metrics
   */
  public getErrorMetrics(): Map<ErrorCode, number> {
    return new Map(this.errorMetrics);
  }

  /**
   * Reset error metrics
   */
  public resetErrorMetrics(): void {
    this.errorMetrics.clear();
  }
}