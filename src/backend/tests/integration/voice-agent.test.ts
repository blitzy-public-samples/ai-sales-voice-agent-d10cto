import { describe, test, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { VoiceAgentService } from '../../src/services/voice-agent.service';
import { LiveKitService } from '../../src/integrations/livekit/livekit.service';
import { OpenAIService } from '../../src/integrations/openai/openai.service';
import { CircuitBreaker } from '../../lib/circuit-breaker';
import { ConversationState } from '../../src/integrations/openai/types';
import { CallOutcome } from '../../src/types';
import { logger } from '../../lib/logger';

// Test constants
const TEST_TIMEOUT = 30000;
const VOICE_QUALITY_THRESHOLD = 8.0;
const CALL_COMPLETION_THRESHOLD = 0.95;
const MEETING_BOOKING_THRESHOLD = 0.15;

// Test contact data
const TEST_CONTACT = {
  name: 'Test Medical Practice',
  type: 'medical',
  size: 'medium',
  decisionMaker: 'Dr. Test',
  phone: '+1234567890',
  extension: '123'
};

describe('VoiceAgentService Integration Tests', () => {
  let voiceAgent: VoiceAgentService;
  let livekitService: LiveKitService;
  let openaiService: OpenAIService;
  let circuitBreaker: CircuitBreaker;
  let completedCalls: number = 0;
  let humanReachedCalls: number = 0;
  let meetingsScheduled: number = 0;
  let voiceQualityScores: number[] = [];

  beforeAll(async () => {
    // Initialize circuit breaker
    circuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      resetTimeout: 30000,
      monitoredServices: ['livekit', 'openai'],
      retryStrategy: {
        maxRetries: 3,
        backoffType: 'exponential',
        baseDelay: 1000,
        maxDelay: 8000,
        jitter: true
      }
    });

    // Initialize services
    livekitService = new LiveKitService();
    openaiService = new OpenAIService({
      model: 'tts-1-hd',
      voice: 'alloy',
      temperature: 0.7,
      maxTokens: 150
    });

    // Initialize voice agent
    voiceAgent = new VoiceAgentService(
      livekitService,
      openaiService,
      circuitBreaker
    );

    // Setup test metrics collection
    jest.spyOn(livekitService, 'getCallMetrics');
    jest.spyOn(openaiService, 'synthesizeSpeech');
  });

  afterAll(async () => {
    // Cleanup resources
    voiceAgent.cleanup();
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  describe('Call Initialization and Connection', () => {
    test('should successfully initialize and connect calls', async () => {
      const callAttempts = 10;
      let successfulConnections = 0;

      for (let i = 0; i < callAttempts; i++) {
        try {
          const connected = await voiceAgent.startCall(
            TEST_CONTACT.phone,
            TEST_CONTACT
          );

          if (connected) {
            successfulConnections++;
            const metrics = await livekitService.getCallMetrics();
            expect(metrics.latency).toBeLessThan(1500);
          }

          await voiceAgent.endCall();
        } catch (error) {
          logger.error('Call initialization failed', { error });
        }
      }

      const connectionRate = successfulConnections / callAttempts;
      expect(connectionRate).toBeGreaterThanOrEqual(CALL_COMPLETION_THRESHOLD);
    }, TEST_TIMEOUT);
  });

  describe('Phone Tree Navigation', () => {
    test('should successfully navigate phone menus', async () => {
      const navigationAttempts = 5;
      let successfulNavigations = 0;

      for (let i = 0; i < navigationAttempts; i++) {
        try {
          await voiceAgent.startCall(TEST_CONTACT.phone, TEST_CONTACT);
          
          // Mock phone tree navigation sequence
          const navigationResult = await voiceAgent['navigatePhoneTree']([
            '1', // Main menu
            TEST_CONTACT.extension, // Extension
            '0' // Operator/human
          ]);

          if (navigationResult) {
            successfulNavigations++;
            humanReachedCalls++;
          }

          await voiceAgent.endCall();
        } catch (error) {
          logger.error('Phone tree navigation failed', { error });
        }
      }

      const navigationSuccessRate = successfulNavigations / navigationAttempts;
      expect(navigationSuccessRate).toBeGreaterThanOrEqual(0.9);
    }, TEST_TIMEOUT);
  });

  describe('Conversation Management', () => {
    test('should conduct natural conversations with quality voice', async () => {
      const conversationAttempts = 5;

      for (let i = 0; i < conversationAttempts; i++) {
        try {
          await voiceAgent.startCall(TEST_CONTACT.phone, TEST_CONTACT);

          // Simulate conversation flow
          const responses = [
            'Hello, this is Dr. Test speaking',
            'Yes, I\'m interested in learning more',
            'What are your rates?',
            'That sounds reasonable',
            'Yes, I'd like to schedule a meeting'
          ];

          for (const response of responses) {
            const voiceResponse = await openaiService.synthesizeSpeech(response);
            const metrics = await livekitService.getCallMetrics();
            
            voiceQualityScores.push(metrics.audioQualityScore);
            
            // Process conversation
            const result = await voiceAgent['processConversation'](
              Buffer.from(response)
            );
            
            expect(result).toBeDefined();
          }

          completedCalls++;
          await voiceAgent.endCall();
        } catch (error) {
          logger.error('Conversation test failed', { error });
        }
      }

      const averageQualityScore = voiceQualityScores.reduce((a, b) => a + b, 0) / voiceQualityScores.length;
      expect(averageQualityScore).toBeGreaterThanOrEqual(VOICE_QUALITY_THRESHOLD);
    }, TEST_TIMEOUT);
  });

  describe('Meeting Scheduling', () => {
    test('should successfully schedule meetings when opportunity arises', async () => {
      const schedulingAttempts = 20;

      for (let i = 0; i < schedulingAttempts; i++) {
        try {
          await voiceAgent.startCall(TEST_CONTACT.phone, TEST_CONTACT);

          // Simulate positive conversation flow
          await voiceAgent['updateState'](ConversationState.SPEAKING);
          await voiceAgent['updateState'](ConversationState.SCHEDULING_INITIATED);

          // Mock scheduling attempt
          const scheduled = await voiceAgent['scheduleAppointment']({
            date: new Date(Date.now() + 86400000), // Tomorrow
            time: '14:00',
            duration: 30,
            attendees: [TEST_CONTACT.email]
          });

          if (scheduled) {
            meetingsScheduled++;
            await voiceAgent['updateState'](ConversationState.MEETING_CONFIRMED);
          }

          completedCalls++;
          await voiceAgent.endCall();
        } catch (error) {
          logger.error('Meeting scheduling test failed', { error });
        }
      }

      const bookingRate = meetingsScheduled / completedCalls;
      expect(bookingRate).toBeGreaterThanOrEqual(MEETING_BOOKING_THRESHOLD);
    }, TEST_TIMEOUT);
  });

  describe('Performance Metrics', () => {
    test('should meet all performance criteria', () => {
      // Calculate final metrics
      const callCompletionRate = humanReachedCalls / completedCalls;
      const meetingBookingRate = meetingsScheduled / completedCalls;
      const averageVoiceQuality = voiceQualityScores.reduce((a, b) => a + b, 0) / voiceQualityScores.length;

      // Log results
      logger.info('Performance test results', {
        callCompletionRate,
        meetingBookingRate,
        averageVoiceQuality,
        totalCalls: completedCalls,
        humanReached: humanReachedCalls,
        meetingsScheduled
      });

      // Verify against requirements
      expect(callCompletionRate).toBeGreaterThanOrEqual(CALL_COMPLETION_THRESHOLD);
      expect(meetingBookingRate).toBeGreaterThanOrEqual(MEETING_BOOKING_THRESHOLD);
      expect(averageVoiceQuality).toBeGreaterThanOrEqual(VOICE_QUALITY_THRESHOLD);
    });
  });
});