import { INITIAL_CANDIDATE_MASK, REGISTERED_PREDICATES } from '@alibi/game-engine';
import { CERTIFIED_DISCLOSURE_LIMIT, MINIMUM_SURVIVING_CANDIDATES } from '@alibi/protocol';
import { describe, expect, it } from 'vitest';

import {
  loadSuiPublicConfig,
  MOVE_PREDICATES,
  parseSuiPublicConfig,
  parseU64,
  popcountU64,
  U64_MAX,
  u64ToHex,
} from '../src';
import { LEVEL_ID, PACKAGE_ID } from './fixtures';

describe('public configuration', () => {
  it('requires explicit valid live configuration and normalizes IDs', () => {
    expect(
      parseSuiPublicConfig({ network: 'testnet', packageId: PACKAGE_ID, levelConfigId: LEVEL_ID }),
    ).toEqual({
      network: 'testnet',
      packageId: expect.stringMatching(/^0x[0-9a-f]{64}$/),
      levelConfigId: expect.stringMatching(/^0x[0-9a-f]{64}$/),
    });
    expect(() => loadSuiPublicConfig({})).toThrowError(
      'Live Sui configuration is missing or invalid.',
    );
    expect(() =>
      parseSuiPublicConfig({ network: 'testnet', packageId: 'fixture', levelConfigId: LEVEL_ID }),
    ).toThrow();
    expect(() =>
      parseSuiPublicConfig({
        network: 'testnet',
        packageId: PACKAGE_ID,
        levelConfigId: LEVEL_ID,
        fallback: 'fixture',
      }),
    ).toThrow();
  });
});

describe('lossless masks and canonical vectors', () => {
  it('handles the maximum u64 without JavaScript number loss', () => {
    expect(parseU64('18446744073709551615')).toBe(U64_MAX);
    expect(u64ToHex(U64_MAX)).toBe('0xffffffffffffffff');
    expect(popcountU64(U64_MAX)).toBe(64);
    expect(() => parseU64(Number.MAX_SAFE_INTEGER as never)).toThrowError('JavaScript numbers');
    expect(() => parseU64('01')).toThrowError('canonically encoded');
    expect(() => parseU64('18446744073709551616')).toThrowError('outside');
  });

  it('derives all Move mappings from the canonical B2 engine', () => {
    expect(MOVE_PREDICATES).toHaveLength(12);
    expect(INITIAL_CANDIDATE_MASK).toBe(U64_MAX);
    expect(CERTIFIED_DISCLOSURE_LIMIT).toBe(5);
    expect(MINIMUM_SURVIVING_CANDIDATES).toBe(2);
    for (const [index, move] of MOVE_PREDICATES.entries()) {
      const engine = REGISTERED_PREDICATES[index]!;
      expect(move.id).toBe(index);
      expect(move.browserId).toBe(engine.id);
      expect(move.truthMask).toBe(engine.truthMask);
      const yes = INITIAL_CANDIDATE_MASK & move.truthMask;
      const no = INITIAL_CANDIDATE_MASK & (U64_MAX ^ move.truthMask);
      expect(popcountU64(yes)).toBeGreaterThanOrEqual(MINIMUM_SURVIVING_CANDIDATES);
      expect(popcountU64(no)).toBeGreaterThanOrEqual(MINIMUM_SURVIVING_CANDIDATES);
      expect(yes | no).toBe(INITIAL_CANDIDATE_MASK);
    }
  });
});
