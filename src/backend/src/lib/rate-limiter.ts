/**
 * @file Enhanced rate limiter implementation for external API services
 * @version 1.0.0
 * @description Implements configurable rate limiting strategies with circuit breaker pattern
 */

import { TokenBucket } from 'token-bucket'; // v1.0.0
import { LeakyBucket } from 'leaky-bucket'; // v2.0.0
import { logger } from './logger';
import { ErrorHandler } from './error-handler';
import { CircuitBreaker, CircuitBreakerConfig, CircuitState } from './circuit-breaker';

/**
 * Available rate limiting strategies
 */
export enum RateLimitStrategy {
  TOKEN_BUCKET = 'token_bucket',
  LEAKY_BUCKET = 'leaky_bucket',
  FIXED_WINDOW = 'fixed_window'
}

/**
 * Available backoff strategies for rate limit recovery
 */
export enum BackoffStrategy {
  LINEAR = 'linear',
  EXPONENTIAL = 'exponential',
  FIBONACCI = 'fibonacci'
}

/**
 * Rate limiter configuration interface
 */
export interface RateLimiterConfig {
  service: string;
  limit: number;
  window: number;
  strategy: RateLimitStrategy;
  backoffStrategy: BackoffStrategy;
  circuitBreakerConfig: CircuitBreakerConfig;
}

/**
 * Rate limit metrics tracking interface
 */
interface RateLimitMetrics {
  totalRequests: number;
  limitExceeded: number;
  lastExceeded: Date | null;
  currentUsage: number;
  resetTime: Date;
}

/**
 * Default configuration values
 */
const DEFAULT_WINDOW_MS = 60000; // 1 minute

/**
 * Service-specific rate limits
 */
const SERVICE_LIMITS = {
  LIVEKIT: 100,
  OPENAI: 3000,
  GOOGLE_CALENDAR: 1000000,
  S3: 5500,
  LOGTAIL: 100
};

/**
 * Service-specific backoff configurations
 */
const BACKOFF_CONFIGS = {
  LIVEKIT: BackoffStrategy.EXPONENTIAL,
  OPENAI: BackoffStrategy.FIBONACCI,
  GOOGLE_CALENDAR: BackoffStrategy.LINEAR,
  LOGTAIL: BackoffStrategy.EXPONENTIAL
};

/**
 * Service-specific circuit breaker configurations
 */
const CIRCUIT_BREAKER_CONFIGS: Record<string, CircuitBreakerConfig> = {
  LIVEKIT: {
    failureThreshold: 5,
    resetTimeout: 30000,
    monitoredServices: ['LIVEKIT']
  },
  OPENAI: {
    failureThreshold: 3,
    resetTimeout: 45000,
    monitoredServices: ['OPENAI']
  }
};

/**
 * Enhanced rate limiter implementation with circuit breaker pattern
 */
export class RateLimiter {
  private limiters: Map<string, TokenBucket | LeakyBucket>;
  private circuitBreakers: Map<string, CircuitBreaker>;
  private metrics: Map<string, RateLimitMetrics>;
  private readonly config: RateLimiterConfig;

  /**
   * Initialize rate limiter with configuration
   */
  constructor(config: RateLimiterConfig) {
    this.config = {
      ...config,
      window: config.window || DEFAULT_WINDOW_MS
    };

    this.limiters = new Map();
    this.circuitBreakers = new Map();
    this.metrics = new Map();

    this.initializeLimiters();
    this.initializeCircuitBreakers();
    this.initializeMetrics();

    logger.info(`Rate limiter initialized for service ${config.service}`, {
      limit: config.limit,
      window: config.window,
      strategy: config.strategy
    });
  }

  /**
   * Initialize rate limiters based on strategy
   */
  private initializeLimiters(): void {
    switch (this.config.strategy) {
      case RateLimitStrategy.TOKEN_BUCKET:
        this.limiters.set(
          this.config.service,
          new TokenBucket({
            capacity: this.config.limit,
            fillPerSecond: this.config.limit / (this.config.window / 1000)
          })
        );
        break;

      case RateLimitStrategy.LEAKY_BUCKET:
        this.limiters.set(
          this.config.service,
          new LeakyBucket({
            capacity: this.config.limit,
            leakRate: this.config.limit / (this.config.window / 1000)
          })
        );
        break;

      default:
        throw new Error(`Unsupported rate limit strategy: ${this.config.strategy}`);
    }
  }

  /**
   * Initialize circuit breakers for services
   */
  private initializeCircuitBreakers(): void {
    const circuitBreakerConfig = CIRCUIT_BREAKER_CONFIGS[this.config.service] || {
      failureThreshold: 5,
      resetTimeout: 30000,
      monitoredServices: [this.config.service]
    };

    this.circuitBreakers.set(
      this.config.service,
      new CircuitBreaker(circuitBreakerConfig)
    );
  }

  /**
   * Initialize metrics tracking
   */
  private initializeMetrics(): void {
    this.metrics.set(this.config.service, {
      totalRequests: 0,
      limitExceeded: 0,
      lastExceeded: null,
      currentUsage: 0,
      resetTime: new Date(Date.now() + this.config.window)
    });
  }

  /**
   * Check if operation is within rate limits
   */
  public async checkLimit(service: string): Promise<boolean> {
    const metrics = this.metrics.get(service);
    if (!metrics) {
      throw new Error(`Service ${service} not configured for rate limiting`);
    }

    // Check circuit breaker state
    const circuitBreaker = this.circuitBreakers.get(service);
    if (circuitBreaker?.getState(service) === CircuitState.OPEN) {
      logger.warn(`Circuit breaker open for service ${service}`);
      return false;
    }

    // Update metrics
    metrics.totalRequests++;
    metrics.currentUsage++;

    const limiter = this.limiters.get(service);
    if (!limiter) {
      throw new Error(`Rate limiter not found for service ${service}`);
    }

    try {
      const allowed = await this.checkLimiter(limiter);
      
      if (!allowed) {
        metrics.limitExceeded++;
        metrics.lastExceeded = new Date();
        await this.handleRateLimit(service);
        return false;
      }

      return true;
    } catch (error) {
      logger.error(`Rate limit check failed for ${service}`, { error });
      return false;
    }
  }

  /**
   * Check specific limiter implementation
   */
  private async checkLimiter(limiter: TokenBucket | LeakyBucket): Promise<boolean> {
    if (limiter instanceof TokenBucket) {
      return limiter.tryRemoveTokens(1);
    } else {
      return limiter.tryAcquire(1);
    }
  }

  /**
   * Handle rate limit exceeded scenario
   */
  private async handleRateLimit(service: string): Promise<void> {
    logger.warn(`Rate limit exceeded for ${service}`, {
      metrics: this.metrics.get(service)
    });

    const backoffStrategy = BACKOFF_CONFIGS[service] || BackoffStrategy.EXPONENTIAL;
    const delay = this.calculateBackoff(service, backoffStrategy);

    logger.debug(`Applying backoff delay of ${delay}ms for ${service}`);
    await this.delay(delay);
  }

  /**
   * Calculate backoff delay based on strategy
   */
  private calculateBackoff(service: string, strategy: BackoffStrategy): number {
    const metrics = this.metrics.get(service);
    if (!metrics) return 1000;

    const attempts = metrics.limitExceeded;
    const baseDelay = 1000;

    switch (strategy) {
      case BackoffStrategy.EXPONENTIAL:
        return Math.min(baseDelay * Math.pow(2, attempts), 30000);

      case BackoffStrategy.FIBONACCI:
        return Math.min(this.fibonacci(attempts) * baseDelay, 30000);

      case BackoffStrategy.LINEAR:
        return Math.min(baseDelay * attempts, 30000);

      default:
        return baseDelay;
    }
  }

  /**
   * Calculate Fibonacci number for backoff
   */
  private fibonacci(n: number): number {
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
   * Utility method for delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get current metrics for a service
   */
  public getMetrics(service: string): RateLimitMetrics | undefined {
    return this.metrics.get(service);
  }

  /**
   * Reset metrics for a service
   */
  public resetMetrics(service: string): void {
    this.metrics.set(service, {
      totalRequests: 0,
      limitExceeded: 0,
      lastExceeded: null,
      currentUsage: 0,
      resetTime: new Date(Date.now() + this.config.window)
    });

    logger.info(`Reset rate limit metrics for ${service}`);
  }
}