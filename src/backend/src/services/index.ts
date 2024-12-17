/**
 * @fileoverview Barrel file exporting all service classes for the DocShield AI Voice Agent system.
 * Provides centralized access to campaign, call record, contact, and voice agent services.
 * 
 * @version 1.0.0
 * @license MIT
 */

// Import service classes
import { CampaignService } from './campaign.service';
import { CallRecordService } from './call-record.service';
import { ContactService } from './contact.service';
import { VoiceAgentService } from './voice-agent.service';

/**
 * Validates that all required services are properly initialized
 * @param services Record of service instances to validate
 * @returns boolean indicating if all services are valid
 */
export const validateServiceInitialization = (services: Record<string, any>): boolean => {
  // Required service names
  const requiredServices = [
    'campaignService',
    'callRecordService',
    'contactService',
    'voiceAgentService'
  ];

  // Required methods for each service
  const requiredMethods = {
    campaignService: [
      'createCampaign',
      'getCampaignById',
      'updateCampaignStatus',
      'addMessageToHistory',
      'updateCallOutcome'
    ],
    callRecordService: [
      'createCallRecord',
      'getCallRecordsByCampaign',
      'getCallRecordsByOutcome',
      'getCallRecordsByDateRange',
      'getSignedRecordingUrl'
    ],
    contactService: [
      'createContact',
      'getContactById',
      'getContactByPhone',
      'updateContact',
      'deleteContact'
    ],
    voiceAgentService: [
      'startCall',
      'handlePhoneTree',
      'conductConversation',
      'scheduleAppointment',
      'endCall'
    ]
  };

  // Check if all required services exist
  const hasAllServices = requiredServices.every(serviceName => 
    services[serviceName] && typeof services[serviceName] === 'object'
  );

  if (!hasAllServices) {
    return false;
  }

  // Check if all required methods exist for each service
  return requiredServices.every(serviceName => {
    const service = services[serviceName];
    return requiredMethods[serviceName as keyof typeof requiredMethods].every(
      methodName => typeof service[methodName] === 'function'
    );
  });
};

// Export service classes
export {
  CampaignService,
  CallRecordService,
  ContactService,
  VoiceAgentService
};

// Export default service instances
export { campaignService as default } from './campaign.service';
export { default as callRecordService } from './call-record.service';
export { default as contactService } from './contact.service';
export { default as voiceAgentService } from './voice-agent.service';

/**
 * Type definitions for service initialization options
 */
export interface ServiceInitOptions {
  maxRetries?: number;
  backoffMs?: number;
  circuitBreakerConfig?: {
    failureThreshold: number;
    resetTimeout: number;
    monitoredServices: string[];
  };
  errorMetricsEnabled?: boolean;
}

/**
 * @remarks
 * This barrel file provides centralized access to all service classes and instances
 * used in the DocShield AI Voice Agent system. It includes:
 * 
 * - Campaign management services
 * - Call record tracking services
 * - Contact management services
 * - Voice agent conversation services
 * 
 * The validateServiceInitialization helper ensures all required services are
 * properly initialized with their necessary methods before system startup.
 */