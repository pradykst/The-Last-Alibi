import { createPublicRuntimeStatus, toPublicRuntimeError } from '@alibi/runtime/server';
import type { PublicError } from '@alibi/protocol';
import type { RuntimeEnvironment } from '@alibi/runtime/server';

export type PageRuntimeModel =
  | {
      available: true;
      mode: 'fixture' | 'live';
      label: string;
      summary: string;
    }
  | {
      available: false;
      label: 'Unavailable';
      summary: string;
      error: PublicError;
    };

export function buildPageRuntimeModel(
  environment: RuntimeEnvironment = process.env,
): PageRuntimeModel {
  try {
    const runtime = createPublicRuntimeStatus(environment);
    const blockedCapabilities = runtime.capabilities.filter((capability) => capability.blocking);

    return {
      available: true,
      mode: runtime.mode,
      label: runtime.label,
      summary:
        blockedCapabilities.length === 0
          ? 'All capabilities are clearly labelled fixtures.'
          : `${blockedCapabilities.length} live capabilities are blocked as unavailable.`,
    };
  } catch (error: unknown) {
    const publicError = toPublicRuntimeError(error);
    return {
      available: false,
      label: 'Unavailable',
      summary: publicError.message,
      error: publicError,
    };
  }
}
