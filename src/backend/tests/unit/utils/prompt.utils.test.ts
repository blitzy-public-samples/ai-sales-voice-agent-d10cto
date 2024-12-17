/**
 * @fileoverview Unit tests for prompt utilities module
 * @version 1.0.0
 */

import { 
  interpolatePrompt,
  generateGreetingPrompt,
  generateIntroductionPrompt
} from '../../../src/utils/prompt.utils';

import {
  GREETING_PROMPTS,
  INTRODUCTION_PROMPTS
} from '../../../src/constants/prompts';

// Test data constants
const TEST_CONTACT_INFO = {
  practiceName: 'Test Medical Practice',
  contactName: 'Dr. Smith',
  contactTitle: 'Medical Director',
  agentName: 'AI Agent'
};

const TEST_PRACTICE_INFO = {
  practiceName: 'Test Medical Practice',
  specialties: ['Family Medicine', 'Pediatrics'],
  currentProvider: 'OldInsure Co',
  estimatedSavings: 25
};

describe('interpolatePrompt', () => {
  it('should successfully interpolate all template variables', () => {
    const template = 'Hello {{contactName}} from {{practiceName}}';
    const variables = {
      contactName: TEST_CONTACT_INFO.contactName,
      practiceName: TEST_CONTACT_INFO.practiceName,
      contactTitle: TEST_CONTACT_INFO.contactTitle,
      agentName: TEST_CONTACT_INFO.agentName
    };

    const result = interpolatePrompt(template, variables);
    expect(result).toBe(`Hello ${TEST_CONTACT_INFO.contactName} from ${TEST_CONTACT_INFO.practiceName}`);
  });

  it('should preserve voice quality markers during interpolation', () => {
    const template = '<break time="300ms"/> Hello {{contactName}} <emphasis>from DocShield</emphasis>';
    const variables = {
      contactName: TEST_CONTACT_INFO.contactName,
      practiceName: TEST_CONTACT_INFO.practiceName,
      contactTitle: TEST_CONTACT_INFO.contactTitle,
      agentName: TEST_CONTACT_INFO.agentName
    };

    const result = interpolatePrompt(template, variables);
    expect(result).toContain('<break time="300ms"/>');
    expect(result).toContain('<emphasis>from DocShield</emphasis>');
  });

  it('should throw error for missing required variables', () => {
    const template = 'Hello {{contactName}} from {{practiceName}}';
    const variables = {
      contactName: TEST_CONTACT_INFO.contactName
      // practiceName intentionally omitted
    };

    expect(() => interpolatePrompt(template, variables)).toThrow('Missing required variables');
  });

  it('should handle empty template string gracefully', () => {
    expect(() => interpolatePrompt('', TEST_CONTACT_INFO)).toThrow('Prompt template cannot be empty');
  });

  it('should preserve text without template variables', () => {
    const template = 'This is a static message';
    const result = interpolatePrompt(template, TEST_CONTACT_INFO);
    expect(result).toBe('This is a static message');
  });

  it('should handle multiple instances of same variable', () => {
    const template = '{{contactName}} is here. Calling for {{contactName}}';
    const variables = {
      contactName: TEST_CONTACT_INFO.contactName,
      practiceName: TEST_CONTACT_INFO.practiceName,
      contactTitle: TEST_CONTACT_INFO.contactTitle,
      agentName: TEST_CONTACT_INFO.agentName
    };

    const result = interpolatePrompt(template, variables);
    expect(result).toBe(`${TEST_CONTACT_INFO.contactName} is here. Calling for ${TEST_CONTACT_INFO.contactName}`);
  });
});

describe('generateGreetingPrompt', () => {
  it('should generate appropriate front desk greeting', () => {
    const context = {
      recipientType: 'FRONT_DESK' as const,
      contactInfo: TEST_CONTACT_INFO,
      agentName: TEST_CONTACT_INFO.agentName
    };

    const result = generateGreetingPrompt(context);
    expect(result).toContain(TEST_CONTACT_INFO.contactName);
    expect(result).toContain(TEST_CONTACT_INFO.contactTitle);
    expect(result).toContain('DocShield');
  });

  it('should generate personalized decision maker greeting', () => {
    const context = {
      recipientType: 'DECISION_MAKER' as const,
      contactInfo: TEST_CONTACT_INFO,
      agentName: TEST_CONTACT_INFO.agentName
    };

    const result = generateGreetingPrompt(context);
    expect(result).toContain(TEST_CONTACT_INFO.contactName);
    expect(result).toContain('DocShield');
    expect(result).toContain('good time');
  });

  it('should generate clear voicemail greeting', () => {
    const context = {
      recipientType: 'VOICEMAIL' as const,
      contactInfo: TEST_CONTACT_INFO,
      agentName: TEST_CONTACT_INFO.agentName
    };

    const result = generateGreetingPrompt(context);
    expect(result).toContain('888-DOCSHIELD');
    expect(result).toContain('follow up with an email');
    expect(result).toContain(TEST_CONTACT_INFO.practiceName);
  });

  it('should throw error for invalid recipient type', () => {
    const context = {
      recipientType: 'INVALID_TYPE' as any,
      contactInfo: TEST_CONTACT_INFO,
      agentName: TEST_CONTACT_INFO.agentName
    };

    expect(() => generateGreetingPrompt(context)).toThrow('Invalid recipient type');
  });

  it('should preserve voice quality markers in greetings', () => {
    const context = {
      recipientType: 'FRONT_DESK' as const,
      contactInfo: TEST_CONTACT_INFO,
      agentName: TEST_CONTACT_INFO.agentName
    };

    const result = generateGreetingPrompt(context);
    expect(result).toContain('<break');
    expect(result).toMatch(/time=["'][\d.]+s["']/);
  });
});

describe('generateIntroductionPrompt', () => {
  it('should combine company intro and value proposition', () => {
    const result = generateIntroductionPrompt(TEST_PRACTICE_INFO);
    expect(result).toContain('DocShield is a leading provider');
    expect(result).toContain('saved 20-30% on their premiums');
  });

  it('should interpolate practice information correctly', () => {
    const result = generateIntroductionPrompt(TEST_PRACTICE_INFO);
    expect(result).toContain(TEST_PRACTICE_INFO.practiceName);
    expect(result).toContain(TEST_PRACTICE_INFO.currentProvider);
  });

  it('should handle missing practice details gracefully', () => {
    const minimalInfo = {
      practiceName: TEST_PRACTICE_INFO.practiceName,
      specialties: TEST_PRACTICE_INFO.specialties
    };

    const result = generateIntroductionPrompt(minimalInfo);
    expect(result).toContain('your current provider');
    expect(result).toContain('competitive rate');
  });

  it('should maintain proper voice quality markers', () => {
    const result = generateIntroductionPrompt(TEST_PRACTICE_INFO);
    expect(result).toContain('<break');
    expect(result).toContain('<emphasis');
  });

  it('should include all value proposition points', () => {
    const result = generateIntroductionPrompt(TEST_PRACTICE_INFO);
    expect(result).toContain('Cyber liability protection');
    expect(result).toContain('Regulatory defense coverage');
    expect(result).toContain('risk management consulting');
  });

  it('should format estimated savings correctly', () => {
    const result = generateIntroductionPrompt(TEST_PRACTICE_INFO);
    expect(result).toContain(`${TEST_PRACTICE_INFO.estimatedSavings}% less than your current premium`);
  });

  it('should throw error for missing practice name', () => {
    const invalidInfo = {
      specialties: TEST_PRACTICE_INFO.specialties,
      currentProvider: TEST_PRACTICE_INFO.currentProvider
    };

    expect(() => generateIntroductionPrompt(invalidInfo as any)).toThrow();
  });

  it('should optimize for natural conversation flow', () => {
    const result = generateIntroductionPrompt(TEST_PRACTICE_INFO);
    expect(result).toMatch(/\. <break[^>]+> /);
    expect(result).toMatch(/\, <break[^>]+> /);
  });
});