import { Schema, Document } from 'mongoose'; // ^7.0.0
import { ContactRole } from '../../types/contact.types';

/**
 * Interface extending Document for TypeScript type safety with Mongoose
 */
export interface IContact extends Document {
  practiceName: string;
  firstName: string;
  lastName: string;
  role: ContactRole;
  phone: string;
  extension?: string;
  email: string;
  timezone: string;
  bestTimeToCall: string[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Custom validator for E.164 phone number format
 * Ensures North American numbers only (+1 prefix)
 * @param phone - Phone number to validate
 * @returns boolean indicating if phone number is valid
 */
const validatePhone = (phone: string): boolean => {
  // E.164 format for North American numbers: +1 followed by 10 digits
  const phoneRegex = /^\+1[2-9][0-9]{9}$/;
  
  if (!phoneRegex.test(phone)) {
    return false;
  }

  // Validate area code isn't restricted
  const areaCode = phone.substring(2, 5);
  const invalidAreaCodes = ['000', '555', '911'];
  if (invalidAreaCodes.includes(areaCode)) {
    return false;
  }

  return true;
};

/**
 * Custom validator for email format and domain
 * @param email - Email address to validate
 * @returns boolean indicating if email is valid
 */
const validateEmail = (email: string): boolean => {
  // RFC 5322 compliant email regex
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  
  if (!emailRegex.test(email)) {
    return false;
  }

  // Length constraints
  if (email.length < 5 || email.length > 254) {
    return false;
  }

  // Blacklist common disposable email domains
  const disposableDomains = ['tempmail.com', 'throwaway.com'];
  const domain = email.split('@')[1];
  if (disposableDomains.includes(domain)) {
    return false;
  }

  return true;
};

/**
 * Custom validator for timezone format
 * @param timezone - IANA timezone string to validate
 * @returns boolean indicating if timezone is valid
 */
const validateTimezone = (timezone: string): boolean => {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch (error) {
    return false;
  }
};

/**
 * Custom validator for time slot format
 * @param timeSlot - Time slot string to validate (HH:MM-HH:MM)
 * @returns boolean indicating if time slot format is valid
 */
const validateTimeSlot = (timeSlot: string): boolean => {
  const timeSlotRegex = /^([01][0-9]|2[0-3]):[0-5][0-9]-([01][0-9]|2[0-3]):[0-5][0-9]$/;
  if (!timeSlotRegex.test(timeSlot)) {
    return false;
  }

  const [start, end] = timeSlot.split('-');
  const startMinutes = parseInt(start.split(':')[0]) * 60 + parseInt(start.split(':')[1]);
  const endMinutes = parseInt(end.split(':')[0]) * 60 + parseInt(end.split(':')[1]);

  return endMinutes > startMinutes;
};

/**
 * Mongoose schema definition for medical practice contacts
 */
export const ContactSchema = new Schema<IContact>({
  practiceName: {
    type: String,
    required: [true, 'Practice name is required'],
    trim: true,
    minlength: [2, 'Practice name must be at least 2 characters long'],
    maxlength: [100, 'Practice name cannot exceed 100 characters'],
    index: true
  },
  firstName: {
    type: String,
    required: [true, 'First name is required'],
    trim: true,
    minlength: [2, 'First name must be at least 2 characters long'],
    maxlength: [50, 'First name cannot exceed 50 characters'],
    index: true
  },
  lastName: {
    type: String,
    required: [true, 'Last name is required'],
    trim: true,
    minlength: [2, 'Last name must be at least 2 characters long'],
    maxlength: [50, 'Last name cannot exceed 50 characters'],
    index: true
  },
  role: {
    type: String,
    required: [true, 'Role is required'],
    enum: {
      values: Object.values(ContactRole),
      message: 'Invalid role specified'
    },
    index: true
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    validate: {
      validator: validatePhone,
      message: 'Invalid phone number format. Must be E.164 format (+1XXXXXXXXXX)'
    },
    unique: true,
    index: true
  },
  extension: {
    type: String,
    required: false,
    validate: {
      validator: (ext: string) => !ext || /^\d{1,6}$/.test(ext),
      message: 'Extension must contain only digits and be 6 or fewer characters'
    }
  },
  email: {
    type: String,
    required: [true, 'Email address is required'],
    validate: {
      validator: validateEmail,
      message: 'Invalid email format'
    },
    unique: true,
    lowercase: true,
    trim: true,
    index: true
  },
  timezone: {
    type: String,
    required: [true, 'Timezone is required'],
    validate: {
      validator: validateTimezone,
      message: 'Invalid timezone specified'
    },
    index: true
  },
  bestTimeToCall: {
    type: [String],
    required: [true, 'Best time to call is required'],
    validate: {
      validator: (slots: string[]) => 
        slots.length > 0 && 
        slots.length <= 5 && 
        slots.every(validateTimeSlot),
      message: 'Invalid time slot format. Use HH:MM-HH:MM format'
    }
  }
}, {
  timestamps: true,
  collection: 'contacts',
  versionKey: false,
  
  // Optimize queries with compound indexes
  indexes: [
    // Compound index for name searches
    { firstName: 1, lastName: 1 },
    // Compound index for practice filtering
    { practiceName: 1, role: 1 },
    // Compound index for timezone-based queries
    { timezone: 1, bestTimeToCall: 1 }
  ]
});

// Add text index for full-text search capabilities
ContactSchema.index({
  practiceName: 'text',
  firstName: 'text',
  lastName: 'text'
}, {
  weights: {
    practiceName: 3,
    firstName: 2,
    lastName: 2
  },
  name: 'ContactTextIndex'
});

// Pre-save middleware to standardize phone format
ContactSchema.pre('save', function(next) {
  // Ensure phone number is in E.164 format
  if (this.phone && !this.phone.startsWith('+1')) {
    this.phone = '+1' + this.phone.replace(/\D/g, '');
  }
  next();
});

// Create virtual for full name
ContactSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

// Ensure virtuals are included in JSON serialization
ContactSchema.set('toJSON', {
  virtuals: true,
  transform: (doc, ret) => {
    delete ret.id; // Remove duplicate id field
    return ret;
  }
});

// Add method to check if contact is available at given time
ContactSchema.methods.isAvailable = function(time: Date): boolean {
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
};