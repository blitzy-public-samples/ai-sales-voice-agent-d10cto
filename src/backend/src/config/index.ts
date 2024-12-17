/**
 * @fileoverview Central configuration module for DocShield AI Voice Agent system.
 * Aggregates and validates all configuration settings with comprehensive monitoring.
 * 
 * @version 1.0.0
 * @license MIT
 */

import dotenv from 'dotenv'; // ^16.x
import { authConfig } from './auth.config';
import { databaseConfig, initializeDatabase } from './database.config';
import { livekitConfig, validateLivekitConfig } from './livekit.config';
import { openAIConfig, voiceAgentConfig, salesCoachConfig } from './openai.config';
import { queueConfig } from './queue.config';

// Load environment variables
dotenv.config();

/**
 * Global configuration constants
 */
const NODE_ENV = process.env.NODE_ENV || 'development';
const CONFIG_VERSION = process.env.CONFIG_VERSION || '1.0.0';
const MONITORING_ENABLED = process.env.MONITORING_ENABLED === 'true';

/**
 * Unified configuration interface for the DocShield system
 */
export interface SystemConfig {
  environment: string;
  version: string;
  monitoring: {
    enabled: boolean;
    interval: number;
    logLevel: string;
  };
  auth: typeof authConfig;
  database: typeof databaseConfig;
  livekit: typeof livekitConfig;
  openai: {
    api: typeof openAIConfig;
    voiceAgent: typeof voiceAgentConfig;
    salesCoach: typeof salesCoachConfig;
  };
  queue: typeof queueConfig;
}

/**
 * Central configuration object that aggregates all system settings
 */
export const config: SystemConfig = {
  environment: NODE_ENV,
  version: CONFIG_VERSION,
  monitoring: {
    enabled: MONITORING_ENABLED,
    interval: parseInt(process.env.MONITORING_INTERVAL || '30000', 10),
    logLevel: process.env.LOG_LEVEL || 'info'
  },
  auth: authConfig,
  database: databaseConfig,
  livekit: livekitConfig,
  openai: {
    api: openAIConfig,
    voiceAgent: voiceAgentConfig,
    salesCoach: salesCoachConfig
  },
  queue: queueConfig
};

/**
 * Initializes all system configurations with comprehensive validation
 * @throws Error if any configuration validation fails
 */
export const initializeConfig = async (): Promise<void> => {
  try {
    console.info('Initializing DocShield AI Voice Agent configuration...');

    // Validate environment variables
    validateEnvironment();

    // Initialize security monitoring
    if (MONITORING_ENABLED) {
      initializeMonitoring();
    }

    // Validate and initialize authentication
    await authConfig.validateCredentials();
    console.info('Authentication configuration validated');

    // Initialize database connection
    await initializeDatabase();
    console.info('Database configuration initialized');

    // Validate LiveKit configuration
    await validateLivekitConfig();
    console.info('LiveKit configuration validated');

    // Validate queue configuration
    await queueConfig.validateQueueConfig();
    console.info('Queue configuration validated');

    // Start configuration monitoring
    if (MONITORING_ENABLED) {
      monitorConfig();
    }

    console.info('System configuration initialized successfully');
  } catch (error) {
    console.error('Configuration initialization failed:', error);
    throw error;
  }
};

/**
 * Validates required environment variables
 * @throws Error if required variables are missing
 */
const validateEnvironment = (): void => {
  const requiredVars = [
    'MONGODB_URI',
    'REDIS_URL',
    'LIVEKIT_API_KEY',
    'OPENAI_API_KEY',
    'AWS_ACCESS_KEY_ID',
    'ENCRYPTION_KEY'
  ];

  const missing = requiredVars.filter(varName => !process.env[varName]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
};

/**
 * Initializes security and performance monitoring
 */
const initializeMonitoring = (): void => {
  // Set up monitoring intervals
  const intervals = {
    configCheck: 30000,  // 30 seconds
    healthCheck: 60000,  // 1 minute
    metricsCollection: 15000  // 15 seconds
  };

  // Monitor configuration changes
  setInterval(checkConfigurationChanges, intervals.configCheck);

  // Monitor system health
  setInterval(checkSystemHealth, intervals.healthCheck);

  // Collect performance metrics
  setInterval(collectMetrics, intervals.metricsCollection);
};

/**
 * Monitors configuration for changes and security issues
 */
const monitorConfig = async (): Promise<void> => {
  while (true) {
    try {
      // Check configuration integrity
      await validateConfig();

      // Monitor credential expiration
      await checkCredentialExpiration();

      // Monitor service health
      await checkServiceHealth();

      // Wait for next monitoring interval
      await new Promise(resolve => setTimeout(resolve, config.monitoring.interval));
    } catch (error) {
      console.error('Configuration monitoring error:', error);
      // Continue monitoring despite errors
    }
  }
};

/**
 * Validates current configuration state
 * @returns Promise<boolean> indicating if configuration is valid
 */
export const validateConfig = async (): Promise<boolean> => {
  try {
    // Validate all configuration components
    await Promise.all([
      authConfig.validateCredentials(),
      validateLivekitConfig(),
      queueConfig.validateQueueConfig()
    ]);

    return true;
  } catch (error) {
    console.error('Configuration validation failed:', error);
    return false;
  }
};

/**
 * Checks credential expiration status
 */
const checkCredentialExpiration = async (): Promise<void> => {
  // Implementation would check credential expiration dates
  // and trigger rotation if needed
};

/**
 * Checks health of all integrated services
 */
const checkServiceHealth = async (): Promise<void> => {
  // Implementation would check health of MongoDB, Redis,
  // LiveKit, OpenAI, and other integrated services
};

/**
 * Monitors configuration changes
 */
const checkConfigurationChanges = (): void => {
  // Implementation would track configuration changes
  // and validate any updates
};

/**
 * Checks overall system health
 */
const checkSystemHealth = (): void => {
  // Implementation would check system resource usage,
  // error rates, and performance metrics
};

/**
 * Collects system performance metrics
 */
const collectMetrics = (): void => {
  // Implementation would collect and report system metrics
  // to monitoring service
};

export default config;