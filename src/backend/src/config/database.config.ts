/**
 * @fileoverview MongoDB database configuration for DocShield AI Voice Agent system.
 * Implements secure connection handling, monitoring, and performance optimizations.
 * 
 * @see Technical Specifications/2.1 High-Level Architecture
 * @see Technical Specifications/7.2 Data Security
 */

import mongoose, { ConnectOptions } from 'mongoose'; // ^7.x
import dotenv from 'dotenv'; // ^16.x
import { CampaignSchema } from '../db/schemas';

// Load environment variables
dotenv.config();

// Database connection configuration constants
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/docshield';
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || 'docshield';
const MONGODB_MIN_POOL_SIZE = parseInt(process.env.MONGODB_MIN_POOL_SIZE || '5', 10);
const MONGODB_MAX_POOL_SIZE = parseInt(process.env.MONGODB_MAX_POOL_SIZE || '10', 10);
const MONGODB_CONNECT_TIMEOUT_MS = 30000;
const MONGODB_SOCKET_TIMEOUT_MS = 45000;

/**
 * Returns optimized MongoDB connection configuration options
 * Implements security and performance requirements from Technical Specifications
 */
export const getDatabaseConfig = (): ConnectOptions => ({
  dbName: MONGODB_DB_NAME,
  
  // Security settings
  ssl: true,
  tls: true,
  tlsAllowInvalidCertificates: false,
  tlsAllowInvalidHostnames: false,
  retryWrites: true,
  
  // Authentication settings
  authSource: 'admin',
  authMechanism: 'SCRAM-SHA-256',
  
  // Connection pool settings
  minPoolSize: MONGODB_MIN_POOL_SIZE,
  maxPoolSize: MONGODB_MAX_POOL_SIZE,
  
  // Timeout settings
  connectTimeoutMS: MONGODB_CONNECT_TIMEOUT_MS,
  socketTimeoutMS: MONGODB_SOCKET_TIMEOUT_MS,
  
  // Write concern for data integrity
  writeConcern: {
    w: 'majority',
    j: true,
    wtimeout: 5000
  },
  
  // Read preference for optimal performance
  readPreference: 'primaryPreferred',
  
  // Compression for network efficiency
  compressors: ['snappy', 'zlib'],
  
  // Monitoring settings
  monitorCommands: true,
  serverSelectionTimeoutMS: 5000,
  heartbeatFrequencyMS: 10000,
  
  // Auto-index creation
  autoIndex: true,
  autoCreate: true
});

/**
 * Monitors database connection health and performance metrics
 * Reports metrics to LogTail for monitoring
 */
const monitorDatabaseHealth = (): void => {
  const db = mongoose.connection;

  // Monitor connection pool metrics
  setInterval(() => {
    const poolStats = {
      active: db.pool?.size || 0,
      available: db.pool?.available || 0,
      pending: db.pool?.pending || 0
    };
    console.info('MongoDB Pool Stats:', poolStats);
  }, 60000);

  // Monitor operation performance
  db.on('commandStarted', (event) => {
    console.debug(`MongoDB Command Started: ${event.commandName}`);
  });

  db.on('commandSucceeded', (event) => {
    console.debug(`MongoDB Command Succeeded: ${event.commandName} (${event.duration}ms)`);
  });

  db.on('commandFailed', (event) => {
    console.error(`MongoDB Command Failed: ${event.commandName}`, event.failure);
  });
};

/**
 * Initializes MongoDB connection with enhanced security configurations
 * Implements connection pooling, monitoring, and error handling
 */
export const initializeDatabase = async (): Promise<void> => {
  try {
    // Configure mongoose settings
    mongoose.set('strictQuery', true);
    mongoose.set('autoIndex', true);
    mongoose.set('debug', process.env.NODE_ENV !== 'production');

    // Connect to MongoDB with retry logic
    const maxRetries = 3;
    let retryCount = 0;
    
    while (retryCount < maxRetries) {
      try {
        await mongoose.connect(MONGODB_URI, getDatabaseConfig());
        break;
      } catch (error) {
        retryCount++;
        if (retryCount === maxRetries) throw error;
        console.warn(`MongoDB connection attempt ${retryCount} failed, retrying...`);
        await new Promise(resolve => setTimeout(resolve, 5000 * retryCount));
      }
    }

    // Set up connection event handlers
    const db = mongoose.connection;

    db.on('connected', () => {
      console.info('MongoDB connected successfully');
      monitorDatabaseHealth();
    });

    db.on('error', (error) => {
      console.error('MongoDB connection error:', error);
    });

    db.on('disconnected', () => {
      console.warn('MongoDB disconnected');
    });

    db.on('reconnected', () => {
      console.info('MongoDB reconnected');
    });

    // Handle process termination
    process.on('SIGINT', async () => {
      try {
        await db.close();
        console.info('MongoDB connection closed through app termination');
        process.exit(0);
      } catch (error) {
        console.error('Error during MongoDB shutdown:', error);
        process.exit(1);
      }
    });

  } catch (error) {
    console.error('Failed to initialize MongoDB connection:', error);
    throw error;
  }
};

// Export mongoose instance for direct access if needed
export const database = mongoose;