import winston from 'winston'; // v3.10.0
import { LogtailTransport } from '@logtail/winston'; // v0.4.0
import { loggerConfig } from '../config/logger.config';
import { v4 as uuidv4 } from 'uuid'; // v9.0.0

/**
 * Interface for structured log metadata
 */
interface LogMetadata {
  timestamp?: Date;
  level?: string;
  message?: string;
  service?: string;
  workerId?: string;
  campaignId?: string;
  contactId?: string;
  error?: Error;
  environment?: string;
  component?: string;
  duration?: number;
  tags?: string[];
  sensitiveFields?: string[];
  [key: string]: any;
}

/**
 * Formats error objects for consistent logging with stack traces and context
 */
function formatError(error: Error): object {
  const formattedError = {
    name: error.name,
    message: error.message,
    stack: error.stack,
    code: (error as any).code,
    correlationId: uuidv4(),
    timestamp: new Date().toISOString(),
    context: {
      runtime: process.version,
      platform: process.platform,
      arch: process.arch,
      nodeEnv: process.env.NODE_ENV
    }
  };

  // Add additional error properties if they exist
  if (error instanceof Error) {
    Object.getOwnPropertyNames(error).forEach(key => {
      if (!['name', 'message', 'stack'].includes(key)) {
        (formattedError as any)[key] = (error as any)[key];
      }
    });
  }

  return formattedError;
}

/**
 * Enhanced Logger class with worker identification and security features
 */
export class Logger {
  private logger: winston.Logger;
  private workerId: string;
  private sensitivePatterns: RegExp[];
  private errorCorrelation: Map<string, Error>;
  private static instance: Logger;

  constructor(workerId: string) {
    this.workerId = workerId;
    this.errorCorrelation = new Map();
    
    // Initialize sensitive data patterns
    this.sensitivePatterns = [
      /\b\d{10,}\b/g, // Phone numbers
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, // Email addresses
      /\b[3-6]\d{15}\b/g, // Credit card numbers
      /\b[A-Z0-9]{20,}\b/g // API keys/tokens
    ];

    // Create Winston logger instance
    this.logger = winston.createLogger({
      ...loggerConfig,
      defaultMeta: {
        ...loggerConfig.defaultMeta,
        workerId: this.workerId
      }
    });

    // Add error recovery for transports
    this.logger.on('error', (error) => {
      console.error('Logger transport error:', error);
      this.fallbackLog('error', 'Logger transport failure', { error });
    });
  }

  /**
   * Fallback logging when primary transports fail
   */
  private fallbackLog(level: string, message: string, meta?: any): void {
    console[level as keyof Console](`[FALLBACK] ${message}`, meta);
  }

  /**
   * Filter sensitive information from log data
   */
  private filterSensitiveData(data: any): any {
    if (typeof data === 'string') {
      return this.sensitivePatterns.reduce(
        (filtered, pattern) => filtered.replace(pattern, '****'),
        data
      );
    }
    if (typeof data === 'object' && data !== null) {
      const filtered = { ...data };
      Object.keys(filtered).forEach(key => {
        filtered[key] = this.filterSensitiveData(filtered[key]);
      });
      return filtered;
    }
    return data;
  }

  /**
   * Enhance metadata with standard fields
   */
  private enhanceMetadata(metadata: LogMetadata = {}): LogMetadata {
    return {
      timestamp: new Date(),
      workerId: this.workerId,
      environment: process.env.NODE_ENV,
      service: 'docshield-voice-agent',
      ...metadata
    };
  }

  /**
   * Log error messages with enhanced error formatting
   */
  error(message: string, metadata: LogMetadata = {}): void {
    const enhancedMetadata = this.enhanceMetadata(metadata);
    
    if (metadata.error) {
      const formattedError = formatError(metadata.error);
      enhancedMetadata.error = formattedError;
      this.errorCorrelation.set(formattedError.correlationId, metadata.error);
    }

    this.logger.error(
      this.filterSensitiveData(message),
      this.filterSensitiveData(enhancedMetadata)
    );
  }

  /**
   * Log warning messages
   */
  warn(message: string, metadata: LogMetadata = {}): void {
    this.logger.warn(
      this.filterSensitiveData(message),
      this.filterSensitiveData(this.enhanceMetadata(metadata))
    );
  }

  /**
   * Log info messages
   */
  info(message: string, metadata: LogMetadata = {}): void {
    this.logger.info(
      this.filterSensitiveData(message),
      this.filterSensitiveData(this.enhanceMetadata(metadata))
    );
  }

  /**
   * Log debug messages with detailed context
   */
  debug(message: string, metadata: LogMetadata = {}): void {
    const debugMetadata = {
      ...this.enhanceMetadata(metadata),
      debugContext: {
        memory: process.memoryUsage(),
        uptime: process.uptime(),
        pid: process.pid
      }
    };

    this.logger.debug(
      this.filterSensitiveData(message),
      this.filterSensitiveData(debugMetadata)
    );
  }

  /**
   * Get singleton logger instance
   */
  static getInstance(workerId: string): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger(workerId);
    }
    return Logger.instance;
  }
}

// Create default logger instance
const defaultWorkerId = uuidv4();
export const logger = Logger.getInstance(defaultWorkerId);