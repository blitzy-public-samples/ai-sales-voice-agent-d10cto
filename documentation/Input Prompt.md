# WHY - Vision & Purpose

## 1. Purpose & Users

The application is a node worker application that functions as an AI voice agent that does a fully autonomous sales call when it receives a job from a redis queue. The application will record an audio transcript, convert it to a text transcription, and upload to an S3 bucket. Using this transcription, the worker will also update the database after each call (detailed below).  

This will be used by DocShield’s sales team. DocShield is an insurance brokerage whose customer base consists of outpatient doctor’s practices. DocShield’s sales team has an existing sales sequencing tool that will issues jobs to the redis queue, which this worker will consume.  

The key difference vs. all alternative solutions is that the voice agent will initiate, conduct, and process the calls it executes fully independently. 

# WHAT - Core Requirements

## 2. Functional Requirements

System must:

- Listen to redis as a worker and accept a job when available
- Handle the case when job type is “call”
- Interpolate provided prompt text with personalized information from Contact model and adhere to provided prompt when conducting the call
- Append the general AI call prompt to the provided prompt
- Initiate a call to the contact via their phone number using LiveKit/OpenAI Realtime API
- Handle navigating a phone tree to get connected to the front desk
    - *Voice agent should select whatever dial options lead to the front desk. This won’t be options like “billing”, “doctor referrals”, “appointment follow-up”, or “emergency help”. NEVER select the emergency line option, this will upset our end-user. Usually the best option is “patient scheduling” or “schedule a new appointment”.*
- Initialize another AI which is listening to the conversation as text transcript, and providing coaching and instructions based on a pre-defined prompt we give it. That coach AI should be instructing call AI if it has completed the current step and should move to the next
- Implement AI function calling to update the campaign’s status/message history in database, book meeting on google calendar, and update any other CRM
- Record a text transcript of the call (convert audio to text) and upload that to S3 and update the campaign database

# HOW - Planning & Implementation

## 3. Technical Foundation

### Required Stack Components

- Frontend (e.g., web app, mobile, desktop)
    - Don’t worry about the front end, I just need you to be a node worker application. Just give me a way to seed the redis queue with a test job (can be done via CLI/script)
- Backend (e.g., database, APIs)
    - We are using node with typescript on the backend
    - We are using MongoDB for our database with mongoose
    - We are using Redis with Bull to manage jobs and queues
- Integrations (e.g., third-party services)
    - We are using LiveKit + OpenAI Realtime API to conduct the voice calls
        - https://docs.livekit.io/agents/openai/overview/
    - We are using the google api to access google accounts/calendars
    - We are using Clerk for auth and to retrieve Oauth Access Token
    - We are using LogTail for log drain
- Infrastructure
    - Node worker deployed on Heroku
    - Redis deployed on Redis Cloud

### System Requirements

- Performance needs
    - The application should be able to run on a eco instance of a heroku worker regarding cpu and ram
- Security requirements
    - The worker is inaccessible from the web, running as just a worker process, so whatever is recommended but don’t go overboard.
- Scalability expectations
    - The worker should be able to horizontally scale
- Reliability targets
    - as little as possible, and if you do fail, fail gracefully with errors following the pattern in the appendix worker
- Integration constraints

## 4. User Experience

### Key User Flows

1. Entry Point
    1. End-user receives a call
        1. End-user: this is the physician practice who receives the call. The call will typically be answered by a front desk receptionist, sometimes by the practice administrator or a nurse, and very rarely by one of the physicians themselves 
2. Key Steps/Interactions
    1. Physician practice chats with voice agent
    2. Physician practice will either reject the offer to schedule a meeting, accept the offer to schedule a meeting, or hang up on the voice agent before indicating 
3. Success Criteria
    1. Voice agent is cogent
    2. Voice agent does not interrupt end-user at physician practice
    3. Voice agent addresses all questions and concerns from end-user
    4. Voice agent successfully schedules a meeting for the end-user’s physician practice via function call
4. Alternative Flows
    1. Physician Practice declines the meeting
    2. Physician Practice hangs up/doesn’t pick up

### Core Interfaces

For each interface, consider:

- Primary purpose
- Key functionality
- Critical components
- User interactions

Phone Call (Voice Medium)

- Primary Purpose: to listen to the voice agent pitch docshield and to hopefully agree to a meeting
- Key functionality:
    - AI Voice Agent navigates the phone tree as necessary to get to front desk
    - AI Voice Agent follows the provided prompt and conduct an sales meeting with the physician practice
    - AI Sales Coach agent is listening to the conversation and providing feedback as well as suggestions to move on to other sections as it completes parts of the provided prompt
    - AI voice agent can handle objections elegantly using FAQ information from the prompt
    - AI voice agent can schedule a meeting via the google API
    - If practice declines the meeting:
        - Voice agent asks is there a reason this isn’t interesting to your practice today?
        - Physician Practice responds with reason
        - Voice Agent updates the campaign decline_reason
    - If practice hangs up/doesn’t answer
        - Voice agent updates the campaign message history and lastStepCompleted
- Critical Components
    - The worker function that is listening to the redis queue
    - The AI voice calling functionality which uses the compound prompts (static prompt + provided, interpolated promt)
    - An AI sales coach who is providing instructions to the ai voice agent mid-call on how to progress through the call according to the coach’s prompt instructions
    - The ability to interact with external tools via function calling

## 5. Business Requirements

### Access & Authentication

- No user types, worker application will constantly be on and listening to redis queue
- Auth requirements: None
- Access control needs: none

### Business Rules

- Data validation rules
    - Ensure the phone number provided is valid by checking string length
- Process requirements
    - Ensure the AI Voice Agent is sticking to the prompt/script and is always progressing the physician practice towards booking a meeting
    - Ensure the AI sales coach is listening to the conversation and inserting his suggestions.
        - Run the sales coach every 15 seconds and evaluate if the AI Voice Agent needs an intervention based on the sales agent’s prompt
        - If it does not, do nothing
        - If it does need an intervention, send a constructive message to the AI Voice Agent as text
    - Ensure the call is transcribed to text, uploaded to S3, and reference is updated in the campaign messageHistory
- Compliance needs
    - Ensure the voice agent does not hallucinate and only answers with data from the provided prompt, not just in general
    - Ensure the voice agent always maintains a professional tone, even if end-user insults, berates, or is rude to voice agent
    - If end user asks the voice agent whether it is human or an AI, voice agent should reply that it is an AI malpractice specialist that has worked with dozens of physician practices
    - If end user asks whether the voice agent is an insurance agent, must say no. You can explain you are a malpractice insurance specialist but are not a licensed insurance producer. Your boss at DocShield is a licensed insurance producer who will engage in all policy specific questions and advice.
- Service level expectations
    - Voice calls and conversations should be resilient and handle the dynamic nature of human conversation

## 6. Implementation Priorities

High Priority: 

- Node worker with the ability to make outbound calls with the AI Voice Agent and all associated business logic
- Ability to use external tools and function calling to update DB and other external services

Medium priority:

- AI Sales Coach that is listening to the conversation and evaluating whether to send a suggestion every 15 seconds
- Transcribe the voice call to text, save in S3, and update campaign messageHistory with reference
- Navigate phone trees on outbound calls

Low Priority: 

- None

---

REF: A.1

- Purpose: This is an example of the worker application and how it should handle processing jobs from redis and executing the right action based on the job type. You can extend this by editing the case to add “phone”. Do not worry about implementing a case for email, we already have it.
- This should run by default when the application runs

```tsx
import type { CampaignModelPopulated } from "./mongoose/models/Campaign"
import mongoConnect from "./mongoose/connection"
import "./mongoose/models/Batch"
import "./mongoose/models/Contact"
import "./mongoose/models/Sequence"

import * as dotenv from "dotenv"

import { clerkClient } from "@clerk/clerk-sdk-node"
import { gmail_v1, google } from "googleapis"
import type { Queue as BullQueue, Job } from "bull"

// Use type imports via typeof import
import fetch from "node-fetch"
import Queue from "bull"
import { setCampaignFail, updateCampaign, getCampaign } from "./campaignController"
import { sendEmail } from "./channels/email"

import { logger, loggedOperation } from './libraries/utils/logger';

dotenv.config({ path: process.env.ENV_FILE })

// Initialize Bull Queue
let messageQueue: BullQueue<{
  campaignId: string
  step: number
  finalStep: boolean
}>

const delay = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

const normalizeEmail = (email: string): string => {
  // Split email into local part and domain
  const [local, domain] = email.split("@")
  if (!local || !domain) return email.toLowerCase()

  return `${local
    // Remove all dots
    .replace(/\./g, "")
    // Remove everything after + (Gmail aliases)
    .split("+")[0]
    // Convert to lowercase
    .toLowerCase()}@${
    // Domain should just be lowercase
    domain.toLowerCase()
    }`
}

const checkForResponses = async (campaign: CampaignModelPopulated): Promise<boolean> => {
  try {
    // Get fresh token from Clerk
    const tokens = await clerkClient.users.getUserOauthAccessToken(
      campaign.batch.initiator,
      "oauth_google"
    )

    const oauthToken = tokens.data[0]?.token
    if (!oauthToken) {
      logger.error("No OAuth token available for response check")
      return false
    }

    const gmail = google.gmail({
      version: "v1",
      headers: { Authorization: `Bearer ${oauthToken}` },
    })

    if (!campaign.threadId) {
      return false
    }

    // Get all messages in the thread
    const thread = await gmail.users.threads.get({
      userId: "me",
      id: campaign.threadId,
    })

    if (!thread.data.messages) {
      return false
    }

    // Get the email address of the contact
    const contactEmail = campaign.contact.email

    // Check if there are any messages from the contact
    // Skip the first message since it's our initial email
    const hasResponse: boolean = thread.data.messages
      .slice(1)
      .some((message: gmail_v1.Schema$Message) => {
        const fromHeader = message.payload?.headers?.find(
          (header: gmail_v1.Schema$MessagePartHeader) => header.name?.toLowerCase() === "from"
        )
        if (!fromHeader?.value) return false

        // Extract email from "Name <email@domain.com>" format
        const emailMatch = fromHeader.value.match(/<(.+?)>/) || [null, fromHeader.value]
        const senderEmail = emailMatch[1] || fromHeader.value

        return normalizeEmail(senderEmail) === normalizeEmail(contactEmail)
      })

    return hasResponse
  } catch (error) {
    logger.error("Error checking for responses:", {
      campaignId: campaign._id.toString(),
      error
    })
    return false
  }
}

const completeStep = async (
  campaign: CampaignModelPopulated,
  stepIndex: number,
  finalStep: boolean
): Promise<{
  success: boolean
  data?: CampaignModelPopulated
  error?: string
}> => {
  return await loggedOperation(
    async (): Promise<{ success: boolean; data?: CampaignModelPopulated; error?: string }> => {
      let messageId = ""
      let threadId = ""

      switch (campaign.batch.sequence.steps[stepIndex].channel) {
        case "email": {
          const emailResponse = await loggedOperation(
            async () => await sendEmail(campaign, stepIndex),
            'SendEmail',
            { campaignId: campaign._id.toString(), step: stepIndex }
          )
          if (!emailResponse.success) {
            throw new Error(emailResponse.error)
          }
          messageId = emailResponse.data?.messageId || ""
          threadId = emailResponse.data?.threadId || ""
          break
        } case "phone": {

          break
        }
        default:
          throw new Error("Invalid channel")
      }

      const updatedCampaignPayload = {
        lastCompletedStep: stepIndex,
        lastCompletedDate: new Date(),
        threadId,
        status: campaign.status,
        messageHistory: [
          ...campaign.messageHistory,
          {
            messageId,
            sentAt: new Date(),
            opens: 0,
            clicks: 0,
          },
        ],
      }

      if (stepIndex === 0) {
        updatedCampaignPayload.threadId = threadId
      }

      if (finalStep) {
        updatedCampaignPayload.status = "complete_no_response"
        logger.info('Campaign completed with no response', {
          campaignId: campaign._id.toString()
        })
      }

      logger.info('Updating campaign', {
        campaignId: campaign._id.toString(),
        payload: updatedCampaignPayload
      })
      const updateResponse = await updateCampaign(campaign._id.toString(), updatedCampaignPayload)
      logger.info('Campaign updated', {
        campaignId: campaign._id.toString(),
        response: updateResponse
      })

      if (!updateResponse.ok) {
        return { success: false, error: "Failed to update campaign" }
      }

      const updatedCampaign = (await updateResponse.json()) as CampaignModelPopulated
      return { success: true, data: updatedCampaign }
    },
    'CompleteStep',
    {
      campaignId: campaign._id.toString(),
      step: stepIndex,
      channel: campaign.batch.sequence.steps[stepIndex].channel,
      finalStep
    }
  )
}

async function processMessage(job: Job<{ campaignId: string; step: number; finalStep: boolean }>) {
  const context = {
    jobId: job.id,
    campaignId: job.data.campaignId,
    step: job.data.step,
    finalStep: job.data.finalStep
  };

  const result = await loggedOperation(
    async () => {
      await mongoConnect()

      const response = await getCampaign(job.data.campaignId)
      if (!response.ok) {
        throw new Error("Campaign not found")
      }
      const campaign = (await response.json()) as CampaignModelPopulated

      // Check for responses
      const hasResponse = await checkForResponses(campaign)
      if (hasResponse) {
        logger.info('Campaign has response, marking as complete', {
          campaignId: campaign._id.toString(),
          step: job.data.step
        })

        await updateCampaign(campaign._id.toString(), { status: "complete_with_response" })
         
        // Remove remaining steps from Redis queue
        const remainingSteps = campaign.batch.sequence.steps.length - (job.data.step + 1)
        await Promise.all(
          Array.from({ length: remainingSteps }).map(async (_, index) => {
            const futureStepIndex = job.data.step + 1 + index
            const jobId = `${campaign._id.toString()}-${futureStepIndex}`
            try {
              const futureJob = await messageQueue.getJob(jobId)
              if (futureJob) {
                await futureJob.remove()
                logger.debug('Removed future job due to response', { jobId, campaignId: campaign._id.toString() })
              }
            } catch (error) {
              logger.error('Failed to remove future job', { jobId, error })
            }
          })
        )
        return { success: true }
      }

      // Check for no opens
      if (campaign.lastCompletedStep >= 2 && campaign.messageHistory.reduce((acc, msg) => acc + msg.opens, 0) === 0) {
        logger.info('Campaign has no opens, marking as complete_no_response', {
          campaignId: campaign._id.toString(),
          step: job.data.step
        })
        await setCampaignFail(campaign._id.toString(), job.data.step, "complete_no_response")
        return { success: true }
      }

      // Process the step
      const result = await completeStep(campaign, job.data.step, job.data.finalStep)
      await delay(3000)
      return result
    },
    'ProcessMessage',
    context
  )

  // Rethrow error for Bull retry mechanism if needed
  if (!result.success) {
    throw new Error(result.error)
  }

  return result
}

async function startWorker() {

  logger.info('Starting Message Bee Worker!')
  messageQueue = new Queue(
    process.env.REDIS_QUEUE_NAME || "message-queue",
    process.env.REDIS_URL || "redis://localhost:6379",
  )

  // Enhanced error logging
  messageQueue.on('error', (error) => {
    logger.error('Queue error occurred', {
      error,
      nodeVersion: process.version,
      queueName: process.env.REDIS_QUEUE_NAME
    })
  })

  messageQueue.on('completed', (job) => {
    logger.info('Job completed successfully', {
      jobId: job.id,
      campaignId: job.data.campaignId,
      step: job.data.step
    })
  })

  messageQueue.on('failed', (job, error) => {
    logger.error('Job processing failed', {
      jobId: job?.id,
      campaignId: job?.data?.campaignId,
      step: job?.data?.step,
      error
    })
  })

  await messageQueue.process("sendMessage", async (job) => processMessage(job))
}

// Update the worker startup
if (require.main === module) {
  startWorker().catch((error) => {
    logger.error('Worker failed to start', { error })
    process.exit(1)
  })
}

export default startWorker

export type StartWorker = typeof startWorker

```

REF: A.2

- Purpose: This is an example of the sendEmail function, which is invoked when the worker has a redis job that is of type “email”. You should implement something similar but for a new function, callPhone
- This should be invoked by the worker in REF: A.1 in the “phone” case

```tsx

import * as dotenv from "dotenv"
import { CampaignModelPopulated, Message } from "../mongoose/models/Campaign"
import { clerkClient } from "@clerk/clerk-sdk-node"
import * as utf8 from "utf8"
import { gmail_v1, google } from "googleapis"
import { ContactModel } from "../mongoose/models/Contact"
import { marked } from "marked"
import quotedPrintable from "quoted-printable"
import { setCampaignFail } from "../campaignController"

dotenv.config({ path: process.env.ENV_FILE })

const { encode: encodeUTF8 } = utf8

export const sendEmail = async (
  emailData: CampaignModelPopulated,
  stepIndex: number
): Promise<{
  success: boolean
  data?: {
    messageId?: string
    threadId?: string
  }
  error?: string
}> => {
  // Get fresh token from Clerk
  const tokens = await clerkClient.users.getUserOauthAccessToken(
    emailData.batch.initiator,
    "oauth_google"
  )

  const oauthToken = tokens.data[0]?.token
  if (!oauthToken) {
    return { success: false, error: "No OAuth token available" }
  }

  const gmail = google.gmail({
    version: "v1",
    headers: { Authorization: `Bearer ${oauthToken}` },
  })

  // Get references string from message history (properly formatted)
  const references = emailData.messageHistory
    .map((msg: Message) => `<${msg.messageId.replace(/[<>]/g, "")}>`)
    .join(" ")

  const lastMessageId = emailData.messageHistory.length > 0
    ? `<${emailData.messageHistory[emailData.messageHistory.length - 1].messageId.replace(/[<>]/g, "")}>`
    : undefined

  const interpolateMessage = (message: string, contact: ContactModel) =>
    message.replace(/\{\{\s*([^}]+)\s*\}\}/g, (match, field: string) => {
      const trimmedField = field.trim() as keyof ContactModel
      return String(contact[trimmedField] ?? match)
    })

  const messageBody = interpolateMessage(
    emailData.batch.sequence.steps[stepIndex].message,
    emailData.contact
  )

  const htmlMessageBody = await marked(messageBody, {
    breaks: true,
    gfm: true,
  })

  // HTML structure with preserved whitespace and markdown-converted content
  const htmlContent = `
<html>
    <head>
        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
    </head>
    <body>
        <div>
            <div>
                ${htmlMessageBody}
            </div>
            <div style="display:none;border:0px;width:0px;height:0px;overflow:hidden">
                <img src="${process.env.NEXT_PUBLIC_APP_URL}/api/r/${emailData._id.toString()}.gif?t=${Date.now()}" 
                     alt="${Math.random().toString(36).substring(7)}" 
                     width="1" 
                     height="1"/>
                <!-- ${" ".repeat(Math.floor(Math.random() * 100) + 150)} -->
            </div>
        </div>
    </body>
</html>`

  const boundary = `000000000000${Math.random().toString(16).slice(2)}`

  const headers = [
    `To: ${emailData.contact.email}`,
    `Subject: ${emailData.batch.sequence.subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ]

  if (references) {
    headers.push(`References: ${references}`)
  }
  if (lastMessageId) {
    headers.push(`In-Reply-To: ${lastMessageId}`)
  }

  // Create plain text version by stripping HTML tags from the markdown-converted HTML
  const plainTextContent = htmlMessageBody.replace(/<[^>]+>/g, "")
  const encodedPlainText = quotedPrintable.encode(encodeUTF8(plainTextContent))

  // Encode HTML content properly
  const encodedHtmlContent = quotedPrintable.encode(encodeUTF8(htmlContent))

  const rawEmail = [
    ...headers,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: quoted-printable",
    "",
    encodedPlainText,
    "",
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: quoted-printable",
    "",
    encodedHtmlContent,
    "",
    `--${boundary}--`,
  ].join("\r\n")

  const encodedEmail = Buffer.from(rawEmail)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")

  try {
    const response = await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: encodedEmail,
        threadId: emailData.threadId,
      },
    })

    // Extract the Gmail-assigned Message-ID from the response
    const { id } = response.data

    // Retrieve the sent message to get the Message-ID header
    try {
      if (!id) {
        return { success: false, error: "No message ID" }
      }
      const message = await gmail.users.messages.get({
        userId: "me",
        id,
        format: "full",
      })

      const SentHeaders = message.data.payload?.headers
      const messageIdHeader = SentHeaders?.find(
        (header: gmail_v1.Schema$MessagePartHeader) => header.name === "Message-Id"
      )
      if (!messageIdHeader || !messageIdHeader.value || !response.data.threadId) {
        return { success: false, error: "No message ID header" }
      }
      return {
        success: true,
        data: {
          messageId: messageIdHeader.value,
          threadId: response.data.threadId,
        },
      }
    } catch (error) {
      console.error("Error retrieving message headers:", error)
      return { success: false, error: "Error retrieving message headers" }
    }

  } catch (error) {
    console.error("Error sending email:", error)
    
    // Update campaign status to failed and remove pending jobs
    try {
      await setCampaignFail(emailData._id.toString(), stepIndex, "failed")
    } catch (updateError) {
      console.error("Error updating campaign status:", updateError)
    }
    
    return { success: false, error: "Error sending email" }
  }
}

```

REF: A.3

- Purpose: This file, campaignController.ts, contains any helper controllers to manipulate the mongo db and redis db. You will need to implement the getCampaign and updateCampaign functions as used in REF: A.1
- It can be referenced from the worker REF: A.1 and sendEmail REF: A.2 (or the new callPhone)

```tsx
import Campaign, { CampaignStatus } from "./mongoose/models/Campaign"
import mongoConnect from "./mongoose/connection"
import Queue from "bull"

import * as dotenv from "dotenv"
dotenv.config({ path: process.env.ENV_FILE })

// Initialize Bull Queue
let messageQueue: Queue.Queue<{
  campaignId: string
  step: number
  finalStep: boolean
}>

try {
  messageQueue = new Queue(
    process.env.REDIS_QUEUE_NAME || "message-queue",
    process.env.REDIS_URL || "redis://localhost:6379"
  )
} catch (error) {
  console.error("Queue initialization error:", error)
  throw error
}

export const setCampaignFail = async (campaignId: string, stepIndex: number, status: CampaignStatus) => {
  try {
    await mongoConnect()
    // Update campaign status to failed
    await Campaign.findByIdAndUpdate(campaignId, { status })
    // Remove all pending jobs for this campaign (checking steps 0-9 for safety)
    await Promise.all(
      Array.from({ length: 10 }).map(async (_, index) => {
        const jobId = `${campaignId}-${index}`
        try {
          const job = await messageQueue.getJob(jobId)
          if (job && job.data.step !== stepIndex) {
            await job.remove()
            console.log(`Removed job ${jobId} due to campaign failure`)
          }
        } catch (error) {
          console.error(`Error removing job ${jobId}:`, error)
          throw new Error(`Error removing job ${jobId}: ${error as string}`)
        }
      })
    )
    console.log(`passed job removal`)
    return { success: true }
  } catch (error) {
    console.error(`Error setting campaign ${campaignId} to failed:`, error)
    return { success: false, error: `Error setting campaign ${campaignId} to failed` }
  }
}

```

REF: A.4

- Purpose: This is a logger function which wraps critical functions in my worker REF: A.1 and in my channel functions such as sendEmail REF: A.2.
- It can be used by any of the worker or associated logic

```
import { Logtail } from '@logtail/node';
import * as dotenv from "dotenv"

dotenv.config({ path: process.env.ENV_FILE })

// Initialize Logtail with source token from environment variables
const logtail = new Logtail(process.env.LOGTAIL_SOURCE_TOKEN || '');

/**
 * Converts various types of context data into metadata suitable for logging
 */
const contextToMetadata = (context: any): any => {
  if (context === null || context === undefined) {
    return {};
  }

  if (context instanceof Error) {
    return {
      error_message: context.message,
      error_stack: context.stack,
      error_name: context.name
    };
  }

  if (context instanceof Date) {
    return context.toISOString();
  }

  if (Buffer.isBuffer(context)) {
    return '[Buffer]';
  }

  if (typeof context === 'object') {
    try {
      // Handle circular references and complex objects
      return JSON.parse(JSON.stringify(context));
    } catch (error) {
      return String(context);
    }
  }

  return context.toString();
};

/**
 * Type for operation result
 */

/**
 * Executes and logs an operation with proper error handling
 */
export async function loggedOperation<T>(
  operation: () => Promise<{ success: boolean; data?: T; error?: string }>,
  operationName: string,
  context: Record<string, any> = {}
): Promise<{ success: boolean; data?: T; error?: string }> {
  try {
    // Log operation start
    logtail.info(`${operationName} - attempting`, {
      status: 'attempting',
      operation: operationName,
      ...contextToMetadata(context)
    });

    // Execute operation
    const result = await operation();

    // Log success
    logtail.info(`${operationName} - completed`, {
      status: 'completed',
      operation: operationName,
      ...contextToMetadata(context)
    });

    return result
  } catch (error) {
    // Log failure
    logtail.error(`${operationName} - failed`, {
      status: 'failed',
      operation: operationName,
      ...contextToMetadata(context),
      ...contextToMetadata(error)
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }

    
  } finally {
    // Ensure logs are sent
    await logtail.flush();
  }
}

// Export default logger instance with common log levels
export const logger = {
  info: (message: string, context: Record<string, any> = {}) => {
    logtail.info(message, contextToMetadata(context));
  },
  
  error: (message: string, context: Record<string, any> = {}) => {
    logtail.error(message, contextToMetadata(context));
  },
  
  warn: (message: string, context: Record<string, any> = {}) => {
    logtail.warn(message, contextToMetadata(context));
  },
  
  debug: (message: string, context: Record<string, any> = {}) => {
    logtail.debug(message, contextToMetadata(context));
  },

  // Ensure logs are sent
  flush: async () => {
    await logtail.flush();
  }
};

```

REF: B.1

- Purpose: This is the mongoose/mongodb scheme for a Sequence. A sequence contains the user provided prompt which will be given to the AI voice agent. The worker will check which step of the sequence the Campaign REF: B.4 is on and initiate the correct step of the sequence
- This will be referenced by the worker REF A.1

```tsx
import mongoose from "mongoose"

export interface SequenceType extends mongoose.Document {
  name: string;
  steps: Step[];
  createdAt: Date;
  updatedAt: Date;
  subject: string;
}

export interface SequenceModel {
  _id: mongoose.Types.ObjectId
  name: string
  steps: Step[]
  createdAt: Date
  updatedAt: Date
  subject: string
}

export interface Step {
  channel: "email" | "voicemail";
  message: string;
  delayDays: number;
  sendAt: number;
}

const SequenceSchema = new mongoose.Schema<SequenceType>(
  {
    name: {
      type: String,
      required: true,
    },
    steps: {
      type: [Object],
      required: true
    },
    subject: {
      type: String,
      required: true
    }
  },
  { timestamps: true }
)

export default mongoose.models?.Sequence
  || mongoose.model<SequenceType>("Sequence", SequenceSchema) 
```

REF: B.2

- Purpose: This is the mongoose/mongodb schema for a Batch. A batch contains the data about which sequence this batch is running, who initiated the batch, and other metadata about the batch
- This mongoose model can be accessed by the Controller REF: A.3

```tsx
import mongoose from "mongoose"
import type { SequenceModel } from "./Sequence"

export interface BatchType extends mongoose.Document {
  name: string
  sequence: mongoose.Types.ObjectId
  initiator: string
  createdAt: Date
  updatedAt: Date
  status: "in_progress" | "completed" | "paused"
}

export interface BatchModel {
  _id: mongoose.Types.ObjectId
  sequence: mongoose.Types.ObjectId
  name: string
  initiator: string
  createdAt: Date
  updatedAt: Date
  status: "in_progress" | "completed" | "paused"
}

export interface BatchModelPopulated {
  _id: mongoose.Types.ObjectId
  sequence: SequenceModel
  name: string
  initiator: string
  createdAt: Date
  updatedAt: Date
  status: "in_progress" | "completed" | "paused"
}

const BatchSchema = new mongoose.Schema<BatchType>(
  {
    name: {
      type: String,
      required: true,
    },
    sequence: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Sequence",
      required: true,
    },
    initiator: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["in_progress", "completed", "paused"],
      default: "in_progress",
    },
  },
  { timestamps: true }
)

export default mongoose.models?.Batch
  || mongoose.model<BatchType>("Batch", BatchSchema) 
```

REF: B.3

- Purpose: This is the mongoose/mongodb schema for a Contact. The contact is the base database model which contains the end contacts name, email, phone, etc. It is referenced by Campaign Controller in REF: B.3
- This mongoose model can be accessed by the Controller REF: A.3

```tsx
import mongoose from "mongoose"

export interface ContactType extends mongoose.Document {
  fName: string;
  lName: string;
  email: string;
  phone: string;
  state: string;
  practiceName: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ContactModel {
  _id: mongoose.Types.ObjectId;
  fName: string;
  lName: string;
  email: string;
  phone: string;
  state: string;
  practiceName: string;
  createdAt: Date;
  updatedAt: Date;
}

const ContactSchema = new mongoose.Schema<ContactType>(
  {
    fName: {
      type: String,
      required: true,
    },
    lName: {
      type: String,
      required: true,
    },
    practiceName: {
      type: String,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
    },
    state: {
      type: String,
    },
  },
  { timestamps: true }
)

export default mongoose.models?.Contact
  || mongoose.model<ContactType>("Contact", ContactSchema) 
```

REF: B.4

- Purpose: This is the mongoose/mongodb schema for a Campaign. A campaign model contains all the information about how the campaign is progressing, message history, views/opens, and other metadata. It forms the backbone of the outreach app
- This mongoose model can be accessed by the Controller REF: A.3

```tsx
import mongoose from "mongoose"

import type { BatchModelPopulated } from "./Batch"
import type { ContactModel } from "./Contact"

export interface Message {
  messageId: string
  sentAt: Date
  opens: number
  clicks: number
}

export type CampaignStatus =
  | "in_progress"
  | "complete_no_response"
  | "complete_with_response"
  | "complete_positive_response"
  | "complete_negative_response"
  | "failed"
  | "paused"

export interface CampaignType extends mongoose.Document {
  contact: mongoose.Types.ObjectId
  status: CampaignStatus
  messageHistory: Message[]
  lastCompletedStep: number
  lastCompletedDate: Date | null
  batch: mongoose.Types.ObjectId
  threadId: string
  createdAt: Date
  updatedAt: Date
}

export interface CampaignModel {
  _id: mongoose.Types.ObjectId
  contact: mongoose.Types.ObjectId
  status: CampaignStatus
  messageHistory: Message[]
  lastCompletedStep: number
  lastCompletedDate: Date | null
  batch: mongoose.Types.ObjectId
  threadId: string
  createdAt: Date
  updatedAt: Date
}

export interface CampaignModelPopulated {
  _id: mongoose.Types.ObjectId
  contact: ContactModel
  status: CampaignStatus
  messageHistory: Message[]
  lastCompletedStep: number
  lastCompletedDate: Date | null
  batch: BatchModelPopulated
  threadId: string
  createdAt: Date
  updatedAt: Date
}

const CampaignSchema = new mongoose.Schema<CampaignType>(
  {
    contact: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Contact",
      required: true,
    },
    status: {
      type: String,
      enum: [
        "in_progress",
        "complete_no_response",
        "complete_with_response",
        "complete_positive_response",
        "complete_negative_response",
        "failed",
        "paused",
      ],
      required: true,
      default: "in_progress",
    },
    batch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Batch",
      required: true,
    },
    threadId: {
      type: String,
      required: false,
    },
    messageHistory: {
      type: [Object],
      required: true,
      default: [],
    },
    lastCompletedStep: {
      type: Number,
      required: true,
      default: -1, // -1 indicates no steps completed yet
    },
    lastCompletedDate: {
      type: Date,
      required: false,
    },
  },
  { timestamps: true }
)

export default mongoose.models?.Campaign
  || mongoose.model<CampaignType>("Campaign", CampaignSchema) 
```

REF: C.1

- Purpose: This is a link to the docs from LiveKit, which is the provider around OpenAI Realtime API to make voice calls
- It should be implemented in a new function callPhone, similar to sendEmail REF: A.2

https://docs.livekit.io/agents/openai/overview/

REF: D.1

- Purpose: Sample prompt from Sequence REF: B.1 via the message property, will be sent to the voice agent directly before initiating a call
- Components of call (in order)
    - **Greeting**
        - *Note: Voice agent to listen for end-user to introduce themselves. 9 times out of 10 end-user will be front desk staff.*
        - Voice Agent: “Hello, this is Chelsea calling from DocShield. How are you doing today?”
    - **DocShield Intro**
        - End-user: “What’s DocShield?” or “How can I help you?”
            - Voice Agent: “We’re a Harvard-funded start-up that helps independent physicians save on their malpractice insurance. We were hoping to schedule a meeting with Dr. Smith and show him how we might be able to lower his malpractice premium.”
    - **Objection handling - the end-user may ask these questions before agreeing to schedule a meeting**
        - *End-user will generally be impatient during this stage. Voice agent to try to keep responses clear and concise. End-user may hang up which is ok.*
        - End-user: “Dr. Smith already has malpractice insurance”
            - Voice agent: “Yes, our customers almost always have existing malpractice coverage when they work with us. We allow them to benchmark their existing policy in 20 minutes to see if they can lower their premium without sacrificing on quality.”
        - End-user: “We’ll need to get that approved by our practice manager” (or by another individual in the practice)
            - Voice agent: “Sure, could you give me the name and email of your practice manager so I can get in touch with them?”
                - *Note: If the front desk wants to transfer your call directly to the practice manager or another individual, be sure to ask them for the persons email and name before being transferred as the transfers often won’t be picked up*
        - End-user: “We don’t do meetings with reps”
            - Voice agent: “We hear that all time - just so you know we’re not a pharma company, so if that’s the main hold up on meeting with us that won’t be an issue.”
        - End-user: “How much does it cost?”
            - Voice agent: “We’re paid by the insurers we work with so we don’t charge physicians anything. Getting quotes through us is 100% free and no strings attached for your practice.”
        - End-user: “Can you bring in lunch for the office?”
            - Voice agent: “Yes, we usually just have a video call with whomever handles the malpractice insurance, but I can get a $100 lunch credit and we can put that toward a DoorDash delivery of whatever the office would like.”
    - **Scheduling a meeting - Voice agent’s north star**
        - *Voice agent’s ultimate goal is getting a meeting scheduled with whomever handles the malpractice insurance for the practice, either Dr. Smith (or another one of the physicians at the practice) or the practice manager.*
        - *The meeting will be a video conference, which voice agent will send a google invite for via email. To do this, voice agent will need to ask the best email to send the invite to.*
        - *Voice agent will be checking google calendar to see availability. However, Voice agent should NEVER provide a list of many possible dates when asked when DocShield can do the meeting. Instead, voice agent should always respond by asking whomever will be taking the meeting at the practice (e.g. Dr. Smith) is free to meet. This is important - it’s a bad look to offer the physician practice every day of the week because it makes it seem like no other practices want to speak with us. Try to schedule the meeting within 1 to 21 days from the date of the call.*
        - *Meetings will typically be scheduled during 10am-2pm on weekdays, but DocShield can happily accommodate times outside of this range*
    - **Some calls**: Handling a rejection
        - End-user: “We’re not interested at this time” (or some variation thereof)
            - Voice agent: “No worries - could I just ask why not?”
            - End-user: “The doctor is happy with his current insurer”
            - Voice agent: “Got it, do you know the last time he’s gotten quotes to compare to his current policy? You’d be surprised how often we find 20% savings or more on coverage”
    - **Some calls**: Leaving a voicemail if no one picks up
        - “Hello, this is Chelsea calling from DocShield. We’re a Harvard funded start-up that helps independent physicians like Dr. Smith save on their malpractice insurance premiums without sacrificing on coverage quality. Our site can help you save over $100K over the course of your career in just 20 minutes. Please give me a call back at (914) 820-5734 so we can show you how it works.”
    - **Some calls:** Navigating a phone tree
        - *Voice agent should select whatever dial options lead to the front desk. This won’t be options like “billing”, “doctor referrals”, “appointment follow-up”, or “emergency help”. NEVER select the emergency line option, this will upset our end-user. Usually the best option is “patient scheduling” or “schedule a new appointment”.*
    - **Other notes:**
        - *If voice agent is asked whether it is an insurance agent, it must say no. It can explain that it is a malpractice insurance specialist but not a licensed insurance producer. Its boss at DocShield is a licensed insurance producer who will engage in all policy specific questions and advice.*
        - *If end user asks the voice agent whether it is human or an AI, voice agent should reply that it is an AI malpractice specialist that has worked with dozens of physician practices*