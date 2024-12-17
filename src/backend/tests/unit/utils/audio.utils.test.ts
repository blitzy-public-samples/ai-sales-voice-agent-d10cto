/**
 * Unit Tests for Audio Processing Utilities
 * Tests audio format validation, conversion, metadata and channel operations
 * Version: 1.0.0
 */

import { validateAudioFormat, convertToOpus, extractAudioMetadata, splitDualChannel } from '../../src/utils/audio.utils';
import { CallRecordType } from '../../src/types/call-record.types';
import * as fs from 'fs';
import * as path from 'path';

// Test fixture paths
const TEST_FIXTURES_PATH = path.join(__dirname, '../../../fixtures/audio');

// Test data buffers
const VALID_WAV_BUFFER = fs.readFileSync(path.join(TEST_FIXTURES_PATH, 'valid.wav'));
const VALID_MP3_BUFFER = fs.readFileSync(path.join(TEST_FIXTURES_PATH, 'valid.mp3'));
const INVALID_SAMPLE_RATE_BUFFER = fs.readFileSync(path.join(TEST_FIXTURES_PATH, 'invalid-sample-rate.wav'));
const INVALID_BIT_DEPTH_BUFFER = fs.readFileSync(path.join(TEST_FIXTURES_PATH, 'invalid-bit-depth.wav'));
const INVALID_CHANNELS_BUFFER = fs.readFileSync(path.join(TEST_FIXTURES_PATH, 'invalid-channels.wav'));
const CORRUPT_FILE_BUFFER = fs.readFileSync(path.join(TEST_FIXTURES_PATH, 'corrupt.wav'));
const LARGE_FILE_BUFFER = fs.readFileSync(path.join(TEST_FIXTURES_PATH, 'large.wav'));

// Quality thresholds
const QUALITY_THRESHOLD = 8.0;
const COMPRESSION_RATIO_TARGET = 10.0;

describe('validateAudioFormat', () => {
  // Valid format tests
  test('should validate correct WAV format with 48kHz/16-bit/dual-channel', async () => {
    const result = await validateAudioFormat(VALID_WAV_BUFFER);
    expect(result).toBe(true);
  });

  test('should validate correct MP3 format with required specifications', async () => {
    const result = await validateAudioFormat(VALID_MP3_BUFFER);
    expect(result).toBe(true);
  });

  // Invalid format tests
  test('should reject invalid sample rate (32kHz)', async () => {
    await expect(validateAudioFormat(INVALID_SAMPLE_RATE_BUFFER))
      .rejects.toThrow('Audio specifications do not meet requirements');
  });

  test('should reject invalid bit depth (8-bit)', async () => {
    await expect(validateAudioFormat(INVALID_BIT_DEPTH_BUFFER))
      .rejects.toThrow('Audio specifications do not meet requirements');
  });

  test('should reject mono channel audio', async () => {
    await expect(validateAudioFormat(INVALID_CHANNELS_BUFFER))
      .rejects.toThrow('Audio specifications do not meet requirements');
  });

  // Edge cases
  test('should handle corrupt audio files gracefully', async () => {
    await expect(validateAudioFormat(CORRUPT_FILE_BUFFER))
      .rejects.toThrow('Audio validation failed');
  });

  test('should process large files efficiently', async () => {
    const startTime = Date.now();
    await validateAudioFormat(LARGE_FILE_BUFFER);
    const duration = Date.now() - startTime;
    expect(duration).toBeLessThan(5000); // Should process within 5 seconds
  });

  // Quality validation
  test('should enforce quality threshold in strict mode', async () => {
    const options = { checkQuality: true, strictMode: true };
    await expect(validateAudioFormat(VALID_WAV_BUFFER, options))
      .resolves.toBe(true);
  });
});

describe('convertToOpus', () => {
  test('should convert WAV to Opus while maintaining quality', async () => {
    const opusBuffer = await convertToOpus(VALID_WAV_BUFFER);
    
    // Verify compression ratio
    const ratio = VALID_WAV_BUFFER.length / opusBuffer.length;
    expect(ratio).toBeGreaterThanOrEqual(COMPRESSION_RATIO_TARGET);
    
    // Verify quality preservation
    const result = await validateAudioFormat(opusBuffer, { checkQuality: true });
    expect(result).toBe(true);
  });

  test('should handle streaming conversion of large files', async () => {
    const startTime = Date.now();
    const opusBuffer = await convertToOpus(LARGE_FILE_BUFFER);
    const duration = Date.now() - startTime;
    
    expect(duration).toBeLessThan(10000); // Should convert within 10 seconds
    expect(opusBuffer).toBeInstanceOf(Buffer);
  });

  test('should reject invalid input formats', async () => {
    await expect(convertToOpus(CORRUPT_FILE_BUFFER))
      .rejects.toThrow('Opus conversion failed');
  });

  // Memory usage test
  test('should maintain stable memory usage during conversion', async () => {
    const initialMemory = process.memoryUsage().heapUsed;
    await convertToOpus(LARGE_FILE_BUFFER);
    const finalMemory = process.memoryUsage().heapUsed;
    
    // Should not increase heap usage by more than 100MB
    expect(finalMemory - initialMemory).toBeLessThan(100 * 1024 * 1024);
  });
});

describe('extractAudioMetadata', () => {
  test('should extract correct WAV metadata', async () => {
    const metadata = await extractAudioMetadata(VALID_WAV_BUFFER);
    
    expect(metadata).toMatchObject({
      audioFormat: 'wav',
      channels: 2,
      sampleRate: 48000,
      bitDepth: 16
    });
  });

  test('should extract correct MP3 metadata', async () => {
    const metadata = await extractAudioMetadata(VALID_MP3_BUFFER);
    
    expect(metadata).toMatchObject({
      audioFormat: 'mp3',
      channels: 2,
      sampleRate: 48000,
      bitDepth: 16
    });
  });

  test('should handle corrupt metadata gracefully', async () => {
    await expect(extractAudioMetadata(CORRUPT_FILE_BUFFER))
      .rejects.toThrow('Metadata extraction failed');
  });

  test('should perform efficiently on large files', async () => {
    const startTime = Date.now();
    await extractAudioMetadata(LARGE_FILE_BUFFER);
    const duration = Date.now() - startTime;
    
    expect(duration).toBeLessThan(1000); // Should extract within 1 second
  });
});

describe('splitDualChannel', () => {
  test('should correctly separate dual channels', async () => {
    const { agentTrack, recipientTrack } = await splitDualChannel(VALID_WAV_BUFFER);
    
    // Verify both tracks are valid buffers
    expect(agentTrack).toBeInstanceOf(Buffer);
    expect(recipientTrack).toBeInstanceOf(Buffer);
    
    // Verify each track is mono
    const agentMetadata = await extractAudioMetadata(agentTrack);
    const recipientMetadata = await extractAudioMetadata(recipientTrack);
    
    expect(agentMetadata.channels).toBe(1);
    expect(recipientMetadata.channels).toBe(1);
  });

  test('should preserve audio quality in separated tracks', async () => {
    const { agentTrack, recipientTrack } = await splitDualChannel(VALID_WAV_BUFFER);
    
    // Verify quality of both tracks
    const agentResult = await validateAudioFormat(agentTrack, { checkQuality: true });
    const recipientResult = await validateAudioFormat(recipientTrack, { checkQuality: true });
    
    expect(agentResult).toBe(true);
    expect(recipientResult).toBe(true);
  });

  test('should reject mono input', async () => {
    await expect(splitDualChannel(INVALID_CHANNELS_BUFFER))
      .rejects.toThrow('Audio must be dual channel format');
  });

  test('should handle large files efficiently', async () => {
    const startTime = Date.now();
    await splitDualChannel(LARGE_FILE_BUFFER);
    const duration = Date.now() - startTime;
    
    expect(duration).toBeLessThan(5000); // Should split within 5 seconds
  });

  test('should maintain phase alignment', async () => {
    const { agentTrack, recipientTrack } = await splitDualChannel(VALID_WAV_BUFFER);
    
    // Verify tracks are same length
    expect(agentTrack.length).toBe(recipientTrack.length);
    
    // TODO: Add more sophisticated phase alignment checks
    // This would involve analyzing waveform correlation between tracks
  });
});