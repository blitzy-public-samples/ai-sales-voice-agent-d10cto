/**
 * @file Central export file for DocShield AI Voice Agent constants
 * @version 1.0.0
 * @description Aggregates and re-exports all constants, enums, and types used throughout
 * the application for error handling, conversation management, and status tracking.
 */

// Error handling exports from error-codes.ts
export {
    ErrorCode,
    ErrorMessage,
    ErrorSeverity,
    ErrorCategory,
    BackoffType,
    type ErrorDetail,
    type ErrorContext,
    type ErrorRecoveryPattern,
    ERROR_CODE_PREFIX,
    ERROR_CODE_VERSION,
    DEFAULT_ERROR_SEVERITY,
    ERROR_CODE_REGEX,
    DEFAULT_RECOVERY_PATTERNS,
    ERROR_CODE_CATEGORIES,
    ERROR_CODE_SEVERITIES
} from './error-codes';

// Conversation prompts and utilities from prompts.ts
export {
    PROMPT_INTERPOLATION_KEYS,
    GREETING_PROMPTS,
    INTRODUCTION_PROMPTS,
    OBJECTION_HANDLERS,
    SCHEDULING_PROMPTS,
    CLOSING_PROMPTS,
    interpolatePrompt
} from './prompts';

// Status tracking enums from status-codes.ts
export {
    CampaignStatus,
    CallStatus,
    CallOutcome
} from './status-codes';

/**
 * Commonly used error recovery configurations based on error type
 */
export const ERROR_RECOVERY_CONFIG = {
    API_TIMEOUT: {
        maxRetries: 3,
        backoffDelay: 2000, // 2 seconds
        maxDelay: 10000 // 10 seconds
    },
    NETWORK: {
        maxRetries: 2,
        backoffDelay: 1000, // 1 second
        maxDelay: 5000 // 5 seconds
    },
    VOICE_DROP: {
        maxRetries: 1,
        backoffDelay: 5000, // 5 seconds
        maxDelay: 5000 // 5 seconds
    },
    QUEUE: {
        maxRetries: 5,
        backoffDelay: 1000, // 1 second
        maxDelay: 30000 // 30 seconds
    },
    DATABASE: {
        maxRetries: 3,
        backoffDelay: 2000, // 2 seconds
        maxDelay: 15000 // 15 seconds
    }
} as const;

/**
 * Call recording configuration constants
 */
export const RECORDING_CONFIG = {
    FORMAT: 'wav',
    CHANNELS: 2, // Dual channel for agent/recipient
    SAMPLE_RATE: 48000, // 48kHz
    BIT_DEPTH: 16,
    COMPRESSION: 'opus'
} as const;

/**
 * State machine transition validation map
 * Defines valid state transitions for call status
 */
export const VALID_CALL_TRANSITIONS = {
    [CallStatus.INITIALIZING]: [CallStatus.DIALING],
    [CallStatus.DIALING]: [
        CallStatus.NAVIGATING_MENU,
        CallStatus.LEAVING_VOICEMAIL,
        CallStatus.ENDED
    ],
    [CallStatus.NAVIGATING_MENU]: [
        CallStatus.SPEAKING,
        CallStatus.LEAVING_VOICEMAIL,
        CallStatus.ENDED
    ],
    [CallStatus.SPEAKING]: [
        CallStatus.SCHEDULING,
        CallStatus.CLOSING,
        CallStatus.ENDED
    ],
    [CallStatus.SCHEDULING]: [CallStatus.CLOSING],
    [CallStatus.LEAVING_VOICEMAIL]: [CallStatus.CLOSING],
    [CallStatus.CLOSING]: [CallStatus.ENDED],
    [CallStatus.ENDED]: []
} as const;

/**
 * Campaign status transition validation map
 * Defines valid state transitions for campaign status
 */
export const VALID_CAMPAIGN_TRANSITIONS = {
    [CampaignStatus.PENDING]: [
        CampaignStatus.IN_PROGRESS,
        CampaignStatus.FAILED
    ],
    [CampaignStatus.IN_PROGRESS]: [
        CampaignStatus.COMPLETED,
        CampaignStatus.FAILED
    ],
    [CampaignStatus.COMPLETED]: [],
    [CampaignStatus.FAILED]: []
} as const;

/**
 * Mapping of call outcomes to their corresponding success metrics
 */
export const CALL_OUTCOME_METRICS = {
    [CallOutcome.MEETING_SCHEDULED]: {
        success: true,
        meetingBooked: true,
        requiresFollowup: false
    },
    [CallOutcome.DECLINED]: {
        success: false,
        meetingBooked: false,
        requiresFollowup: true
    },
    [CallOutcome.VOICEMAIL]: {
        success: true,
        meetingBooked: false,
        requiresFollowup: true
    },
    [CallOutcome.NO_ANSWER]: {
        success: false,
        meetingBooked: false,
        requiresFollowup: true
    },
    [CallOutcome.FAILED]: {
        success: false,
        meetingBooked: false,
        requiresFollowup: true
    }
} as const;