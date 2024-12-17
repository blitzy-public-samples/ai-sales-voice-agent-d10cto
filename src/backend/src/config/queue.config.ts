// @ts-check

import Queue from 'bull'; // ^4.10.0
import Redis from 'ioredis'; // ^5.3.0
import { JobType, JobOptions, DEFAULT_JOB_OPTIONS } from '../types/queue.types';

/**
 * Redis connection configuration based on technical specifications
 * Implements connection pooling, timeouts, and retry strategies
 */
const REDIS_CONFIG: Redis.RedisOptions = {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  maxRetryTime: 10000,
  enableOfflineQueue: true,
  connectTimeout: 10000,
  disconnectTimeout: 5000,
  commandTimeout: 5000,
  retryStrategy(times: number) {
    // Exponential backoff with max 30s delay
    return Math.min(times * 1000, 30000);
  },
  reconnectOnError(err: Error) {
    // Reconnect on READONLY errors (Redis failover)
    return err.message.includes('READONLY');
  }
};

/**
 * Queue configuration constants
 */
const REDIS_URL = process.env.REDIS_URL;
const QUEUE_PREFIX = process.env.QUEUE_PREFIX || 'docshield';
const QUEUE_MONITOR_INTERVAL = 30000; // 30 seconds
const QUEUE_STALLED_INTERVAL = 30000; // 30 seconds
const QUEUE_METRICS_INTERVAL = 15000; // 15 seconds

/**
 * Queue scaling thresholds based on technical specifications
 */
const QUEUE_SCALING_THRESHOLDS = {
  MIN_JOBS: 10,    // Minimum jobs before scaling down
  MAX_JOBS: 100,   // Maximum jobs before scaling up
  SCALE_UP_FACTOR: 1.5,   // Scale up by 50%
  SCALE_DOWN_FACTOR: 0.5  // Scale down by 50%
};

/**
 * Validates Redis connection configuration and accessibility
 * @returns {Promise<boolean>} True if configuration is valid and Redis is accessible
 */
export const validateQueueConfig = async (): Promise<boolean> => {
  if (!REDIS_URL) {
    throw new Error('REDIS_URL environment variable is required');
  }

  try {
    const redis = new Redis(REDIS_URL, REDIS_CONFIG);
    
    // Test Redis connectivity
    await redis.ping();
    
    // Check Redis role (master/replica)
    const [role] = await redis.role();
    if (role !== 'master') {
      console.warn('Redis instance is not master, failover may occur');
    }
    
    // Cleanup test connection
    await redis.quit();
    
    return true;
  } catch (error) {
    console.error('Redis configuration validation failed:', error);
    throw error;
  }
};

/**
 * Creates and configures a Bull queue instance with comprehensive error handling and monitoring
 * @param {string} queueName - Name of the queue to create
 * @returns {Queue.Queue} Configured Bull queue instance
 */
export const createQueue = (queueName: string): Queue.Queue => {
  // Create Redis clients for Bull queue
  const client = new Redis(REDIS_URL, REDIS_CONFIG);
  const subscriber = new Redis(REDIS_URL, REDIS_CONFIG);

  // Configure Bull queue with Redis clients
  const queue = new Queue(queueName, {
    prefix: QUEUE_PREFIX,
    createClient: (type) => {
      switch (type) {
        case 'client':
          return client;
        case 'subscriber':
          return subscriber;
        default:
          return new Redis(REDIS_URL, REDIS_CONFIG);
      }
    },
    defaultJobOptions: {
      ...DEFAULT_JOB_OPTIONS,
      removeOnComplete: true,
      removeOnFail: false
    },
    settings: {
      stalledInterval: QUEUE_STALLED_INTERVAL,
      maxStalledCount: 2
    }
  });

  // Set up queue event listeners for monitoring
  queue.on('error', (error) => {
    console.error(`Queue ${queueName} error:`, error);
  });

  queue.on('waiting', (jobId) => {
    console.log(`Job ${jobId} is waiting for processing`);
  });

  queue.on('active', (job) => {
    console.log(`Processing job ${job.id} of type ${job.data.type}`);
  });

  queue.on('completed', (job) => {
    console.log(`Job ${job.id} completed successfully`);
  });

  queue.on('failed', (job, error) => {
    console.error(`Job ${job.id} failed:`, error);
  });

  queue.on('stalled', (job) => {
    console.warn(`Job ${job.id} has stalled`);
  });

  // Set up queue metrics collection
  setInterval(async () => {
    try {
      const [waiting, active, completed, failed] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getCompletedCount(),
        queue.getFailedCount()
      ]);

      console.log('Queue metrics:', {
        queueName,
        waiting,
        active,
        completed,
        failed,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Failed to collect queue metrics:', error);
    }
  }, QUEUE_METRICS_INTERVAL);

  return queue;
};

/**
 * Queue configuration object with factory functions and validation
 */
export const queueConfig = {
  createQueue,
  validateQueueConfig,
  QUEUE_SCALING_THRESHOLDS
};

export default queueConfig;