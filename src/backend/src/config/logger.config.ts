import winston from 'winston'; // v3.10.0
import { LogtailTransport } from '@logtail/winston'; // v0.4.0

// Define log levels with numeric priorities
const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
};

// Default log level from environment or fallback to info
const DEFAULT_LOG_LEVEL = process.env.LOG_LEVEL || 'info';

// LogTail source token from environment
const LOGTAIL_SOURCE_TOKEN = process.env.LOGTAIL_SOURCE_TOKEN;

/**
 * Creates Winston log format configuration with timestamp, level, metadata and filtering
 * @returns Combined Winston format configuration
 */
const createLogFormat = (): winston.Format => {
  // Create timestamp format using ISO datetime
  const timestamp = winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss.SSS'
  });

  // Add colorization for console output
  const colorize = winston.format.colorize();

  // Add metadata with source and environment info
  const metadata = winston.format.metadata({
    fillWith: {
      service: 'docshield-voice-agent',
      environment: process.env.NODE_ENV,
      version: process.env.npm_package_version
    }
  });

  // Filter sensitive data patterns
  const filterSensitive = winston.format((info) => {
    const masked = { ...info };
    
    // Mask phone numbers
    if (typeof masked.message === 'string') {
      masked.message = masked.message.replace(
        /\+?\d{10,}/g,
        match => `${match.slice(0, 4)}****${match.slice(-4)}`
      );
    }
    
    // Mask email addresses
    if (typeof masked.message === 'string') {
      masked.message = masked.message.replace(
        /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
        match => `${match.slice(0, 2)}****@${match.split('@')[1]}`
      );
    }
    
    return masked;
  })();

  // Create print format for console
  const printFormat = winston.format.printf(({ level, message, timestamp, metadata }) => {
    return `[${timestamp}] ${level}: ${message} ${
      Object.keys(metadata).length ? JSON.stringify(metadata) : ''
    }`;
  });

  // Return combined format
  return winston.format.combine(
    timestamp,
    metadata,
    filterSensitive,
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json(),
    colorize,
    printFormat
  );
};

/**
 * Creates array of Winston transports with environment-specific configurations
 * @returns Array of configured console and LogTail transports
 */
const createTransports = (): winston.transport[] => {
  const transports: winston.transport[] = [];

  // Console transport configuration
  const consoleTransport = new winston.transports.Console({
    level: DEFAULT_LOG_LEVEL,
    handleExceptions: true,
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  });
  transports.push(consoleTransport);

  // Add file transport for development environment
  if (process.env.NODE_ENV === 'development') {
    const fileTransport = new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      format: winston.format.json()
    });
    transports.push(fileTransport);
  }

  // Add LogTail transport if token exists
  if (LOGTAIL_SOURCE_TOKEN) {
    try {
      const logtailTransport = new LogtailTransport({
        level: DEFAULT_LOG_LEVEL,
        sourceToken: LOGTAIL_SOURCE_TOKEN,
        handleExceptions: true,
        format: winston.format.json()
      });

      // Add error handler for LogTail transport
      logtailTransport.on('error', (error) => {
        console.error('LogTail Transport Error:', error);
        // Fallback to console logging if LogTail fails
        console.log('Falling back to console transport only');
      });

      transports.push(logtailTransport);
    } catch (error) {
      console.error('Failed to initialize LogTail transport:', error);
    }
  } else {
    console.warn('LOGTAIL_SOURCE_TOKEN not provided - LogTail transport disabled');
  }

  return transports;
};

/**
 * Complete Winston logger configuration
 */
export const loggerConfig = {
  levels: LOG_LEVELS,
  level: DEFAULT_LOG_LEVEL,
  format: createLogFormat(),
  transports: createTransports(),
  exitOnError: false,
  handleExceptions: true,
  handleRejections: true,
  silent: process.env.NODE_ENV === 'test', // Disable logging in test environment
  
  // Additional metadata for all logs
  defaultMeta: {
    service: 'docshield-voice-agent',
    environment: process.env.NODE_ENV
  }
};

// Type definitions for external use
export type LogLevel = keyof typeof LOG_LEVELS;
export type LoggerConfig = typeof loggerConfig;