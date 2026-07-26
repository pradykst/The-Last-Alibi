import { resolveRuntimeMode } from '@alibi/runtime/server';
import type { RuntimeEnvironment } from '@alibi/runtime/server';

import { GameServiceError } from './errors';

export function runTestimonyOperation<T>(
  adapters: {
    fixture: () => T | Promise<T>;
    live?: () => T | Promise<T>;
  },
  environment: RuntimeEnvironment = process.env,
): T | Promise<T> {
  let mode: 'fixture' | 'live';
  try {
    mode = resolveRuntimeMode(environment);
  } catch {
    throw new GameServiceError(
      503,
      'RUNTIME_CONFIGURATION_ERROR',
      'The game runtime is not configured safely.',
    );
  }

  if (mode === 'fixture') {
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
