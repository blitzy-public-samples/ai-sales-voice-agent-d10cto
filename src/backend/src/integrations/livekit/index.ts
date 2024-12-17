/**
 * @file LiveKit Integration Entry Point
 * @version 1.0.0
 * @description Exports LiveKit service and types for voice call management in DocShield AI Voice Agent
 */

// Import LiveKit service and types from internal modules
import { LiveKitService } from './livekit.service';
import {
  LiveKitCallState,
  LiveKitAudioConfig,
  LiveKitCallMetrics,
  LiveKitCallEventType,
  LiveKitCallEvent,
  LIVEKIT_AUDIO_DEFAULTS,
  LIVEKIT_QUALITY_THRESHOLDS,
  Room,
  RoomEvent
} from './types';

/**
 * Default audio configuration based on Technical Specifications/Appendices/A.3
 * Ensures high-quality dual-channel audio for voice calls
 */
export const DEFAULT_AUDIO_CONFIG: LiveKitAudioConfig = LIVEKIT_AUDIO_DEFAULTS;

/**
 * Quality thresholds for voice calls based on Technical Specifications/1.2
 * Ensures voice quality score > 8/10 and response latency < 1.5s
 */
export const QUALITY_THRESHOLDS = LIVEKIT_QUALITY_THRESHOLDS;

/**
 * LiveKit SDK version used by the integration
 * Required by IE2 rule for third-party imports
 */
export const LIVEKIT_SDK_VERSION = '1.2.0';

/**
 * Re-export LiveKit service class for voice call management
 * Implements requirements from Technical Specifications/2.2.1
 */
export { LiveKitService };

/**
 * Re-export LiveKit call state enum for lifecycle tracking
 * Maps to states defined in Technical Specifications/D.2
 */
export { LiveKitCallState };

/**
 * Re-export LiveKit audio configuration interface
 * Based on requirements from Technical Specifications/A.3
 */
export { LiveKitAudioConfig };

/**
 * Re-export LiveKit call metrics interface
 * Implements monitoring requirements from Technical Specifications/1.2
 */
export { LiveKitCallMetrics };

/**
 * Re-export LiveKit call event types and interface
 * Used for comprehensive call lifecycle event tracking
 */
export { LiveKitCallEventType, LiveKitCallEvent };

/**
 * Re-export LiveKit SDK types for external use
 * Provides type safety for LiveKit SDK interactions
 */
export { Room, RoomEvent };

/**
 * Type definition for LiveKit call initialization options
 * Supports configuration of audio and quality parameters
 */
export interface LiveKitCallOptions {
  /**
   * Custom audio configuration overrides
   */
  audioConfig?: Partial<LiveKitAudioConfig>;
  
  /**
   * Custom quality threshold overrides
   */
  qualityThresholds?: Partial<typeof LIVEKIT_QUALITY_THRESHOLDS>;
  
  /**
   * Enable call recording (default: false)
   */
  enableRecording?: boolean;
  
  /**
   * Maximum retry attempts for call initialization
   */
  maxRetries?: number;
}

/**
 * Type definition for LiveKit call initialization result
 * Provides detailed information about call setup status
 */
export interface LiveKitCallResult {
  /**
   * Whether call initialization was successful
   */
  success: boolean;
  
  /**
   * Call identifier for tracking
   */
  callId: string;
  
  /**
   * Initial call state
   */
  state: LiveKitCallState;
  
  /**
   * Active audio configuration
   */
  audioConfig: LiveKitAudioConfig;
  
  /**
   * Initialization timestamp
   */
  timestamp: Date;
}

/**
 * Type definition for LiveKit error details
 * Used for structured error handling in voice calls
 */
export interface LiveKitError extends Error {
  /**
   * Error code for categorization
   */
  code: string;
  
  /**
   * Call state when error occurred
   */
  callState?: LiveKitCallState;
  
  /**
   * Associated call metrics
   */
  metrics?: Partial<LiveKitCallMetrics>;
  
  /**
   * Error timestamp
   */
  timestamp: Date;
}

// Default export of commonly used LiveKit elements
export default {
  LiveKitService,
  LiveKitCallState,
  DEFAULT_AUDIO_CONFIG,
  QUALITY_THRESHOLDS,
  LIVEKIT_SDK_VERSION
};