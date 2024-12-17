/**
 * DTMF (Dual-Tone Multi-Frequency) Utility Functions
 * Handles phone tree navigation for DocShield AI Voice Agent
 * Version: 1.0.0
 */

import dtmf from 'node-dtmf'; // v0.1.0
import { logger } from '../lib/logger';
import { ErrorCode } from '../constants/error-codes';
import { validateAudioFormat } from './audio.utils';

// DTMF frequency pairs for each digit/symbol based on telecommunications standards
const DTMF_FREQUENCIES: Record<string, [number, number]> = {
  '1': [697, 1209], '2': [697, 1336], '3': [697, 1477],
  '4': [770, 1209], '5': [770, 1336], '6': [770, 1477],
  '7': [852, 1209], '8': [852, 1336], '9': [852, 1477],
  '*': [941, 1209], '0': [941, 1336], '#': [941, 1477]
};

// Configuration constants
const DEFAULT_TONE_DURATION = 250;  // Duration in milliseconds
const DEFAULT_TONE_AMPLITUDE = 0.5; // Amplitude between 0 and 1
const DTMF_DETECTION_THRESHOLD = 0.8; // Confidence threshold for detection
const SAMPLE_RATE = 48000; // 48kHz sample rate from audio.utils

/**
 * Interface for DTMF tone generation options
 */
interface DTMFOptions {
  duration?: number;   // Tone duration in milliseconds
  amplitude?: number;  // Tone amplitude (0-1)
  sampleRate?: number; // Sample rate in Hz
}

/**
 * Interface for DTMF detection results
 */
interface DTMFDetectionResult {
  digit: string;
  confidence: number;
  timestamp: number;
}

/**
 * Generates a high-quality DTMF tone for a given digit
 * 
 * @param digit - The DTMF digit/symbol to generate ('0'-'9', '*', '#')
 * @param options - Optional configuration for tone generation
 * @returns Promise resolving to audio buffer containing the DTMF tone
 * @throws Error if digit is invalid or generation fails
 */
export async function generateDTMFTone(
  digit: string,
  options: DTMFOptions = {}
): Promise<Buffer> {
  try {
    // Validate digit
    if (!DTMF_FREQUENCIES[digit]) {
      throw new Error(`Invalid DTMF digit: ${digit}`);
    }

    // Merge options with defaults
    const config = {
      duration: options.duration || DEFAULT_TONE_DURATION,
      amplitude: options.amplitude || DEFAULT_TONE_AMPLITUDE,
      sampleRate: options.sampleRate || SAMPLE_RATE
    };

    logger.debug('Generating DTMF tone', {
      digit,
      config,
      component: 'dtmf-utils'
    });

    // Get frequency pair for digit
    const [f1, f2] = DTMF_FREQUENCIES[digit];

    // Generate tone using node-dtmf
    const generator = new dtmf.Generator(config.sampleRate);
    const buffer = generator.generateTone(f1, f2, config.duration, config.amplitude);

    // Validate generated tone
    const isValid = await validateAudioFormat(buffer, { checkQuality: true });
    if (!isValid) {
      throw new Error('Generated tone failed quality validation');
    }

    return buffer;
  } catch (error) {
    logger.error('DTMF tone generation failed', {
      error,
      digit,
      code: ErrorCode.PHONE_TREE_ERROR
    });
    throw error;
  }
}

/**
 * Detects DTMF tones in an audio buffer with noise filtering
 * 
 * @param audioBuffer - Audio buffer to analyze for DTMF tones
 * @returns Promise resolving to array of detected DTMF digits with confidence scores
 * @throws Error if detection fails
 */
export async function detectDTMFTone(audioBuffer: Buffer): Promise<DTMFDetectionResult[]> {
  try {
    // Validate audio format
    await validateAudioFormat(audioBuffer);

    logger.debug('Detecting DTMF tones', {
      bufferSize: audioBuffer.length,
      component: 'dtmf-utils'
    });

    // Initialize detector with noise filtering
    const detector = new dtmf.Detector({
      sampleRate: SAMPLE_RATE,
      threshold: DTMF_DETECTION_THRESHOLD
    });

    // Process audio in chunks for memory efficiency
    const results: DTMFDetectionResult[] = [];
    const chunkSize = 1024;
    
    for (let offset = 0; offset < audioBuffer.length; offset += chunkSize) {
      const chunk = audioBuffer.slice(offset, offset + chunkSize);
      const detected = detector.processChunk(chunk);

      if (detected && detected.confidence >= DTMF_DETECTION_THRESHOLD) {
        results.push({
          digit: detected.digit,
          confidence: detected.confidence,
          timestamp: Date.now()
        });
      }
    }

    logger.debug('DTMF detection complete', {
      detectedCount: results.length,
      component: 'dtmf-utils'
    });

    return results;
  } catch (error) {
    logger.error('DTMF tone detection failed', {
      error,
      code: ErrorCode.PHONE_TREE_ERROR
    });
    throw error;
  }
}

/**
 * Validates a sequence of DTMF tones against an expected pattern
 * 
 * @param sequence - Array of detected DTMF digits
 * @param pattern - Expected pattern string (e.g., "1#*")
 * @returns Boolean indicating if sequence matches pattern
 */
export function validateDTMFSequence(sequence: string[], pattern: string): boolean {
  try {
    logger.debug('Validating DTMF sequence', {
      sequence,
      pattern,
      component: 'dtmf-utils'
    });

    // Validate inputs
    if (!sequence.length || !pattern) {
      return false;
    }

    // Convert sequence to string for comparison
    const sequenceStr = sequence.join('');

    // Check if sequence matches pattern
    const isValid = sequenceStr === pattern;

    logger.debug('DTMF sequence validation result', {
      isValid,
      component: 'dtmf-utils'
    });

    return isValid;
  } catch (error) {
    logger.error('DTMF sequence validation failed', {
      error,
      sequence,
      pattern,
      code: ErrorCode.PHONE_TREE_ERROR
    });
    return false;
  }
}

/**
 * Waits for a specific DTMF tone with timeout
 * 
 * @param expectedTone - The DTMF tone to wait for
 * @param timeoutMs - Timeout in milliseconds
 * @returns Promise resolving to boolean indicating if tone was detected
 */
export async function waitForDTMFTone(
  expectedTone: string,
  timeoutMs: number
): Promise<boolean> {
  try {
    logger.debug('Waiting for DTMF tone', {
      expectedTone,
      timeoutMs,
      component: 'dtmf-utils'
    });

    // Validate expected tone
    if (!DTMF_FREQUENCIES[expectedTone]) {
      throw new Error(`Invalid expected tone: ${expectedTone}`);
    }

    // Initialize detector
    const detector = new dtmf.Detector({
      sampleRate: SAMPLE_RATE,
      threshold: DTMF_DETECTION_THRESHOLD
    });

    return new Promise((resolve) => {
      let detected = false;
      const timeoutId = setTimeout(() => {
        if (!detected) {
          logger.debug('DTMF tone wait timeout', {
            expectedTone,
            component: 'dtmf-utils'
          });
          resolve(false);
        }
      }, timeoutMs);

      detector.on('tone', (tone) => {
        if (tone.digit === expectedTone && tone.confidence >= DTMF_DETECTION_THRESHOLD) {
          detected = true;
          clearTimeout(timeoutId);
          logger.debug('Expected DTMF tone detected', {
            tone,
            component: 'dtmf-utils'
          });
          resolve(true);
        }
      });
    });
  } catch (error) {
    logger.error('DTMF tone wait failed', {
      error,
      expectedTone,
      code: ErrorCode.PHONE_TREE_ERROR
    });
    throw error;
  }
}