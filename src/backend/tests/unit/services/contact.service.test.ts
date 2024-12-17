/**
 * @file Unit tests for ContactService
 * @description Comprehensive test coverage for contact management operations
 */

import { describe, beforeEach, test, expect, jest } from '@jest/globals';
import { Types } from 'mongoose';
import { ContactService } from '../../src/services/contact.service';
import Contact from '../../src/db/models/contact.model';
import { ContactType, ContactRole } from '../../src/types/contact.types';
import { ErrorHandler } from '../../src/lib/error-handler';
import { ErrorCode } from '../../src/constants/error-codes';

// Mock dependencies
jest.mock('../../src/db/models/contact.model');
jest.mock('../../src/lib/error-handler');

describe('ContactService', () => {
  // Test fixtures
  let mockContactService: ContactService;
  let mockErrorHandler: jest.Mocked<ErrorHandler>;
  let mockContact: jest.Mocked<typeof Contact>;

  // Test data
  const testContactData: ContactType = {
    _id: new Types.ObjectId(),
    practiceName: 'Test Medical Practice',
    firstName: 'John',
    lastName: 'Doe',
    role: ContactRole.PRACTICE_ADMIN,
    phone: '+12125551234',
    extension: '123',
    email: 'john.doe@testpractice.com',
    timezone: 'America/New_York',
    bestTimeToCall: ['09:00-12:00', '14:00-16:00'],
    createdAt: new Date(),
    updatedAt: new Date()
  };

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Initialize mocked error handler
    mockErrorHandler = {
      handleError: jest.fn(),
      circuitBreaker: jest.fn(),
      cancelRetries: jest.fn(),
      getErrorMetrics: jest.fn(),
      resetErrorMetrics: jest.fn()
    } as unknown as jest.Mocked<ErrorHandler>;

    // Initialize contact service with mocked dependencies
    mockContactService = new ContactService(mockErrorHandler);

    // Mock Contact model methods
    mockContact = Contact as jest.Mocked<typeof Contact>;
  });

  describe('createContact', () => {
    test('should create contact successfully with valid data', async () => {
      // Setup
      mockErrorHandler.circuitBreaker.mockResolvedValueOnce(testContactData);

      // Execute
      const result = await mockContactService.createContact(testContactData);

      // Verify
      expect(mockErrorHandler.circuitBreaker).toHaveBeenCalledWith(
        expect.any(Function),
        'mongodb'
      );
      expect(result).toEqual(testContactData);
    });

    test('should handle validation errors during creation', async () => {
      // Setup
      const invalidData = { ...testContactData, email: 'invalid-email' };
      mockErrorHandler.circuitBreaker.mockRejectedValueOnce(new Error('Validation failed'));

      // Execute & Verify
      await expect(mockContactService.createContact(invalidData))
        .rejects
        .toThrow('Validation failed');
    });

    test('should handle duplicate contact errors', async () => {
      // Setup
      const duplicateError = new Error('Duplicate key error');
      (duplicateError as any).code = 11000;
      mockErrorHandler.circuitBreaker.mockRejectedValueOnce(duplicateError);

      // Execute & Verify
      await expect(mockContactService.createContact(testContactData))
        .rejects
        .toThrow('Duplicate key error');
    });
  });

  describe('getContactById', () => {
    test('should retrieve contact by valid ID', async () => {
      // Setup
      mockErrorHandler.circuitBreaker.mockResolvedValueOnce(testContactData);

      // Execute
      const result = await mockContactService.getContactById(testContactData._id);

      // Verify
      expect(mockErrorHandler.circuitBreaker).toHaveBeenCalledWith(
        expect.any(Function),
        'mongodb'
      );
      expect(result).toEqual(testContactData);
    });

    test('should return null for non-existent ID', async () => {
      // Setup
      mockErrorHandler.circuitBreaker.mockResolvedValueOnce(null);

      // Execute
      const result = await mockContactService.getContactById(new Types.ObjectId());

      // Verify
      expect(result).toBeNull();
    });

    test('should handle invalid ObjectId format', async () => {
      // Execute & Verify
      await expect(mockContactService.getContactById('invalid-id' as any))
        .rejects
        .toThrow('Invalid contact ID format');
    });
  });

  describe('getContactByPhone', () => {
    test('should retrieve contact by phone number', async () => {
      // Setup
      mockErrorHandler.circuitBreaker.mockResolvedValueOnce(testContactData);

      // Execute
      const result = await mockContactService.getContactByPhone('+12125551234');

      // Verify
      expect(mockErrorHandler.circuitBreaker).toHaveBeenCalledWith(
        expect.any(Function),
        'mongodb'
      );
      expect(result).toEqual(testContactData);
    });

    test('should normalize phone number format', async () => {
      // Setup
      mockErrorHandler.circuitBreaker.mockResolvedValueOnce(testContactData);

      // Execute
      await mockContactService.getContactByPhone('2125551234');

      // Verify
      expect(mockErrorHandler.circuitBreaker).toHaveBeenCalledWith(
        expect.any(Function),
        'mongodb'
      );
    });

    test('should return null for non-existent phone', async () => {
      // Setup
      mockErrorHandler.circuitBreaker.mockResolvedValueOnce(null);

      // Execute
      const result = await mockContactService.getContactByPhone('+12125559999');

      // Verify
      expect(result).toBeNull();
    });
  });

  describe('updateContact', () => {
    test('should update contact with valid data', async () => {
      // Setup
      const updateData = { firstName: 'Jane', lastName: 'Smith' };
      const updatedContact = { ...testContactData, ...updateData };
      mockErrorHandler.circuitBreaker
        .mockResolvedValueOnce(testContactData)  // For getContactById
        .mockResolvedValueOnce(updatedContact);  // For findByIdAndUpdate

      // Execute
      const result = await mockContactService.updateContact(testContactData._id, updateData);

      // Verify
      expect(mockErrorHandler.circuitBreaker).toHaveBeenCalledTimes(2);
      expect(result).toEqual(updatedContact);
    });

    test('should handle validation errors during update', async () => {
      // Setup
      const invalidData = { email: 'invalid-email' };
      mockErrorHandler.circuitBreaker
        .mockResolvedValueOnce(testContactData)  // For getContactById
        .mockRejectedValueOnce(new Error('Validation failed'));  // For update

      // Execute & Verify
      await expect(mockContactService.updateContact(testContactData._id, invalidData))
        .rejects
        .toThrow('Validation failed');
    });

    test('should handle non-existent contact update', async () => {
      // Setup
      mockErrorHandler.circuitBreaker.mockResolvedValueOnce(null);

      // Execute
      const result = await mockContactService.updateContact(
        new Types.ObjectId(),
        { firstName: 'Test' }
      );

      // Verify
      expect(result).toBeNull();
    });
  });

  describe('deleteContact', () => {
    test('should delete existing contact', async () => {
      // Setup
      mockErrorHandler.circuitBreaker.mockResolvedValueOnce(testContactData);

      // Execute
      const result = await mockContactService.deleteContact(testContactData._id);

      // Verify
      expect(mockErrorHandler.circuitBreaker).toHaveBeenCalledWith(
        expect.any(Function),
        'mongodb'
      );
      expect(result).toBe(true);
    });

    test('should handle non-existent contact deletion', async () => {
      // Setup
      mockErrorHandler.circuitBreaker.mockResolvedValueOnce(null);

      // Execute
      const result = await mockContactService.deleteContact(new Types.ObjectId());

      // Verify
      expect(result).toBe(false);
    });

    test('should handle invalid ObjectId during deletion', async () => {
      // Execute & Verify
      await expect(mockContactService.deleteContact('invalid-id' as any))
        .rejects
        .toThrow('Invalid contact ID format');
    });
  });

  describe('Error Handling', () => {
    test('should handle database connection errors', async () => {
      // Setup
      const dbError = new Error('Database connection failed');
      mockErrorHandler.circuitBreaker.mockRejectedValueOnce(dbError);

      // Execute & Verify
      await expect(mockContactService.getContactById(testContactData._id))
        .rejects
        .toThrow('Database connection failed');
    });

    test('should handle circuit breaker open state', async () => {
      // Setup
      const circuitError = new Error('Circuit breaker is open');
      mockErrorHandler.circuitBreaker.mockRejectedValueOnce(circuitError);

      // Execute & Verify
      await expect(mockContactService.createContact(testContactData))
        .rejects
        .toThrow('Circuit breaker is open');
    });

    test('should handle concurrent update conflicts', async () => {
      // Setup
      const versionError = new Error('Version conflict');
      mockErrorHandler.circuitBreaker
        .mockResolvedValueOnce(testContactData)
        .mockRejectedValueOnce(versionError);

      // Execute & Verify
      await expect(mockContactService.updateContact(
        testContactData._id,
        { firstName: 'Test' }
      )).rejects.toThrow('Version conflict');
    });
  });
});