import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import {
  generateDTMFTone,
  detectDTMFTone,
  validateDTMFSequence,
  waitForDTMFTone
} from '../../../src/utils/dtmf.utils';
import { ErrorCode } from '../../../src/constants/error-codes';

// Mock the node-dtmf module
jest.mock('node-dtmf', () => ({
  Generator: jest.fn().mockImplementation(() => ({
    generateTone: jest.fn().mockReturnValue(Buffer.from([]))
  })),
  Detector: jest.fn().mockImplementation(() => ({
    processChunk: jest.fn(),
    on: jest.fn()
  }))
}));

// Mock the logger
jest.mock('../../../src/lib/logger', () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn()
  }
}));

describe('DTMF Utilities', () => {
  const validDigits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '#'];
  const invalidDigits = ['A', 'B', 'C', 'D', 'E', 'F'];
  const defaultToneOptions = {
    duration: 250,
    amplitude: 0.5,
    sampleRate: 48000
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('generateDTMFTone', () => {
    test.each(validDigits)('should generate valid DTMF tone for digit %s', async (digit) => {
      const result = await generateDTMFTone(digit);
      expect(result).toBeInstanceOf(Buffer);
    });

    test.each(invalidDigits)('should throw error for invalid digit %s', async (digit) => {
      await expect(generateDTMFTone(digit)).rejects.toThrow('Invalid DTMF digit');
    });

    test('should use custom duration when provided', async () => {
      const customDuration = 500;
      await generateDTMFTone('1', { duration: customDuration });
      expect(jest.mocked(require('node-dtmf')).Generator).toHaveBeenCalledWith(
        defaultToneOptions.sampleRate
      );
    });

    test('should use custom amplitude when provided', async () => {
      const customAmplitude = 0.8;
      await generateDTMFTone('1', { amplitude: customAmplitude });
      expect(jest.mocked(require('node-dtmf')).Generator).toHaveBeenCalledWith(
        defaultToneOptions.sampleRate
      );
    });

    test('should handle tone generation failure', async () => {
      jest.mocked(require('node-dtmf')).Generator.mockImplementationOnce(() => ({
        generateTone: jest.fn().mockImplementationOnce(() => {
          throw new Error('Generation failed');
        })
      }));

      await expect(generateDTMFTone('1')).rejects.toThrow('Generation failed');
    });
  });

  describe('detectDTMFTone', () => {
    const mockAudioBuffer = Buffer.from([1, 2, 3, 4]);
    const mockDetectionResult = {
      digit: '1',
      confidence: 0.9,
      timestamp: Date.now()
    };

    test('should detect valid DTMF tone', async () => {
      jest.mocked(require('node-dtmf')).Detector.mockImplementationOnce(() => ({
        processChunk: jest.fn().mockReturnValue(mockDetectionResult)
      }));

      const result = await detectDTMFTone(mockAudioBuffer);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        digit: expect.any(String),
        confidence: expect.any(Number),
        timestamp: expect.any(Number)
      });
    });

    test('should handle no tones detected', async () => {
      jest.mocked(require('node-dtmf')).Detector.mockImplementationOnce(() => ({
        processChunk: jest.fn().mockReturnValue(null)
      }));

      const result = await detectDTMFTone(mockAudioBuffer);
      expect(result).toHaveLength(0);
    });

    test('should filter out low confidence detections', async () => {
      const lowConfidenceResult = { ...mockDetectionResult, confidence: 0.5 };
      jest.mocked(require('node-dtmf')).Detector.mockImplementationOnce(() => ({
        processChunk: jest.fn().mockReturnValue(lowConfidenceResult)
      }));

      const result = await detectDTMFTone(mockAudioBuffer);
      expect(result).toHaveLength(0);
    });

    test('should handle detection errors gracefully', async () => {
      jest.mocked(require('node-dtmf')).Detector.mockImplementationOnce(() => ({
        processChunk: jest.fn().mockImplementationOnce(() => {
          throw new Error('Detection failed');
        })
      }));

      await expect(detectDTMFTone(mockAudioBuffer)).rejects.toThrow('Detection failed');
    });
  });

  describe('validateDTMFSequence', () => {
    const validSequences = [
      { sequence: ['1', '2', '3'], pattern: '123' },
      { sequence: ['#', '0', '*'], pattern: '#0*' },
      { sequence: ['9', '9', '9'], pattern: '999' }
    ];

    const invalidSequences = [
      { sequence: ['1', '2'], pattern: '123' },
      { sequence: ['1', 'A', '3'], pattern: '123' },
      { sequence: ['#', '#'], pattern: '#*' }
    ];

    test.each(validSequences)('should validate correct sequence %p', ({ sequence, pattern }) => {
      expect(validateDTMFSequence(sequence, pattern)).toBe(true);
    });

    test.each(invalidSequences)('should reject invalid sequence %p', ({ sequence, pattern }) => {
      expect(validateDTMFSequence(sequence, pattern)).toBe(false);
    });

    test('should handle empty sequence', () => {
      expect(validateDTMFSequence([], '123')).toBe(false);
    });

    test('should handle empty pattern', () => {
      expect(validateDTMFSequence(['1', '2', '3'], '')).toBe(false);
    });

    test('should handle validation errors gracefully', () => {
      // @ts-ignore - Testing with invalid input type
      expect(validateDTMFSequence(null, '123')).toBe(false);
    });
  });

  describe('waitForDTMFTone', () => {
    const mockTimeout = 1000;

    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test('should resolve true when expected tone is detected', async () => {
      const expectedTone = '1';
      const detectorMock = {
        on: jest.fn().mockImplementation((event, callback) => {
          if (event === 'tone') {
            callback({ digit: expectedTone, confidence: 0.9 });
          }
        })
      };

      jest.mocked(require('node-dtmf')).Detector.mockImplementationOnce(() => detectorMock);

      const waitPromise = waitForDTMFTone(expectedTone, mockTimeout);
      jest.runAllTimers();
      
      await expect(waitPromise).resolves.toBe(true);
    });

    test('should resolve false on timeout', async () => {
      const detectorMock = {
        on: jest.fn()
      };

      jest.mocked(require('node-dtmf')).Detector.mockImplementationOnce(() => detectorMock);

      const waitPromise = waitForDTMFTone('1', mockTimeout);
      jest.runAllTimers();
      
      await expect(waitPromise).resolves.toBe(false);
    });

    test('should reject for invalid expected tone', async () => {
      await expect(waitForDTMFTone('X', mockTimeout)).rejects.toThrow('Invalid expected tone');
    });

    test('should handle detector initialization errors', async () => {
      jest.mocked(require('node-dtmf')).Detector.mockImplementationOnce(() => {
        throw new Error('Detector initialization failed');
      });

      await expect(waitForDTMFTone('1', mockTimeout)).rejects.toThrow('Detector initialization failed');
    });

    test('should ignore tones with low confidence', async () => {
      const expectedTone = '1';
      const detectorMock = {
        on: jest.fn().mockImplementation((event, callback) => {
          if (event === 'tone') {
            callback({ digit: expectedTone, confidence: 0.5 });
          }
        })
      };

      jest.mocked(require('node-dtmf')).Detector.mockImplementationOnce(() => detectorMock);

      const waitPromise = waitForDTMFTone(expectedTone, mockTimeout);
      jest.runAllTimers();
      
      await expect(waitPromise).resolves.toBe(false);
    });
  });
});