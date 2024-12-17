import { Schema, Types } from 'mongoose'; // ^7.0.0
import { CampaignStatus } from '../../types/campaign.types';
import { CallOutcome } from '../../types/call-record.types';

/**
 * MongoDB schema definition for campaign documents.
 * Implements comprehensive campaign tracking with enhanced validation and indexing.
 */
const CampaignSchema = new Schema({
  // Core Fields
  contactId: {
    type: Types.ObjectId,
    required: [true, 'Contact ID is required'],
    ref: 'Contact',
    index: true
  },

  status: {
    type: String,
    enum: Object.values(CampaignStatus),
    required: [true, 'Campaign status is required'],
    default: CampaignStatus.PENDING,
    validate: {
      validator: function(this: any, status: CampaignStatus) {
        if (this.isNew) return status === CampaignStatus.PENDING;
        return validateStatusTransition(this.status, status);
      },
      message: 'Invalid campaign status transition'
    }
  },

  messageHistory: {
    type: [{
      timestamp: {
        type: Date,
        required: true,
        default: Date.now
      },
      message: {
        type: String,
        required: true,
        maxlength: [2000, 'Message cannot exceed 2000 characters']
      },
      type: {
        type: String,
        required: true,
        enum: ['AGENT', 'CONTACT', 'SYSTEM']
      },
      metadata: {
        type: Map,
        of: Schema.Types.Mixed,
        default: null
      }
    }],
    default: [],
    validate: {
      validator: function(messages: any[]) {
        return messages.length <= 1000; // Limit message history size
      },
      message: 'Message history cannot exceed 1000 entries'
    }
  },

  lastCompletedStep: {
    type: Number,
    required: true,
    default: 0,
    min: [0, 'Step number cannot be negative'],
    validate: {
      validator: function(step: number) {
        return Number.isInteger(step);
      },
      message: 'Step must be an integer'
    }
  },

  lastCallOutcome: {
    type: String,
    enum: Object.values(CallOutcome),
    sparse: true,
    index: true
  },

  lastCallDate: {
    type: Date,
    index: true
  },

  nextCallDate: {
    type: Date,
    sparse: true,
    validate: {
      validator: function(this: any, date: Date) {
        if (!date) return true;
        return date > new Date();
      },
      message: 'Next call date must be in the future'
    }
  },

  threadId: {
    type: String,
    required: true,
    unique: true,
    validate: {
      validator: function(id: string) {
        return /^thread_[a-zA-Z0-9]{24}$/.test(id);
      },
      message: 'Invalid OpenAI thread ID format'
    }
  }
}, {
  timestamps: true,
  collection: 'campaigns',
  versionKey: false,
  validateBeforeSave: true,
  strict: true
});

// Compound index for efficient campaign querying
CampaignSchema.index({ status: 1, nextCallDate: 1 }, { background: true });

/**
 * Validates campaign status transitions based on state machine rules
 */
function validateStatusTransition(oldStatus: CampaignStatus, newStatus: CampaignStatus): boolean {
  const validTransitions = {
    [CampaignStatus.PENDING]: [CampaignStatus.IN_PROGRESS, CampaignStatus.FAILED],
    [CampaignStatus.IN_PROGRESS]: [CampaignStatus.COMPLETED, CampaignStatus.FAILED],
    [CampaignStatus.COMPLETED]: [], // Terminal state
    [CampaignStatus.FAILED]: []     // Terminal state
  };

  return validTransitions[oldStatus]?.includes(newStatus) || false;
}

/**
 * Pre-save middleware for campaign document validation and cleanup
 */
CampaignSchema.pre('save', async function(next) {
  // Set timestamps
  if (this.isNew) {
    this.createdAt = new Date();
  }
  this.updatedAt = new Date();

  // Validate status transitions
  if (this.isModified('status')) {
    const isValid = validateStatusTransition(this.status, this.get('status'));
    if (!isValid) {
      next(new Error('Invalid status transition'));
      return;
    }
  }

  // Validate and trim message content
  if (this.isModified('messageHistory')) {
    this.messageHistory = this.messageHistory.map((msg: any) => ({
      ...msg,
      message: msg.message.trim()
    }));
  }

  next();
});

/**
 * Ensure proper cleanup when campaign reaches terminal state
 */
CampaignSchema.pre('save', function(next) {
  if (this.isModified('status') && 
      [CampaignStatus.COMPLETED, CampaignStatus.FAILED].includes(this.status)) {
    this.nextCallDate = null; // Clear next call date for terminal states
  }
  next();
});

export default CampaignSchema;