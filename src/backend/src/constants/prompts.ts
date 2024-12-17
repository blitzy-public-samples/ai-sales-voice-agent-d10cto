/**
 * @fileoverview Core conversation prompts and scripts for DocShield AI Voice Agent
 * @version 1.0.0
 * 
 * Contains structured prompts optimized for natural voice synthesis covering:
 * - Greetings and introductions
 * - Value propositions
 * - Objection handling
 * - Meeting scheduling
 * - Call closings
 */

/**
 * Template variable keys for prompt interpolation
 */
export const PROMPT_INTERPOLATION_KEYS = {
  PRACTICE_NAME: '{{practiceName}}',
  CONTACT_NAME: '{{contactName}}',
  CONTACT_TITLE: '{{contactTitle}}',
  AGENT_NAME: '{{agentName}}',
  MEETING_DATE: '{{meetingDate}}',
  MEETING_TIME: '{{meetingTime}}',
  CURRENT_PROVIDER: '{{currentProvider}}',
  PREMIUM_ESTIMATE: '{{premiumEstimate}}'
} as const;

/**
 * Initial greeting prompts for different call scenarios
 */
export const GREETING_PROMPTS = {
  FRONT_DESK: `Hello, this is {{agentName}} from DocShield. <break time="0.3s"/> I'm calling to speak with {{contactName}}, your {{contactTitle}}. Is {{contactName}} available?`,
  
  DECISION_MAKER: `Hi {{contactName}}, this is {{agentName}} from DocShield. <break time="0.2s"/> I hope I caught you at a good time.`,
  
  VOICEMAIL: `Hi {{contactName}}, this is {{agentName}} from DocShield calling about {{practiceName}}'s malpractice insurance coverage. <break time="0.3s"/> 
    I'd love to discuss how we can help protect your practice while potentially reducing your premiums. <break time="0.2s"/>
    Please give me a call back at your convenience at 888-DOCSHIELD. <break time="0.2s"/>
    I'll also follow up with an email with more information. Thanks and have a great day!`
} as const;

/**
 * Company introduction and value proposition prompts
 */
export const INTRODUCTION_PROMPTS = {
  COMPANY_INTRO: `DocShield is a leading provider of medical malpractice insurance, specifically designed for independent medical practices like {{practiceName}}. <break time="0.3s"/>
    We use advanced risk analytics and proactive risk management to offer comprehensive coverage at competitive rates.`,
    
  VALUE_PROPOSITION: `Many practices we work with have saved 20-30% on their premiums while getting enhanced coverage features like: <break time="0.2s"/>
    - Cyber liability protection <break time="0.1s"/>
    - Regulatory defense coverage <break time="0.1s"/>
    - And free risk management consulting <break time="0.3s"/>
    Would you be interested in learning how we could help {{practiceName}}?`
} as const;

/**
 * Response scripts for handling common sales objections
 */
export const OBJECTION_HANDLERS = {
  NOT_INTERESTED: `I understand you may not be actively looking to switch providers right now. <break time="0.2s"/>
    Many of our current clients initially felt the same way, but were glad they took 15 minutes to learn about our unique offering. <break time="0.3s"/>
    Would you be open to a brief conversation to see if we could add value to {{practiceName}}?`,
    
  ALREADY_INSURED: `That's great that you have coverage with {{currentProvider}}. <break time="0.2s"/>
    We actually work with many practices who switched to us from {{currentProvider}}. <break time="0.3s"/>
    Based on your practice profile, we estimate we could offer similar or better coverage at around {{premiumEstimate}} annually. <break time="0.2s"/>
    Would it be worth exploring if we could help you optimize your coverage?`,
    
  TOO_EXPENSIVE: `I appreciate that cost is an important factor. <break time="0.3s"/>
    That's exactly why we'd love to show you our coverage options. <break time="0.2s"/>
    Many practices find that we offer more comprehensive protection at a lower total cost. <break time="0.3s"/>
    Could we schedule a quick call to review some specific numbers for {{practiceName}}?`,
    
  CALL_BACK_LATER: `I understand timing is important. <break time="0.2s"/>
    When would be a better time for us to have a brief conversation about optimizing {{practiceName}}'s malpractice coverage? <break time="0.3s"/>
    I'm happy to schedule a specific time that works best for you.`
} as const;

/**
 * Meeting scheduling and confirmation dialogue scripts
 */
export const SCHEDULING_PROMPTS = {
  PROPOSE_MEETING: `I'd love to schedule a brief 15-minute call to show you exactly how we could help {{practiceName}}. <break time="0.3s"/>
    I have availability {{meetingDate}} at {{meetingTime}} - would that work for you?`,
    
  CONFIRM_TIME: `Great! Just to confirm, we'll meet on {{meetingDate}} at {{meetingTime}}. <break time="0.2s"/>
    I'll send you a calendar invitation with the conference details right after our call.`,
    
  SCHEDULE_SUCCESS: `Excellent! You'll receive a calendar invitation shortly. <break time="0.3s"/>
    I look forward to showing you how DocShield can help protect {{practiceName}} while optimizing your premium costs.`
} as const;

/**
 * Call closing scripts for different conversation outcomes
 */
export const CLOSING_PROMPTS = {
  POSITIVE_CLOSE: `Thank you for your time today, {{contactName}}. <break time="0.2s"/>
    I'm excited to speak with you again on {{meetingDate}}. <break time="0.3s"/>
    Have a great rest of your day!`,
    
  NEUTRAL_CLOSE: `Thank you for taking my call today, {{contactName}}. <break time="0.2s"/>
    I'll follow up with some information by email, and I look forward to connecting again soon. <break time="0.3s"/>
    Have a great day!`,
    
  NEGATIVE_CLOSE: `I appreciate you taking the time to speak with me today, {{contactName}}. <break time="0.2s"/>
    If your needs change in the future, please don't hesitate to reach out. <break time="0.3s"/>
    Take care!`
} as const;

/**
 * Interpolates template variables in prompts while optimizing for voice synthesis
 * @param promptTemplate - The prompt template string containing variables
 * @param variables - Object containing variable values to interpolate
 * @returns Interpolated and voice-optimized prompt string
 */
export const interpolatePrompt = (
  promptTemplate: string,
  variables: Record<string, string>
): string => {
  if (!promptTemplate) {
    throw new Error('Prompt template is required');
  }

  if (!variables || typeof variables !== 'object') {
    throw new Error('Variables object is required');
  }

  let interpolatedPrompt = promptTemplate;

  // Replace all template variables with provided values
  Object.entries(variables).forEach(([key, value]) => {
    const template = `{{${key}}}`;
    interpolatedPrompt = interpolatedPrompt.replace(new RegExp(template, 'g'), value);
  });

  // Validate all variables were replaced
  if (interpolatedPrompt.includes('{{')) {
    throw new Error('Not all template variables were provided');
  }

  return interpolatedPrompt;
};