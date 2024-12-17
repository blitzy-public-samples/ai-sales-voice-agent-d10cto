// @ts-nocheck
import { Types } from 'mongoose'; // v7.0.0

/**
 * Enum defining possible outcomes of sales calls based on state machine transitions
 * Maps to the voice agent state machine terminal states
 */
export enum CallOutcome {
  MEETING_SCHEDULED = 'MEETING_SCHEDULED', // Successfully scheduled a meeting
  DECLINED = 'DECLINED',                   // Prospect declined to schedule
  VOICEMAIL = 'VOICEMAIL',                // Left voicemail message
  NO_ANSWER = 'NO_ANSWER',                // Call was not answered
  FAILED = 'FAILED'                       // Technical or other failure
}

/**
 * Interface defining complete structure of a call record including metadata and audio specifications
 * Implements requirements from Technical Specifications/Appendices/A.3 Call Recording Format
 */
export interface CallRecordType {
  // Reference Fields
  campaignId: Types.ObjectId;           // Reference to parent campaign
  transcriptUrl: string;                // S3 URL to call transcript
  recordingUrl: string;                 // S3 URL to audio recording

  // Call Metadata
  callTime: Date;                       // When call was initiated
  duration: number;                     // Call duration in seconds
  outcome: CallOutcome;                 // Final call outcome
  declineReason: string | null;         // Reason if declined (optional)

  // Audio Specifications
  audioFormat: string;                  // WAV/MP3 format
  channels: number;                     // Dual channel (2) for agent/recipient
  sampleRate: number;                   // 48kHz sample rate
  bitDepth: number;                     // 16-bit depth
}

/**
 * Interface for creating new call records with required initial fields
 * Used when initializing a new call record before audio processing
 */
export interface CallRecordCreateInput {
  // Required fields for initial creation
  campaignId: Types.ObjectId;           // Reference to parent campaign
  callTime: Date;                       // When call was initiated
  duration: number;                     // Call duration in seconds
  outcome: CallOutcome;                 // Final call outcome
  declineReason: string | null;         // Reason if declined (optional)
}