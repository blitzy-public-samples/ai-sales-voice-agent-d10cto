import { EventEmitter } from 'events';
import { LiveKitService } from '../integrations/livekit/livekit.service';
import { OpenAIService } from '../integrations/openai/openai.service';
import { CircuitBreaker } from '../lib/circuit-breaker';
import { logger } from '../lib/logger';
import { 
  ConversationState, 
  VoiceResponse, 
  SalesCoachResponse 
} from '../integrations/openai/types';
import { CallOutcome } from '../types';

// Constants for voice agent configuration
const CONVERSATION_TIMEOUT_MS = 300000; // 5 minutes
const MAX_RETRY_ATTEMPTS = 3;
const SALES_COACH_INTERVAL_MS = 15000;
const MIN_VOICE_QUALITY_SCORE = 8.0;
const QUALITY_CHECK_INTERVAL_MS = 5000;

/**
 * Core service implementing DocShield AI Voice Agent capabilities
 * Manages voice call lifecycle, conversation flow, and quality monitoring
 */
export class VoiceAgentService {
  private readonly livekitService: LiveKitService;
  private readonly openaiService: OpenAIService;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly eventEmitter: EventEmitter;
  private currentState: ConversationState;
  private contactContext: any;
  private qualityMetrics: Map<string, number>;
  private stateHistory: ConversationState[];
  private salesCoachInterval: NodeJS.Timer | null;
  private qualityCheckInterval: NodeJS.Timer | null;
  private readonly correlationId: string;

  constructor(
    livekitService: LiveKitService,
    openaiService: OpenAIService,
    circuitBreaker: CircuitBreaker
  ) {
    this.livekitService = livekitService;
    this.openaiService = openaiService;
    this.circuitBreaker = circuitBreaker;
    this.eventEmitter = new EventEmitter();
    this.currentState = ConversationState.INITIALIZING;
    this.stateHistory = [];
    this.qualityMetrics = new Map();
    this.salesCoachInterval = null;
    this.qualityCheckInterval = null;
    this.correlationId = `voice-agent-${Date.now()}`;

    this.setupEventListeners();
  }

  /**
   * Initiates a new outbound sales call with enhanced monitoring
   * @param phoneNumber Target phone number in E.164 format
   * @param contactInfo Contact information for context
   * @returns Promise resolving to true if call started successfully
   */
  public async startCall(
    phoneNumber: string,
    contactInfo: any
  ): Promise<boolean> {
    try {
      logger.info('Starting outbound call', {
        phoneNumber: phoneNumber.replace(/\d/g, '*'),
        correlationId: this.correlationId
      });

      // Initialize contact context
      this.contactContext = contactInfo;

      // Start quality monitoring
      this.startQualityMonitoring();

      // Initialize LiveKit call
      const callInitialized = await this.circuitBreaker.executeFunction(
        async () => await this.livekitService.initializeCall(phoneNumber),
        'livekit'
      );

      if (!callInitialized) {
        throw new Error('Failed to initialize call');
      }

      // Start sales coach monitoring
      this.startSalesCoachMonitoring();

      // Update state
      this.updateState(ConversationState.CALL_INITIATED);

      return true;
    } catch (error) {
      this.handleError('Failed to start call', error as Error);
      throw error;
    }
  }

  /**
   * Handles phone tree navigation with DTMF tones
   * @param menuOptions Array of menu options to navigate
   * @returns Promise resolving when navigation is complete
   */
  private async navigatePhoneTree(menuOptions: string[]): Promise<void> {
    try {
      this.updateState(ConversationState.MENU_DETECTED);

      for (const option of menuOptions) {
        await this.circuitBreaker.executeFunction(
          async () => await this.livekitService.sendDTMF(option),
          'livekit'
        );

        // Wait for menu response
        await this.delay(2000);
      }

      this.updateState(ConversationState.NAVIGATING_MENU);
    } catch (error) {
      this.handleError('Phone tree navigation failed', error as Error);
      throw error;
    }
  }

  /**
   * Processes real-time voice conversation with enhanced monitoring
   * @param audioInput Incoming audio buffer
   * @returns Promise resolving to voice response
   */
  private async processConversation(audioInput: Buffer): Promise<VoiceResponse> {
    try {
      // Transcribe incoming audio
      const transcript = await this.openaiService.transcribeAudio(audioInput);

      // Get sales coach guidance
      const guidance = await this.getSalesCoachGuidance(transcript);

      // Generate response considering sales coach input
      const response = await this.generateResponse(transcript, guidance);

      // Monitor voice quality
      await this.monitorVoiceQuality(response);

      return response;
    } catch (error) {
      this.handleError('Conversation processing failed', error as Error);
      throw error;
    }
  }

  /**
   * Monitors and maintains voice quality metrics
   * @param response Voice response to monitor
   */
  private async monitorVoiceQuality(response: VoiceResponse): Promise<void> {
    try {
      const metrics = await this.livekitService.getCallMetrics();
      
      // Calculate quality score
      const qualityScore = (
        metrics.audioQualityScore +
        metrics.latency / 1000 +
        (1 - metrics.packetLoss)
      ) / 3;

      // Update metrics
      this.qualityMetrics.set('quality', qualityScore);
      this.qualityMetrics.set('latency', metrics.latency);
      this.qualityMetrics.set('packetLoss', metrics.packetLoss);

      // Log metrics
      logger.info('Voice quality metrics', {
        metrics: Object.fromEntries(this.qualityMetrics),
        correlationId: this.correlationId
      });

      // Alert if quality drops below threshold
      if (qualityScore < MIN_VOICE_QUALITY_SCORE) {
        logger.warn('Voice quality below threshold', {
          score: qualityScore,
          threshold: MIN_VOICE_QUALITY_SCORE,
          correlationId: this.correlationId
        });
      }
    } catch (error) {
      this.handleError('Voice quality monitoring failed', error as Error);
    }
  }

  /**
   * Gets real-time guidance from sales coach AI
   * @param transcript Current conversation transcript
   * @returns Promise resolving to sales coach response
   */
  private async getSalesCoachGuidance(transcript: string): Promise<SalesCoachResponse> {
    try {
      return await this.openaiService.getSalesCoachGuidance({
        messages: [{ role: 'user', content: transcript }],
        state: this.currentState,
        lastState: this.stateHistory[this.stateHistory.length - 1],
        stateHistory: this.stateHistory,
        transcriptBuffer: [transcript],
        salesCoachFeedback: [],
        confidenceScore: 0,
        outcome: CallOutcome.MEETING_SCHEDULED
      });
    } catch (error) {
      this.handleError('Sales coach guidance failed', error as Error);
      throw error;
    }
  }

  /**
   * Generates voice response considering sales coach guidance
   * @param transcript User transcript
   * @param guidance Sales coach guidance
   * @returns Promise resolving to voice response
   */
  private async generateResponse(
    transcript: string,
    guidance: SalesCoachResponse
  ): Promise<VoiceResponse> {
    try {
      const response = await this.openaiService.generateResponse({
        messages: [
          { role: 'user', content: transcript },
          { role: 'system', content: guidance.guidance }
        ],
        state: this.currentState,
        lastState: this.stateHistory[this.stateHistory.length - 1],
        stateHistory: this.stateHistory,
        transcriptBuffer: [transcript],
        salesCoachFeedback: [guidance],
        confidenceScore: guidance.confidence,
        outcome: CallOutcome.MEETING_SCHEDULED
      });

      return await this.openaiService.synthesizeSpeech(response);
    } catch (error) {
      this.handleError('Response generation failed', error as Error);
      throw error;
    }
  }

  /**
   * Updates conversation state with logging
   * @param newState New conversation state
   */
  private updateState(newState: ConversationState): void {
    const oldState = this.currentState;
    this.currentState = newState;
    this.stateHistory.push(newState);

    logger.info('Conversation state updated', {
      oldState,
      newState,
      correlationId: this.correlationId
    });

    this.eventEmitter.emit('stateChange', { oldState, newState });
  }

  /**
   * Starts quality monitoring interval
   */
  private startQualityMonitoring(): void {
    this.qualityCheckInterval = setInterval(
      () => this.monitorVoiceQuality(null as any),
      QUALITY_CHECK_INTERVAL_MS
    );
  }

  /**
   * Starts sales coach monitoring interval
   */
  private startSalesCoachMonitoring(): void {
    this.salesCoachInterval = setInterval(
      async () => {
        try {
          const guidance = await this.getSalesCoachGuidance('');
          logger.info('Sales coach update', {
            guidance: guidance.guidance,
            confidence: guidance.confidence,
            correlationId: this.correlationId
          });
        } catch (error) {
          logger.error('Sales coach monitoring failed', {
            error,
            correlationId: this.correlationId
          });
        }
      },
      SALES_COACH_INTERVAL_MS
    );
  }

  /**
   * Sets up event listeners for monitoring
   */
  private setupEventListeners(): void {
    this.eventEmitter.on('stateChange', (event) => {
      logger.info('Voice agent state changed', {
        ...event,
        correlationId: this.correlationId
      });
    });
  }

  /**
   * Handles and logs errors with correlation
   */
  private handleError(message: string, error: Error): void {
    logger.error(message, {
      error,
      correlationId: this.correlationId,
      state: this.currentState
    });
  }

  /**
   * Utility method for delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Cleans up resources on service shutdown
   */
  public cleanup(): void {
    if (this.salesCoachInterval) {
      clearInterval(this.salesCoachInterval);
    }
    if (this.qualityCheckInterval) {
      clearInterval(this.qualityCheckInterval);
    }
    this.openaiService.cleanup();
    logger.info('Voice agent cleanup completed', {
      correlationId: this.correlationId
    });
  }
}