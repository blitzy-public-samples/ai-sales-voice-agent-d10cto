import mongoose from 'mongoose'; // ^7.x
import os from 'os'; // built-in
import { logger } from './logger';
import { CircuitBreaker, CircuitState } from './circuit-breaker';
import { getDatabaseConfig } from '../config/database.config';

/**
 * Constants for health check thresholds and configuration
 */
const HEALTH_CHECK_INTERVAL = 30000; // 30 seconds
const MEMORY_THRESHOLD = 450; // 450MB memory threshold
const CPU_THRESHOLD = 80; // 80% CPU threshold
const ERROR_RATE_THRESHOLD = 5; // 5% error rate threshold
const LATENCY_THRESHOLD = 2000; // 2 seconds latency threshold
const QUEUE_LENGTH_THRESHOLD = 100; // 100 jobs queue threshold

/**
 * Interface defining the health status response structure
 */
export interface HealthStatus {
  healthy: boolean;
  timestamp: Date;
  metrics: {
    memoryUsage: number; // Memory usage in MB
    cpuUsage: number; // CPU usage percentage
    queueLength: number; // Current Redis queue length
    errorRate: number; // Error rate percentage
    activeConnections: number; // Active voice connections
    latencyMs: number; // Average API latency
    uptimeHours: number; // System uptime in hours
  };
  services: {
    database: string; // MongoDB connection status
    redis: string; // Redis connection status
    liveKit: string; // LiveKit service status
    openai: string; // OpenAI API status
    s3: string; // S3 storage status
    calendar: string; // Google Calendar API status
  };
  thresholds: {
    memory: number;
    cpu: number;
    errors: number;
    latency: number;
  };
}

let healthCheckTimer: NodeJS.Timer | null = null;
let lastHealthStatus: HealthStatus | null = null;

/**
 * Calculate system resource usage metrics
 */
async function getResourceMetrics(): Promise<{ memoryUsage: number; cpuUsage: number }> {
  const memoryUsage = process.memoryUsage().heapUsed / 1024 / 1024; // Convert to MB
  
  // Calculate CPU usage
  const cpus = os.cpus();
  const totalCpu = cpus.reduce((acc, cpu) => {
    const total = Object.values(cpu.times).reduce((a, b) => a + b);
    const idle = cpu.times.idle;
    return acc + ((total - idle) / total) * 100;
  }, 0);
  const cpuUsage = totalCpu / cpus.length;

  return { memoryUsage, cpuUsage };
}

/**
 * Check database connection health and latency
 */
async function checkDatabaseHealth(): Promise<{ status: string; latency: number }> {
  const startTime = Date.now();
  try {
    if (mongoose.connection.readyState !== 1) {
      return { status: 'disconnected', latency: 0 };
    }
    await mongoose.connection.db.admin().ping();
    return { status: 'connected', latency: Date.now() - startTime };
  } catch (error) {
    logger.error('Database health check failed', { error });
    return { status: 'error', latency: 0 };
  }
}

/**
 * Performs comprehensive health check of the worker system
 */
export async function checkHealth(): Promise<HealthStatus> {
  const startTime = Date.now();
  const { memoryUsage, cpuUsage } = await getResourceMetrics();
  const dbHealth = await checkDatabaseHealth();

  // Get circuit breaker states for external services
  const circuitBreaker = new CircuitBreaker({
    failureThreshold: 5,
    resetTimeout: 60000,
    monitoredServices: ['liveKit', 'openai', 's3', 'calendar']
  });

  const serviceStates = {
    database: dbHealth.status,
    redis: circuitBreaker.getState('redis') === CircuitState.CLOSED ? 'healthy' : 'degraded',
    liveKit: circuitBreaker.getState('liveKit') === CircuitState.CLOSED ? 'healthy' : 'degraded',
    openai: circuitBreaker.getState('openai') === CircuitState.CLOSED ? 'healthy' : 'degraded',
    s3: circuitBreaker.getState('s3') === CircuitState.CLOSED ? 'healthy' : 'degraded',
    calendar: circuitBreaker.getState('calendar') === CircuitState.CLOSED ? 'healthy' : 'degraded'
  };

  // Calculate overall system health
  const healthy = memoryUsage < MEMORY_THRESHOLD &&
    cpuUsage < CPU_THRESHOLD &&
    dbHealth.latency < LATENCY_THRESHOLD &&
    Object.values(serviceStates).every(status => status === 'healthy');

  const healthStatus: HealthStatus = {
    healthy,
    timestamp: new Date(),
    metrics: {
      memoryUsage,
      cpuUsage,
      queueLength: 0, // To be implemented with Redis queue integration
      errorRate: 0, // To be calculated from error logs
      activeConnections: 0, // To be implemented with LiveKit integration
      latencyMs: dbHealth.latency,
      uptimeHours: process.uptime() / 3600
    },
    services: serviceStates,
    thresholds: {
      memory: MEMORY_THRESHOLD,
      cpu: CPU_THRESHOLD,
      errors: ERROR_RATE_THRESHOLD,
      latency: LATENCY_THRESHOLD
    }
  };

  // Log health check results
  logger.info('Health check completed', {
    healthy,
    duration: Date.now() - startTime,
    metrics: healthStatus.metrics
  });

  lastHealthStatus = healthStatus;
  return healthStatus;
}

/**
 * Starts periodic health monitoring with configurable interval
 */
export function startHealthMonitor(intervalMs: number = HEALTH_CHECK_INTERVAL): void {
  if (healthCheckTimer) {
    logger.warn('Health monitor already running');
    return;
  }

  logger.info('Starting health monitor', { interval: intervalMs });

  healthCheckTimer = setInterval(async () => {
    try {
      const status = await checkHealth();
      
      // Alert on unhealthy status
      if (!status.healthy) {
        logger.error('System health check failed', {
          metrics: status.metrics,
          services: status.services
        });
      }
    } catch (error) {
      logger.error('Health check failed', { error });
    }
  }, intervalMs);

  // Ensure cleanup on process termination
  process.on('SIGTERM', stopHealthMonitor);
  process.on('SIGINT', stopHealthMonitor);
}

/**
 * Stops the periodic health monitoring
 */
export function stopHealthMonitor(): void {
  if (healthCheckTimer) {
    clearInterval(healthCheckTimer);
    healthCheckTimer = null;
    logger.info('Health monitor stopped');
  }
}