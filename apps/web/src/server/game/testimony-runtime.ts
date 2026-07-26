import type { RuntimeEnvironment } from '@alibi/runtime/server';

import { GameServiceError } from './errors';

export function runTestimonyOperation<T>(
  adapters: {
    fixture: () => T | Promise<T>;
    live?: () => T | Promise<T>;
  },
  environment: RuntimeEnvironment = process.env,
): T | Promise<T> {
  const mode = environment['ALIBI_ZERO_G_MODE']?.trim() ?? 'disabled';
  if (mode !== 'disabled' && mode !== 'live') {
    throw new GameServiceError(
      503,
      'RUNTIME_CONFIGURATION_ERROR',
      'The 0G testimony runtime is not configured safely.',
    );
  }

  if (mode === 'disabled') {
    return adapters.fixture();
  }
  if (adapters.live === undefined) {
    throw new GameServiceError(
      503,
      'ZERO_G_LIVE_CONTEXT_UNAVAILABLE',
      'Live public session context is unavailable. Fixture testimony was not executed.',
    );
  }
  return adapters.live();
}
