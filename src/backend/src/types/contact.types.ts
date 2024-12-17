// @ts-check
import { Types } from 'mongoose'; // ^7.0.0

/**
 * Enumeration of possible roles for medical practice contacts.
 * Used for role-based operations and access control in the system.
 */
export enum ContactRole {
  FRONT_DESK = 'FRONT_DESK',
  PRACTICE_ADMIN = 'PRACTICE_ADMIN',
  PHYSICIAN = 'PHYSICIAN'
}

/**
 * Interface defining the complete structure of contact documents in MongoDB.
 * Represents medical practice contacts with all required fields for the DocShield system.
 */
export interface ContactType {
  /** MongoDB ObjectId for unique contact identification */
  _id: Types.ObjectId;
  
  /** Name of the medical practice */
  practiceName: string;
  
  /** Contact's first name */
  firstName: string;
  
  /** Contact's last name */
  lastName: string;
  
  /** Contact's role in the medical practice */
  role: ContactRole;
  
  /** Contact's phone number in E.164 format */
  phone: string;
  
  /** Optional extension number for phone system navigation */
  extension: string | null;
  
  /** Contact's email address */
  email: string;
  
  /** Contact's timezone in IANA format (e.g., 'America/New_York') */
  timezone: string;
  
  /** Array of preferred time slots for calls in 24h format (e.g., ['09:00-12:00', '14:00-16:00']) */
  bestTimeToCall: string[];
  
  /** Timestamp of contact creation */
  createdAt: Date;
  
  /** Timestamp of last contact update */
  updatedAt: Date;
}

/**
 * Type definition for contact creation input.
 * Omits auto-generated fields (_id, createdAt, updatedAt) while maintaining required fields.
 */
export type ContactCreateInput = Omit<ContactType, '_id' | 'createdAt' | 'updatedAt'>;

/**
 * Type definition for contact update operations.
 * Makes all fields optional to support partial updates while maintaining type safety.
 */
export type ContactUpdateInput = {
  [K in keyof Omit<ContactType, '_id' | 'createdAt' | 'updatedAt'>]?: ContactType[K];
};

/**
 * Type guard to check if a value is a valid ContactRole
 * @param value - The value to check
 * @returns boolean indicating if the value is a valid ContactRole
 */
export const isContactRole = (value: any): value is ContactRole => {
  return Object.values(ContactRole).includes(value as ContactRole);
};

/**
 * Type for contact search/filter criteria
 * Supports partial matching on relevant fields
 */
export interface ContactSearchCriteria {
  practiceName?: string;
  firstName?: string;
  lastName?: string;
  role?: ContactRole;
  phone?: string;
  email?: string;
  timezone?: string;
}

/**
 * Type for contact list sorting options
 */
export interface ContactSortOptions {
  field: keyof Omit<ContactType, '_id'>;
  order: 'asc' | 'desc';
}

/**
 * Type for paginated contact list responses
 */
export interface PaginatedContactResponse {
  contacts: ContactType[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}