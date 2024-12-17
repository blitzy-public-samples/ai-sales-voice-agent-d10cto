/**
 * @file Contact Model Definition
 * @description Mongoose model for medical practice contacts with HIPAA compliance and comprehensive auditing
 * @module db/models/contact.model
 * @version 1.0.0
 */

import { model, Model, FilterQuery, UpdateQuery } from 'mongoose'; // ^7.0.0
import { ContactSchema } from '../schemas/contact.schema';
import { 
  ContactType, 
  ContactRole, 
  ContactSearchCriteria, 
  ContactSortOptions, 
  PaginatedContactResponse 
} from '../../types/contact.types';

/**
 * Interface for custom static methods on the Contact model
 */
interface ContactModel extends Model<ContactType> {
  findByPhone(phone: string): Promise<ContactType | null>;
  findByPracticeName(practiceName: string): Promise<ContactType[]>;
  findByRole(role: ContactRole): Promise<ContactType[]>;
  updateLastContacted(id: string): Promise<void>;
  searchContacts(
    criteria: ContactSearchCriteria,
    sort: ContactSortOptions,
    page: number,
    limit: number
  ): Promise<PaginatedContactResponse>;
}

/**
 * Add custom static methods to the schema
 */
ContactSchema.statics = {
  /**
   * Find a contact by phone number
   * Normalizes phone number format before querying
   * @param phone - Phone number to search for
   * @returns Promise resolving to contact or null
   */
  async findByPhone(phone: string): Promise<ContactType | null> {
    const normalizedPhone = phone.startsWith('+1') ? phone : `+1${phone.replace(/\D/g, '')}`;
    return this.findOne({ phone: normalizedPhone });
  },

  /**
   * Find contacts by practice name using case-insensitive partial matching
   * @param practiceName - Practice name to search for
   * @returns Promise resolving to array of matching contacts
   */
  async findByPracticeName(practiceName: string): Promise<ContactType[]> {
    return this.find({
      practiceName: { 
        $regex: new RegExp(practiceName, 'i') 
      }
    }).sort({ createdAt: -1 });
  },

  /**
   * Find contacts by role
   * @param role - ContactRole enum value to filter by
   * @returns Promise resolving to array of matching contacts
   */
  async findByRole(role: ContactRole): Promise<ContactType[]> {
    return this.find({ role }).sort({ practiceName: 1, lastName: 1 });
  },

  /**
   * Update the lastContactedAt timestamp for a contact
   * @param id - MongoDB ObjectId of the contact
   * @throws Error if contact not found
   */
  async updateLastContacted(id: string): Promise<void> {
    const result = await this.updateOne(
      { _id: id },
      { $set: { lastContactedAt: new Date() } }
    );
    
    if (result.matchedCount === 0) {
      throw new Error(`Contact not found with id: ${id}`);
    }
  },

  /**
   * Search contacts with filtering, sorting, and pagination
   * @param criteria - Search criteria for filtering contacts
   * @param sort - Sorting options
   * @param page - Page number (1-based)
   * @param limit - Number of results per page
   * @returns Promise resolving to paginated contact response
   */
  async searchContacts(
    criteria: ContactSearchCriteria,
    sort: ContactSortOptions,
    page: number,
    limit: number
  ): Promise<PaginatedContactResponse> {
    // Build filter query
    const filter: FilterQuery<ContactType> = {};
    
    if (criteria.practiceName) {
      filter.practiceName = { $regex: new RegExp(criteria.practiceName, 'i') };
    }
    if (criteria.firstName) {
      filter.firstName = { $regex: new RegExp(criteria.firstName, 'i') };
    }
    if (criteria.lastName) {
      filter.lastName = { $regex: new RegExp(criteria.lastName, 'i') };
    }
    if (criteria.role) {
      filter.role = criteria.role;
    }
    if (criteria.phone) {
      filter.phone = criteria.phone.startsWith('+1') ? 
        criteria.phone : 
        `+1${criteria.phone.replace(/\D/g, '')}`;
    }
    if (criteria.email) {
      filter.email = criteria.email.toLowerCase();
    }
    if (criteria.timezone) {
      filter.timezone = criteria.timezone;
    }

    // Execute count query
    const total = await this.countDocuments(filter);

    // Execute find query with sorting and pagination
    const contacts = await this.find(filter)
      .sort({ [sort.field]: sort.order === 'asc' ? 1 : -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .exec();

    return {
      contacts,
      total,
      page,
      limit,
      hasMore: total > page * limit
    };
  }
};

/**
 * Add instance methods to the schema
 */
ContactSchema.methods = {
  /**
   * Check if contact can be reached at a specific time
   * @param time - Date object representing the time to check
   * @returns boolean indicating availability
   */
  isAvailable(time: Date): boolean {
    const contactTime = new Date(time).toLocaleTimeString('en-US', {
      timeZone: this.timezone,
      hour12: false,
      hour: '2-digit',
      minute: '2-digit'
    });

    return this.bestTimeToCall.some(slot => {
      const [start, end] = slot.split('-');
      return contactTime >= start && contactTime <= end;
    });
  },

  /**
   * Get formatted full name of contact
   * @returns string containing full name
   */
  getFullName(): string {
    return `${this.firstName} ${this.lastName}`;
  }
};

// Create and export the Contact model
const Contact = model<ContactType, ContactModel>('Contact', ContactSchema);

export default Contact;