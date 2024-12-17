/**
 * @fileoverview Utility module for managing and interpolating conversation prompts
 * @version 1.0.0
 * 
 * Provides comprehensive prompt management with:
 * - Dynamic variable interpolation
 * - Voice quality optimization
 * - Context-aware prompt generation
 * - Error handling and validation
 */

import { 
  GREETING_PROMPTS, 
  INTRODUCTION_PROMPTS, 
  OBJECTION_HANDLERS 
} from '../constants/prompts';
import logger from 'winston'; // v3.8.2

// Regular expression for matching template variables
const TEMPLATE_REGEX = /\{\{([^}]+)\}\}/g;

// Required variables for prompt interpolation
const REQUIRED_VARIABLES = ['practiceName', 'contactName', 'contactTitle', 'agentName'] as const;

// Voice synthesis optimization markers
const VOICE_MARKERS = {
  PAUSE_SHORT: "<break time='300ms'/>",
  PAUSE_MEDIUM: "<break time='500ms'/>",
  PAUSE_LONG: "<break time='800ms'/>",
  EMPHASIS: '<emphasis>{{text}}</emphasis>'
} as const;

// Type definitions
interface VoiceOptions {
  speed?: number;
  emphasis?: boolean;
  naturalPauses?: boolean;
}

interface CallContext {
  recipientType: 'FRONT_DESK' | 'DECISION_MAKER' | 'VOICEMAIL';
  contactInfo: {
    practiceName: string;
    contactName: string;
    contactTitle: string;
  };
  agentName: string;
}

interface PracticeInfo {
  practiceName: string;
  specialties: string[];
  currentProvider?: string;
  estimatedSavings?: number;
}

/**
 * Validates and interpolates prompt template variables while optimizing for voice synthesis
 * @param promptTemplate - Template string containing variables to interpolate
 * @param variables - Object containing values for template variables
 * @param voiceOptions - Optional configuration for voice synthesis optimization
 * @returns Interpolated and voice-optimized prompt string
 * @throws Error if template or required variables are missing
 */
export function interpolatePrompt(
  promptTemplate: string,
  variables: Record<string, string>,
  voiceOptions: VoiceOptions = { speed: 1, emphasis: true, naturalPauses: true }
): string {
  try {
    // Validate inputs
    if (!promptTemplate?.trim()) {
      throw new Error('Prompt template cannot be empty');
    }

    if (!variables || typeof variables !== 'object') {
      throw new Error('Variables must be provided as an object');
    }

    // Verify required variables
    const missingVars = REQUIRED_VARIABLES.filter(
      key => !(key in variables)
    );
    
    if (missingVars.length > 0) {
      throw new Error(`Missing required variables: ${missingVars.join(', ')}`);
    }

    // Apply voice optimization
    let optimizedTemplate = promptTemplate;
    
    if (voiceOptions.naturalPauses) {
      optimizedTemplate = addNaturalPauses(optimizedTemplate);
    }

    if (voiceOptions.emphasis) {
      optimizedTemplate = addEmphasisMarkers(optimizedTemplate);
    }

    // Perform variable interpolation
    let interpolatedPrompt = optimizedTemplate;
    Object.entries(variables).forEach(([key, value]) => {
      const template = `{{${key}}}`;
      interpolatedPrompt = interpolatedPrompt.replace(
        new RegExp(template, 'g'), 
        value
      );
    });

    // Verify all variables were replaced
    const remainingVars = interpolatedPrompt.match(TEMPLATE_REGEX);
    if (remainingVars) {
      throw new Error(`Unresolved template variables: ${remainingVars.join(', ')}`);
    }

    return interpolatedPrompt;

  } catch (error) {
    logger.error('Prompt interpolation failed:', {
      error: error.message,
      template: promptTemplate,
      variables
    });
    throw error;
  }
}

/**
 * Generates context-aware greeting prompt based on recipient type
 * @param context - Call context including recipient and contact information
 * @returns Optimized greeting prompt for the specific scenario
 */
export function generateGreetingPrompt(context: CallContext): string {
  try {
    const { recipientType, contactInfo, agentName } = context;
    
    // Select appropriate greeting template
    const template = GREETING_PROMPTS[recipientType];
    if (!template) {
      throw new Error(`Invalid recipient type: ${recipientType}`);
    }

    // Prepare variables for interpolation
    const variables = {
      practiceName: contactInfo.practiceName,
      contactName: contactInfo.contactName,
      contactTitle: contactInfo.contactTitle,
      agentName
    };

    // Generate optimized greeting
    return interpolatePrompt(template, variables, {
      emphasis: true,
      naturalPauses: true
    });

  } catch (error) {
    logger.error('Greeting generation failed:', {
      error: error.message,
      context
    });
    throw error;
  }
}

/**
 * Generates practice-specific introduction with value proposition
 * @param practiceInfo - Information about the medical practice
 * @returns Customized introduction prompt with voice optimization
 */
export function generateIntroductionPrompt(practiceInfo: PracticeInfo): string {
  try {
    // Combine introduction components
    const introTemplate = `${INTRODUCTION_PROMPTS.COMPANY_INTRO} ${VOICE_MARKERS.PAUSE_MEDIUM} ${INTRODUCTION_PROMPTS.VALUE_PROPOSITION}`;

    // Prepare interpolation variables
    const variables = {
      practiceName: practiceInfo.practiceName,
      currentProvider: practiceInfo.currentProvider || 'your current provider',
      premiumEstimate: practiceInfo.estimatedSavings 
        ? `${practiceInfo.estimatedSavings}% less than your current premium`
        : 'a competitive rate'
    };

    // Generate optimized introduction
    return interpolatePrompt(introTemplate, variables, {
      emphasis: true,
      naturalPauses: true
    });

  } catch (error) {
    logger.error('Introduction generation failed:', {
      error: error.message,
      practiceInfo
    });
    throw error;
  }
}

/**
 * Adds natural pause markers based on punctuation and phrasing
 * @param template - Input prompt template
 * @returns Template with optimized pause markers
 */
function addNaturalPauses(template: string): string {
  return template
    .replace(/\.\s+/g, `. ${VOICE_MARKERS.PAUSE_MEDIUM} `)
    .replace(/,\s+/g, `, ${VOICE_MARKERS.PAUSE_SHORT} `)
    .replace(/\?\s+/g, `? ${VOICE_MARKERS.PAUSE_LONG} `);
}

/**
 * Adds emphasis markers to key phrases and important terms
 * @param template - Input prompt template
 * @returns Template with emphasis markers
 */
function addEmphasisMarkers(template: string): string {
  const emphasisPhrases = [
    'DocShield',
    'medical malpractice insurance',
    'comprehensive coverage',
    'competitive rates',
    'risk management'
  ];

  let result = template;
  emphasisPhrases.forEach(phrase => {
    result = result.replace(
      new RegExp(`\\b${phrase}\\b`, 'gi'),
      VOICE_MARKERS.EMPHASIS.replace('{{text}}', phrase)
    );
  });

  return result;
}