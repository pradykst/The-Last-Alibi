import { gameErrorResponseSchema, publicErrorSchema } from '@alibi/protocol';
import type { GameDenialCode, GameErrorResponse, PublicError } from '@alibi/protocol';

const DENIAL_MESSAGES: Record<GameDenialCode, string> = {
  UNKNOWN_SESSION: 'This fixture session is unknown or has expired.',
  INVALID_SESSION_STATE: 'This action is not available in the current session state.',
  UNKNOWN_PREDICATE: 'That certified question is not registered for this level.',
  PREDICATE_ALREADY_USED: 'That certified question has already been used.',
  DISCLOSURE_LIMIT_REACHED: 'All five certified disclosures have been used.',
  UNSAFE_DISCLOSURE: 'That question could reduce a branch below two candidates.',
  OPERATION_ALREADY_PENDING: 'Another authoritative operation is already pending.',
  MALFORMED_REQUEST: 'The request did not match the public game protocol.',
};

const DENIAL_STATUS: Record<GameDenialCode, number> = {
  UNKNOWN_SESSION: 404,
  INVALID_SESSION_STATE: 409,
  UNKNOWN_PREDICATE: 404,
  PREDICATE_ALREADY_USED: 409,
  DISCLOSURE_LIMIT_REACHED: 409,
  UNSAFE_DISCLOSURE: 409,
  OPERATION_ALREADY_PENDING: 409,
  MALFORMED_REQUEST: 400,
};

export class GameServiceError extends Error {
  public readonly publicError: PublicError;

  public constructor(
    public readonly statusCode: number,
    code: string,
    message: string,
    retryable = false,
  ) {
    super(message);
    this.name = 'GameServiceError';
    this.publicError = publicErrorSchema.parse({
      code,
      message,
      retryable,
    });
  }

  public static denial(code: GameDenialCode): GameServiceError {
    return new GameServiceError(DENIAL_STATUS[code], code, DENIAL_MESSAGES[code]);
  }
}

export function gameErrorResponse(error: unknown): {
  statusCode: number;
  body: GameErrorResponse;
} {
  if (error instanceof GameServiceError) {
    return {
      statusCode: error.statusCode,
      body: gameErrorResponseSchema.parse({
        ok: false,
        error: error.publicError,
      }),
    };
  }

  return {
    statusCode: 500,
    body: gameErrorResponseSchema.parse({
      ok: false,
      error: {
        code: 'GAME_REQUEST_FAILED',
        message: 'The game request could not be completed.',
        retryable: false,
      },
    }),
  };
}
