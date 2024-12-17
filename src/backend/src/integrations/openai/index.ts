/**
 * @fileoverview Entry point for OpenAI integration module that exports the OpenAI service
 * and type definitions for voice synthesis, conversation management, and sales coaching capabilities.
 * 
 * @version 1.0.0
 * @license MIT
 */

import { OpenAIService } from './openai.service';
import { CircuitBreaker } from '../../lib/circuit-breaker';
import { logger } from '../../lib/logger';

/**
 * Interface for voice quality settings to meet >8/10 clarity target
 */
export interface VoiceQualitySettings {
  /** Target clarity score (0-1) */
  clarity: number;
  /** Target naturalness score (0-1) */
  naturalness: number;
  /** Maximum acceptable latency in seconds */
  maxLatency: number;
  /** Sample rate for audio (48kHz standard) */
  sampleRate: number;
  /** Bit depth for audio (16-bit standard) */
  bitDepth: number;
}

/**
 * Interface for real-time streaming configuration
 */
export interface StreamingSettings {
  /** Enable streaming mode */
  enabled: boolean;
  /** Chunk size in bytes */
  chunkSize: number;
  /** Buffer size in seconds */
  bufferSize: number;
}

/**
 * Enhanced configuration interface for voice agent with quality controls
 */
export interface VoiceAgentConfig {
  /** OpenAI model for voice synthesis */
  model: 'tts-1' | 'tts-1-hd';
  /** Voice character selection */
  voice: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
  /** Temperature for response generation (0-2) */
  temperature: number;
  /** Maximum tokens in generated response */
  maxTokens: number;
  /** Voice quality configuration */
  voiceQuality: VoiceQualitySettings;
  /** Streaming configuration */
  streamingConfig: StreamingSettings;
}

/**
 * Enhanced enum for conversation state machine with error states
 */
export enum ConversationState {
  INITIALIZING = 'INITIALIZING',
  DIALING = 'DIALING',
  NAVIGATING_MENU = 'NAVIGATING_MENU',
  SPEAKING = 'SPEAKING',
  SCHEDULING = 'SCHEDULING',
  CLOSING = 'CLOSING',
  LEAVING_VOICEMAIL = 'LEAVING_VOICEMAIL',
  ERROR_RECOVERY = 'ERROR_RECOVERY',
  QUALITY_CHECK = 'QUALITY_CHECK'
}

/**
 * Interface for performance metrics tracking
 */
export interface PerformanceMetrics {
  /** Engagement level score (0-1) */
  engagementScore: number;
  /** Objection handling effectiveness (0-1) */
  objectionHandling: number;
  /** Meeting scheduling success rate (0-1) */
  closingEfficiency: number;
  /** Conversation flow naturalness (0-1) */
  conversationFlow: number;
}

/**
 * Interface for sales coach intervention triggers
 */
export interface InterventionTriggers {
  /** Detect customer objections */
  objectionDetected: boolean;
  /** Identify buying signals */
  interestSignal: boolean;
  /** Detect customer confusion */
  confusionDetected: boolean;
  /** Identify sales opportunities */
  opportunityIdentified: boolean;
}

/**
 * Enhanced interface for AI sales coach responses with metrics
 */
export interface SalesCoachResponse {
  /** Specific guidance for the voice agent */
  guidance: string;
  /** Recommended next action */
  nextAction: string;
  /** Confidence score (0-1) */
  confidence: number;
  /** Performance tracking metrics */
  performanceMetrics: PerformanceMetrics;
  /** Intervention trigger flags */
  interventionTriggers: InterventionTriggers;
}

// Export OpenAI service instance with default configuration
const defaultConfig: VoiceAgentConfig = {
  model: 'tts-1-hd',
  voice: 'alloy',
  temperature: 0.7,
  maxTokens: 150,
  voiceQuality: {
    clarity: 0.95,        // Target >8/10 clarity
    naturalness: 0.90,    // Target >8/10 naturalness
    maxLatency: 1.5,      // <1.5s response latency
    sampleRate: 48000,    // 48kHz sample rate
    bitDepth: 16          // 16-bit depth
  },
  streamingConfig: {
    enabled: true,
    chunkSize: 4096,
    bufferSize: 0.5
  }
};

// Initialize OpenAI service with circuit breaker protection
const circuitBreaker = new CircuitBreaker({
  failureThreshold: 5,
  resetTimeout: 60000,
  monitoredServices: ['openai-voice', 'openai-chat']
});

logger.info('Initializing OpenAI service with default configuration', {
  model: defaultConfig.model,
  voice: defaultConfig.voice,
  qualityTargets: {
    clarity: defaultConfig.voiceQuality.clarity,
    naturalness: defaultConfig.voiceQuality.naturalness
  }
});

export const openAIService = new OpenAIService(defaultConfig);

// Export all type definitions and service
export {
  OpenAIService,
  VoiceAgentConfig,
  VoiceQualitySettings,
  StreamingSettings,
  ConversationState,
  PerformanceMetrics,
  InterventionTriggers,
  SalesCoachResponse
};