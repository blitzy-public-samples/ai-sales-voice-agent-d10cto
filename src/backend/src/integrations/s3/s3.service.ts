import { injectable } from 'inversify';
import { 
  S3Client, 
  PutObjectCommand, 
  GetObjectCommand, 
  DeleteObjectCommand,
  HeadObjectCommand 
} from '@aws-sdk/client-s3'; // v3.0.0
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'; // v3.0.0
import { 
  S3Config, 
  S3StorageOptions, 
  S3UploadResult, 
  AudioMetadata, 
  StorageClass, 
  ServerSideEncryption 
} from './types';
import { s3Config, s3Client } from '../../config/s3.config';
import { ErrorHandler } from '../../lib/error-handler';
import { logger } from '../../lib/logger';
import { ErrorCode, ErrorCategory } from '../../constants/error-codes';

/**
 * Enhanced S3 service implementation for secure call recording storage
 * with comprehensive error handling and audio validation
 */
@injectable()
export class S3Service {
  private readonly errorHandler: ErrorHandler;
  private readonly s3Client: S3Client;
  private readonly bucketName: string;

  constructor(errorHandler: ErrorHandler) {
    this.errorHandler = errorHandler;
    this.s3Client = s3Client;
    this.bucketName = s3Config.bucket;

    // Validate S3 configuration on initialization
    this.validateConfiguration();
  }

  /**
   * Uploads file to S3 with encryption and validation
   * @param fileBuffer - File data buffer
   * @param key - S3 object key
   * @param options - Storage options including encryption settings
   * @returns Upload result with secure URL
   */
  public async uploadFile(
    fileBuffer: Buffer,
    key: string,
    options: S3StorageOptions
  ): Promise<S3UploadResult> {
    try {
      // Validate audio format if content type is audio
      if (options.contentType.startsWith('audio/')) {
        const isValidAudio = await this.validateAudioFormat(fileBuffer, {
          format: options.contentType.includes('wav') ? 'wav' : 'mp3',
          channels: 2,
          sampleRate: 48000,
          bitDepth: 16,
          compression: 'opus',
          duration: 0,
          fileSize: fileBuffer.length
        });

        if (!isValidAudio) {
          throw new Error('Invalid audio format or specifications');
        }
      }

      // Configure upload command with encryption
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: fileBuffer,
        ContentType: options.contentType,
        Metadata: options.metadata,
        ServerSideEncryption: options.serverSideEncryption || ServerSideEncryption.KMS,
        SSEKMSKeyId: s3Config.kmsKeyId,
        StorageClass: options.storageClass || StorageClass.STANDARD,
        Tagging: this.formatTags(options.tagging)
      });

      // Execute upload with circuit breaker protection
      await this.errorHandler.withCircuitBreaker(
        async () => await this.s3Client.send(command),
        'S3'
      );

      // Generate secure signed URL
      const signedUrl = await this.getSignedUrl(key, 3600); // 1 hour expiration

      // Log successful upload
      logger.info('File uploaded successfully to S3', {
        key,
        bucket: this.bucketName,
        contentType: options.contentType,
        size: fileBuffer.length,
        encryption: options.serverSideEncryption
      });

      return {
        url: signedUrl,
        key,
        bucket: this.bucketName,
        metadata: options.metadata,
        serverSideEncryption: options.serverSideEncryption
      };

    } catch (error) {
      logger.error('Failed to upload file to S3', {
        error,
        key,
        bucket: this.bucketName
      });
      throw this.errorHandler.handleError(error as Error, {
        component: 'S3Service',
        operation: 'uploadFile',
        metadata: { key, bucket: this.bucketName }
      });
    }
  }

  /**
   * Validates audio file format and specifications
   * @param audioBuffer - Audio file buffer
   * @param metadata - Expected audio metadata
   * @returns boolean indicating if audio is valid
   */
  private async validateAudioFormat(
    audioBuffer: Buffer,
    metadata: AudioMetadata
  ): Promise<boolean> {
    try {
      // Validate file size
      if (audioBuffer.length === 0) {
        return false;
      }

      // Validate WAV/MP3 header
      const header = audioBuffer.slice(0, 12);
      const isWav = header.toString().includes('WAVE');
      const isMp3 = header.slice(0, 2).toString() === 'ID3';

      if (!isWav && !isMp3) {
        return false;
      }

      // Additional format-specific validation could be added here
      // For production, consider using audio processing libraries
      // to validate sample rate, bit depth, and channels

      return true;
    } catch (error) {
      logger.error('Audio validation failed', { error, metadata });
      return false;
    }
  }

  /**
   * Generates secure pre-signed URL for S3 object
   * @param key - S3 object key
   * @param expiresIn - URL expiration in seconds
   * @returns Secure pre-signed URL
   */
  public async getSignedUrl(key: string, expiresIn: number): Promise<string> {
    try {
      // Verify object exists
      const headCommand = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: key
      });

      await this.errorHandler.withCircuitBreaker(
        async () => await this.s3Client.send(headCommand),
        'S3'
      );

      // Generate signed URL
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key
      });

      return await getSignedUrl(this.s3Client, command, { expiresIn });

    } catch (error) {
      logger.error('Failed to generate signed URL', {
        error,
        key,
        bucket: this.bucketName
      });
      throw this.errorHandler.handleError(error as Error, {
        component: 'S3Service',
        operation: 'getSignedUrl',
        metadata: { key, bucket: this.bucketName }
      });
    }
  }

  /**
   * Securely deletes file from S3
   * @param key - S3 object key
   */
  public async deleteFile(key: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key
      });

      await this.errorHandler.withCircuitBreaker(
        async () => await this.s3Client.send(command),
        'S3'
      );

      logger.info('File deleted successfully from S3', {
        key,
        bucket: this.bucketName
      });

    } catch (error) {
      logger.error('Failed to delete file from S3', {
        error,
        key,
        bucket: this.bucketName
      });
      throw this.errorHandler.handleError(error as Error, {
        component: 'S3Service',
        operation: 'deleteFile',
        metadata: { key, bucket: this.bucketName }
      });
    }
  }

  /**
   * Validates S3 configuration
   * @throws Error if configuration is invalid
   */
  private validateConfiguration(): void {
    if (!this.bucketName) {
      throw new Error('S3 bucket name not configured');
    }

    if (!s3Config.region) {
      throw new Error('AWS region not configured');
    }

    if (!s3Config.kmsKeyId && s3Config.serverSideEncryption === ServerSideEncryption.KMS) {
      throw new Error('KMS key ID required for KMS encryption');
    }
  }

  /**
   * Formats tag key-value pairs for S3
   * @param tags - Tag key-value pairs
   * @returns Formatted tag string
   */
  private formatTags(tags: Record<string, string>): string {
    return Object.entries(tags)
      .map(([key, value]) => `${key}=${value}`)
      .join('&');
  }
}