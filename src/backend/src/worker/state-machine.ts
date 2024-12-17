import { EventEmitter } from 'events';
import { VoiceAgentService } from '../services/voice-agent.service';
import { CallOutcome } from '../types/call-record.types';
import winston from 'winston';

/**
 * Enum defining all possible states in the voice agent state machine
 */
export enum VoiceAgentState {
  INITIALIZING = 'INITIALIZING',
  DIALING = 'DIALING',
  NAVIGATING_MENU = 'NAVIGATING_MENU',
  SPEAKING = 'SPEAKING',
  SCHEDULING = 'SCHEDULING',
  CLOSING = 'CLOSING',
  LEAVING_VOICEMAIL = 'LEAVING_VOICEMAIL',
  ENDED = 'ENDED',
  FAILED = 'FAILED'
}

/**
 * Interface for state transition history tracking
 */
interface StateHistoryEntry {
  fromState: VoiceAgentState;
  toState: VoiceAgentState;
  timestamp: Date;
  duration: number;
  metadata?: Record<string, any>;
}

/**
 * Interface for state execution context
 */
interface StateContext {
  phoneNumber: string;
  contactInfo: any;
  startTime: Date;
  lastStateChange: Date;
  retryCount: number;
  outcome?: CallOutcome;
  error?: Error;
}

/**
 * Constants for state machine configuration
 */
const STATE_TRANSITION_TIMEOUT_MS = 60000; // 1 minute timeout for state transitions
const MAX_RETRY_ATTEMPTS = 3;
const BACKOFF_BASE_MS = 1000;
const STATE_HISTORY_LIMIT = 100;

/**
 * Implementation of the voice agent state machine with comprehensive monitoring and error handling
 */
export class VoiceAgentStateMachine {
  private currentState: VoiceAgentState;
  private readonly voiceAgent: VoiceAgentService;
  private readonly eventEmitter: EventEmitter;
  private retryCount: number;
  private stateContext: StateContext;
  private readonly stateHistory: StateHistoryEntry[];
  private readonly logger: winston.Logger;

  constructor(voiceAgent: VoiceAgentService, logger: winston.Logger) {
    this.voiceAgent = voiceAgent;
    this.eventEmitter = new EventEmitter();
    this.currentState = VoiceAgentState.INITIALIZING;
    this.retryCount = 0;
    this.stateHistory = [];
    this.logger = logger;
    this.stateContext = this.initializeStateContext();

    this.setupEventListeners();
  }

  /**
   * Starts the state machine execution for a new call
   * @param phoneNumber Target phone number
   * @param contactInfo Contact information for context
   */
  public async start(phoneNumber: string, contactInfo: any): Promise<CallOutcome> {
    try {
      this.logger.info('Starting voice agent state machine', {
        phoneNumber: phoneNumber.replace(/\d/g, '*'),
        state: this.currentState
      });

      // Initialize state context
      this.stateContext = {
        phoneNumber,
        contactInfo,
        startTime: new Date(),
        lastStateChange: new Date(),
        retryCount: 0
      };

      // Begin state machine execution
      let nextState = this.currentState;
      do {
        nextState = await this.executeState();
        if (nextState !== this.currentState) {
          await this.transitionTo(nextState);
        }
      } while (!this.isTerminalState(nextState));

      return this.stateContext.outcome || CallOutcome.FAILED;
    } catch (error) {
      this.logger.error('State machine execution failed', { error });
      await this.transitionTo(VoiceAgentState.FAILED);
      return CallOutcome.FAILED;
    }
  }

  /**
   * Handles transition to a new state with validation and monitoring
   */
  private async transitionTo(newState: VoiceAgentState): Promise<void> {
    const oldState = this.currentState;
    const timestamp = new Date();

    try {
      // Validate state transition
      if (!this.isValidTransition(oldState, newState)) {
        throw new Error(`Invalid state transition from ${oldState} to ${newState}`);
      }

      // Update state tracking
      this.currentState = newState;
      this.stateContext.lastStateChange = timestamp;

      // Record state history
      this.recordStateTransition(oldState, newState, timestamp);

      // Emit state change event
      this.eventEmitter.emit('stateChange', {
        fromState: oldState,
        toState: newState,
        timestamp
      });

      this.logger.info('State transition completed', {
        fromState: oldState,
        toState: newState,
        duration: Date.now() - timestamp.getTime()
      });
    } catch (error) {
      this.logger.error('State transition failed', {
        fromState: oldState,
        toState: newState,
        error
      });
      throw error;
    }
  }

  /**
   * Executes the current state with timeout and error handling
   */
  private async executeState(): Promise<VoiceAgentState> {
    const startTime = Date.now();
    let timeoutHandle: NodeJS.Timeout;

    try {
      // Set up timeout handler
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(`State execution timeout after ${STATE_TRANSITION_TIMEOUT_MS}ms`));
        }, STATE_TRANSITION_TIMEOUT_MS);
      });

      // Execute state-specific logic with timeout
      const stateExecution = this.executeStateLogic();
      const nextState = await Promise.race([stateExecution, timeoutPromise]);

      clearTimeout(timeoutHandle!);
      return nextState;
    } catch (error) {
      this.logger.error('State execution failed', {
        state: this.currentState,
        duration: Date.now() - startTime,
        error
      });

      // Attempt retry if possible
      if (await this.handleRetry(error as Error)) {
        return this.currentState; // Retry same state
      }

      // If retry not possible, transition to failed state
      return VoiceAgentState.FAILED;
    }
  }

  /**
   * Executes logic specific to the current state
   */
  private async executeStateLogic(): Promise<VoiceAgentState> {
    switch (this.currentState) {
      case VoiceAgentState.INITIALIZING:
        const callStarted = await this.voiceAgent.startCall(
          this.stateContext.phoneNumber,
          this.stateContext.contactInfo
        );
        return callStarted ? VoiceAgentState.DIALING : VoiceAgentState.FAILED;

      case VoiceAgentState.DIALING:
        // Handle phone tree navigation if detected
        const menuDetected = await this.voiceAgent.handlePhoneTree();
        return menuDetected ? VoiceAgentState.NAVIGATING_MENU : VoiceAgentState.SPEAKING;

      case VoiceAgentState.NAVIGATING_MENU:
        const navigationSuccess = await this.voiceAgent.handlePhoneTree();
        return navigationSuccess ? VoiceAgentState.SPEAKING : VoiceAgentState.FAILED;

      case VoiceAgentState.SPEAKING:
        const conversationResult = await this.voiceAgent.conductConversation();
        if (conversationResult.scheduleRequested) {
          return VoiceAgentState.SCHEDULING;
        }
        return VoiceAgentState.CLOSING;

      case VoiceAgentState.SCHEDULING:
        const schedulingResult = await this.voiceAgent.scheduleAppointment();
        this.stateContext.outcome = schedulingResult.success ? 
          CallOutcome.MEETING_SCHEDULED : CallOutcome.DECLINED;
        return VoiceAgentState.CLOSING;

      case VoiceAgentState.CLOSING:
        await this.voiceAgent.endCall();
        return VoiceAgentState.ENDED;

      case VoiceAgentState.LEAVING_VOICEMAIL:
        await this.voiceAgent.endCall();
        this.stateContext.outcome = CallOutcome.VOICEMAIL;
        return VoiceAgentState.ENDED;

      default:
        return VoiceAgentState.FAILED;
    }
  }

  /**
   * Handles retry logic for failed state executions
   */
  private async handleRetry(error: Error): Promise<boolean> {
    if (this.retryCount >= MAX_RETRY_ATTEMPTS) {
      return false;
    }

    this.retryCount++;
    const backoffDelay = BACKOFF_BASE_MS * Math.pow(2, this.retryCount - 1);

    this.logger.info('Retrying state execution', {
      state: this.currentState,
      attempt: this.retryCount,
      backoffDelay
    });

    await new Promise(resolve => setTimeout(resolve, backoffDelay));
    return true;
  }

  /**
   * Records state transition in history with cleanup
   */
  private recordStateTransition(
    fromState: VoiceAgentState,
    toState: VoiceAgentState,
    timestamp: Date
  ): void {
    const entry: StateHistoryEntry = {
      fromState,
      toState,
      timestamp,
      duration: Date.now() - this.stateContext.lastStateChange.getTime()
    };

    this.stateHistory.push(entry);

    // Maintain history limit
    if (this.stateHistory.length > STATE_HISTORY_LIMIT) {
      this.stateHistory.shift();
    }
  }

  /**
   * Validates if a state transition is allowed
   */
  private isValidTransition(fromState: VoiceAgentState, toState: VoiceAgentState): boolean {
    const validTransitions: Record<VoiceAgentState, VoiceAgentState[]> = {
      [VoiceAgentState.INITIALIZING]: [VoiceAgentState.DIALING, VoiceAgentState.FAILED],
      [VoiceAgentState.DIALING]: [VoiceAgentState.NAVIGATING_MENU, VoiceAgentState.SPEAKING, VoiceAgentState.LEAVING_VOICEMAIL, VoiceAgentState.FAILED],
      [VoiceAgentState.NAVIGATING_MENU]: [VoiceAgentState.SPEAKING, VoiceAgentState.FAILED],
      [VoiceAgentState.SPEAKING]: [VoiceAgentState.SCHEDULING, VoiceAgentState.CLOSING, VoiceAgentState.FAILED],
      [VoiceAgentState.SCHEDULING]: [VoiceAgentState.CLOSING, VoiceAgentState.FAILED],
      [VoiceAgentState.CLOSING]: [VoiceAgentState.ENDED, VoiceAgentState.FAILED],
      [VoiceAgentState.LEAVING_VOICEMAIL]: [VoiceAgentState.ENDED, VoiceAgentState.FAILED],
      [VoiceAgentState.ENDED]: [],
      [VoiceAgentState.FAILED]: []
    };

    return validTransitions[fromState]?.includes(toState) || false;
  }

  /**
   * Checks if the given state is a terminal state
   */
  private isTerminalState(state: VoiceAgentState): boolean {
    return [VoiceAgentState.ENDED, VoiceAgentState.FAILED].includes(state);
  }

  /**
   * Initializes default state context
   */
  private initializeStateContext(): StateContext {
    return {
      phoneNumber: '',
      contactInfo: {},
      startTime: new Date(),
      lastStateChange: new Date(),
      retryCount: 0
    };
  }

  /**
   * Sets up event listeners for monitoring
   */
  private setupEventListeners(): void {
    this.eventEmitter.on('stateChange', (event) => {
      this.logger.info('Voice agent state changed', event);
    });
  }

  /**
   * Gets the current state of the voice agent
   */
  public getCurrentState(): VoiceAgentState {
    return this.currentState;
  }

  /**
   * Gets the complete state history
   */
  public getStateHistory(): StateHistoryEntry[] {
    return [...this.stateHistory];
  }
}