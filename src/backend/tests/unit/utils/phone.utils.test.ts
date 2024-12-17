/**
 * @file Unit tests for phone number utility functions
 * @version 1.0.0
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals'; // ^29.0.0
import {
  formatPhoneNumber,
  validatePhoneNumber,
  generateDTMFTones,
  formatExtension,
  combinePhoneAndExtension
} from '../../src/utils/phone.utils';
import { ErrorCode } from '../../src/constants/error-codes';

describe('Phone Utility Functions', () => {
  describe('formatPhoneNumber', () => {
    const validPhoneCases = [
      { input: '4155552671', expected: '+14155552671' },
      { input: '(415) 555-2671', expected: '+14155552671' },
      { input: '415-555-2671', expected: '+14155552671' },
      { input: '+1-415-555-2671', expected: '+14155552671' },
      { input: '1-415-555-2671', expected: '+14155552671' }
    ];

    test.each(validPhoneCases)('formats $input to $expected', ({ input, expected }) => {
      expect(formatPhoneNumber(input)).toBe(expected);
    });

    const invalidPhoneCases = [
      { input: '123', error: ErrorCode.INVALID_PHONE_ERROR },
      { input: 'abcdefghijk', error: ErrorCode.INVALID_PHONE_ERROR },
      { input: '+44123456789', error: ErrorCode.INVALID_PHONE_ERROR },
      { input: '8005552671', error: null }, // Toll-free number should return null
      { input: '', error: ErrorCode.INVALID_PHONE_ERROR }
    ];

    test.each(invalidPhoneCases)('handles invalid input $input', ({ input, error }) => {
      if (error) {
        expect(() => formatPhoneNumber(input)).toThrow(error);
      } else {
        expect(formatPhoneNumber(input)).toBeNull();
      }
    });

    test('handles null/undefined inputs', () => {
      expect(() => formatPhoneNumber(null as any)).toThrow(ErrorCode.INVALID_PHONE_ERROR);
      expect(() => formatPhoneNumber(undefined as any)).toThrow(ErrorCode.INVALID_PHONE_ERROR);
    });
  });

  describe('validatePhoneNumber', () => {
    const validationCases = [
      { input: '4155552671', expected: true },
      { input: '(415) 555-2671', expected: true },
      { input: '+1-415-555-2671', expected: true },
      { input: '123', expected: false },
      { input: '8005552671', expected: false }, // Toll-free
      { input: '+44123456789', expected: false }, // International
      { input: '', expected: false }
    ];

    test.each(validationCases)('validates $input correctly', ({ input, expected }) => {
      expect(validatePhoneNumber(input)).toBe(expected);
    });

    test('handles null/undefined inputs', () => {
      expect(validatePhoneNumber(null as any)).toBe(false);
      expect(validatePhoneNumber(undefined as any)).toBe(false);
    });
  });

  describe('generateDTMFTones', () => {
    const sampleRate = 44100; // Hz
    const defaultDuration = 250; // ms

    test('generates correct DTMF frequencies for single digits', () => {
      const tones = generateDTMFTones('1');
      const expectedSamples = Math.floor(sampleRate * (defaultDuration / 1000));
      expect(tones.length).toBe(expectedSamples * 2); // 16-bit = 2 bytes per sample
    });

    test('generates correct length for multi-digit sequences', () => {
      const sequence = '123';
      const tones = generateDTMFTones(sequence);
      const expectedSamples = Math.floor(sampleRate * (defaultDuration / 1000)) * sequence.length +
        Math.floor(sampleRate * (100 / 1000)) * (sequence.length - 1); // Including pauses
      expect(tones.length).toBe(expectedSamples * 2);
    });

    test('handles invalid DTMF characters', () => {
      expect(() => generateDTMFTones('ABC')).toThrow(ErrorCode.PHONE_TREE_ERROR);
      expect(() => generateDTMFTones('')).toThrow(ErrorCode.PHONE_TREE_ERROR);
    });

    test('respects custom duration parameter', () => {
      const customDuration = 500; // ms
      const tones = generateDTMFTones('1', customDuration);
      const expectedSamples = Math.floor(sampleRate * (customDuration / 1000));
      expect(tones.length).toBe(expectedSamples * 2);
    });
  });

  describe('formatExtension', () => {
    const extensionCases = [
      { input: '123', expected: '000123' },
      { input: '1234', expected: '001234' },
      { input: '12345', expected: '012345' },
      { input: '123456', expected: '123456' },
      { input: '1234567', expected: null }, // Too long
      { input: '', expected: null },
      { input: 'abc', expected: null }
    ];

    test.each(extensionCases)('formats extension $input correctly', ({ input, expected }) => {
      if (expected === null) {
        expect(formatExtension(input)).toBeNull();
      } else {
        expect(formatExtension(input)).toBe(expected);
      }
    });

    test('handles null/undefined inputs', () => {
      expect(formatExtension(null as any)).toBeNull();
      expect(formatExtension(undefined as any)).toBeNull();
    });

    test('strips non-numeric characters', () => {
      expect(formatExtension('123-456')).toBe('123456');
      expect(formatExtension('12.34')).toBe('001234');
    });
  });

  describe('combinePhoneAndExtension', () => {
    const combinationCases = [
      { 
        phone: '4155552671', 
        extension: '123', 
        expected: '+14155552671,000123' 
      },
      { 
        phone: '(415) 555-2671', 
        extension: '1234', 
        expected: '+14155552671,001234' 
      },
      { 
        phone: '415-555-2671', 
        extension: '', 
        expected: '+14155552671' 
      }
    ];

    test.each(combinationCases)('combines $phone with extension $extension', ({ phone, extension, expected }) => {
      expect(combinePhoneAndExtension(phone, extension)).toBe(expected);
    });

    test('handles invalid phone numbers', () => {
      expect(() => combinePhoneAndExtension('123', '456'))
        .toThrow(ErrorCode.INVALID_PHONE_ERROR);
    });

    test('handles invalid extensions', () => {
      expect(() => combinePhoneAndExtension('4155552671', '1234567'))
        .toThrow(ErrorCode.INVALID_EXTENSION_ERROR);
    });

    test('handles null/undefined inputs', () => {
      expect(() => combinePhoneAndExtension(null as any, '123'))
        .toThrow(ErrorCode.INVALID_PHONE_ERROR);
      expect(() => combinePhoneAndExtension('4155552671', null as any))
        .toBe('+14155552671');
    });
  });

  // Performance tests
  describe('Performance', () => {
    const ITERATION_COUNT = 1000;
    
    test('formatPhoneNumber handles high volume', () => {
      const phone = '4155552671';
      const start = process.hrtime();
      
      for (let i = 0; i < ITERATION_COUNT; i++) {
        formatPhoneNumber(phone);
      }
      
      const [seconds, nanoseconds] = process.hrtime(start);
      const totalMs = (seconds * 1000) + (nanoseconds / 1000000);
      expect(totalMs / ITERATION_COUNT).toBeLessThan(1); // Average < 1ms per operation
    });

    test('generateDTMFTones memory usage', () => {
      const sequence = '123456789';
      const initialMemory = process.memoryUsage().heapUsed;
      
      generateDTMFTones(sequence);
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryDiff = finalMemory - initialMemory;
      
      // Ensure reasonable memory usage (less than 10MB for test sequence)
      expect(memoryDiff).toBeLessThan(10 * 1024 * 1024);
    });
  });
});