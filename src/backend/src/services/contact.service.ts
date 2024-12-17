/**
 * @file Contact Service Implementation
 * @description Service layer for managing medical practice contacts with enhanced security and validation
 * @version 1.0.0
 */

import { Types } from 'mongoose'; // ^7.0.0
import Contact from '../db/models/contact.model';
import { ContactType, ContactRole, ContactCreateInput, ContactUpdateInput } from '../types/contact.types';
import { validateContact } from '../lib/validator';
import { ErrorHandler } from '../lib/error-handler';
import { logger } from '../lib/logger';
import { ErrorCode, ErrorCategory } from '../constants/error-codes';

/**
 * Service class for managing medical practice contacts with enhanced security and validation
 */
export class ContactService {
  private readonly errorHandler: ErrorHandler;
  private readonly serviceName = 'ContactService';

  /**
   * Initialize contact service with error handling capabilities
   */
  constructor(errorHandler: ErrorHandler) {
    this.errorHandler = errorHandler;
  }

  /**
   * Create a new contact with enhanced validation and security checks
   * @param contactData - Contact creation input data
   * @returns Promise resolving to created contact
   * @throws ValidationError if contact data is invalid
   */
  async createContact(contactData: ContactCreateInput): Promise<ContactType> {
    try {
      // Validate contact data
      validateContact(contactData as ContactType);

      // Create contact with circuit breaker protection
      const contact = await this.errorHandler.circuitBreaker(
        async () => Contact.create(contactData),
        'mongodb'
      );

      // Log successful creation
      logger.info('Contact created successfully', {
        contactId: contact._id,
        practiceName: contact.practiceName,
        role: contact.role
      });

      return contact;
    } catch (error) {
      logger.error('Failed to create contact', {
        error,
        contactData: { ...contactData, phone: '****', email: '****' }
      });
      throw error;
    }
  }

  /**
   * Retrieve contact by ID with security checks
   * @param id - MongoDB ObjectId of the contact
   * @returns Promise resolving to contact or null if not found
   */
  async getContactById(id: Types.ObjectId): Promise<ContactType | null> {
    try {
      // Validate ObjectId format
      if (!Types.ObjectId.isValid(id)) {
        throw new Error('Invalid contact ID format');
      }

      // Retrieve contact with circuit breaker protection
      const contact = await this.errorHandler.circuitBreaker(
        async () => Contact.findById(id),
        'mongodb'
      );

      if (!contact) {
        logger.warn('Contact not found', { contactId: id });
        return null;
      }

      logger.info('Contact retrieved successfully', { contactId: id });
      return contact;
    } catch (error) {
      logger.error('Failed to retrieve contact', { error, contactId: id });
      throw error;
    }
  }

  /**
   * Retrieve contact by phone number with validation
   * @param phone - Phone number to search for
   * @returns Promise resolving to contact or null if not found
   */
  async getContactByPhone(phone: string): Promise<ContactType | null> {
    try {
      // Normalize phone number format
      const normalizedPhone = phone.startsWith('+1') ? 
        phone : 
        `+1${phone.replace(/\D/g, '')}`;

      // Retrieve contact with circuit breaker protection
      const contact = await this.errorHandler.circuitBreaker(
        async () => Contact.findOne({ phone: normalizedPhone }),
        'mongodb'
      );

      if (!contact) {
        logger.warn('Contact not found by phone', { 
          phone: '****' + normalizedPhone.slice(-4) 
        });
        return null;
      }

      logger.info('Contact retrieved by phone successfully', {
        contactId: contact._id,
        phone: '****' + normalizedPhone.slice(-4)
      });

      return contact;
    } catch (error) {
      logger.error('Failed to retrieve contact by phone', {
        error,
        phone: '****' + phone.slice(-4)
      });
      throw error;
    }
  }

  /**
   * Update contact with validation and security checks
   * @param id - MongoDB ObjectId of the contact
   * @param updateData - Partial contact data to update
   * @returns Promise resolving to updated contact or null if not found
   */
  async updateContact(
    id: Types.ObjectId,
    updateData: ContactUpdateInput
  ): Promise<ContactType | null> {
    try {
      // Validate ObjectId format
      if (!Types.ObjectId.isValid(id)) {
        throw new Error('Invalid contact ID format');
      }

      // Validate update data
      const existingContact = await this.getContactById(id);
      if (!existingContact) {
        return null;
      }

      const updatedContact = { ...existingContact, ...updateData };
      validateContact(updatedContact as ContactType);

      // Update contact with circuit breaker protection
      const result = await this.errorHandler.circuitBreaker(
        async () => Contact.findByIdAndUpdate(
          id,
          { $set: updateData },
          { new: true, runValidators: true }
        ),
        'mongodb'
      );

      if (!result) {
        logger.warn('Contact not found for update', { contactId: id });
        return null;
      }

      logger.info('Contact updated successfully', {
        contactId: id,
        updatedFields: Object.keys(updateData)
      });

      return result;
    } catch (error) {
      logger.error('Failed to update contact', {
        error,
        contactId: id,
        updateData: { ...updateData, phone: '****', email: '****' }
      });
      throw error;
    }
  }

  /**
   * Delete contact with security verification
   * @param id - MongoDB ObjectId of the contact
   * @returns Promise resolving to boolean indicating success
   */
  async deleteContact(id: Types.ObjectId): Promise<boolean> {
    try {
      // Validate ObjectId format
      if (!Types.ObjectId.isValid(id)) {
        throw new Error('Invalid contact ID format');
      }

      // Delete contact with circuit breaker protection
      const result = await this.errorHandler.circuitBreaker(
        async () => Contact.findByIdAndDelete(id),
        'mongodb'
      );

      if (!result) {
        logger.warn('Contact not found for deletion', { contactId: id });
        return false;
      }

      logger.info('Contact deleted successfully', { contactId: id });
      return true;
    } catch (error) {
      logger.error('Failed to delete contact', { error, contactId: id });
      throw error;
    }
  }

  /**
   * Search contacts with filtering and pagination
   * @param criteria - Search criteria
   * @param sort - Sort options
   * @param page - Page number
   * @param limit - Results per page
   * @returns Promise resolving to paginated contact list
   */
  async searchContacts(
    criteria: Record<string, any>,
    sort: { field: string; order: 'asc' | 'desc' },
    page: number = 1,
    limit: number = 10
  ): Promise<{ contacts: ContactType[]; total: number; hasMore: boolean }> {
    try {
      // Build query with circuit breaker protection
      const [contacts, total] = await Promise.all([
        this.errorHandler.circuitBreaker(
          async () => Contact.find(criteria)
            .sort({ [sort.field]: sort.order === 'asc' ? 1 : -1 })
            .skip((page - 1) * limit)
            .limit(limit),
          'mongodb'
        ),
        this.errorHandler.circuitBreaker(
          async () => Contact.countDocuments(criteria),
          'mongodb'
        )
      ]);

      logger.info('Contacts search completed', {
        criteria,
        page,
        limit,
        total,
        found: contacts.length
      });

      return {
        contacts,
        total,
        hasMore: total > page * limit
      };
    } catch (error) {
      logger.error('Failed to search contacts', {
        error,
        criteria,
        sort,
        page,
        limit
      });
      throw error;
    }
  }
}

// Export singleton instance
export default ContactService;