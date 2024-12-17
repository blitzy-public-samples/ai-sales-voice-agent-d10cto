import { describe, beforeEach, afterEach, test, expect, jest } from '@jest/globals';
import { VoiceAgentService } from '../../../src/services/voice-agent.service';
import { LiveKitService } from '../../../src/integrations/livekit/livekit.service';
import { OpenAIService } from '../../../src/integrations/openai/openai.service';
import { CallOutcome } from '../../../src/types/call-record.types';
import { ConversationState } from '../../../src/integrations/openai/types';
import { CircuitBreaker } from '../../../src/lib/circuit-breaker';

// Test constants
const TEST_PHONE_NUMBER = '+1234567890';
const TEST_CONTACT_INFO = {
  practiceName: 'Test Medical Practice',
  firstName: 'John',
  lastName: 'Doe',
  role: 'PRACTICE_ADMIN'
};
const MOCK_AUDIO_BUFFER = Buffer.from('test-audio-data');
const VOICE_QUALITY_THRESHOLD = 8.0;

describe('VoiceAgentService', () => {
  let voiceAgent: VoiceAgentService;
  let livekitService: jest.Mocked<LiveKitService>;
  let openaiService: jest.Mocked<OpenAIService>;
  let circuitBreaker: jest.Mocked<CircuitBreaker>;

  beforeEach(() => {
    // Mock LiveKit service
    livekitService = {
      initializeCall: jest.fn(),
      endCall: jest.fn(),
      getCallMetrics: jest.fn(),
      adjustVoiceParameters: jest.fn()
    } as any;

    // Mock OpenAI service
    openaiService = {
      synthesizeSpeech: jest.fn(),
      transcribeAudio: jest.fn(),
      generateResponse: jest.fn(),
      getSalesCoachGuidance: jest.fn()
    } as any;

    // Mock circuit breaker
    circuitBreaker = {
      executeFunction: jest.fn(),
      getState: jest.fn()
    } as any;

    // Initialize voice agent service
    voiceAgent = new VoiceAgentService(
      livekitService,
      openaiService,
      circuitBreaker
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
    voiceAgent.cleanup();
  });

  describe('Call Management', () => {
    test('should successfully initialize outbound call', async () => {
      // Setup
      livekitService.initializeCall.mockResolvedValue(true);
      livekitService.getCallMetrics.mockResolvedValue({
        latency: 100,
        packetLoss: 0.01,
        audioQualityScore: 9.0,
        jitter: 20,
        bitrate: 32000,
        timestamp: new Date()
      });

      // Execute
      const result = await voiceAgent.startCall(TEST_PHONE_NUMBER, TEST_CONTACT_INFO);

      // Assert
      expect(result).toBe(true);
      expect(livekitService.initializeCall).toHaveBeenCalledWith(TEST_PHONE_NUMBER);
      expect(livekitService.getCallMetrics).toHaveBeenCalled();
    });

    test('should handle call initialization failure', async () => {
      // Setup
      livekitService.initializeCall.mockRejectedValue(new Error('Connection failed'));

      // Execute & Assert
      await expect(
        voiceAgent.startCall(TEST_PHONE_NUMBER, TEST_CONTACT_INFO)
      ).rejects.toThrow('Connection failed');
    });

    test('should monitor voice quality during call', async () => {
      // Setup
      const mockMetrics = {
        latency: 100,
        packetLoss: 0.01,
        audioQualityScore: 9.0,
        jitter: 20,
        bitrate: 32000,
        timestamp: new Date()
      };
      livekitService.getCallMetrics.mockResolvedValue(mockMetrics);

      // Execute
      await voiceAgent['monitorVoiceQuality']({} as any);

      // Assert
      expect(livekitService.getCallMetrics).toHaveBeenCalled();
      expect(livekitService.adjustVoiceParameters).not.toHaveBeenCalled();
    });
  });

  describe('Phone Tree Navigation', () => {
    test('should successfully navigate phone menu', async () => {
      // Setup
      const menuOptions = ['2', '1', '3'];
      livekitService.sendDTMF = jest.fn().mockResolvedValue(true);

      // Execute
      await voiceAgent['navigatePhoneTree'](menuOptions);

      // Assert
      expect(livekitService.sendDTMF).toHaveBeenCalledTimes(menuOptions.length);
      menuOptions.forEach(option => {
        expect(livekitService.sendDTMF).toHaveBeenCalledWith(option);
      });
    });

    test('should handle navigation failure', async () => {
      // Setup
      const menuOptions = ['2', '1', '3'];
      livekitService.sendDTMF = jest.fn().mockRejectedValue(new Error('DTMF failed'));

      // Execute & Assert
      await expect(
        voiceAgent['navigatePhoneTree'](menuOptions)
      ).rejects.toThrow('DTMF failed');
    });
  });

  describe('Conversation Management', () => {
    test('should process conversation with sales coach guidance', async () => {
      // Setup
      const mockTranscript = 'Hello, I am interested in learning more';
      const mockGuidance = {
        guidance: 'Focus on value proposition',
        nextAction: 'Present benefits',
        confidence: 0.9
      };
      const mockResponse = {
        audioContent: MOCK_AUDIO_BUFFER,
        transcript: 'Let me explain our benefits',
        duration: 2.5
      };

      openaiService.transcribeAudio.mockResolvedValue(mockTranscript);
      openaiService.getSalesCoachGuidance.mockResolvedValue(mockGuidance);
      openaiService.generateResponse.mockResolvedValue('Let me explain our benefits');
      openaiService.synthesizeSpeech.mockResolvedValue(mockResponse);

      // Execute
      const result = await voiceAgent['processConversation'](MOCK_AUDIO_BUFFER);

      // Assert
      expect(result).toEqual(mockResponse);
      expect(openaiService.transcribeAudio).toHaveBeenCalledWith(MOCK_AUDIO_BUFFER);
      expect(openaiService.getSalesCoachGuidance).toHaveBeenCalled();
      expect(openaiService.generateResponse).toHaveBeenCalled();
      expect(openaiService.synthesizeSpeech).toHaveBeenCalled();
    });

    test('should handle conversation processing errors', async () => {
      // Setup
      openaiService.transcribeAudio.mockRejectedValue(new Error('Transcription failed'));

      // Execute & Assert
      await expect(
        voiceAgent['processConversation'](MOCK_AUDIO_BUFFER)
      ).rejects.toThrow('Transcription failed');
    });
  });

  describe('Meeting Scheduling', () => {
    test('should successfully schedule meeting', async () => {
      // Setup
      const mockResponse = {
        audioContent: MOCK_AUDIO_BUFFER,
        transcript: 'Great, I have scheduled the meeting',
        duration: 2.0
      };
      openaiService.synthesizeSpeech.mockResolvedValue(mockResponse);

      // Execute
      const result = await voiceAgent['scheduleAppointment']({
        date: new Date(),
        time: '14:00',
        duration: 30
      });

      // Assert
      expect(result).toBe(CallOutcome.MEETING_SCHEDULED);
    });

    test('should handle scheduling failures', async () => {
      // Setup
      openaiService.synthesizeSpeech.mockRejectedValue(new Error('Scheduling failed'));

      // Execute & Assert
      await expect(
        voiceAgent['scheduleAppointment']({
          date: new Date(),
          time: '14:00',
          duration: 30
        })
      ).rejects.toThrow('Scheduling failed');
    });
  });

  describe('Error Handling', () => {
    test('should handle retryable errors with circuit breaker', async () => {
      // Setup
      const error = new Error('API timeout');
      circuitBreaker.executeFunction.mockRejectedValue(error);

      // Execute & Assert
      await expect(
        voiceAgent.startCall(TEST_PHONE_NUMBER, TEST_CONTACT_INFO)
      ).rejects.toThrow('API timeout');
      expect(circuitBreaker.executeFunction).toHaveBeenCalled();
    });

    test('should cleanup resources on error', async () => {
      // Setup
      const cleanupSpy = jest.spyOn(voiceAgent, 'cleanup');

      // Execute
      try {
        await voiceAgent.startCall(TEST_PHONE_NUMBER, TEST_CONTACT_INFO);
      } catch (error) {
        // Assert
        expect(cleanupSpy).toHaveBeenCalled();
      }
    });
  });

  describe('State Management', () => {
    test('should track conversation state transitions', async () => {
      // Setup
      const initialState = ConversationState.INITIALIZING;
      
      // Execute
      voiceAgent['updateState'](ConversationState.CALL_INITIATED);
      voiceAgent['updateState'](ConversationState.SPEAKING);

      // Assert
      expect(voiceAgent['currentState']).toBe(ConversationState.SPEAKING);
      expect(voiceAgent['stateHistory']).toContain(ConversationState.CALL_INITIATED);
      expect(voiceAgent['stateHistory']).toContain(ConversationState.SPEAKING);
    });

    test('should maintain state history for context', async () => {
      // Execute
      const states = [
        ConversationState.INITIALIZING,
        ConversationState.CALL_INITIATED,
        ConversationState.SPEAKING,
        ConversationState.SCHEDULING,
        ConversationState.CALL_ENDED
      ];

      states.forEach(state => voiceAgent['updateState'](state));

      // Assert
      expect(voiceAgent['stateHistory'].length).toBe(states.length);
      expect(voiceAgent['stateHistory']).toEqual(states);
    });
  });
});