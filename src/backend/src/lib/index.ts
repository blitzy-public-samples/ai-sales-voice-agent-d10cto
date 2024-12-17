/**
 * @fileoverview Central export module for DocShield AI Voice Agent worker library utilities
 * @version 1.0.0
 * 
 * Provides a unified interface to access all common utilities including:
 * - Error handling
 * - Logging
 * - Health monitoring
 * - Validation
 * - Rate limiting
 * - Circuit breaker implementations
 */

// Import internal utilities with version comments
import { 
  CircuitBreaker,
  CircuitBreakerConfig,
  CircuitState 
} from './circuit-breaker'; // Local implementation

import {
  ErrorHandler,
  ErrorHandlerConfig,
  RetryableError
} from './error-handler'; // Local implementation

import {
  checkHealth,
  startHealthMonitor,
  stopHealthMonitor,
  HealthStatus
} from './health-check'; // Local implementation

import {
  logger,
  Logger,
  LogLevel,
  LogOptions
} from './logger'; // Local implementation

import {
  RateLimiter,
  RateLimiterConfig,
  RateLimitStrategy,
  BackoffStrategy
} from './rate-limiter'; // Local implementation

import {
  validateCampaign,
  validateContact,
  validateCallRecord,
  ValidationError
} from './validator'; // Local implementation

// Re-export circuit breaker functionality
export {
  CircuitBreaker,
  CircuitBreakerConfig,
  CircuitState
};

// Re-export error handling functionality
export {
  ErrorHandler,
  ErrorHandlerConfig,
  RetryableError
};

// Re-export health monitoring functionality
export {
  checkHealth,
  startHealthMonitor,
  stopHealthMonitor,
  HealthStatus
};

// Re-export logging functionality
export {
  logger,
  Logger,
  LogLevel,
  LogOptions
};

// Re-export rate limiting functionality
export {
  RateLimiter,
  RateLimiterConfig,
  RateLimitStrategy,
  BackoffStrategy
};

// Re-export validation functionality
export {
  validateCampaign,
  validateContact,
  validateCallRecord,
  ValidationError
};

/**
 * Default configuration factory for common utility initialization
 */
export const createDefaultConfig = (workerId: string) => ({
  circuitBreaker: {
    failureThreshold: 5,
    resetTimeout: 60000,
    monitoredServices: [
      'liveKit',
      'openai',
      's3',
      'calendar'
    ]
  } as CircuitBreakerConfig,

  errorHandler: {
    maxRetries: 3,
    backoffMs: 1000,
    circuitBreakerConfig: {
      failureThreshold: 5,
      resetTimeout: 60000,
      monitoredServices: [
        'liveKit',
        'openai',
        's3',
        'calendar'
      ]
    }
  } as ErrorHandlerConfig,

  rateLimiter: {
    service: 'default',
    limit: 100,
    window: 60000,
    strategy: RateLimitStrategy.TOKEN_BUCKET,
    backoffStrategy: BackoffStrategy.EXPONENTIAL,
    circuitBreakerConfig: {
      failureThreshold: 5,
      resetTimeout: 30000,
      monitoredServices: ['default']
    }
  } as RateLimiterConfig
});

/**
 * Initialize all utilities with default configuration
 * @param workerId Unique identifier for the worker instance
 */
export const initializeUtilities = (workerId: string) => {
  const config = createDefaultConfig(workerId);

  return {
    circuitBreaker: new CircuitBreaker(config.circuitBreaker),
    errorHandler: new ErrorHandler(config.errorHandler),
    rateLimiter: new RateLimiter(config.rateLimiter),
    logger: Logger.getInstance(workerId)
  };
};

/**
 * Utility type definitions for external use
 */
export type {
  CircuitBreakerConfig,
  ErrorHandlerConfig,
  RateLimiterConfig,
  HealthStatus,
  LogOptions
};

/**
 * Version information
 */
export const VERSION = '1.0.0';

/**
 * Library configuration constants
 */
export const CONFIG = {
  DEFAULT_RETRY_ATTEMPTS: 3,
  DEFAULT_BACKOFF_MS: 1000,
  DEFAULT_CIRCUIT_BREAKER_THRESHOLD: 5,
  DEFAULT_RATE_LIMIT_WINDOW: 60000,
  HEALTH_CHECK_INTERVAL: 30000
} as const;