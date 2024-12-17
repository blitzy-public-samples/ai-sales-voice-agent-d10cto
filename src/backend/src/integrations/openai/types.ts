/**
 * @fileoverview Type definitions for OpenAI integration including voice agent configuration,
 * response types, conversation states, and sales coaching interfaces.
 * 
 * @version 1.0.0
 * @license MIT
 */

import { ChatCompletionRequestMessage } from 'openai'; // ^4.0.0
import { CallOutcome } from '../../types';

/**
 * Available voice models for text-to-speech synthesis
 */
export const VOICE_MODELS = ['tts-1', 'tts-1-hd'] as const;
type VoiceModel = typeof VOICE_MODELS[number];

/**
 * Available voice options for text-to-speech synthesis
 */
export const VOICE_OPTIONS = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'] as const;
type VoiceOption = typeof VOICE_OPTIONS[number];

/**
 * Configuration interface for voice agent parameters
 */
export interface VoiceAgentConfig {
  /** OpenAI model to use for voice synthesis */
  model: VoiceModel;
  
  /** Voice character to use for synthesis */
  voice: VoiceOption;
  
  /** Temperature for response generation (0-2) */
  temperature: number;
  
  /** Maximum tokens in generated response */
  maxTokens: number;
}

/**
 * Interface for voice synthesis response
 */
export interface VoiceResponse {
  /** Raw audio content as Buffer */
  audioContent: Buffer;
  
  /** Text transcript of synthesized speech */
  transcript: string;
  
  /** Duration of audio in seconds */
  duration: number;
}

/**
 * Enhanced enum for tracking conversation state machine states
 * Maps to the state transitions defined in Technical Specifications/5.3 API Integration Design
 */
export enum ConversationState {
  INITIALIZING = 'INITIALIZING',
  CALL_INITIATED = 'CALL_INITIATED',
  DIALING = 'DIALING',
  MENU_DETECTED = 'MENU_DETECTED',
  NAVIGATING_MENU = 'NAVIGATING_MENU',
  HUMAN_DETECTED = 'HUMAN_DETECTED',
  SPEAKING = 'SPEAKING',
  SCHEDULING_INITIATED = 'SCHEDULING_INITIATED',
  SCHEDULING = 'SCHEDULING',
  MEETING_CONFIRMED = 'MEETING_CONFIRMED',
  CLOSING = 'CLOSING',
  VOICEMAIL_DETECTED = 'VOICEMAIL_DETECTED',
  LEAVING_VOICEMAIL = 'LEAVING_VOICEMAIL',
  CALL_ENDED = 'CALL_ENDED'
}

/**
 * Interface for AI sales coach responses
 * Provides guidance and confidence scoring during conversations
 */
export interface SalesCoachResponse {
  /** Specific guidance or suggestions for the voice agent */
  guidance: string;
  
  /** Recommended next action based on conversation analysis */
  nextAction: string;
  
  /** Confidence score for the recommendation (0-1) */
  confidence: number;
}

/**
 * Enhanced interface for maintaining conversation context
 * Tracks complete conversation state including history and sales coach feedback
 */
export interface ConversationContext {
  /** Array of conversation messages for context */
  messages: ChatCompletionRequestMessage[];
  
  /** Current state in the conversation flow */
  state: ConversationState;
  
  /** Previous state for transition tracking */
  lastState: ConversationState;
  
  /** Complete history of state transitions */
  stateHistory: ConversationState[];
  
  /** Final outcome of the conversation */
  outcome: CallOutcome;
  
  /** Buffer of recent conversation transcripts */
  transcriptBuffer: string[];
  
  /** Overall confidence score for the conversation (0-1) */
  confidenceScore: number;
  
  /** Array of sales coach feedback during conversation */
  salesCoachFeedback: SalesCoachResponse[];
}