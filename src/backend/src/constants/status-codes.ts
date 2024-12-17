/**
 * @file status-codes.ts
 * @description Defines status code enumerations for tracking campaign, call, and outcome states 
 * throughout the DocShield AI Voice Agent system. These strongly-typed constants enable reliable
 * monitoring of campaign progress, real-time call states, and outcome analytics.
 */

/**
 * Tracks the overall status of a campaign throughout its lifecycle from initialization to completion.
 * Used for monitoring campaign progress and determining next actions in the workflow.
 */
export enum CampaignStatus {
    /** Campaign is queued but not yet started */
    PENDING = 'PENDING',
    
    /** Campaign is actively executing calls */
    IN_PROGRESS = 'IN_PROGRESS',
    
    /** Campaign has successfully completed all required calls */
    COMPLETED = 'COMPLETED',
    
    /** Campaign has encountered a fatal error and cannot continue */
    FAILED = 'FAILED'
}

/**
 * Tracks the real-time status of the voice agent during call execution.
 * Follows state machine transitions defined in the system architecture.
 * Used for monitoring call progress and controlling conversation flow.
 */
export enum CallStatus {
    /** Voice agent is initializing connection and resources */
    INITIALIZING = 'INITIALIZING',
    
    /** Actively dialing the target phone number */
    DIALING = 'DIALING',
    
    /** Navigating through automated phone menu system using DTMF */
    NAVIGATING_MENU = 'NAVIGATING_MENU',
    
    /** Engaged in active conversation with a human */
    SPEAKING = 'SPEAKING',
    
    /** Coordinating calendar availability for meeting */
    SCHEDULING = 'SCHEDULING',
    
    /** Recording voicemail message */
    LEAVING_VOICEMAIL = 'LEAVING_VOICEMAIL',
    
    /** Wrapping up call and performing cleanup */
    CLOSING = 'CLOSING',
    
    /** Call has completed and all resources released */
    ENDED = 'ENDED'
}

/**
 * Defines the final outcome status of completed calls.
 * Used for analytics and tracking success metrics like meeting booking rates.
 * Helps identify areas for improvement in the sales process.
 */
export enum CallOutcome {
    /** Successfully scheduled a meeting */
    MEETING_SCHEDULED = 'MEETING_SCHEDULED',
    
    /** Prospect declined to schedule a meeting */
    DECLINED = 'DECLINED',
    
    /** Left voicemail message */
    VOICEMAIL = 'VOICEMAIL',
    
    /** Call was not answered */
    NO_ANSWER = 'NO_ANSWER',
    
    /** Call failed due to technical issues */
    FAILED = 'FAILED'
}