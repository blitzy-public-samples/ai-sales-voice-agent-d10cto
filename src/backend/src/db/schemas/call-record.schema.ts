import { Schema, Types } from 'mongoose'; // v7.0.0
import { CallOutcome } from '../../types/call-record.types';

/**
 * MongoDB schema for call records in the DocShield AI Voice Agent system
 * Implements requirements for call recording management, state tracking, and data security
 * 
 * @see Technical Specifications/Appendices/A.3 Call Recording Format
 * @see Technical Specifications/Appendices/D.2 Voice Agent State Machine
 * @see Technical Specifications/Section 7.2/Data Classification
 */
export const CallRecordSchema = new Schema({
  // Reference Fields
  campaignId: {
    type: Types.ObjectId,
    required: true,
    ref: 'Campaign',
    index: true,
    description: 'Reference to parent campaign'
  },

  // Secure Storage URLs
  transcriptUrl: {
    type: String,
    required: true,
    validate: {
      validator: (v: string) => v.startsWith('https://') && v.includes('s3.amazonaws.com'),
      message: 'Transcript URL must be a valid S3 HTTPS URL'
    },
    description: 'S3 URL to securely stored call transcript'
  },
  recordingUrl: {
    type: String,
    required: true,
    validate: {
      validator: (v: string) => v.startsWith('https://') && v.includes('s3.amazonaws.com'),
      message: 'Recording URL must be a valid S3 HTTPS URL'
    },
    description: 'S3 URL to securely stored audio recording'
  },

  // Call Metadata
  callTime: {
    type: Date,
    required: true,
    index: true,
    description: 'Timestamp when call was initiated'
  },
  duration: {
    type: Number,
    required: true,
    min: [0, 'Duration cannot be negative'],
    description: 'Call duration in seconds'
  },
  outcome: {
    type: String,
    required: true,
    enum: Object.values(CallOutcome),
    index: true,
    description: 'Final outcome of the call based on state machine'
  },
  declineReason: {
    type: String,
    required: false,
    default: null,
    description: 'Reason provided when prospect declines (optional)'
  },

  // Audio Specifications
  audioFormat: {
    type: String,
    required: true,
    enum: ['WAV', 'MP3'],
    default: 'WAV',
    description: 'Audio file format specification'
  },
  channels: {
    type: Number,
    required: true,
    enum: [1, 2],
    default: 2,
    description: 'Number of audio channels (2 for dual agent/recipient)'
  },
  sampleRate: {
    type: Number,
    required: true,
    default: 48000,
    validate: {
      validator: (v: number) => v === 48000,
      message: 'Sample rate must be 48kHz'
    },
    description: 'Audio sample rate in Hz'
  },
  bitDepth: {
    type: Number,
    required: true,
    default: 16,
    validate: {
      validator: (v: number) => v === 16,
      message: 'Bit depth must be 16-bit'
    },
    description: 'Audio bit depth specification'
  },

  // Timestamps
  createdAt: {
    type: Date,
    required: true,
    default: Date.now,
    description: 'Record creation timestamp'
  },
  updatedAt: {
    type: Date,
    required: true,
    default: Date.now,
    description: 'Record last update timestamp'
  }
}, {
  // Schema Options
  timestamps: true, // Enables automatic timestamp management
  collection: 'callRecords',
  versionKey: false,
  
  // Index Options
  autoIndex: true // Enable automatic index creation
});

// Create compound indexes for common queries
CallRecordSchema.index({ campaignId: 1, callTime: -1 }, { background: true });
CallRecordSchema.index({ outcome: 1, callTime: -1 }, { background: true });

// Pre-save middleware to ensure timestamps are set
CallRecordSchema.pre('save', function(next) {
  if (this.isNew) {
    this.createdAt = new Date();
  }
  this.updatedAt = new Date();
  next();
});

export default CallRecordSchema;