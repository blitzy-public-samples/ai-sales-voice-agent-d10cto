import { jest } from '@jest/globals';
import { VoiceAgentStateMachine, VoiceAgentState } from '../../../src/worker/state-machine';
import { VoiceAgentService } from '../../../src/services/voice-agent.service';
import { CallOutcome } from '../../../src/types/call-record.types';
import { logger } from '../../../src/lib/logger';

// Mock dependencies
jest.mock('../../../src/services/voice-agent.service');
jest.mock('../../../src/lib/logger');

describe('VoiceAgentStateMachine', () => {
  let stateMachine: VoiceAgentStateMachine;
  let mockVoiceAgentService: jest.Mocked<VoiceAgentService>;
  const mockLogger = logger;

  // Test constants
  const TEST_PHONE = '+1234567890';
  const TEST_CONTACT = {
    firstName: 'John',
    lastName: 'Doe',
    practiceName: 'Test Medical'
  };
  const TEST_TIMEOUT = 5000;
  const TEST_RETRY_ATTEMPTS = 3;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Initialize mock voice agent service
    mockVoiceAgentService = {
      startCall: jest.fn(),
      handlePhoneTree: jest.fn(),
      conductConversation: jest.fn(),
      scheduleAppointment: jest.fn(),
      endCall: jest.fn(),
      detectVoicemail: jest.fn(),
      leaveVoicemail: jest.fn()
    } as jest.Mocked<VoiceAgentService>;

    // Create fresh state machine instance
    stateMachine = new VoiceAgentStateMachine(mockVoiceAgentService, mockLogger);
  });

  describe('State Transitions', () => {
    it('should follow correct state sequence for successful call with meeting scheduled', async () => {
      // Mock successful service responses
      mockVoiceAgentService.startCall.mockResolvedValue(true);
      mockVoiceAgentService.handlePhoneTree.mockResolvedValue(true);
      mockVoiceAgentService.conductConversation.mockResolvedValue({ 
        scheduleRequested: true 
      });
      mockVoiceAgentService.scheduleAppointment.mockResolvedValue({ 
        success: true 
      });

      // Start state machine
      const result = await stateMachine.start(TEST_PHONE, TEST_CONTACT);

      // Verify state transitions
      const history = stateMachine.getStateHistory();
      expect(history.map(entry => entry.toState)).toEqual([
        VoiceAgentState.DIALING,
        VoiceAgentState.NAVIGATING_MENU,
        VoiceAgentState.SPEAKING,
        VoiceAgentState.SCHEDULING,
        VoiceAgentState.CLOSING,
        VoiceAgentState.ENDED
      ]);

      // Verify final outcome
      expect(result).toBe(CallOutcome.MEETING_SCHEDULED);
    });

    it('should handle voicemail detection and leave message', async () => {
      // Mock voicemail detection
      mockVoiceAgentService.startCall.mockResolvedValue(true);
      mockVoiceAgentService.detectVoicemail.mockResolvedValue(true);
      mockVoiceAgentService.leaveVoicemail.mockResolvedValue(true);

      const result = await stateMachine.start(TEST_PHONE, TEST_CONTACT);

      const history = stateMachine.getStateHistory();
      expect(history.map(entry => entry.toState)).toEqual([
        VoiceAgentState.DIALING,
        VoiceAgentState.LEAVING_VOICEMAIL,
        VoiceAgentState.ENDED
      ]);

      expect(result).toBe(CallOutcome.VOICEMAIL);
    });

    it('should handle declined meeting scenario', async () => {
      mockVoiceAgentService.startCall.mockResolvedValue(true);
      mockVoiceAgentService.handlePhoneTree.mockResolvedValue(true);
      mockVoiceAgentService.conductConversation.mockResolvedValue({
        scheduleRequested: false
      });

      const result = await stateMachine.start(TEST_PHONE, TEST_CONTACT);

      const history = stateMachine.getStateHistory();
      expect(history.map(entry => entry.toState)).toEqual([
        VoiceAgentState.DIALING,
        VoiceAgentState.NAVIGATING_MENU,
        VoiceAgentState.SPEAKING,
        VoiceAgentState.CLOSING,
        VoiceAgentState.ENDED
      ]);

      expect(result).toBe(CallOutcome.DECLINED);
    });
  });

  describe('Error Handling', () => {
    it('should retry on API timeout errors', async () => {
      // Mock API timeout error
      const timeoutError = new Error('API Timeout');
      mockVoiceAgentService.startCall
        .mockRejectedValueOnce(timeoutError)
        .mockRejectedValueOnce(timeoutError)
        .mockResolvedValueOnce(true);

      await stateMachine.start(TEST_PHONE, TEST_CONTACT);

      // Verify retry attempts
      expect(mockVoiceAgentService.startCall).toHaveBeenCalledTimes(3);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Retrying operation'),
        expect.any(Object)
      );
    });

    it('should transition to FAILED state after max retries', async () => {
      // Mock persistent failure
      const networkError = new Error('Network Error');
      mockVoiceAgentService.startCall.mockRejectedValue(networkError);

      const result = await stateMachine.start(TEST_PHONE, TEST_CONTACT);

      // Verify failure state
      expect(stateMachine.getCurrentState()).toBe(VoiceAgentState.FAILED);
      expect(result).toBe(CallOutcome.FAILED);
      expect(mockVoiceAgentService.startCall).toHaveBeenCalledTimes(TEST_RETRY_ATTEMPTS);
    });

    it('should handle voice drop during conversation', async () => {
      mockVoiceAgentService.startCall.mockResolvedValue(true);
      mockVoiceAgentService.handlePhoneTree.mockResolvedValue(true);
      
      // Mock voice drop during conversation
      const voiceDropError = new Error('Voice Connection Lost');
      mockVoiceAgentService.conductConversation.mockRejectedValue(voiceDropError);

      const result = await stateMachine.start(TEST_PHONE, TEST_CONTACT);

      expect(result).toBe(CallOutcome.FAILED);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Voice connection lost'),
        expect.any(Object)
      );
    });
  });

  describe('Event Emissions', () => {
    it('should emit state change events', async () => {
      const stateChangeHandler = jest.fn();
      stateMachine.on('stateChange', stateChangeHandler);

      mockVoiceAgentService.startCall.mockResolvedValue(true);
      mockVoiceAgentService.handlePhoneTree.mockResolvedValue(true);
      mockVoiceAgentService.conductConversation.mockResolvedValue({
        scheduleRequested: true
      });
      mockVoiceAgentService.scheduleAppointment.mockResolvedValue({
        success: true
      });

      await stateMachine.start(TEST_PHONE, TEST_CONTACT);

      // Verify event emissions
      expect(stateChangeHandler).toHaveBeenCalledTimes(6); // All state transitions
      expect(stateChangeHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          fromState: expect.any(String),
          toState: expect.any(String),
          timestamp: expect.any(Date)
        })
      );
    });

    it('should emit error events', async () => {
      const errorHandler = jest.fn();
      stateMachine.on('error', errorHandler);

      const error = new Error('Test Error');
      mockVoiceAgentService.startCall.mockRejectedValue(error);

      await stateMachine.start(TEST_PHONE, TEST_CONTACT);

      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          error,
          state: VoiceAgentState.INITIALIZING
        })
      );
    });
  });

  describe('State History', () => {
    it('should maintain accurate state history', async () => {
      mockVoiceAgentService.startCall.mockResolvedValue(true);
      mockVoiceAgentService.handlePhoneTree.mockResolvedValue(true);
      mockVoiceAgentService.conductConversation.mockResolvedValue({
        scheduleRequested: true
      });
      mockVoiceAgentService.scheduleAppointment.mockResolvedValue({
        success: true
      });

      await stateMachine.start(TEST_PHONE, TEST_CONTACT);

      const history = stateMachine.getStateHistory();
      
      // Verify history entries
      expect(history).toHaveLength(6);
      history.forEach(entry => {
        expect(entry).toMatchObject({
          fromState: expect.any(String),
          toState: expect.any(String),
          timestamp: expect.any(Date),
          duration: expect.any(Number)
        });
      });

      // Verify state transition order
      expect(history[0].fromState).toBe(VoiceAgentState.INITIALIZING);
      expect(history[history.length - 1].toState).toBe(VoiceAgentState.ENDED);
    });
  });
});