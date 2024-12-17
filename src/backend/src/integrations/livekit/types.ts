// External imports from livekit-server-sdk v1.2.0
import { Room, RoomEvent } from 'livekit-server-sdk';

/**
 * Enum representing possible states of a LiveKit voice call
 * Used for tracking call lifecycle from initialization to completion
 */
export enum LiveKitCallState {
  INITIALIZING = 'INITIALIZING', // Initial setup of call resources
  DIALING = 'DIALING',          // Actively attempting connection
  SPEAKING = 'SPEAKING',        // Active voice conversation
  ENDED = 'ENDED',             // Call completed normally
  FAILED = 'FAILED'            // Call terminated due to error
}

/**
 * Interface defining audio configuration parameters for LiveKit calls
 * Based on requirements from Technical Specifications/Appendices/A.3
 */
export interface LiveKitAudioConfig {
  format: string;      // Audio format (WAV/MP3)
  channels: number;    // Number of audio channels (Dual for Agent/Recipient)
  sampleRate: number;  // Sample rate in Hz
  bitDepth: number;    // Bit depth for audio quality
  compression: string; // Audio compression codec
}

/**
 * Interface for tracking call quality metrics
 * Used to ensure voice quality score meets >8/10 requirement
 */
export interface LiveKitCallMetrics {
  latency: number;          // Round-trip time in milliseconds
  packetLoss: number;       // Packet loss ratio (0-1)
  audioQualityScore: number; // Voice quality score (0-10)
  jitter: number;           // Jitter in milliseconds
  bitrate: number;          // Audio bitrate in kbps
  timestamp: Date;          // Metric collection timestamp
}

/**
 * Enum for LiveKit call events
 * Used for tracking significant call lifecycle events
 */
export enum LiveKitCallEventType {
  ROOM_CONNECTED = 'ROOM_CONNECTED',
  PARTICIPANT_JOINED = 'PARTICIPANT_JOINED',
  PARTICIPANT_LEFT = 'PARTICIPANT_LEFT',
  AUDIO_STREAM_STARTED = 'AUDIO_STREAM_STARTED',
  AUDIO_STREAM_ENDED = 'AUDIO_STREAM_ENDED',
  ERROR = 'ERROR'
}

/**
 * Interface for LiveKit call event data
 * Provides structured format for event handling
 */
export interface LiveKitCallEvent {
  type: LiveKitCallEventType;
  timestamp: Date;
  data: Record<string, any>;
}

/**
 * Default audio configuration values
 * Based on Technical Specifications/Appendices/A.3
 */
export const LIVEKIT_AUDIO_DEFAULTS: LiveKitAudioConfig = {
  format: 'WAV',
  channels: 2,
  sampleRate: 48000,
  bitDepth: 16,
  compression: 'Opus'
} as const;

/**
 * Quality threshold constants for voice calls
 * Ensures meeting of voice quality score >8/10 requirement
 */
export const LIVEKIT_QUALITY_THRESHOLDS = {
  MAX_LATENCY_MS: 1500,        // Maximum acceptable latency
  OPTIMAL_LATENCY_MS: 1000,    // Target latency for optimal quality
  MAX_PACKET_LOSS: 0.05,       // Maximum acceptable packet loss (5%)
  OPTIMAL_PACKET_LOSS: 0.01,   // Target packet loss for optimal quality (1%)
  MIN_QUALITY_SCORE: 8.0,      // Minimum acceptable quality score
  TARGET_QUALITY_SCORE: 9.0    // Target quality score for optimal experience
} as const;

/**
 * Re-export LiveKit SDK types for convenience
 */
export type { Room, RoomEvent };