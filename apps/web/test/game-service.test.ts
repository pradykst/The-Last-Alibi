import {
  accusationResponseSchema,
  createSessionResponseSchema,
  exploreResponseSchema,
  testimonyResponseSchema,
  warrantResponseSchema,
} from '@alibi/protocol';
import type { WarrantOutcome } from '@alibi/protocol';
import { describe, expect, it, vi } from 'vitest';

import { REGISTERED_PREDICATES } from '@alibi/game-engine';
import type { RegisteredPredicate } from '@alibi/game-engine';

import { GameServiceError } from '../src/server/game/errors';
import type { FixtureRandomSource } from '../src/server/game/random';
import { runFixtureGameOperation } from '../src/server/game/runtime-gate';
import { FixtureGameService } from '../src/server/game/service';
import { FixtureSessionStore } from '../src/server/game/store';

function deterministicRandom(hiddenCaseIndex: number): FixtureRandomSource {
  let byte = 1;
  return {
    integer: () => hiddenCaseIndex,
    bytes: (length) =>
      Uint8Array.from({ length }, () => {
        const value = byte;
        byte = byte === 255 ? 1 : byte + 1;
        return value;
      }),
  };
}

function createService(
  hiddenCaseIndex = 0,
  evaluatePredicate?: (predicate: RegisteredPredicate, hiddenIndex: number) => WarrantOutcome,
): FixtureGameService {
  return new FixtureGameService({
    random: deterministicRandom(hiddenCaseIndex),
    now: () => new Date('2026-07-25T01:00:00.000Z'),
    evaluatePredicate,
  });
}

function createSession(service: FixtureGameService) {
  return service.createSession().session;
}

function expectDenial(operation: () => unknown, code: string): void {
  try {
    operation();
    throw new Error('Expected operation to fail.');
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(GameServiceError);
    expect((error as GameServiceError).publicError.code).toBe(code);
  }
}

describe('fixture session service', () => {
  it('creates a schema-valid 64-candidate session without secret fields', () => {
    const response = createService().createSession();
    expect(createSessionResponseSchema.parse(response)).toEqual(response);
    expect(response.session.currentCandidateCount).toBe(64);
    expect(response.session.caseCommitment).toMatchObject({
      scheme: 'fixture-sha256-v1',
      status: 'local-fixture',
      label: 'Local fixture commitment',
    });

    const serialized = JSON.stringify(response);
    for (const forbidden of [
      'hiddenCase',
      'hiddenCaseIndex',
      'caseSalt',
      'privateWitness',
      'rngSeed',
      'commitmentOpening',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('explores rooms and collects observations idempotently without changing candidates', () => {
    const service = createService();
    const session = createSession(service);
    const first = service.explore(session.sessionId, {
      roomId: 'room_gallery',
      observationId: 'observation_gallery_clock',
    });
    const second = service.explore(session.sessionId, {
      roomId: 'room_gallery',
      observationId: 'observation_gallery_clock',
    });

    expect(exploreResponseSchema.parse(first)).toEqual(first);
    expect(second.session.currentCandidateCount).toBe(64);
    expect(second.session.exploredRoomIds).toEqual(['room_gallery']);
    expect(second.session.collectedObservationIds).toEqual(['observation_gallery_clock']);
  });

  it('returns unverified scripted testimony without changing candidates', () => {
    const service = createService();
    const session = createSession(service);
    const response = service.requestTestimony(session.sessionId, {
      suspectId: 'suspect_archivist',
      questionId: 'question_archivist_blackout',
    });

    expect(testimonyResponseSchema.parse(response)).toEqual(response);
    expect(response.entry.evidenceClass).toBe('unverified-testimony');
    expect(response.entry.externalResponseId).toMatch(/^fixture-response_/);
    expect(response.session.currentCandidateCount).toBe(64);
    expect(JSON.stringify(response)).not.toContain('0G');
  });

  it('accepts a safe warrant and changes candidates only after evaluation', () => {
    const service = createService(0);
    const session = createSession(service);
    const response = service.requestWarrant(session.sessionId, {
      predicateId: 'predicate_suspect_archivist',
    });

    expect(warrantResponseSchema.parse(response)).toEqual(response);
    expect(response.disclosure.result).toBe('YES');
    expect(response.session.currentCandidateCount).toBe(16);
    expect(response.disclosure.receipt).toEqual(
      expect.objectContaining({
        kind: 'fixture-certified-simulation',
        label: 'Fixture certified simulation',
      }),
    );
  });

  it('rejects unsafe and repeated warrants before another hidden evaluation', () => {
    const evaluator = vi.fn(
      (predicate: RegisteredPredicate, hiddenIndex: number): WarrantOutcome =>
        (predicate.truthMask & (1n << BigInt(hiddenIndex))) !== 0n ? 'YES' : 'NO',
    );
    const service = createService(0, evaluator);
    const session = createSession(service);

    for (const predicateId of [
      'predicate_suspect_archivist',
      'predicate_room_gallery',
      'predicate_weapon_dagger',
    ]) {
      service.requestWarrant(session.sessionId, { predicateId });
    }
    expect(evaluator).toHaveBeenCalledTimes(3);

    expectDenial(
      () =>
        service.requestWarrant(session.sessionId, {
          predicateId: 'predicate_time_pre_blackout',
        }),
      'UNSAFE_DISCLOSURE',
    );
    expectDenial(
      () =>
        service.requestWarrant(session.sessionId, {
          predicateId: 'predicate_suspect_archivist',
        }),
      'PREDICATE_ALREADY_USED',
    );
    expect(evaluator).toHaveBeenCalledTimes(3);
  });

  it('makes a sixth accepted disclosure impossible', () => {
    const service = createService(63);
    const session = createSession(service);
    for (const predicateId of [
      'predicate_suspect_archivist',
      'predicate_suspect_security',
      'predicate_room_gallery',
      'predicate_room_restoration',
      'predicate_weapon_dagger',
    ]) {
      service.requestWarrant(session.sessionId, { predicateId });
    }

    expectDenial(
      () =>
        service.requestWarrant(session.sessionId, {
          predicateId: 'predicate_room_archive',
        }),
      'DISCLOSURE_LIMIT_REACHED',
    );
    expect(service.getSession(session.sessionId).session.usedDisclosureCount).toBe(5);
  });

  it('blocks a conflicting operation while hidden evaluation is pending', () => {
    let service: FixtureGameService;
    let sessionId = '';
    const pendingDenial = vi.fn();
    service = createService(0, () => {
      try {
        service.requestWarrant(sessionId, {
          predicateId: 'predicate_room_gallery',
        });
      } catch (error: unknown) {
        pendingDenial((error as GameServiceError).publicError.code);
      }
      return 'YES';
    });
    sessionId = createSession(service).sessionId;

    service.requestWarrant(sessionId, {
      predicateId: 'predicate_suspect_archivist',
    });
    expect(pendingDenial).toHaveBeenCalledWith('OPERATION_ALREADY_PENDING');
  });

  it.each([
    [
      0,
      {
        suspectId: 'suspect_archivist',
        roomId: 'room_gallery',
        weaponId: 'weapon_dagger',
        timeWindowId: 'time_pre_blackout',
        confirmTerminal: true,
      },
      'YES',
    ],
    [
      0,
      {
        suspectId: 'suspect_security',
        roomId: 'room_gallery',
        weaponId: 'weapon_dagger',
        timeWindowId: 'time_pre_blackout',
        confirmTerminal: true,
      },
      'NO',
    ],
  ] as const)(
    'returns only the terminal binary result for case index %i',
    (hiddenIndex, accusation, expected) => {
      const service = createService(hiddenIndex);
      const session = createSession(service);
      const response = service.accuse(session.sessionId, accusation);

      expect(accusationResponseSchema.parse(response)).toEqual(response);
      expect(response.result).toBe(expected);
      expect(Object.keys(response)).toEqual(['ok', 'session', 'result', 'label']);
      expect(JSON.stringify(response)).not.toContain('hidden');
      expectDenial(() => service.accuse(session.sessionId, accusation), 'INVALID_SESSION_STATE');
      expectDenial(
        () =>
          service.requestWarrant(session.sessionId, {
            predicateId: REGISTERED_PREDICATES[0]!.id,
          }),
        'INVALID_SESSION_STATE',
      );
    },
  );
});

describe('store and runtime boundaries', () => {
  it('expires and bounds in-memory sessions without wall-clock dependence', () => {
    let now = 0;
    const store = new FixtureSessionStore({
      maximumSessions: 1,
      timeToLiveMs: 100,
      now: () => now,
    });
    const firstService = new FixtureGameService({
      store,
      random: deterministicRandom(0),
      now: () => new Date(now),
    });
    const first = createSession(firstService);
    createSession(firstService);
    expect(store.size).toBe(1);
    expectDenial(() => firstService.getSession(first.sessionId), 'UNKNOWN_SESSION');

    const latest = createSession(firstService);
    now = 101;
    expectDenial(() => firstService.getSession(latest.sessionId), 'UNKNOWN_SESSION');
  });

  it('does not invoke fixture game logic in live mode', () => {
    const fixtureOperation = vi.fn(() => 'fixture');
    expect(() =>
      runFixtureGameOperation(fixtureOperation, {
        ALIBI_RUNTIME_MODE: 'live',
      }),
    ).toThrow('Fixture logic was not executed');
    expect(fixtureOperation).not.toHaveBeenCalled();
  });
});
