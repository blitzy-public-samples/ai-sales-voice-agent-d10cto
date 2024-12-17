import { EventEmitter } from 'events';
import { logger } from './logger';
import { ErrorCode, ErrorCategory, BackoffType, DEFAULT_RECOVERY_PATTERNS } from '../constants/error-codes';

/**
 * Enum defining possible circuit breaker states
 */
export enum CircuitState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half-open'
}

/**
 * Interface for retry strategy configuration
 */
interface RetryStrategy {
  maxRetries: number;
  backoffType: BackoffType;
  baseDelay: number;
  maxDelay: number;
  jitter: boolean;
}

/**
 * Interface for circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeout: number;
  monitoredServices: string[];
  retryStrategy?: RetryStrategy;
}

/**
 * Default configuration values
 */
const DEFAULT_FAILURE_THRESHOLD = 5;
const DEFAULT_RESET_TIMEOUT = 60000; // 1 minute
const MAX_RETRIES = 3;

/**
 * Implementation of the Circuit Breaker pattern with enhanced monitoring and retry capabilities
 */
export class CircuitBreaker {
  private state: Map<string, CircuitState>;
  private serviceFailureCounts: Map<string, number>;
  private lastFailureTimes: Map<string, Date>;
  private readonly failureThreshold: number;
  private readonly resetTimeout: number;
  private readonly eventEmitter: EventEmitter;
  private readonly retryStrategy: RetryStrategy;
  private readonly monitoredServices: Set<string>;

  /**
   * Initialize the circuit breaker with configuration
   */
  constructor(config: CircuitBreakerConfig) {
    this.state = new Map();
    this.serviceFailureCounts = new Map();
    this.lastFailureTimes = new Map();
    this.failureThreshold = config.failureThreshold || DEFAULT_FAILURE_THRESHOLD;
    this.resetTimeout = config.resetTimeout || DEFAULT_RESET_TIMEOUT;
    this.eventEmitter = new EventEmitter();
    this.monitoredServices = new Set(config.monitoredServices);

    // Initialize default state for monitored services
    config.monitoredServices.forEach(service => {
      this.state.set(service, CircuitState.CLOSED);
      this.serviceFailureCounts.set(service, 0);
    });

    // Configure retry strategy
    this.retryStrategy = config.retryStrategy || {
      maxRetries: MAX_RETRIES,
      backoffType: BackoffType.EXPONENTIAL,
      baseDelay: 1000,
      maxDelay: 8000,
      jitter: true
    };

    // Set up event listeners for monitoring
    this.setupEventListeners();
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async executeFunction<T>(
    fn: (...args: any[]) => Promise<T>,
    serviceName: string,
    ...args: any[]
  ): Promise<T> {
    if (!this.monitoredServices.has(serviceName)) {
      throw new Error(`Service ${serviceName} is not monitored by circuit breaker`);
    }

    const currentState = this.state.get(serviceName)!;

    if (currentState === CircuitState.OPEN) {
      if (this.shouldAttemptReset(serviceName)) {
        this.transitionState(serviceName, CircuitState.HALF_OPEN);
      } else {
        throw new Error(`Circuit breaker is OPEN for service ${serviceName}`);
      }
    }

    try {
      const result = await this.executeWithRetry(fn, serviceName, args);
      
      if (currentState === CircuitState.HALF_OPEN) {
        this.transitionState(serviceName, CircuitState.CLOSED);
      }
      
      this.serviceFailureCounts.set(serviceName, 0);
      return result;
    } catch (error) {
      await this.handleExecutionError(error, serviceName);
      throw error;
    }
  }

  /**
   * Execute function with retry logic
   */
  private async executeWithRetry<T>(
    fn: (...args: any[]) => Promise<T>,
    serviceName: string,
    args: any[]
  ): Promise<T> {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= this.retryStrategy.maxRetries; attempt++) {
      try {
        return await fn(...args);
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < this.retryStrategy.maxRetries) {
          const delay = this.calculateBackoffDelay(attempt);
          logger.info(`Retrying ${serviceName} after ${delay}ms (attempt ${attempt + 1}/${this.retryStrategy.maxRetries})`);
          await this.delay(delay);
        }
      }
    }

    throw lastError;
  }

  /**
   * Calculate backoff delay with jitter
   */
  private calculateBackoffDelay(attempt: number): number {
    let delay: number;

    switch (this.retryStrategy.backoffType) {
      case BackoffType.EXPONENTIAL:
        delay = Math.min(
          this.retryStrategy.baseDelay * Math.pow(2, attempt),
          this.retryStrategy.maxDelay
        );
        break;
      case BackoffType.LINEAR:
        delay = Math.min(
          this.retryStrategy.baseDelay * (attempt + 1),
          this.retryStrategy.maxDelay
        );
        break;
      case BackoffType.FIBONACCI:
        delay = Math.min(
          this.calculateFibonacci(attempt) * this.retryStrategy.baseDelay,
          this.retryStrategy.maxDelay
        );
        break;
      default:
        delay = this.retryStrategy.baseDelay;
    }

    if (this.retryStrategy.jitter) {
      delay = delay * (0.5 + Math.random());
    }

    return Math.floor(delay);
  }

  /**
   * Calculate Fibonacci number for backoff
   */
  private calculateFibonacci(n: number): number {
    if (n <= 1) return 1;
    let prev = 1, curr = 1;
    for (let i = 2; i <= n; i++) {
      const next = prev + curr;
      prev = curr;
      curr = next;
    }
    return curr;
  }

  /**
   * Handle execution errors and state transitions
   */
  private async handleExecutionError(error: Error, serviceName: string): Promise<void> {
    const currentFailures = (this.serviceFailureCounts.get(serviceName) || 0) + 1;
    this.serviceFailureCounts.set(serviceName, currentFailures);
    this.lastFailureTimes.set(serviceName, new Date());

    if (currentFailures >= this.failureThreshold) {
      this.transitionState(serviceName, CircuitState.OPEN);
    }

    logger.error(`Circuit breaker error for ${serviceName}`, {
      error,
      currentFailures,
      state: this.state.get(serviceName),
      threshold: this.failureThreshold
    });
  }

  /**
   * Transition circuit breaker state
   */
  private transitionState(serviceName: string, newState: CircuitState): void {
    const oldState = this.state.get(serviceName);
    this.state.set(serviceName, newState);
    
    this.eventEmitter.emit('stateChange', {
      serviceName,
      oldState,
      newState,
      timestamp: new Date()
    });

    logger.info(`Circuit breaker state transition for ${serviceName}`, {
      oldState,
      newState,
      failureCount: this.serviceFailureCounts.get(serviceName)
    });
  }

  /**
   * Check if circuit should attempt reset
   */
  private shouldAttemptReset(serviceName: string): boolean {
    const lastFailure = this.lastFailureTimes.get(serviceName);
    if (!lastFailure) return true;
    
    return Date.now() - lastFailure.getTime() >= this.resetTimeout;
  }

  /**
   * Utility method for delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Set up event listeners for monitoring
   */
  private setupEventListeners(): void {
    this.eventEmitter.on('stateChange', (event) => {
      logger.info('Circuit breaker state changed', event);
    });
  }

  /**
   * Get current state for a service
   */
  public getState(serviceName: string): CircuitState {
    return this.state.get(serviceName) || CircuitState.CLOSED;
  }

  /**
   * Reset circuit breaker state for a service
   */
  public reset(serviceName: string): void {
    this.state.set(serviceName, CircuitState.CLOSED);
    this.serviceFailureCounts.set(serviceName, 0);
    this.lastFailureTimes.delete(serviceName);
    
    logger.info(`Circuit breaker reset for ${serviceName}`);
  }
}