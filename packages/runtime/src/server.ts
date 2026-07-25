import {
  CAPABILITY_KEYS,
  CAPABILITY_LABELS,
  publicErrorSchema,
  publicRuntimeStatusSchema,
  runtimeModeSchema,
} from '@alibi/protocol';
import type { CapabilityKey, PublicError, PublicRuntimeStatus, RuntimeMode } from '@alibi/protocol';

export type RuntimeEnvironment = Readonly<Record<string, string | undefined>>;

abstract class AlibiRuntimeError extends Error {
  public abstract readonly publicError: PublicError;

  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class RuntimeConfigurationError extends AlibiRuntimeError {
  public readonly publicError = publicErrorSchema.parse({
    code: 'RUNTIME_CONFIGURATION_ERROR',
    message: 'The runtime mode is not configured safely.',
    retryable: false,
  });

  public constructor(message = 'ALIBI_RUNTIME_MODE must be fixture or live.') {
    super(message);
  }
}

export class LiveCapabilityUnavailableError extends AlibiRuntimeError {
  public readonly publicError: PublicError;

  public constructor(public readonly capability: CapabilityKey) {
    super(`${CAPABILITY_LABELS[capability]} has no verified live adapter.`);
    this.publicError = publicErrorSchema.parse({
      code: 'LIVE_CAPABILITY_UNAVAILABLE',
      message: `${CAPABILITY_LABELS[capability]} is unavailable in live mode.`,
      retryable: false,
    });
  }
}

export class LiveCapabilityFailureError extends AlibiRuntimeError {
  public readonly publicError: PublicError;

  public constructor(public readonly capability: CapabilityKey) {
    super(`${CAPABILITY_LABELS[capability]} failed in live mode.`);
    this.publicError = publicErrorSchema.parse({
      code: 'LIVE_CAPABILITY_FAILED',
      message: `${CAPABILITY_LABELS[capability]} failed in live mode.`,
      retryable: true,
    });
  }
}

export function resolveRuntimeMode(environment: RuntimeEnvironment = process.env): RuntimeMode {
  const configuredMode = environment['ALIBI_RUNTIME_MODE'];
  const parsedMode = runtimeModeSchema.safeParse(configuredMode);

  if (parsedMode.success) {
    return parsedMode.data;
  }

  if (configuredMode !== undefined || environment['NODE_ENV'] === 'production') {
    throw new RuntimeConfigurationError();
  }

  return 'fixture';
}

export function createPublicRuntimeStatus(
  environment: RuntimeEnvironment = process.env,
): PublicRuntimeStatus {
  const mode = resolveRuntimeMode(environment);

  if (mode === 'fixture') {
    return publicRuntimeStatusSchema.parse({
      mode,
      label: 'Fixture',
      capabilities: CAPABILITY_KEYS.map((capability) => ({
        capability,
        state: 'fixture',
        mode,
        label: CAPABILITY_LABELS[capability],
        blocking: false,
      })),
    });
  }

  return publicRuntimeStatusSchema.parse({
    mode,
    label: 'Live (blocked)',
    capabilities: CAPABILITY_KEYS.map((capability) => {
      const error = new LiveCapabilityUnavailableError(capability);
      return {
        capability,
        state: 'unavailable',
        mode,
        label: CAPABILITY_LABELS[capability],
        blocking: true,
        error: error.publicError,
      };
    }),
  });
}

export async function executeCapability<T>(
  capability: CapabilityKey,
  adapters: {
    fixture: () => T | Promise<T>;
    live?: () => T | Promise<T>;
  },
  environment: RuntimeEnvironment = process.env,
): Promise<T> {
  const mode = resolveRuntimeMode(environment);

  if (mode === 'fixture') {
    return adapters.fixture();
  }

  if (adapters.live === undefined) {
    throw new LiveCapabilityUnavailableError(capability);
  }

  try {
    return await adapters.live();
  } catch (error: unknown) {
    if (error instanceof AlibiRuntimeError) {
      throw error;
    }

    throw new LiveCapabilityFailureError(capability);
  }
}

export function toPublicRuntimeError(error: unknown): PublicError {
  if (error instanceof AlibiRuntimeError) {
    return error.publicError;
  }

  return publicErrorSchema.parse({
    code: 'RUNTIME_ERROR',
    message: 'The runtime could not be initialized.',
    retryable: false,
  });
}
