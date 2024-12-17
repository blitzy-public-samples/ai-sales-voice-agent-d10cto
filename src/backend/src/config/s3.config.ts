import { S3Client } from '@aws-sdk/client-s3';
import { config } from 'dotenv';
import { S3Config, ServerSideEncryption, StorageClass } from '../integrations/s3/types';

// Load environment variables
config();

/**
 * Supported AWS regions for S3 operations
 */
const SUPPORTED_AWS_REGIONS = [
  'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
  'eu-west-1', 'eu-west-2', 'eu-central-1',
  'ap-northeast-1', 'ap-southeast-1', 'ap-southeast-2'
];

/**
 * Validates AWS region format and availability
 * @param region AWS region identifier
 * @returns boolean indicating if region is valid
 */
const isValidRegion = (region: string): boolean => {
  return SUPPORTED_AWS_REGIONS.includes(region);
};

/**
 * Validates S3 bucket name according to AWS naming rules
 * @param bucketName Name of the S3 bucket
 * @returns boolean indicating if bucket name is valid
 */
const isValidBucketName = (bucketName: string): boolean => {
  const bucketNameRegex = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;
  return bucketNameRegex.test(bucketName);
};

/**
 * Validates AWS credentials format and presence
 * @param accessKeyId AWS access key ID
 * @param secretAccessKey AWS secret access key
 * @returns boolean indicating if credentials are valid
 */
const hasValidCredentials = (accessKeyId: string, secretAccessKey: string): boolean => {
  const accessKeyRegex = /^[A-Z0-9]{20}$/;
  const secretKeyRegex = /^[A-Za-z0-9/+=]{40}$/;
  return accessKeyRegex.test(accessKeyId) && secretKeyRegex.test(secretAccessKey);
};

/**
 * Validates complete S3 configuration
 * @throws Error if configuration is invalid
 */
const validateS3Config = (): void => {
  // Check required environment variables
  const requiredVars = [
    'AWS_REGION',
    'AWS_BUCKET_NAME',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY'
  ];

  const missingVars = requiredVars.filter(varName => !process.env[varName]);
  if (missingVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
  }

  // Validate region
  if (!isValidRegion(process.env.AWS_REGION!)) {
    throw new Error(`Invalid AWS region: ${process.env.AWS_REGION}`);
  }

  // Validate bucket name
  if (!isValidBucketName(process.env.AWS_BUCKET_NAME!)) {
    throw new Error(`Invalid S3 bucket name: ${process.env.AWS_BUCKET_NAME}`);
  }

  // Validate credentials
  if (!hasValidCredentials(process.env.AWS_ACCESS_KEY_ID!, process.env.AWS_SECRET_ACCESS_KEY!)) {
    throw new Error('Invalid AWS credentials format');
  }
};

/**
 * S3 configuration object with security settings
 */
export const s3Config: S3Config = {
  region: process.env.AWS_REGION!,
  bucket: process.env.AWS_BUCKET_NAME!,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  kmsKeyId: process.env.AWS_KMS_KEY_ID,
  serverSideEncryption: ServerSideEncryption.KMS,
  storageClass: StorageClass.STANDARD
};

/**
 * Creates and configures S3 client with security settings
 */
const createS3Client = (): S3Client => {
  // Validate configuration before creating client
  validateS3Config();

  // Create client with validated configuration
  return new S3Client({
    region: s3Config.region,
    credentials: {
      accessKeyId: s3Config.accessKeyId,
      secretAccessKey: s3Config.secretAccessKey
    },
    // Enable server-side encryption by default
    serverSideEncryption: s3Config.serverSideEncryption,
    // Use KMS key if provided
    ...(s3Config.kmsKeyId && { sseKmsKeyId: s3Config.kmsKeyId })
  });
};

/**
 * Configured S3 client instance with encryption and storage settings
 */
export const s3Client = createS3Client();

/**
 * Default storage options for call recordings
 */
export const defaultStorageOptions = {
  serverSideEncryption: ServerSideEncryption.KMS,
  storageClass: StorageClass.STANDARD,
  metadata: {
    'x-amz-meta-content-type': 'audio/wav',
    'x-amz-meta-encryption': 'AES-256',
    'x-amz-meta-service': 'docshield-voice-agent'
  },
  tagging: {
    service: 'docshield',
    environment: process.env.NODE_ENV || 'development',
    dataType: 'call-recording'
  }
};