/**
 * @file Integration Tests for Contact Management
 * @description Tests contact management functionality with database operations and security checks
 */

import { describe, beforeAll, afterAll, beforeEach, it, expect } from '@jest/globals';
import mongoose, { Types } from 'mongoose';
import { ContactService } from '../../src/services/contact.service';
import Contact from '../../src/db/models/contact.model';
import { ContactType, ContactRole } from '../../src/types/contact.types';
import { ErrorHandler } from '../../src/lib/error-handler';
import { logger } from '../../src/lib/logger';

// Test configuration
const TEST_DB_URI = process.env.TEST_MONGODB_URI || 'mongodb://localhost:27017/docshield_test';
const TEST_TIMEOUT = 10000;

// Test data
const testContact: ContactType = {
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

describe('Contact Integration Tests', () => {
  let contactService: ContactService;
  let errorHandler: ErrorHandler;

  beforeAll(async () => {
    // Connect to test database with security options
    await mongoose.connect(TEST_DB_URI, {
      autoIndex: true,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 5000,
      ssl: process.env.NODE_ENV === 'production',
      retryWrites: true
    });

    // Initialize error handler with test configuration
    errorHandler = new ErrorHandler({
      maxRetries: 2,
      backoffMs: 100,
      circuitBreakerConfig: {
        failureThreshold: 3,
        resetTimeout: 1000,
        monitoredServices: ['mongodb']
      }
    });

    // Initialize contact service
    contactService = new ContactService(errorHandler);

    // Disable logging during tests
    logger.silent = true;
  }, TEST_TIMEOUT);

  afterAll(async () => {
    // Clean up test data and close connection
    await Contact.deleteMany({});
    await mongoose.connection.close();
    logger.silent = false;
  });

  beforeEach(async () => {
    // Clear contacts before each test
    await Contact.deleteMany({});
  });

  describe('Contact Creation', () => {
    it('should create a new contact with role-based validation', async () => {
      // Test contact creation for each role
      for (const role of Object.values(ContactRole)) {
        const roleContact = { ...testContact, role };
        delete roleContact._id;

        const createdContact = await contactService.createContact(roleContact);

        expect(createdContact).toBeDefined();
        expect(createdContact._id).toBeDefined();
        expect(createdContact.role).toBe(role);
        expect(createdContact.phone).toMatch(/^\+1[2-9]\d{9}$/);
        expect(createdContact.email).toBe(roleContact.email.toLowerCase());
      }
    });

    it('should handle duplicate contact creation', async () => {
      // Create initial contact
      const firstContact = await contactService.createContact({ ...testContact });
      expect(firstContact).toBeDefined();

      // Attempt duplicate creation
      await expect(async () => {
        await contactService.createContact({ ...testContact, phone: firstContact.phone });
      }).rejects.toThrow();
    });

    it('should validate phone number format', async () => {
      const invalidPhoneContact = { ...testContact, phone: '1234567890' };
      delete invalidPhoneContact._id;

      await expect(async () => {
        await contactService.createContact(invalidPhoneContact);
      }).rejects.toThrow(/Invalid phone number format/);
    });

    it('should validate timezone format', async () => {
      const invalidTimezoneContact = { ...testContact, timezone: 'Invalid/Zone' };
      delete invalidTimezoneContact._id;

      await expect(async () => {
        await contactService.createContact(invalidTimezoneContact);
      }).rejects.toThrow(/Invalid timezone/);
    });
  });

  describe('Contact Retrieval', () => {
    it('should retrieve contact with security filtering', async () => {
      // Create test contact
      const createdContact = await contactService.createContact({ ...testContact });
      expect(createdContact).toBeDefined();

      // Retrieve by ID
      const retrievedContact = await contactService.getContactById(createdContact._id);
      expect(retrievedContact).toBeDefined();
      expect(retrievedContact?._id).toEqual(createdContact._id);

      // Verify sensitive data handling
      expect(retrievedContact?.phone).toBe(createdContact.phone);
      expect(retrievedContact?.email).toBe(createdContact.email.toLowerCase());
    });

    it('should retrieve contact by phone number', async () => {
      // Create test contact
      const createdContact = await contactService.createContact({ ...testContact });
      expect(createdContact).toBeDefined();

      // Test different phone formats
      const formats = [
        createdContact.phone,
        createdContact.phone.replace('+1', ''),
        createdContact.phone.replace(/\D/g, '')
      ];

      for (const phoneFormat of formats) {
        const found = await contactService.getContactByPhone(phoneFormat);
        expect(found).toBeDefined();
        expect(found?._id).toEqual(createdContact._id);
      }
    });

    it('should handle non-existent contact retrieval', async () => {
      const nonExistentId = new Types.ObjectId();
      const result = await contactService.getContactById(nonExistentId);
      expect(result).toBeNull();
    });
  });

  describe('Contact Updates', () => {
    it('should update contact with validation', async () => {
      // Create initial contact
      const createdContact = await contactService.createContact({ ...testContact });
      expect(createdContact).toBeDefined();

      // Update contact
      const updateData = {
        practiceName: 'Updated Practice Name',
        bestTimeToCall: ['10:00-12:00', '15:00-17:00']
      };

      const updatedContact = await contactService.updateContact(
        createdContact._id,
        updateData
      );

      expect(updatedContact).toBeDefined();
      expect(updatedContact?.practiceName).toBe(updateData.practiceName);
      expect(updatedContact?.bestTimeToCall).toEqual(updateData.bestTimeToCall);
    });

    it('should validate updated phone number', async () => {
      const createdContact = await contactService.createContact({ ...testContact });
      expect(createdContact).toBeDefined();

      await expect(async () => {
        await contactService.updateContact(createdContact._id, {
          phone: 'invalid-phone'
        });
      }).rejects.toThrow(/Invalid phone number format/);
    });

    it('should handle concurrent updates', async () => {
      const createdContact = await contactService.createContact({ ...testContact });
      expect(createdContact).toBeDefined();

      // Simulate concurrent updates
      const updates = [
        contactService.updateContact(createdContact._id, { firstName: 'Update1' }),
        contactService.updateContact(createdContact._id, { firstName: 'Update2' })
      ];

      const results = await Promise.all(updates);
      expect(results[0]?.firstName).not.toBe(results[1]?.firstName);
    });
  });

  describe('Contact Deletion', () => {
    it('should delete contact with authorization', async () => {
      // Create test contact
      const createdContact = await contactService.createContact({ ...testContact });
      expect(createdContact).toBeDefined();

      // Delete contact
      const deleted = await contactService.deleteContact(createdContact._id);
      expect(deleted).toBe(true);

      // Verify deletion
      const notFound = await contactService.getContactById(createdContact._id);
      expect(notFound).toBeNull();
    });

    it('should handle non-existent contact deletion', async () => {
      const nonExistentId = new Types.ObjectId();
      const result = await contactService.deleteContact(nonExistentId);
      expect(result).toBe(false);
    });
  });

  describe('Contact Search', () => {
    it('should search contacts with filtering and pagination', async () => {
      // Create multiple test contacts
      const contacts = await Promise.all([
        contactService.createContact({ ...testContact, firstName: 'John' }),
        contactService.createContact({ ...testContact, firstName: 'Jane', phone: '+12125551235' }),
        contactService.createContact({ ...testContact, firstName: 'Jim', phone: '+12125551236' })
      ]);

      expect(contacts).toHaveLength(3);

      // Test search with criteria
      const searchResult = await contactService.searchContacts(
        { practiceName: testContact.practiceName },
        { field: 'firstName', order: 'asc' },
        1,
        2
      );

      expect(searchResult.contacts).toHaveLength(2);
      expect(searchResult.total).toBe(3);
      expect(searchResult.hasMore).toBe(true);
    });
  });
});