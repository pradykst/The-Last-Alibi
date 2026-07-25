import { resolveRuntimeMode } from '@alibi/runtime/server';
import type { RuntimeEnvironment } from '@alibi/runtime/server';

import { GameServiceError } from './errors';

export function runFixtureGameOperation<T>(
  operation: () => T,
  environment: RuntimeEnvironment = process.env,
): T {
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

  if (mode === 'live') {
    throw new GameServiceError(
      503,
      'LIVE_GAME_CAPABILITY_UNAVAILABLE',
      'The live game capability is unavailable. Fixture logic was not executed.',
    );
  }

  return operation();
}
