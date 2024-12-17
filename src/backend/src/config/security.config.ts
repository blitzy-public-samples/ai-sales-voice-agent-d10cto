/**
 * @file Security configuration module for DocShield AI Voice Agent
 * @version 1.0.0
 * @description Implements encryption, authentication, and security policies
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { config } from 'dotenv';
import { ErrorCode } from '../constants/error-codes';

// Load environment variables
config();

/**
 * Encryption configuration interface
 */
interface EncryptionConfig {
    algorithm: string;
    keyLength: number;
    ivLength: number;
    authTagLength: number;
    keyRotationSchedule: number;
}

/**
 * Security settings interface
 */
interface SecuritySettings {
    encryption: EncryptionConfig;
    tlsVersion: string;
    tokenRotationDays: number;
    rateLimits: Record<string, number>;
    auditLogging: boolean;
    circuitBreaker: {
        failureThreshold: number;
        resetTimeoutMs: number;
    };
}

// Security constants
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const TOKEN_ROTATION_DAYS = 90;
const TLS_MIN_VERSION = '1.3';
const RATE_LIMIT_WINDOW_MS = 60000;
const MAX_REQUESTS_PER_WINDOW = 100;

// Current encryption key and initialization vector
let currentEncryptionKey: Buffer;
let lastKeyRotation: Date;

/**
 * Initialize encryption system with secure key generation and rotation
 */
export async function initializeEncryption(): Promise<void> {
    try {
        // Generate or load encryption key
        const salt = process.env.ENCRYPTION_SALT || randomBytes(16).toString('hex');
        currentEncryptionKey = scryptSync(
            process.env.ENCRYPTION_KEY || '',
            salt,
            KEY_LENGTH
        );

        // Set initial key rotation timestamp
        lastKeyRotation = new Date();

        // Schedule key rotation
        setInterval(rotateEncryptionKey, TOKEN_ROTATION_DAYS * 24 * 60 * 60 * 1000);
    } catch (error) {
        throw new Error(`Encryption initialization failed: ${error.message}`);
    }
}

/**
 * Validate security configuration meets minimum requirements
 */
export async function validateSecurityConfig(): Promise<boolean> {
    try {
        // Check encryption key presence and strength
        if (!process.env.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY.length < 32) {
            throw new Error('Invalid encryption key configuration');
        }

        // Validate TLS version
        if (process.env.TLS_VERSION && process.env.TLS_VERSION < TLS_MIN_VERSION) {
            throw new Error('TLS version below minimum requirement');
        }

        // Verify rate limiting configuration
        if (!process.env.RATE_LIMIT_ENABLED) {
            throw new Error('Rate limiting must be enabled');
        }

        return true;
    } catch (error) {
        throw new Error(`Security validation failed: ${error.message}`);
    }
}

/**
 * Encrypt sensitive data using AES-256-GCM
 * @param data - Data to encrypt
 * @returns Encrypted data buffer with authentication tag
 */
export function encryptSensitiveData(data: Buffer | string): Buffer {
    try {
        // Generate initialization vector
        const iv = randomBytes(IV_LENGTH);

        // Create cipher
        const cipher = createCipheriv(
            ENCRYPTION_ALGORITHM,
            currentEncryptionKey,
            iv
        );

        // Convert input to buffer if string
        const inputBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data);

        // Encrypt data
        const encrypted = Buffer.concat([
            cipher.update(inputBuffer),
            cipher.final()
        ]);

        // Get authentication tag
        const authTag = cipher.getAuthTag();

        // Combine IV, encrypted data, and auth tag
        return Buffer.concat([iv, encrypted, authTag]);
    } catch (error) {
        throw new Error(`Encryption failed: ${error.message}`);
    }
}

/**
 * Decrypt sensitive data with authentication verification
 * @param encryptedData - Encrypted data buffer
 * @returns Decrypted data buffer
 */
export function decryptSensitiveData(encryptedData: Buffer): Buffer {
    try {
        // Extract IV, encrypted data, and auth tag
        const iv = encryptedData.subarray(0, IV_LENGTH);
        const authTag = encryptedData.subarray(encryptedData.length - AUTH_TAG_LENGTH);
        const encrypted = encryptedData.subarray(
            IV_LENGTH,
            encryptedData.length - AUTH_TAG_LENGTH
        );

        // Create decipher
        const decipher = createDecipheriv(
            ENCRYPTION_ALGORITHM,
            currentEncryptionKey,
            iv
        );

        // Set auth tag for verification
        decipher.setAuthTag(authTag);

        // Decrypt data
        return Buffer.concat([decipher.update(encrypted), decipher.final()]);
    } catch (error) {
        throw new Error(`Decryption failed: ${error.message}`);
    }
}

/**
 * Rotate encryption key securely
 */
export async function rotateEncryptionKey(): Promise<void> {
    try {
        // Generate new key
        const newKey = randomBytes(KEY_LENGTH);

        // Backup current key
        const backupKey = currentEncryptionKey;

        // Update current key
        currentEncryptionKey = newKey;
        lastKeyRotation = new Date();

        // Log key rotation (audit)
        console.info('Encryption key rotated successfully');
    } catch (error) {
        throw new Error(`Key rotation failed: ${error.message}`);
    }
}

/**
 * Security configuration object
 */
export const securityConfig: SecuritySettings = {
    encryption: {
        algorithm: ENCRYPTION_ALGORITHM,
        keyLength: KEY_LENGTH,
        ivLength: IV_LENGTH,
        authTagLength: AUTH_TAG_LENGTH,
        keyRotationSchedule: TOKEN_ROTATION_DAYS
    },
    tlsVersion: TLS_MIN_VERSION,
    tokenRotationDays: TOKEN_ROTATION_DAYS,
    rateLimits: {
        windowMs: RATE_LIMIT_WINDOW_MS,
        maxRequests: MAX_REQUESTS_PER_WINDOW
    },
    auditLogging: true,
    circuitBreaker: {
        failureThreshold: 5,
        resetTimeoutMs: 30000
    }
};

// Export default configuration
export default securityConfig;