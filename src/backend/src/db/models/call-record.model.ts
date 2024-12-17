import { model, Model, Query, Types } from 'mongoose'; // v7.0.0
import CallRecordSchema from '../schemas/call-record.schema';
import { CallRecordType, CallOutcome } from '../../types/call-record.types';

/**
 * Interface for audit log entries to track call record access and modifications
 */
interface AuditLog {
  timestamp: Date;
  action: string;
  userId: string;
  details: string;
}

/**
 * Interface extending CallRecordType to include audit logging
 */
interface CallRecordDocument extends CallRecordType {
  auditLog: AuditLog[];
}

/**
 * Interface for static methods on the CallRecord model
 */
interface CallRecordModel extends Model<CallRecordDocument> {
  findByCampaignId(campaignId: Types.ObjectId): Promise<CallRecordDocument[]>;
  findByOutcome(outcome: CallOutcome): Promise<CallRecordDocument[]>;
  findByDateRange(startDate: Date, endDate: Date, page?: number): Promise<CallRecordDocument[]>;
  getAuditLog(recordId: Types.ObjectId): Promise<AuditLog[]>;
}

// Add static methods to schema
CallRecordSchema.statics = {
  /**
   * Find all call records for a specific campaign with security validation
   * @param campaignId - ObjectId of the campaign
   * @returns Promise resolving to array of call records
   */
  async findByCampaignId(campaignId: Types.ObjectId): Promise<CallRecordDocument[]> {
    if (!Types.ObjectId.isValid(campaignId)) {
      throw new Error('Invalid campaign ID format');
    }

    const records = await this.find({ campaignId })
      .sort({ callTime: -1 })
      .select('-auditLog') // Exclude audit log from regular queries
      .lean()
      .exec();

    // Add audit log entry for access
    await this.updateMany(
      { campaignId },
      {
        $push: {
          auditLog: {
            timestamp: new Date(),
            action: 'READ',
            userId: 'system', // Replace with actual user ID in production
            details: 'Campaign records accessed'
          }
        }
      }
    );

    return records;
  },

  /**
   * Find all call records with a specific outcome including audit log
   * @param outcome - Enum value from CallOutcome
   * @returns Promise resolving to array of call records
   */
  async findByOutcome(outcome: CallOutcome): Promise<CallRecordDocument[]> {
    if (!Object.values(CallOutcome).includes(outcome)) {
      throw new Error('Invalid call outcome value');
    }

    return this.find({ outcome })
      .sort({ callTime: -1 })
      .select('-auditLog')
      .lean()
      .exec();
  },

  /**
   * Find all call records within a date range with pagination
   * @param startDate - Start of date range
   * @param endDate - End of date range
   * @param page - Optional page number for pagination
   * @returns Promise resolving to array of call records
   */
  async findByDateRange(
    startDate: Date,
    endDate: Date,
    page: number = 1
  ): Promise<CallRecordDocument[]> {
    // Validate date range
    if (startDate >= endDate) {
      throw new Error('Invalid date range');
    }

    const ITEMS_PER_PAGE = 50;
    const skip = (page - 1) * ITEMS_PER_PAGE;

    return this.find({
      callTime: {
        $gte: startDate,
        $lte: endDate
      }
    })
      .sort({ callTime: -1 })
      .skip(skip)
      .limit(ITEMS_PER_PAGE)
      .select('-auditLog')
      .lean()
      .exec();
  },

  /**
   * Retrieve complete audit log for a call record
   * @param recordId - ObjectId of the call record
   * @returns Promise resolving to array of audit log entries
   */
  async getAuditLog(recordId: Types.ObjectId): Promise<AuditLog[]> {
    if (!Types.ObjectId.isValid(recordId)) {
      throw new Error('Invalid record ID format');
    }

    const record = await this.findById(recordId)
      .select('auditLog')
      .lean()
      .exec();

    if (!record) {
      throw new Error('Call record not found');
    }

    // Add audit log entry for audit log access
    await this.updateOne(
      { _id: recordId },
      {
        $push: {
          auditLog: {
            timestamp: new Date(),
            action: 'AUDIT_ACCESS',
            userId: 'system', // Replace with actual user ID in production
            details: 'Audit log accessed'
          }
        }
      }
    );

    return record.auditLog;
  }
};

// Add query middleware for security filtering
CallRecordSchema.pre(/^find/, function(this: Query<any, any>) {
  // Exclude sensitive fields unless explicitly requested
  if (!this.getOptions().includeSecure) {
    this.select('-transcriptUrl -recordingUrl');
  }
});

// Create and export the model
const CallRecordModel = model<CallRecordDocument, CallRecordModel>('CallRecord', CallRecordSchema);

export default CallRecordModel;