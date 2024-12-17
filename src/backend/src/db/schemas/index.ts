/**
 * @fileoverview MongoDB schema aggregation for DocShield AI Voice Agent system.
 * Centralizes and exports all database schema definitions with comprehensive validation.
 * 
 * @see Technical Specifications/5.2 Database Schema Design
 * @version 1.0.0
 */

import { Schema } from 'mongoose'; // ^7.0.0
import CampaignSchema from './campaign.schema';
import CallRecordSchema from './call-record.schema';
import { ContactSchema } from './contact.schema';

/**
 * Validates schema structure and configuration
 * @param schema Mongoose schema to validate
 * @param name Schema name for error reporting
 * @throws Error if schema validation fails
 */
const validateSchema = (schema: Schema, name: string): void => {
  if (!schema || !(schema instanceof Schema)) {
    throw new Error(`Invalid schema: ${name} is not a valid Mongoose schema`);
  }

  // Verify schema has timestamps enabled
  if (!schema.options.timestamps) {
    throw new Error(`Schema validation failed: ${name} must have timestamps enabled`);
  }

  // Verify schema has proper collection name
  if (!schema.options.collection) {
    throw new Error(`Schema validation failed: ${name} must specify a collection name`);
  }

  // Verify schema has version key disabled
  if (schema.options.versionKey !== false) {
    throw new Error(`Schema validation failed: ${name} must have versionKey disabled`);
  }
}

/**
 * Validates all schemas meet system requirements
 * @throws Error if any schema fails validation
 */
const validateSchemas = (): void => {
  try {
    validateSchema(CampaignSchema, 'Campaign');
    validateSchema(CallRecordSchema, 'CallRecord');
    validateSchema(ContactSchema, 'Contact');
  } catch (error) {
    throw new Error(`Schema validation failed: ${error.message}`);
  }
}

// Perform schema validation on module load
validateSchemas();

// Export schemas with performance monitoring
const monitoredExport = <T extends Schema>(schema: T, name: string): T => {
  const startTime = Date.now();
  
  // Add performance monitoring
  schema.pre('save', function(next) {
    const modelCreationTime = Date.now() - startTime;
    // Log model creation time to LogTail
    console.info(`${name} model creation time: ${modelCreationTime}ms`);
    next();
  });

  return schema;
};

// Export all schemas with monitoring
export const Campaign = monitoredExport(CampaignSchema, 'Campaign');
export const CallRecord = monitoredExport(CallRecordSchema, 'CallRecord');
export const Contact = monitoredExport(ContactSchema, 'Contact');

// Default export for convenience
export default {
  Campaign,
  CallRecord,
  Contact
};

/**
 * Schema version information
 * @constant {string}
 */
export const SCHEMA_VERSION = '1.0.0';

/**
 * Schema validation configuration
 * @constant {Object}
 */
export const SCHEMA_VALIDATION = {
  enabled: true,
  strict: true,
  throwOnError: true
} as const;