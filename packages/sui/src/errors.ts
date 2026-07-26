export type AlibiSuiErrorCode =
  | 'INVALID_CONFIGURATION'
  | 'INVALID_INPUT'
  | 'MALFORMED_PUBLIC_STATE'
  | 'OBJECT_TYPE_MISMATCH'
  | 'MALFORMED_EVENT'
  | 'RPC_UNAVAILABLE'
  | 'SUBMISSION_FAILED'
  | 'CONFIRMATION_FAILED'
  | 'PROVER_FAILED';

export class AlibiSuiError extends Error {
  readonly code: AlibiSuiErrorCode;
  readonly retryable: boolean;

  constructor(code: AlibiSuiErrorCode, message: string, retryable = false) {
    super(message);
    this.name = 'AlibiSuiError';
    this.code = code;
    this.retryable = retryable;
  }

  toJSON(): { code: AlibiSuiErrorCode; message: string; retryable: boolean } {
    return { code: this.code, message: this.message, retryable: this.retryable };
  }
}

export function sanitizedError(
  code: AlibiSuiErrorCode,
  message: string,
  retryable = false,
): AlibiSuiError {
  return new AlibiSuiError(code, message, retryable);
}
