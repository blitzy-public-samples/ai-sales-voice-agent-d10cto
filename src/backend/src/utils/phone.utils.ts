/**
 * @file Phone number utilities for DocShield AI Voice Agent
 * @version 1.0.0
 * @description Utility functions for phone number handling, validation, formatting and DTMF tone generation
 */

import { parsePhoneNumber, isValidPhoneNumber, CountryCode } from 'libphonenumber-js'; // ^1.10.0
import { ErrorCode } from '../constants/error-codes';
import { ContactType } from '../types/contact.types';

/**
 * DTMF frequency pairs for each digit/character (Hz)
 */
const DTMF_FREQUENCIES: Record<string, [number, number]> = {
  '1': [697, 1209], '2': [697, 1336], '3': [697, 1477],
  '4': [770, 1209], '5': [770, 1336], '6': [770, 1477],
  '7': [852, 1209], '8': [852, 1336], '9': [852, 1477],
  '0': [941, 1336], '*': [941, 1209], '#': [941, 1477]
};

// Configuration constants
const DTMF_TONE_DURATION = 250; // milliseconds
const DTMF_PAUSE_DURATION = 100; // milliseconds
const EXTENSION_PAUSE_CHAR = ',';
const MAX_EXTENSION_LENGTH = 6;
const VALID_PHONE_REGIONS: CountryCode[] = ['US', 'CA'];
const SAMPLE_RATE = 44100; // Hz for DTMF generation
const TOLL_FREE_PREFIXES = ['800', '888', '877', '866', '855', '844', '833'];

/**
 * Formats a phone number string into E.164 international format with strict US/Canada validation
 * @param phoneNumber - Raw phone number string to format
 * @returns Formatted E.164 phone number or null if invalid
 * @throws {Error} with ErrorCode.INVALID_PHONE_ERROR if validation fails
 */
export const formatPhoneNumber = (phoneNumber: string): string | null => {
  try {
    // Sanitize input
    const sanitized = phoneNumber.replace(/\D/g, '');
    
    if (!sanitized) {
      throw new Error('Empty phone number provided');
    }

    // Parse and validate
    const parsed = parsePhoneNumber(sanitized, 'US');
    
    if (!parsed || !VALID_PHONE_REGIONS.includes(parsed.country as CountryCode)) {
      return null;
    }

    // Check for toll-free numbers
    if (TOLL_FREE_PREFIXES.some(prefix => parsed.nationalNumber.startsWith(prefix))) {
      return null;
    }

    return parsed.format('E.164');
  } catch (error) {
    throw new Error(`${ErrorCode.INVALID_PHONE_ERROR}: ${error.message}`);
  }
};

/**
 * Validates if a given phone number is a valid US/Canada medical practice number
 * @param phoneNumber - Phone number to validate
 * @returns Boolean indicating validity
 */
export const validatePhoneNumber = (phoneNumber: string): boolean => {
  try {
    const formatted = formatPhoneNumber(phoneNumber);
    if (!formatted) return false;

    const parsed = parsePhoneNumber(formatted);
    
    return (
      parsed.isValid() &&
      VALID_PHONE_REGIONS.includes(parsed.country as CountryCode) &&
      !TOLL_FREE_PREFIXES.some(prefix => parsed.nationalNumber.startsWith(prefix))
    );
  } catch {
    return false;
  }
};

/**
 * Generates DTMF tones for phone tree navigation
 * @param digits - String of digits/characters to convert to DTMF tones
 * @param duration - Duration of each tone in milliseconds (default: DTMF_TONE_DURATION)
 * @returns Buffer containing DTMF tone audio data
 * @throws {Error} with ErrorCode.PHONE_TREE_ERROR if generation fails
 */
export const generateDTMFTones = (
  digits: string,
  duration: number = DTMF_TONE_DURATION
): Buffer => {
  try {
    if (!digits.match(/^[0-9*#]+$/)) {
      throw new Error('Invalid DTMF characters');
    }

    const sampleCount = Math.floor(SAMPLE_RATE * (duration / 1000));
    const totalSamples = sampleCount * digits.length + 
      Math.floor(SAMPLE_RATE * (DTMF_PAUSE_DURATION / 1000)) * (digits.length - 1);
    
    const audioData = new Float32Array(totalSamples);
    
    digits.split('').forEach((digit, index) => {
      const [f1, f2] = DTMF_FREQUENCIES[digit];
      const offset = index * (sampleCount + Math.floor(SAMPLE_RATE * (DTMF_PAUSE_DURATION / 1000)));
      
      for (let i = 0; i < sampleCount; i++) {
        const t = i / SAMPLE_RATE;
        audioData[offset + i] = 
          0.5 * Math.sin(2 * Math.PI * f1 * t) +
          0.5 * Math.sin(2 * Math.PI * f2 * t);
      }
    });

    // Convert to 16-bit PCM
    const buffer = Buffer.alloc(audioData.length * 2);
    for (let i = 0; i < audioData.length; i++) {
      buffer.writeInt16LE(Math.floor(audioData[i] * 32767), i * 2);
    }

    return buffer;
  } catch (error) {
    throw new Error(`${ErrorCode.PHONE_TREE_ERROR}: ${error.message}`);
  }
};

/**
 * Formats an extension number for consistent storage with validation
 * @param extension - Extension number to format
 * @returns Formatted extension or null if invalid
 * @throws {Error} with ErrorCode.INVALID_EXTENSION_ERROR if validation fails
 */
export const formatExtension = (extension: string): string | null => {
  try {
    if (!extension) return null;

    const sanitized = extension.replace(/\D/g, '');
    
    if (sanitized.length === 0 || sanitized.length > MAX_EXTENSION_LENGTH) {
      return null;
    }

    // Pad with zeros for consistent length
    return sanitized.padStart(MAX_EXTENSION_LENGTH, '0');
  } catch (error) {
    throw new Error(`${ErrorCode.INVALID_EXTENSION_ERROR}: ${error.message}`);
  }
};

/**
 * Combines a phone number and extension into a single dialable string
 * @param phoneNumber - Base phone number
 * @param extension - Extension number
 * @returns Combined phone number with extension
 * @throws {Error} if either phone number or extension is invalid
 */
export const combinePhoneAndExtension = (
  phoneNumber: string,
  extension: string
): string => {
  const formattedPhone = formatPhoneNumber(phoneNumber);
  if (!formattedPhone) {
    throw new Error(`${ErrorCode.INVALID_PHONE_ERROR}: Invalid phone number`);
  }

  const formattedExt = formatExtension(extension);
  if (extension && !formattedExt) {
    throw new Error(`${ErrorCode.INVALID_EXTENSION_ERROR}: Invalid extension`);
  }

  return formattedExt 
    ? `${formattedPhone}${EXTENSION_PAUSE_CHAR}${formattedExt}`
    : formattedPhone;
};

/**
 * Type guard to check if a phone number is valid for a medical practice
 * @param contact - Contact object to validate
 * @returns Boolean indicating if phone number is valid
 */
export const hasValidPhoneNumber = (contact: ContactType): boolean => {
  return validatePhoneNumber(contact.phone) && 
    (!contact.extension || formatExtension(contact.extension) !== null);
};