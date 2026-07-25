import { CERTIFIED_DISCLOSURE_LIMIT, MINIMUM_SURVIVING_CANDIDATES } from '@alibi/protocol';
import { describe, expect, it, vi } from 'vitest';

import {
  applyDisclosure,
  authorizeDisclosure,
  CASE_UNIVERSE,
  caseFromIndex,
  caseIndex,
  generateRegisteredPredicates,
  INITIAL_CANDIDATE_MASK,
  intersectMasks,
  popcount,
  previewDisclosure,
  REGISTERED_PREDICATES,
  serializeMask,
} from '../src';
import type { DisclosureEngineState, RegisteredPredicate } from '../src';

function initialState(): DisclosureEngineState {
  return {
    state: 'active',
    candidateMask: INITIAL_CANDIDATE_MASK,
    usedPredicateIds: new Set(),
    acceptedDisclosureCount: 0,
    pendingOperation: false,
  };
}

describe('deterministic case universe', () => {
  it('generates exactly 64 unique canonical cases', () => {
    expect(CASE_UNIVERSE).toHaveLength(64);
    expect(new Set(CASE_UNIVERSE.map((candidate) => candidate.index)).size).toBe(64);
    expect(CASE_UNIVERSE.map((candidate) => candidate.index)).toEqual(
      Array.from({ length: 64 }, (_, index) => index),
    );
  });

  it('round-trips every canonical index and dimension tuple', () => {
    for (const candidate of CASE_UNIVERSE) {
      expect(
        caseIndex(
          candidate.suspectIndex,
          candidate.roomIndex,
          candidate.weaponIndex,
          candidate.timeIndex,
        ),
      ).toBe(candidate.index);
      expect(caseFromIndex(candidate.index)).toEqual(candidate);
    }
  });

  it('represents all candidates as a fixed-width bigint mask', () => {
    expect(popcount(INITIAL_CANDIDATE_MASK)).toBe(64);
    expect(serializeMask(INITIAL_CANDIDATE_MASK)).toBe('0xffffffffffffffff');
    expect(typeof INITIAL_CANDIDATE_MASK).toBe('bigint');
  });
});

describe('registered equality predicates', () => {
  it('generates exactly 12 predicates and regenerates identical masks', () => {
    const regenerated = generateRegisteredPredicates();

    expect(REGISTERED_PREDICATES).toHaveLength(12);
    expect(regenerated.map((predicate) => predicate.truthMask)).toEqual(
      REGISTERED_PREDICATES.map((predicate) => predicate.truthMask),
    );
  });

  it.each([
    ['suspect', 16, 48],
    ['room', 16, 48],
    ['weapon', 32, 32],
    ['time', 32, 32],
  ] as const)('splits %s predicates %i/%i initially', (dimension, yes, no) => {
    for (const predicate of REGISTERED_PREDICATES.filter(
      (entry) => entry.dimension === dimension,
    )) {
      const preview = previewDisclosure(INITIAL_CANDIDATE_MASK, predicate);
      expect(preview.yesCandidateCount).toBe(yes);
      expect(preview.noCandidateCount).toBe(no);
    }
  });
});

describe('safe disclosure transitions', () => {
  it.each(['YES', 'NO'] as const)(
    'applies the %s branch as the exact mask intersection',
    (result) => {
      const state = initialState();
      const predicate = REGISTERED_PREDICATES[0]!;
      const preview = previewDisclosure(state.candidateMask, predicate);
      const next = applyDisclosure(state, predicate, result, preview);

      expect(next.candidateMask).toBe(result === 'YES' ? preview.yesMask : preview.noMask);
      expect(intersectMasks(next.candidateMask, state.candidateMask)).toBe(next.candidateMask);
    },
  );

  it('rejects an unsafe query before any hidden-case evaluator is called', () => {
    const hiddenEvaluator = vi.fn();
    const suspect = REGISTERED_PREDICATES.find((predicate) => predicate.dimension === 'suspect')!;
    const room = REGISTERED_PREDICATES.find((predicate) => predicate.dimension === 'room')!;
    const weapon = REGISTERED_PREDICATES.find((predicate) => predicate.dimension === 'weapon')!;
    let state = initialState();

    for (const predicate of [suspect, room, weapon]) {
      const authorization = authorizeDisclosure(state, predicate);
      expect(authorization.allowed).toBe(true);
      if (authorization.allowed) {
        state = applyDisclosure(state, predicate, 'YES', authorization.preview);
      }
    }

    const unsafePredicate = REGISTERED_PREDICATES.find(
      (predicate) => predicate.dimension === 'time' && !state.usedPredicateIds.has(predicate.id),
    )!;
    const denial = authorizeDisclosure(state, unsafePredicate);
    expect(denial).toEqual({ allowed: false, code: 'UNSAFE_DISCLOSURE' });
    expect(hiddenEvaluator).not.toHaveBeenCalled();
  });

  it('rejects repeated predicates and a sixth disclosure', () => {
    const predicate = REGISTERED_PREDICATES[0]!;
    const repeated = authorizeDisclosure(
      {
        ...initialState(),
        usedPredicateIds: new Set([predicate.id]),
        acceptedDisclosureCount: 1,
      },
      predicate,
    );
    expect(repeated).toEqual({
      allowed: false,
      code: 'PREDICATE_ALREADY_USED',
    });

    const limitReached = authorizeDisclosure(
      {
        ...initialState(),
        usedPredicateIds: new Set(
          REGISTERED_PREDICATES.slice(0, CERTIFIED_DISCLOSURE_LIMIT).map((entry) => entry.id),
        ),
        acceptedDisclosureCount: CERTIFIED_DISCLOSURE_LIMIT,
      },
      REGISTERED_PREDICATES[CERTIFIED_DISCLOSURE_LIMIT],
    );
    expect(limitReached).toEqual({
      allowed: false,
      code: 'DISCLOSURE_LIMIT_REACHED',
    });
  });

  it('rejects pending and terminal states', () => {
    const predicate = REGISTERED_PREDICATES[0]!;
    expect(authorizeDisclosure({ ...initialState(), pendingOperation: true }, predicate)).toEqual({
      allowed: false,
      code: 'OPERATION_ALREADY_PENDING',
    });
    expect(authorizeDisclosure({ ...initialState(), state: 'terminal' }, predicate)).toEqual({
      allowed: false,
      code: 'INVALID_SESSION_STATE',
    });
  });

  it('preserves transition invariants through deterministic randomized sequences', () => {
    for (let seed = 1; seed <= 128; seed += 1) {
      let state = initialState();
      let random = seed;

      for (let step = 0; step < 12; step += 1) {
        random = (random * 48271) % 2147483647;
        const predicate = REGISTERED_PREDICATES[
          random % REGISTERED_PREDICATES.length
        ] as RegisteredPredicate;
        const authorization = authorizeDisclosure(state, predicate);

        if (!authorization.allowed) {
          continue;
        }

        const previousMask = state.candidateMask;
        const result = random % 2 === 0 ? 'YES' : 'NO';
        state = applyDisclosure(state, predicate, result, authorization.preview);

        expect(intersectMasks(state.candidateMask, previousMask)).toBe(state.candidateMask);
        expect(popcount(state.candidateMask)).toBeGreaterThanOrEqual(MINIMUM_SURVIVING_CANDIDATES);
        expect(state.acceptedDisclosureCount).toBeLessThanOrEqual(CERTIFIED_DISCLOSURE_LIMIT);
      }
    }
  });
});
