import { createHash } from 'node:crypto';

import {
  CERTIFIED_DISCLOSURE_LIMIT,
  MVP_LEVEL_ID,
  accusationResponseSchema,
  createSessionResponseSchema,
  exploreResponseSchema,
  getSessionResponseSchema,
  testimonyResponseSchema,
  warrantResponseSchema,
} from '@alibi/protocol';
import type {
  AccusationRequest,
  AccusationResponse,
  CreateSessionResponse,
  ExploreRequest,
  ExploreResponse,
  GetSessionResponse,
  PublicGameSession,
  PublicPredicateStatus,
  TestimonyRequest,
  TestimonyResponse,
  WarrantOutcome,
  WarrantRequest,
  WarrantResponse,
} from '@alibi/protocol';
import {
  applyDisclosure,
  authorizeDisclosure,
  CASE_COUNT,
  caseFromIndex,
  findRegisteredPredicate,
  INITIAL_CANDIDATE_MASK,
  LEVEL_MANIFEST,
  maskForCase,
  popcount,
  previewDisclosure,
  REGISTERED_PREDICATES,
} from '@alibi/game-engine';
import type { DisclosureEngineState, RegisteredPredicate } from '@alibi/game-engine';

import { PUBLIC_GAME_CONTENT, findScriptedTestimony } from './content';
import { GameServiceError } from './errors';
import { CRYPTO_RANDOM_SOURCE, bytesToHex } from './random';
import type { FixtureRandomSource } from './random';
import { FixtureSessionStore } from './store';
import type { SecretFixtureSession } from './store';

export type FixtureGameServiceOptions = {
  store?: FixtureSessionStore;
  random?: FixtureRandomSource;
  now?: () => Date;
  evaluatePredicate?: (predicate: RegisteredPredicate, hiddenCaseIndex: number) => WarrantOutcome;
};

function defaultPredicateEvaluator(
  predicate: RegisteredPredicate,
  hiddenCaseIndex: number,
): WarrantOutcome {
  return (predicate.truthMask & maskForCase(hiddenCaseIndex)) !== 0n ? 'YES' : 'NO';
}

export class FixtureGameService {
  readonly #store: FixtureSessionStore;
  readonly #random: FixtureRandomSource;
  readonly #now: () => Date;
  readonly #evaluatePredicate: (
    predicate: RegisteredPredicate,
    hiddenCaseIndex: number,
  ) => WarrantOutcome;

  public constructor(options: FixtureGameServiceOptions = {}) {
    this.#store = options.store ?? new FixtureSessionStore();
    this.#random = options.random ?? CRYPTO_RANDOM_SOURCE;
    this.#now = options.now ?? (() => new Date());
    this.#evaluatePredicate = options.evaluatePredicate ?? defaultPredicateEvaluator;
  }

  public createSession(): CreateSessionResponse {
    const now = this.#now();
    const nowIso = now.toISOString();
    const hiddenCaseIndex = this.#random.integer(CASE_COUNT);
    const caseSalt = bytesToHex(this.#random.bytes(32));
    const sessionId = `fixture-session_${bytesToHex(this.#random.bytes(16))}`;
    const caseCommitment = createHash('sha256')
      .update(['alibi-fixture-case-v1', MVP_LEVEL_ID, String(hiddenCaseIndex), caseSalt].join('\n'))
      .digest('hex');

    const session: SecretFixtureSession = {
      sessionId,
      hiddenCaseIndex,
      caseSalt,
      caseCommitment,
      candidateMask: INITIAL_CANDIDATE_MASK,
      usedPredicateIds: new Set(),
      acceptedDisclosureCount: 0,
      collectedObservationIds: new Set(),
      testimonyEntries: [],
      certifiedDisclosures: [],
      exploredRoomIds: new Set(),
      state: 'active',
      pendingOperation: false,
      createdAt: nowIso,
      updatedAt: nowIso,
      createdAtMs: now.getTime(),
      updatedAtMs: now.getTime(),
    };
    this.#store.set(session);

    return createSessionResponseSchema.parse({
      ok: true,
      session: this.#toPublicSession(session),
      content: PUBLIC_GAME_CONTENT,
    });
  }

  public getSession(sessionId: string): GetSessionResponse {
    const session = this.#requireSession(sessionId);
    return getSessionResponseSchema.parse({
      ok: true,
      session: this.#toPublicSession(session),
    });
  }

  public explore(sessionId: string, request: ExploreRequest): ExploreResponse {
    const session = this.#requireActiveSession(sessionId);
    const room = LEVEL_MANIFEST.rooms.find((entry) => entry.id === request.roomId);
    if (room === undefined) {
      throw GameServiceError.denial('MALFORMED_REQUEST');
    }

    session.exploredRoomIds.add(request.roomId);
    const observation =
      request.observationId === undefined
        ? undefined
        : room.observations.find((entry) => entry.id === request.observationId);

    if (request.observationId !== undefined && observation === undefined) {
      throw GameServiceError.denial('MALFORMED_REQUEST');
    }

    if (observation !== undefined) {
      session.collectedObservationIds.add(observation.id);
    }
    this.#touch(session);

    return exploreResponseSchema.parse({
      ok: true,
      session: this.#toPublicSession(session),
      ...(observation === undefined ? {} : { observation }),
    });
  }

  public requestTestimony(sessionId: string, request: TestimonyRequest): TestimonyResponse {
    const session = this.#requireActiveSession(sessionId);
    const scripted = findScriptedTestimony(request.suspectId, request.questionId);
    if (scripted === undefined) {
      throw GameServiceError.denial('MALFORMED_REQUEST');
    }

    const now = this.#now();
    const entry = {
      id: `testimony_${bytesToHex(this.#random.bytes(12))}`,
      suspectId: scripted.suspectId,
      questionId: scripted.id,
      question: scripted.question,
      answer: scripted.answer,
      evidenceClass: 'unverified-testimony' as const,
      externalResponseId: `fixture-response_${bytesToHex(this.#random.bytes(12))}`,
      createdAt: now.toISOString(),
    };
    session.testimonyEntries.push(entry);
    this.#touch(session, now);

    return testimonyResponseSchema.parse({
      ok: true,
      session: this.#toPublicSession(session),
      entry,
    });
  }

  public recordVerifiedZeroGTestimony(
    sessionId: string,
    request: TestimonyRequest,
    verified: { answer: string; responseId: string },
  ): TestimonyResponse {
    const session = this.#requireActiveSession(sessionId);
    const scripted = findScriptedTestimony(request.suspectId, request.questionId);
    if (scripted === undefined) {
      throw GameServiceError.denial('MALFORMED_REQUEST');
    }

    const now = this.#now();
    const responseReceipt = createHash('sha256')
      .update(verified.responseId)
      .digest('hex')
      .slice(0, 24);
    const entry = {
      id: `testimony_${bytesToHex(this.#random.bytes(12))}`,
      suspectId: scripted.suspectId,
      questionId: scripted.id,
      question: scripted.question,
      answer: verified.answer,
      evidenceClass: 'unverified-testimony' as const,
      externalResponseId: `zero-g-verified_${responseReceipt}`,
      createdAt: now.toISOString(),
    };
    session.testimonyEntries.push(entry);
    this.#touch(session, now);

    return testimonyResponseSchema.parse({
      ok: true,
      session: this.#toPublicSession(session),
      entry,
    });
  }

  public requestWarrant(sessionId: string, request: WarrantRequest): WarrantResponse {
    const session = this.#requireSession(sessionId);
    const predicate = findRegisteredPredicate(request.predicateId);
    const engineState = this.#engineState(session);
    const authorization = authorizeDisclosure(engineState, predicate);
    if (!authorization.allowed) {
      throw GameServiceError.denial(authorization.code);
    }
    if (predicate === undefined) {
      throw GameServiceError.denial('UNKNOWN_PREDICATE');
    }

    session.pendingOperation = true;
    try {
      const result = this.#evaluatePredicate(predicate, session.hiddenCaseIndex);
      const nextState = applyDisclosure(
        this.#engineState(session),
        predicate,
        result,
        authorization.preview,
      );
      session.candidateMask = nextState.candidateMask;
      session.usedPredicateIds = new Set(nextState.usedPredicateIds);
      session.acceptedDisclosureCount = nextState.acceptedDisclosureCount;
      session.pendingOperation = false;

      const now = this.#now();
      const disclosure = {
        predicateId: predicate.id,
        question: predicate.question,
        result,
        candidateCount: popcount(session.candidateMask),
        evidenceClass: 'certified-disclosure' as const,
        receipt: {
          kind: 'fixture-certified-simulation' as const,
          operationId: `fixture-operation_${bytesToHex(this.#random.bytes(12))}`,
          verificationState: 'verified' as const,
          label: 'Fixture certified simulation' as const,
        },
        createdAt: now.toISOString(),
      };
      session.certifiedDisclosures.push(disclosure);
      this.#touch(session, now);

      return warrantResponseSchema.parse({
        ok: true,
        session: this.#toPublicSession(session),
        disclosure,
      });
    } catch (error: unknown) {
      session.pendingOperation = false;
      throw error;
    }
  }

  public accuse(sessionId: string, request: AccusationRequest): AccusationResponse {
    const session = this.#requireActiveSession(sessionId);
    const hiddenCase = caseFromIndex(session.hiddenCaseIndex);
    const result: WarrantOutcome =
      hiddenCase.suspectId === request.suspectId &&
      hiddenCase.roomId === request.roomId &&
      hiddenCase.weaponId === request.weaponId &&
      hiddenCase.timeWindowId === request.timeWindowId
        ? 'YES'
        : 'NO';

    session.state = 'terminal';
    session.terminalResult = result;
    this.#touch(session);

    return accusationResponseSchema.parse({
      ok: true,
      session: this.#toPublicSession(session),
      result,
      label: 'Fixture verdict',
    });
  }

  #requireSession(sessionId: string): SecretFixtureSession {
    const session = this.#store.get(sessionId);
    if (session === undefined) {
      throw GameServiceError.denial('UNKNOWN_SESSION');
    }
    return session;
  }

  #requireActiveSession(sessionId: string): SecretFixtureSession {
    const session = this.#requireSession(sessionId);
    if (session.state !== 'active' || session.pendingOperation) {
      throw GameServiceError.denial(
        session.pendingOperation ? 'OPERATION_ALREADY_PENDING' : 'INVALID_SESSION_STATE',
      );
    }
    return session;
  }

  #engineState(session: SecretFixtureSession): DisclosureEngineState {
    return {
      state: session.state,
      candidateMask: session.candidateMask,
      usedPredicateIds: session.usedPredicateIds,
      acceptedDisclosureCount: session.acceptedDisclosureCount,
      pendingOperation: session.pendingOperation,
    };
  }

  #predicateStatuses(session: SecretFixtureSession): PublicPredicateStatus[] {
    return REGISTERED_PREDICATES.map((predicate) => {
      const preview = previewDisclosure(session.candidateMask, predicate);
      return {
        predicateId: predicate.id,
        dimension: predicate.dimension,
        valueId: predicate.valueId,
        question: predicate.question,
        availability: session.usedPredicateIds.has(predicate.id)
          ? 'used'
          : preview.safe
            ? 'available'
            : 'unsafe',
        yesCandidateCount: preview.yesCandidateCount,
        noCandidateCount: preview.noCandidateCount,
      };
    });
  }

  #toPublicSession(session: SecretFixtureSession): PublicGameSession {
    const common = {
      sessionId: session.sessionId,
      levelId: MVP_LEVEL_ID,
      caseCommitment: {
        scheme: 'fixture-sha256-v1' as const,
        value: session.caseCommitment,
        status: 'local-fixture' as const,
        label: 'Local fixture commitment' as const,
      },
      currentCandidateCount: popcount(session.candidateMask),
      usedDisclosureCount: session.acceptedDisclosureCount,
      maximumDisclosureCount: CERTIFIED_DISCLOSURE_LIMIT,
      collectedObservationIds: [...session.collectedObservationIds],
      testimonyEntries: [...session.testimonyEntries],
      certifiedDisclosures: [...session.certifiedDisclosures],
      exploredRoomIds: [...session.exploredRoomIds],
      predicateStatuses: this.#predicateStatuses(session),
      verificationState:
        session.certifiedDisclosures.length === 0 ? ('idle' as const) : ('verified' as const),
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };

    return session.state === 'terminal'
      ? {
          ...common,
          state: 'terminal',
          terminalResult: session.terminalResult!,
        }
      : {
          ...common,
          state: 'active',
        };
  }

  #touch(session: SecretFixtureSession, date = this.#now()): void {
    session.updatedAt = date.toISOString();
    session.updatedAtMs = date.getTime();
    this.#store.set(session);
  }
}
