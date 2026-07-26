import { describe, expect, it, vi } from 'vitest';

import { GameServiceError } from '../src/server/game/errors';
import { runTestimonyOperation } from '../src/server/game/testimony-runtime';

describe('testimony fixture/live boundary', () => {
  it('uses only scripted testimony in fixture mode', () => {
    const fixture = vi.fn(() => 'fixture-testimony');
    const live = vi.fn(() => 'zero-g-testimony');
    expect(runTestimonyOperation({ fixture, live }, { ALIBI_ZERO_G_MODE: 'disabled' })).toBe(
      'fixture-testimony',
    );
    expect(fixture).toHaveBeenCalledOnce();
    expect(live).not.toHaveBeenCalled();
  });

  it('uses only the injected 0G path in live mode', () => {
    const fixture = vi.fn(() => 'fixture-testimony');
    const live = vi.fn(() => 'zero-g-testimony');
    expect(runTestimonyOperation({ fixture, live }, { ALIBI_ZERO_G_MODE: 'live' })).toBe(
      'zero-g-testimony',
    );
    expect(live).toHaveBeenCalledOnce();
    expect(fixture).not.toHaveBeenCalled();
  });

  it('fails closed without Sui-backed live public context and never falls back', () => {
    const fixture = vi.fn(() => 'fixture-testimony');
    try {
      runTestimonyOperation({ fixture }, { ALIBI_ZERO_G_MODE: 'live' });
      throw new Error('Expected live testimony to be blocked.');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(GameServiceError);
      expect((error as GameServiceError).statusCode).toBe(503);
      expect((error as GameServiceError).publicError.code).toBe('ZERO_G_LIVE_CONTEXT_UNAVAILABLE');
      expect(JSON.stringify((error as GameServiceError).publicError)).not.toContain(
        'ALIBI_ZERO_G_MODE',
      );
    }
    expect(fixture).not.toHaveBeenCalled();
  });
});
