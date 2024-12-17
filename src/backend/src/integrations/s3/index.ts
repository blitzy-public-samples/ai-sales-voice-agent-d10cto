/**
 * @file Entry point for AWS S3 integration module providing secure, encrypted storage
 * for call recordings and transcripts with comprehensive monitoring and error handling
 * @version 1.0.0
 */

import { S3Service } from './s3.service';
import {
  S3Config,
  S3StorageOptions,
  S3UploadResult,
  AudioMetadata,
  StorageClass,
  ServerSideEncryption,
  AudioFormat,
  AudioCompression
} from './types';

// Re-export core service and types
export {
  // Main service class
  S3Service,
  
  // Configuration interfaces
  S3Config,
  S3StorageOptions,
  S3UploadResult,
  
  // Audio-specific types
  AudioMetadata,
  AudioFormat,
  AudioCompression,
  
  // Storage configuration enums
  StorageClass,
  ServerSideEncryption
};

// Default audio format specifications based on technical requirements
export const DEFAULT_AUDIO_METADATA: AudioMetadata = {
  format: AudioFormat.WAV,
  channels: 2, // Dual channel for agent/recipient
  sampleRate: 48000, // 48kHz as specified
  bitDepth: 16, // 16-bit as specified
  compression: AudioCompression.OPUS, // Opus compression as specified
  duration: 0, // Will be set during upload
  fileSize: 0 // Will be set during upload
};

// Default storage options with security settings
export const DEFAULT_STORAGE_OPTIONS: Partial<S3StorageOptions> = {
  serverSideEncryption: ServerSideEncryption.KMS, // KMS encryption for enhanced security
  storageClass: StorageClass.STANDARD, // Standard storage for frequent access
  metadata: {
    'x-amz-meta-service': 'docshield-voice-agent',
    'x-amz-meta-content-type': 'audio/wav',
    'x-amz-meta-encryption': 'aws:kms',
    'x-amz-meta-channels': '2',
    'x-amz-meta-sample-rate': '48000',
    'x-amz-meta-bit-depth': '16',
    'x-amz-meta-compression': 'opus'
  },
  tagging: {
    service: 'docshield',
    environment: process.env.NODE_ENV || 'development',
    dataType: 'call-recording',
    securityLevel: 'sensitive'
  }
};

// Validation functions for audio specifications
export const validateAudioSpecs = (metadata: AudioMetadata): boolean => {
  return (
    metadata.channels === DEFAULT_AUDIO_METADATA.channels &&
    metadata.sampleRate === DEFAULT_AUDIO_METADATA.sampleRate &&
    metadata.bitDepth === DEFAULT_AUDIO_METADATA.bitDepth &&
    metadata.compression === DEFAULT_AUDIO_METADATA.compression
  );
};

// Security configuration validation
export const validateSecurityConfig = (config: S3Config): boolean => {
  return (
    !!config.region &&
    !!config.bucket &&
    !!config.kmsKeyId && // KMS key is required for enhanced security
    !!config.accessKeyId &&
    !!config.secretAccessKey
  );
};

// Utility function to generate secure file keys
export const generateSecureFileKey = (
  campaignId: string,
  contactId: string,
  timestamp: number = Date.now()
): string => {
  return `recordings/${campaignId}/${contactId}/${timestamp}.wav`;
};

// Error messages for S3 operations
export const S3ErrorMessages = {
  INVALID_CONFIG: 'Invalid S3 configuration provided',
  INVALID_AUDIO_FORMAT: 'Audio format does not meet required specifications',
  UPLOAD_FAILED: 'Failed to upload file to S3',
  DOWNLOAD_FAILED: 'Failed to download file from S3',
  DELETE_FAILED: 'Failed to delete file from S3',
  ENCRYPTION_REQUIRED: 'Server-side encryption is required for all uploads',
  KMS_REQUIRED: 'KMS encryption is required for sensitive data'
} as const;

// Type definitions for error handling
export type S3ErrorType = keyof typeof S3ErrorMessages;
export type S3ErrorMessage = typeof S3ErrorMessages[S3ErrorType];

/**
 * Create a preconfigured S3Service instance with default settings
 * @param config Partial S3 configuration to override defaults
 * @returns Configured S3Service instance
 */
export const createS3Service = (config: Partial<S3Config>): S3Service => {
  if (!validateSecurityConfig(config as S3Config)) {
    throw new Error(S3ErrorMessages.INVALID_CONFIG);
  }
  return new S3Service(config as S3Config);
};