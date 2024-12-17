/**
 * @fileoverview OpenAI configuration module for DocShield AI Voice Agent system.
 * Provides configuration settings for voice synthesis, conversation management,
 * and sales coach monitoring.
 * 
 * @version 1.0.0
 * @license MIT
 */

import { OpenAIApi } from 'openai'; // ^4.0.0
import { VoiceAgentConfig } from '../integrations/openai/types';

/**
 * Default model settings for voice agent
 */
const DEFAULT_MODEL = 'tts-1-hd'; // High-definition voice model for optimal clarity
const DEFAULT_TEMPERATURE = 0.7;  // Balanced creativity and consistency
const DEFAULT_VOICE = 'alloy';    // Professional, neutral voice
const DEFAULT_MAX_TOKENS = 150;   // Optimal length for sales responses

/**
 * Sales coach monitoring interval (15 seconds)
 * As specified in Technical Specifications/2.2 Component Details
 */
const SALES_COACH_INTERVAL = 15000;

/**
 * Retrieves and validates OpenAI configuration from environment variables
 * @throws {Error} If required configuration values are missing
 * @returns {Object} Validated OpenAI configuration object
 */
const getOpenAIConfig = () => {
  const apiKey = process.env.OPENAI_API_KEY;
  const organizationId = process.env.OPENAI_ORG_ID;

  if (!apiKey || !organizationId) {
    throw new Error('Missing required OpenAI configuration. OPENAI_API_KEY and OPENAI_ORG_ID must be set.');
  }

  return {
    apiKey,
    organization: organizationId
  };
};

/**
 * OpenAI API configuration with credentials
 * Used for initializing the OpenAI client
 */
export const openAIConfig = getOpenAIConfig();

/**
 * Voice agent configuration optimized for high-quality sales conversations
 * Implements voice quality requirements from Technical Specifications/1.2 System Overview
 */
export const voiceAgentConfig: VoiceAgentConfig = {
  model: DEFAULT_MODEL,
  temperature: DEFAULT_TEMPERATURE,
  voice: DEFAULT_VOICE,
  maxTokens: DEFAULT_MAX_TOKENS,
  // Additional voice quality settings
  streaming: true,              // Enable real-time streaming for natural conversation flow
  voiceQuality: 'high',        // High-quality voice synthesis
  clarity: 0.95,               // Target >8/10 clarity score
  naturalness: 0.90            // Target >8/10 naturalness score
};

/**
 * Sales coach configuration for conversation monitoring and guidance
 * Implements monitoring parameters from Technical Specifications/2.2 Component Details
 */
export const salesCoachConfig = {
  model: 'gpt-4',              // Latest model for optimal analysis
  interval: SALES_COACH_INTERVAL,
  temperature: 0.4,            // Lower temperature for more focused guidance
  confidenceThreshold: 0.8,    // Minimum confidence for interventions
  
  // Triggers for sales coach interventions
  interventionTriggers: [
    'objection_detected',
    'interest_signal',
    'confusion_detected',
    'opportunity_identified'
  ],
  
  // Performance metrics for monitoring
  performanceMetrics: {
    engagementScore: 0.0,      // Conversation engagement level
    objectionHandling: 0.0,    // Effectiveness of objection responses
    closingEfficiency: 0.0,    // Success rate in scheduling meetings
    conversationFlow: 0.0      // Natural flow of dialogue
  }
};

/**
 * Validation function for voice agent configuration
 * @param config Voice agent configuration to validate
 * @throws {Error} If configuration is invalid
 */
export const validateVoiceConfig = (config: VoiceAgentConfig): void => {
  if (config.temperature < 0 || config.temperature > 2) {
    throw new Error('Temperature must be between 0 and 2');
  }
  
  if (config.maxTokens < 1 || config.maxTokens > 4096) {
    throw new Error('maxTokens must be between 1 and 4096');
  }
  
  if (!['tts-1', 'tts-1-hd'].includes(config.model)) {
    throw new Error('Invalid voice model specified');
  }
  
  if (!['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'].includes(config.voice)) {
    throw new Error('Invalid voice option specified');
  }
};

// Validate voice agent configuration on module load
validateVoiceConfig(voiceAgentConfig);