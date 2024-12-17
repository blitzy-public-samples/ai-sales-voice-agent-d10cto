// External imports
import dotenv from 'dotenv'; // v16.x
import { LiveKitAudioConfig, LIVEKIT_AUDIO_DEFAULTS, LIVEKIT_QUALITY_THRESHOLDS } from '../integrations/livekit/types';

// Initialize environment variables
dotenv.config();

/**
 * Comprehensive LiveKit configuration object for DocShield AI Voice Agent
 * Implements requirements for voice quality (>8/10) and latency (<1.5s)
 */
export const livekitConfig = {
  // Server connection settings
  serverUrl: process.env.LIVEKIT_SERVER_URL,
  apiKey: process.env.LIVEKIT_API_KEY,
  apiSecret: process.env.LIVEKIT_API_SECRET,
  
  // Audio configuration optimized for high-quality voice calls
  audioConfig: getDefaultAudioConfig(),
  
  // Connection settings optimized for low latency
  connectionSettings: {
    // Keep latency under 1.5s requirement
    maxJoinRetries: 3,
    autoSubscribe: true,
    adaptiveStream: true,
    dynacast: true,
    maxRetries: 3,
    timeout: 10000,
    keepaliveInterval: 5000,
    jitterBuffer: {
      delay: 50,        // Initial jitter buffer delay (ms)
      maxDelay: 100,    // Maximum buffer delay (ms)
      minDelay: 25      // Minimum buffer delay (ms)
    }
  },

  // Monitoring settings for quality assurance
  monitoring: {
    metricsInterval: 1000,      // Collect metrics every second
    qualityThresholds: {
      ...LIVEKIT_QUALITY_THRESHOLDS,
      reconnectOnQualityBelow: 7.0,
      warnOnQualityBelow: 8.5
    },
    // Health check configuration
    healthCheck: {
      enabled: true,
      interval: 30000,  // 30 second intervals
      timeout: 5000     // 5 second timeout
    }
  },

  // SSL/TLS configuration for secure communication
  ssl: {
    enabled: process.env.LIVEKIT_ENV === 'production',
    rejectUnauthorized: true,
    minVersion: 'TLSv1.2'
  }
};

/**
 * Returns optimized default audio configuration for high-quality voice calls
 * Implements voice quality requirements from technical specifications
 */
function getDefaultAudioConfig(): LiveKitAudioConfig {
  return {
    ...LIVEKIT_AUDIO_DEFAULTS,
    // Override any defaults if needed for optimization
    sampleRate: 48000,  // 48kHz for high fidelity
    bitDepth: 16,       // 16-bit for quality balance
    compression: 'Opus' // Opus codec for efficient streaming
  };
}

/**
 * Validates LiveKit configuration settings
 * Ensures all required parameters are present and properly formatted
 */
export async function validateLivekitConfig(): Promise<boolean> {
  // Validate server URL
  if (!livekitConfig.serverUrl || !livekitConfig.serverUrl.startsWith('wss://')) {
    throw new Error('Invalid LiveKit server URL. Must use secure WebSocket (wss://)');
  }

  // Validate API credentials
  if (!livekitConfig.apiKey || !livekitConfig.apiSecret) {
    throw new Error('LiveKit API credentials not configured');
  }

  // Validate audio configuration
  const audioConfig = livekitConfig.audioConfig;
  if (audioConfig.sampleRate < 44100 || audioConfig.bitDepth < 16) {
    throw new Error('Audio quality settings below minimum requirements');
  }

  // Validate connection settings for latency requirements
  const { jitterBuffer } = livekitConfig.connectionSettings;
  if (jitterBuffer.maxDelay > LIVEKIT_QUALITY_THRESHOLDS.MAX_LATENCY_MS * 0.1) {
    throw new Error('Jitter buffer settings may cause excessive latency');
  }

  // Validate SSL configuration in production
  if (process.env.LIVEKIT_ENV === 'production' && !livekitConfig.ssl.enabled) {
    throw new Error('SSL must be enabled in production environment');
  }

  return true;
}

/**
 * Export configuration validation function for runtime checks
 * and main configuration object with all necessary settings
 */
export default {
  livekitConfig,
  validateLivekitConfig
};