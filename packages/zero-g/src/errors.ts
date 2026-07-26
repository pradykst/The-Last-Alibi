import type { PublicZeroGError } from './types';

export type ZeroGErrorCode =
  | 'ZERO_G_DISABLED'
  | 'ZERO_G_CONFIGURATION_INVALID'
  | 'ZERO_G_PROVIDER_UNAVAILABLE'
  | 'ZERO_G_PROVIDER_MISMATCH'
  | 'ZERO_G_REQUEST_TIMEOUT'
  | 'ZERO_G_RESPONSE_TOO_LARGE'
  | 'ZERO_G_INFERENCE_FAILED'
  | 'ZERO_G_RESPONSE_ID_MISSING'
  | 'ZERO_G_VERIFICATION_FAILED'
  | 'ZERO_G_OUTPUT_MALFORMED'
  | 'ZERO_G_UNKNOWN_ACTION'
  | 'ZERO_G_UNKNOWN_LEAD'
  | 'ZERO_G_UNKNOWN_PREDICATE'
  | 'ZERO_G_LIVE_CONTEXT_UNAVAILABLE'
  | 'ZERO_G_TESTIMONY_BUSY';

const PUBLIC_MESSAGES: Record<ZeroGErrorCode, string> = {
  ZERO_G_DISABLED: '0G inference is disabled.',
  ZERO_G_CONFIGURATION_INVALID: '0G inference is not configured safely.',
  ZERO_G_PROVIDER_UNAVAILABLE: 'The configured 0G provider is unavailable.',
  ZERO_G_PROVIDER_MISMATCH: 'The configured 0G provider does not match the required service.',
  ZERO_G_REQUEST_TIMEOUT: 'The 0G inference request timed out.',
  ZERO_G_RESPONSE_TOO_LARGE: 'The 0G inference response exceeded the permitted size.',
  ZERO_G_INFERENCE_FAILED: 'The 0G inference request failed.',
  ZERO_G_RESPONSE_ID_MISSING: 'The 0G response could not be verified.',
  ZERO_G_VERIFICATION_FAILED: 'The 0G response failed verification.',
  ZERO_G_OUTPUT_MALFORMED: 'The verified 0G response did not match the required format.',
  ZERO_G_UNKNOWN_ACTION: 'The verified 0G response used an unknown action.',
  ZERO_G_UNKNOWN_LEAD: 'The verified 0G response referenced an unknown lead.',
  ZERO_G_UNKNOWN_PREDICATE: 'The verified 0G response referenced an unknown predicate.',
  ZERO_G_LIVE_CONTEXT_UNAVAILABLE: 'Live public session context is unavailable.',
  ZERO_G_TESTIMONY_BUSY: 'Another testimony request is already pending.',
};

const RETRYABLE_CODES = new Set<ZeroGErrorCode>([
  'ZERO_G_PROVIDER_UNAVAILABLE',
  'ZERO_G_REQUEST_TIMEOUT',
  'ZERO_G_INFERENCE_FAILED',
  'ZERO_G_TESTIMONY_BUSY',
]);

export class ZeroGError extends Error {
  public constructor(public readonly code: ZeroGErrorCode) {
    super(PUBLIC_MESSAGES[code]);
    this.name = 'ZeroGError';
  }

  public get publicError(): PublicZeroGError {
    return {
      code: this.code,
      message: PUBLIC_MESSAGES[this.code],
      retryable: RETRYABLE_CODES.has(this.code),
    };
  }
}

export function toPublicZeroGError(error: unknown): PublicZeroGError {
  if (error instanceof ZeroGError) {
    return error.publicError;
  }

  return {
    code: 'ZERO_G_INFERENCE_FAILED',
    message: PUBLIC_MESSAGES.ZERO_G_INFERENCE_FAILED,
    retryable: false,
  };
}
