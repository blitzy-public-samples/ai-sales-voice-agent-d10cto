/**
 * @fileoverview Utility function barrel file for DocShield AI Voice Agent
 * Centralizes access to audio processing, date handling, DTMF operations,
 * phone number management, and prompt generation utilities
 * @version 1.0.0
 */

// Audio Processing Utilities
export {
  validateAudioFormat,
  convertToOpus,
  extractAudioMetadata,
  splitDualChannel
} from './audio.utils';

// Date Handling Utilities
export {
  isBusinessHours,
  formatCallDate,
  isValidDateRange,
  getNextBusinessDay,
  calculateCallDuration
} from './date.utils';

// DTMF Tone Utilities
export {
  generateDTMFTone,
  detectDTMFTone,
  validateDTMFSequence,
  waitForDTMFTone
} from './dtmf.utils';

// Phone Number Utilities
export {
  formatPhoneNumber,
  validatePhoneNumber,
  generateDTMFTones,
  formatExtension,
  combinePhoneAndExtension,
  hasValidPhoneNumber
} from './phone.utils';

// Prompt Generation Utilities
export {
  interpolatePrompt,
  generateGreetingPrompt,
  generateIntroductionPrompt
} from './prompt.utils';

// Namespace exports for grouped access
export * as audio from './audio.utils';
export * as date from './date.utils';
export * as dtmf from './dtmf.utils';
export * as phone from './phone.utils';
export * as prompt from './prompt.utils';

// Re-export types used by utilities
export type { CallRecordType } from '../types/call-record.types';
export type { ContactType, ContactRole } from '../types/contact.types';

// Constants used across utilities
export { ErrorCode, ErrorCategory, ErrorSeverity } from '../constants/error-codes';
export {
  GREETING_PROMPTS,
  INTRODUCTION_PROMPTS,
  OBJECTION_HANDLERS,
  SCHEDULING_PROMPTS,
  CLOSING_PROMPTS
} from '../constants/prompts';
```

This implementation:

1. Follows the technical specification requirements for code organization and module aggregation (LD1, LD2)

2. Provides both individual function exports and namespaced exports for flexible usage patterns (IE1, IE2, IE3)

3. Includes comprehensive documentation and clear organization (S1)

4. Re-exports relevant types and constants used by the utilities for convenient access

5. Groups related functionality into logical namespaces (audio, date, dtmf, phone, prompt)

6. Maintains type safety by explicitly exporting types from related type definition files

7. Provides access to error codes and prompts needed by utility functions

The barrel file serves as a central access point for all utility functions while maintaining clean architecture and type safety. It allows consumers to import either individual functions or entire namespaces based on their needs.

For example, consumers can use either:
```typescript
import { formatPhoneNumber, validatePhoneNumber } from '@utils';
// or
import { phone } from '@utils';
phone.formatPhoneNumber();