import { S3ClientConfig } from '@aws-sdk/client-s3';

/**
 * Configuration interface for AWS S3 service
 * @version 3.0.0
 */
export interface S3Config extends Partial<S3ClientConfig> {
  /** AWS region for S3 bucket */
  region: string;
  /** S3 bucket name for storing recordings */
  bucket: string;
  /** AWS access key ID */
  accessKeyId: string;
  /** AWS secret access key */
  secretAccessKey: string;
  /** Optional KMS key ID for enhanced encryption */
  kmsKeyId?: string;
  /** Optional custom endpoint for S3 compatibility */
  endpoint?: string;
}

/**
 * Storage options for S3 operations
 */
export interface S3StorageOptions {
  /** MIME type of the content being stored */
  contentType: string;
  /** Custom metadata key-value pairs */
  metadata: Record<string, string>;
  /** Server-side encryption method */
  serverSideEncryption: ServerSideEncryption;
  /** S3 storage class for cost optimization */
  storageClass: StorageClass;
  /** Optional KMS key ID for KMS encryption */
  kmsKeyId?: string;
  /** Custom tags for object organization */
  tagging: Record<string, string>;
}

/**
 * Result interface for S3 upload operations
 */
export interface S3UploadResult {
  /** Complete URL to access the uploaded object */
  url: string;
  /** S3 object key */
  key: string;
  /** Destination bucket name */
  bucket: string;
  /** Object metadata */
  metadata: Record<string, string>;
  /** Optional version ID for versioned buckets */
  versionId?: string;
  /** Applied server-side encryption method */
  serverSideEncryption: ServerSideEncryption;
}

/**
 * Comprehensive metadata for audio recordings
 */
export interface AudioMetadata {
  /** Audio file format (WAV/MP3) */
  format: AudioFormat;
  /** Number of audio channels (1=mono, 2=stereo) */
  channels: number;
  /** Sample rate in Hz (e.g., 48000) */
  sampleRate: number;
  /** Bit depth (e.g., 16) */
  bitDepth: number;
  /** Compression algorithm used */
  compression: AudioCompression;
  /** Duration in seconds */
  duration: number;
  /** File size in bytes */
  fileSize: number;
}

/**
 * S3 storage class options for cost optimization
 */
export enum StorageClass {
  /** Standard storage for frequently accessed data */
  STANDARD = 'STANDARD',
  /** Cost-optimized storage with automatic tiering */
  INTELLIGENT_TIERING = 'INTELLIGENT_TIERING',
  /** Long-term archival storage */
  GLACIER = 'GLACIER'
}

/**
 * Server-side encryption options for S3 objects
 */
export enum ServerSideEncryption {
  /** AES-256 encryption managed by S3 */
  AES256 = 'AES256',
  /** AWS KMS managed encryption */
  KMS = 'aws:kms'
}

/**
 * Supported audio file formats
 */
export enum AudioFormat {
  /** Waveform Audio File Format */
  WAV = 'wav',
  /** MPEG Layer 3 Audio */
  MP3 = 'mp3'
}

/**
 * Audio compression options
 */
export enum AudioCompression {
  /** Opus compression codec */
  OPUS = 'opus',
  /** No compression */
  NONE = 'none'
}