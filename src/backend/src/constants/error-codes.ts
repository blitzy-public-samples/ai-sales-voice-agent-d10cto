/**
 * @file Error code definitions and error-related enums for DocShield AI Voice Agent
 * @version 1.0.0
 * @description Centralized error handling constants and types for consistent error management
 */

/**
 * Prefix for all DocShield error codes
 */
export const ERROR_CODE_PREFIX = 'DOCSHIELD_ERR_';

/**
 * Current version of the error code system
 */
export const ERROR_CODE_VERSION = '1.0.0';

/**
 * Default error severity if not specified
 */
export const DEFAULT_ERROR_SEVERITY = 'MEDIUM';

/**
 * Regex pattern for validating error codes
 */
export const ERROR_CODE_REGEX = /^DOCSHIELD_ERR_[A-Z_]+$/;

/**
 * Enumeration of all system error codes
 */
export enum ErrorCode {
    API_TIMEOUT_ERROR = 'DOCSHIELD_ERR_API_TIMEOUT',
    NETWORK_ERROR = 'DOCSHIELD_ERR_NETWORK_FAILURE',
    VOICE_PROCESSING_ERROR = 'DOCSHIELD_ERR_VOICE_PROCESSING',
    PHONE_TREE_ERROR = 'DOCSHIELD_ERR_PHONE_TREE_NAV',
    CALENDAR_ERROR = 'DOCSHIELD_ERR_CALENDAR_SYNC',
    DATABASE_ERROR = 'DOCSHIELD_ERR_DATABASE_ACCESS',
    QUEUE_ERROR = 'DOCSHIELD_ERR_QUEUE_OPERATION',
    STORAGE_ERROR = 'DOCSHIELD_ERR_STORAGE_ACCESS'
}

/**
 * Classification of error types for recovery pattern selection
 */
export enum ErrorCategory {
    RETRYABLE = 'retryable',     // Errors that can be automatically retried
    TRANSIENT = 'transient',     // Temporary errors that may resolve themselves
    PERMANENT = 'permanent',      // Errors requiring manual intervention
    SECURITY = 'security'        // Security-related errors requiring immediate attention
}

/**
 * Human-readable error messages (i18n-ready)
 */
export enum ErrorMessage {
    API_TIMEOUT_ERROR = 'External API request timed out',
    NETWORK_ERROR = 'Network connection failed',
    VOICE_PROCESSING_ERROR = 'Voice processing operation failed',
    PHONE_TREE_ERROR = 'Phone tree navigation error',
    CALENDAR_ERROR = 'Calendar synchronization failed',
    DATABASE_ERROR = 'Database operation failed',
    QUEUE_ERROR = 'Queue processing error',
    STORAGE_ERROR = 'Storage operation failed'
}

/**
 * Error severity levels for monitoring and alerting
 */
export enum ErrorSeverity {
    LOW = 'low',           // Minor issues, no immediate action required
    MEDIUM = 'medium',     // Notable issues requiring attention
    HIGH = 'high',        // Serious issues requiring prompt attention
    CRITICAL = 'critical' // Critical issues requiring immediate response
}

/**
 * Types of backoff strategies for error recovery
 */
export enum BackoffType {
    NONE = 'none',
    LINEAR = 'linear',
    EXPONENTIAL = 'exponential',
    FIBONACCI = 'fibonacci'
}

/**
 * Detailed error information structure
 */
export interface ErrorDetail {
    code: ErrorCode;
    message: string;
    severity: ErrorSeverity;
    category: ErrorCategory;
    timestamp: Date;
    context: ErrorContext;
    version: string;
    retryCount: number;
    backoffDelay: number;
}

/**
 * Context information for error tracking
 */
export interface ErrorContext {
    component: string;         // System component where error occurred
    operation: string;        // Operation being performed
    metadata: Record<string, unknown>; // Additional error context
    stackTrace: string;      // Error stack trace
    sensitiveFields: string[]; // Fields requiring redaction in logs
}

/**
 * Error recovery pattern configuration
 */
export interface ErrorRecoveryPattern {
    category: ErrorCategory;
    maxRetries: number;
    backoffType: BackoffType;
    baseDelay: number;    // Base delay in milliseconds
    maxDelay: number;     // Maximum delay in milliseconds
    jitter: boolean;      // Whether to add randomization to delays
}

/**
 * Default error recovery patterns by category
 */
export const DEFAULT_RECOVERY_PATTERNS: Record<ErrorCategory, ErrorRecoveryPattern> = {
    [ErrorCategory.RETRYABLE]: {
        category: ErrorCategory.RETRYABLE,
        maxRetries: 3,
        backoffType: BackoffType.EXPONENTIAL,
        baseDelay: 1000,
        maxDelay: 8000,
        jitter: true
    },
    [ErrorCategory.TRANSIENT]: {
        category: ErrorCategory.TRANSIENT,
        maxRetries: 2,
        backoffType: BackoffType.LINEAR,
        baseDelay: 5000,
        maxDelay: 15000,
        jitter: false
    },
    [ErrorCategory.PERMANENT]: {
        category: ErrorCategory.PERMANENT,
        maxRetries: 0,
        backoffType: BackoffType.NONE,
        baseDelay: 0,
        maxDelay: 0,
        jitter: false
    },
    [ErrorCategory.SECURITY]: {
        category: ErrorCategory.SECURITY,
        maxRetries: 0,
        backoffType: BackoffType.NONE,
        baseDelay: 0,
        maxDelay: 0,
        jitter: false
    }
};

/**
 * Maps error codes to their default categories
 */
export const ERROR_CODE_CATEGORIES: Record<ErrorCode, ErrorCategory> = {
    [ErrorCode.API_TIMEOUT_ERROR]: ErrorCategory.RETRYABLE,
    [ErrorCode.NETWORK_ERROR]: ErrorCategory.RETRYABLE,
    [ErrorCode.VOICE_PROCESSING_ERROR]: ErrorCategory.TRANSIENT,
    [ErrorCode.PHONE_TREE_ERROR]: ErrorCategory.RETRYABLE,
    [ErrorCode.CALENDAR_ERROR]: ErrorCategory.RETRYABLE,
    [ErrorCode.DATABASE_ERROR]: ErrorCategory.RETRYABLE,
    [ErrorCode.QUEUE_ERROR]: ErrorCategory.TRANSIENT,
    [ErrorCode.STORAGE_ERROR]: ErrorCategory.RETRYABLE
};

/**
 * Maps error codes to their default severity levels
 */
export const ERROR_CODE_SEVERITIES: Record<ErrorCode, ErrorSeverity> = {
    [ErrorCode.API_TIMEOUT_ERROR]: ErrorSeverity.MEDIUM,
    [ErrorCode.NETWORK_ERROR]: ErrorSeverity.HIGH,
    [ErrorCode.VOICE_PROCESSING_ERROR]: ErrorSeverity.HIGH,
    [ErrorCode.PHONE_TREE_ERROR]: ErrorSeverity.MEDIUM,
    [ErrorCode.CALENDAR_ERROR]: ErrorSeverity.MEDIUM,
    [ErrorCode.DATABASE_ERROR]: ErrorSeverity.HIGH,
    [ErrorCode.QUEUE_ERROR]: ErrorSeverity.HIGH,
    [ErrorCode.STORAGE_ERROR]: ErrorSeverity.HIGH
};