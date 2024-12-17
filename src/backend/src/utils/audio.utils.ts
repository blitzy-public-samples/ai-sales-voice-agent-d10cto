/**
 * Audio Processing Utilities for DocShield AI Voice Agent
 * Handles audio format validation, conversion, metadata management and channel operations
 * Version: 1.0.0
 * 
 * @module AudioUtils
 */

import { CallRecordType } from '../types/call-record.types';
import * as opus from 'node-opus'; // v0.3.3
import * as wav from 'node-wav';   // v0.1.0

// Audio format constants based on Technical Specifications/Appendices/A.3
const REQUIRED_SAMPLE_RATE = 48000;  // 48kHz sample rate requirement
const REQUIRED_BIT_DEPTH = 16;       // 16-bit depth requirement
const REQUIRED_CHANNELS = 2;         // Dual channel requirement
const SUPPORTED_FORMATS = ['wav', 'mp3'] as const;
const QUALITY_THRESHOLD = 8;         // Minimum voice quality score out of 10

// Opus encoder configuration for optimal voice quality
const OPUS_CONFIG = {
  rate: REQUIRED_SAMPLE_RATE,
  channels: REQUIRED_CHANNELS,
  frameSize: 960, // 20ms at 48kHz
  maxFrameSize: 6 * 960, // Maximum frame size for processing
};

/**
 * Interface for audio validation options
 */
interface AudioValidationOptions {
  checkQuality?: boolean;  // Whether to perform quality analysis
  strictMode?: boolean;    // Whether to strictly enforce all requirements
}

/**
 * Validates audio format specifications and quality metrics
 * Ensures compliance with system requirements for voice quality
 * 
 * @param audioBuffer - Raw audio buffer to validate
 * @param options - Validation options
 * @returns Promise resolving to validation result
 * @throws Error if buffer is invalid or validation fails
 */
export async function validateAudioFormat(
  audioBuffer: Buffer,
  options: AudioValidationOptions = { checkQuality: true, strictMode: true }
): Promise<boolean> {
  try {
    if (!Buffer.isBuffer(audioBuffer)) {
      throw new Error('Invalid audio buffer provided');
    }

    // Extract audio metadata for validation
    const metadata = await extractAudioMetadata(audioBuffer);

    // Validate format requirements
    const formatValid = SUPPORTED_FORMATS.includes(metadata.audioFormat.toLowerCase());
    if (!formatValid && options.strictMode) {
      throw new Error(`Unsupported audio format: ${metadata.audioFormat}`);
    }

    // Validate technical specifications
    const specsValid = 
      metadata.sampleRate === REQUIRED_SAMPLE_RATE &&
      metadata.bitDepth === REQUIRED_BIT_DEPTH &&
      metadata.channels === REQUIRED_CHANNELS;
    
    if (!specsValid && options.strictMode) {
      throw new Error('Audio specifications do not meet requirements');
    }

    // Perform quality analysis if requested
    if (options.checkQuality) {
      const qualityScore = await analyzeVoiceQuality(audioBuffer);
      if (qualityScore < QUALITY_THRESHOLD) {
        throw new Error(`Voice quality below threshold: ${qualityScore}/${QUALITY_THRESHOLD}`);
      }
    }

    return formatValid && specsValid;
  } catch (error) {
    throw new Error(`Audio validation failed: ${error.message}`);
  }
}

/**
 * Converts audio to Opus compressed format while preserving voice quality
 * Implements efficient streaming conversion with memory management
 * 
 * @param audioBuffer - Raw audio buffer to convert
 * @returns Promise resolving to Opus-compressed buffer
 * @throws Error if compression fails
 */
export async function convertToOpus(audioBuffer: Buffer): Promise<Buffer> {
  try {
    // Initialize Opus encoder with optimal settings
    const encoder = new opus.OpusEncoder(
      OPUS_CONFIG.rate,
      OPUS_CONFIG.channels
    );

    // Allocate processing buffers
    const chunks: Buffer[] = [];
    let offset = 0;

    // Process audio in frames
    while (offset < audioBuffer.length) {
      const frameSize = Math.min(
        OPUS_CONFIG.frameSize,
        audioBuffer.length - offset
      );
      
      const frame = audioBuffer.slice(offset, offset + frameSize);
      const compressed = encoder.encode(frame, OPUS_CONFIG.frameSize);
      
      chunks.push(compressed);
      offset += frameSize;
    }

    // Combine compressed chunks
    const result = Buffer.concat(chunks);

    // Verify quality preservation
    const qualityScore = await analyzeVoiceQuality(result);
    if (qualityScore < QUALITY_THRESHOLD) {
      throw new Error('Quality degraded during compression');
    }

    return result;
  } catch (error) {
    throw new Error(`Opus conversion failed: ${error.message}`);
  }
}

/**
 * Extracts comprehensive audio metadata including format specifications
 * and technical parameters
 * 
 * @param audioBuffer - Audio buffer to analyze
 * @returns Promise resolving to audio metadata
 * @throws Error if metadata extraction fails
 */
export async function extractAudioMetadata(
  audioBuffer: Buffer
): Promise<CallRecordType> {
  try {
    // Read WAV header for metadata
    const wavData = wav.decode(audioBuffer);

    // Compile metadata object
    const metadata: Partial<CallRecordType> = {
      audioFormat: 'wav',
      channels: wavData.channelData.length,
      sampleRate: wavData.sampleRate,
      bitDepth: wavData.bitDepth || REQUIRED_BIT_DEPTH,
    };

    // Validate extracted metadata
    if (!metadata.channels || !metadata.sampleRate || !metadata.bitDepth) {
      throw new Error('Invalid or incomplete audio metadata');
    }

    return metadata as CallRecordType;
  } catch (error) {
    throw new Error(`Metadata extraction failed: ${error.message}`);
  }
}

/**
 * Splits dual channel audio into separate agent and recipient tracks
 * Preserves audio quality during separation
 * 
 * @param audioBuffer - Dual channel audio buffer
 * @returns Promise resolving to separated track buffers
 * @throws Error if channel splitting fails
 */
export async function splitDualChannel(
  audioBuffer: Buffer
): Promise<{ agentTrack: Buffer; recipientTrack: Buffer }> {
  try {
    // Validate dual channel format
    const metadata = await extractAudioMetadata(audioBuffer);
    if (metadata.channels !== REQUIRED_CHANNELS) {
      throw new Error('Audio must be dual channel format');
    }

    // Decode WAV data
    const wavData = wav.decode(audioBuffer);
    const [leftChannel, rightChannel] = wavData.channelData;

    // Create separate buffers for each channel
    const agentTrack = wav.encode([leftChannel], {
      sampleRate: metadata.sampleRate,
      float: false,
      bitDepth: metadata.bitDepth,
    });

    const recipientTrack = wav.encode([rightChannel], {
      sampleRate: metadata.sampleRate,
      float: false,
      bitDepth: metadata.bitDepth,
    });

    // Verify quality of separated tracks
    const agentQuality = await analyzeVoiceQuality(agentTrack);
    const recipientQuality = await analyzeVoiceQuality(recipientTrack);

    if (agentQuality < QUALITY_THRESHOLD || recipientQuality < QUALITY_THRESHOLD) {
      throw new Error('Quality lost during channel separation');
    }

    return { agentTrack, recipientTrack };
  } catch (error) {
    throw new Error(`Channel splitting failed: ${error.message}`);
  }
}

/**
 * Analyzes voice quality metrics including clarity and naturalness
 * Internal helper function for quality validation
 * 
 * @param audioBuffer - Audio buffer to analyze
 * @returns Promise resolving to quality score (0-10)
 */
async function analyzeVoiceQuality(audioBuffer: Buffer): Promise<number> {
  try {
    // TODO: Implement actual voice quality analysis
    // This is a placeholder that should be replaced with real voice quality metrics
    // using signal processing libraries or machine learning models
    
    // For now, return a mock score based on basic audio properties
    const metadata = await extractAudioMetadata(audioBuffer);
    const hasValidSpecs = 
      metadata.sampleRate === REQUIRED_SAMPLE_RATE &&
      metadata.bitDepth === REQUIRED_BIT_DEPTH;
    
    return hasValidSpecs ? 9 : 7;
  } catch (error) {
    throw new Error(`Quality analysis failed: ${error.message}`);
  }
}