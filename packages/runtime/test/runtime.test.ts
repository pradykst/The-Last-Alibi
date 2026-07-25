import { describe, expect, it, vi } from 'vitest';

import {
  LiveCapabilityFailureError,
  LiveCapabilityUnavailableError,
  RuntimeConfigurationError,
  createPublicRuntimeStatus,
  executeCapability,
  resolveRuntimeMode,
} from '../src/server';

describe('runtime mode boundary', () => {
  it('defaults to fixture mode outside production', () => {
    expect(resolveRuntimeMode({ NODE_ENV: 'test' })).toBe('fixture');
  });

  it('fails closed when production omits the runtime mode', () => {
    expect(() => resolveRuntimeMode({ NODE_ENV: 'production' })).toThrow(RuntimeConfigurationError);
  });

  it('accepts an explicit production fixture mode', () => {
    expect(
      createPublicRuntimeStatus({
        NODE_ENV: 'production',
        ALIBI_RUNTIME_MODE: 'fixture',
      }).label,
    ).toBe('Fixture');
  });

  it('rejects invalid runtime modes', () => {
    expect(() =>
      resolveRuntimeMode({
        NODE_ENV: 'development',
        ALIBI_RUNTIME_MODE: 'automatic',
      }),
    ).toThrow(RuntimeConfigurationError);
  });

  it('never invokes a fixture adapter in live mode', async () => {
    const fixture = vi.fn(() => 'fixture-result');

    await expect(
      executeCapability('sui', { fixture }, { ALIBI_RUNTIME_MODE: 'live' }),
    ).rejects.toBeInstanceOf(LiveCapabilityUnavailableError);
    expect(fixture).not.toHaveBeenCalled();
  });

  it('turns a failed live adapter into a typed blocking failure', async () => {
    const fixture = vi.fn(() => 'fixture-result');

    await expect(
      executeCapability(
        'walrus',
        {
          fixture,
          live: () => {
            throw new Error('upstream details must remain private');
          },
        },
        { ALIBI_RUNTIME_MODE: 'live' },
      ),
    ).rejects.toBeInstanceOf(LiveCapabilityFailureError);
    expect(fixture).not.toHaveBeenCalled();
  });

  it('marks every unverified live capability as blocking', () => {
    const status = createPublicRuntimeStatus({ ALIBI_RUNTIME_MODE: 'live' });

    expect(status.capabilities).toHaveLength(6);
    expect(status.capabilities.every((capability) => capability.blocking)).toBe(true);
    expect(status.capabilities.every((capability) => capability.state === 'unavailable')).toBe(
      true,
    );
  });

  it('does not expose unrelated environment values in public status', () => {
    const secretMarker = 'never-serialize-this-value';
    const status = createPublicRuntimeStatus({
      ALIBI_RUNTIME_MODE: 'fixture',
      UNRELATED_SECRET: secretMarker,
    });

    expect(JSON.stringify(status)).not.toContain(secretMarker);
  });
});
