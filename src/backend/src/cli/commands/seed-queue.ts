import { Command } from 'commander'; // ^10.0.0
import { Types } from 'mongoose'; // ^7.0.0
import { sanitize } from 'validator'; // ^13.0.0

import CallProducer from '../../queue/producers/call.producer';
import { JobType } from '../../queue/types';
import { logger } from '../../lib/logger';

// Constants for command configuration
const COMMAND_NAME = 'seed-queue';
const COMMAND_DESCRIPTION = 'Add test job to Redis queue';
const DEFAULT_STEP = 0;
const MAX_STEP = 10;
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

/**
 * Interface for command options
 */
interface SeedQueueOptions {
  step?: number;
  final?: boolean;
}

/**
 * Creates and configures the seed-queue CLI command
 * @returns Configured Command instance
 */
export function createSeedQueueCommand(): Command {
  const command = new Command(COMMAND_NAME);
  
  command
    .description(COMMAND_DESCRIPTION)
    .argument('<campaignId>', 'MongoDB ObjectId of the campaign')
    .option('-s, --step <number>', 'Campaign step number', String(DEFAULT_STEP))
    .option('-f, --final', 'Mark as final step', false)
    .action(async (campaignId: string, options: SeedQueueOptions) => {
      try {
        await handleSeedQueue(campaignId, options);
        process.exit(0);
      } catch (error) {
        logger.error('Failed to seed queue', {
          error,
          campaignId,
          component: 'SeedQueueCommand'
        });
        process.exit(1);
      }
    });

  return command;
}

/**
 * Validates command input parameters
 * @param campaignId Campaign ID to validate
 * @param options Command options to validate
 * @throws Error if validation fails
 */
function validateInput(campaignId: string, options: SeedQueueOptions): void {
  // Sanitize campaign ID
  const sanitizedCampaignId = sanitize(campaignId);
  if (!Types.ObjectId.isValid(sanitizedCampaignId)) {
    throw new Error('Invalid campaign ID format');
  }

  // Validate step number
  const step = Number(options.step);
  if (isNaN(step) || step < 0 || step > MAX_STEP) {
    throw new Error(`Step must be a number between 0 and ${MAX_STEP}`);
  }

  // Validate final flag with step
  if (options.final && step !== MAX_STEP) {
    logger.warn('Final flag set but step is not maximum', {
      step,
      maxStep: MAX_STEP,
      component: 'SeedQueueCommand'
    });
  }
}

/**
 * Handles the seed-queue command execution with retry logic
 * @param campaignId Campaign ID to create job for
 * @param options Command options
 */
async function handleSeedQueue(
  campaignId: string,
  options: SeedQueueOptions
): Promise<void> {
  // Validate input parameters
  validateInput(campaignId, options);

  const producer = new CallProducer();
  let retryCount = 0;

  while (retryCount < MAX_RETRIES) {
    try {
      // Convert campaign ID to ObjectId
      const campaignObjectId = new Types.ObjectId(campaignId);
      const step = Number(options.step);

      // Log operation start
      logger.info('Seeding queue with test job', {
        campaignId,
        step,
        final: options.final,
        component: 'SeedQueueCommand'
      });

      // Enqueue the job
      const job = await producer.enqueueCall(campaignObjectId, step);

      // Log successful operation
      logger.info('Successfully created test job', {
        jobId: job.id,
        campaignId,
        step,
        final: options.final,
        component: 'SeedQueueCommand'
      });

      return;
    } catch (error) {
      retryCount++;
      
      if (retryCount === MAX_RETRIES) {
        logger.error('Max retries reached for queue seeding', {
          error,
          campaignId,
          retryCount,
          component: 'SeedQueueCommand'
        });
        throw error;
      }

      logger.warn('Retrying queue seeding', {
        error,
        campaignId,
        retryCount,
        component: 'SeedQueueCommand'
      });

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * retryCount));
    }
  }
}

export default createSeedQueueCommand;