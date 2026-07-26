import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute } from 'node:path';

import type {
  CertifiedDisclosureEntry,
  ObservationId,
  RoomId,
  TestimonyEntry,
  WarrantOutcome,
} from '@alibi/protocol';
import {
  certifiedDisclosureEntrySchema,
  observationIdSchema,
  roomIdSchema,
  testimonyEntrySchema,
  warrantOutcomeSchema,
} from '@alibi/protocol';
import { z } from 'zod';

export type SecretFixtureSession = {
  sessionId: string;
  hiddenCaseIndex: number;
  caseSalt: string;
  caseCommitment: string;
  candidateMask: bigint;
  usedPredicateIds: Set<string>;
  acceptedDisclosureCount: number;
  collectedObservationIds: Set<ObservationId>;
  testimonyEntries: TestimonyEntry[];
  certifiedDisclosures: CertifiedDisclosureEntry[];
  exploredRoomIds: Set<RoomId>;
  state: 'active' | 'terminal';
  pendingOperation: boolean;
  terminalResult?: WarrantOutcome;
  createdAt: string;
  updatedAt: string;
  createdAtMs: number;
  updatedAtMs: number;
};

export type SessionStoreOptions = {
  maximumSessions?: number;
  timeToLiveMs?: number;
  now?: () => number;
  persistencePath?: string;
};

const persistedSessionSchema = z
  .object({
    sessionId: z.string().min(1),
    hiddenCaseIndex: z.number().int().min(0).max(63),
    caseSalt: z.string().regex(/^[0-9a-f]{64}$/u),
    caseCommitment: z.string().regex(/^[0-9a-f]{64}$/u),
    candidateMask: z.string().regex(/^\d+$/u),
    usedPredicateIds: z.array(z.string().min(1)),
    acceptedDisclosureCount: z.number().int().min(0).max(5),
    collectedObservationIds: z.array(observationIdSchema),
    testimonyEntries: z.array(testimonyEntrySchema),
    certifiedDisclosures: z.array(certifiedDisclosureEntrySchema),
    exploredRoomIds: z.array(roomIdSchema),
    state: z.enum(['active', 'terminal']),
    pendingOperation: z.boolean(),
    terminalResult: warrantOutcomeSchema.optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    createdAtMs: z.number().int().nonnegative(),
    updatedAtMs: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine((session, context) => {
    if ((session.state === 'terminal') !== (session.terminalResult !== undefined)) {
      context.addIssue({
        code: 'custom',
        message: 'Terminal fixture sessions must contain exactly one terminal result.',
      });
    }
    const mask = BigInt(session.candidateMask);
    if (mask < 1n || mask > (1n << 64n) - 1n) {
      context.addIssue({ code: 'custom', message: 'Fixture candidate mask is out of range.' });
    }
  });

const persistedStoreSchema = z
  .object({
    version: z.literal(1),
    sessions: z.array(persistedSessionSchema),
  })
  .strict();

type PersistedSession = z.infer<typeof persistedSessionSchema>;

export class FixtureSessionStore {
  readonly #sessions = new Map<string, SecretFixtureSession>();
  readonly #maximumSessions: number;
  readonly #timeToLiveMs: number;
  readonly #now: () => number;
  readonly #persistencePath: string | undefined;

  public constructor(options: SessionStoreOptions = {}) {
    this.#maximumSessions = options.maximumSessions ?? 128;
    this.#timeToLiveMs = options.timeToLiveMs ?? 2 * 60 * 60 * 1000;
    this.#now = options.now ?? Date.now;
    const persistencePath = options.persistencePath?.trim();
    if (persistencePath !== undefined && persistencePath !== '' && !isAbsolute(persistencePath)) {
      throw new Error('Fixture persistence path must be absolute.');
    }
    this.#persistencePath = persistencePath === '' ? undefined : persistencePath;
    this.#load();
    if (this.#evictExpired()) this.#persist();
  }

  public get(sessionId: string): SecretFixtureSession | undefined {
    const session = this.#sessions.get(sessionId);
    if (session === undefined) {
      return undefined;
    }

    if (this.#now() - session.updatedAtMs >= this.#timeToLiveMs) {
      this.#sessions.delete(sessionId);
      this.#persist();
      return undefined;
    }

    return session;
  }

  public set(session: SecretFixtureSession): void {
    this.#sessions.set(session.sessionId, session);
    this.#evictExpired();

    while (this.#sessions.size > this.#maximumSessions) {
      const oldest = [...this.#sessions.values()].sort(
        (left, right) => left.updatedAtMs - right.updatedAtMs,
      )[0];
      if (oldest === undefined) {
        break;
      }
      this.#sessions.delete(oldest.sessionId);
    }
    this.#persist();
  }

  public get size(): number {
    if (this.#evictExpired()) this.#persist();
    return this.#sessions.size;
  }

  #evictExpired(): boolean {
    let changed = false;
    for (const [sessionId, session] of this.#sessions) {
      if (this.#now() - session.updatedAtMs >= this.#timeToLiveMs) {
        this.#sessions.delete(sessionId);
        changed = true;
      }
    }
    return changed;
  }

  #load(): void {
    if (this.#persistencePath === undefined) return;

    let source: string;
    try {
      source = readFileSync(this.#persistencePath, 'utf8');
    } catch (error: unknown) {
      if (isNodeError(error, 'ENOENT')) return;
      throw new Error('Fixture session persistence could not be read.');
    }

    let decoded: unknown;
    try {
      decoded = JSON.parse(source) as unknown;
    } catch {
      throw new Error('Fixture session persistence is malformed.');
    }
    const parsed = persistedStoreSchema.safeParse(decoded);
    if (!parsed.success) throw new Error('Fixture session persistence is malformed.');

    for (const persisted of parsed.data.sessions) {
      const session = restoreSession(persisted);
      this.#sessions.set(session.sessionId, session);
    }
  }

  #persist(): void {
    if (this.#persistencePath === undefined) return;

    mkdirSync(dirname(this.#persistencePath), { recursive: true });
    const temporaryPath = `${this.#persistencePath}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`;
    const body = `${JSON.stringify({
      version: 1,
      sessions: [...this.#sessions.values()].map(persistSession),
    })}\n`;
    try {
      writeFileSync(temporaryPath, body, {
        encoding: 'utf8',
        flag: 'wx',
        mode: 0o600,
      });
      renameSync(temporaryPath, this.#persistencePath);
    } catch {
      throw new Error('Fixture session persistence could not be written.');
    } finally {
      rmSync(temporaryPath, { force: true });
    }
  }
}

function persistSession(session: SecretFixtureSession): PersistedSession {
  return {
    sessionId: session.sessionId,
    hiddenCaseIndex: session.hiddenCaseIndex,
    caseSalt: session.caseSalt,
    caseCommitment: session.caseCommitment,
    candidateMask: session.candidateMask.toString(),
    usedPredicateIds: [...session.usedPredicateIds],
    acceptedDisclosureCount: session.acceptedDisclosureCount,
    collectedObservationIds: [...session.collectedObservationIds],
    testimonyEntries: [...session.testimonyEntries],
    certifiedDisclosures: [...session.certifiedDisclosures],
    exploredRoomIds: [...session.exploredRoomIds],
    state: session.state,
    pendingOperation: session.pendingOperation,
    ...(session.terminalResult === undefined ? {} : { terminalResult: session.terminalResult }),
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    createdAtMs: session.createdAtMs,
    updatedAtMs: session.updatedAtMs,
  };
}

function restoreSession(session: PersistedSession): SecretFixtureSession {
  return {
    sessionId: session.sessionId,
    hiddenCaseIndex: session.hiddenCaseIndex,
    caseSalt: session.caseSalt,
    caseCommitment: session.caseCommitment,
    candidateMask: BigInt(session.candidateMask),
    usedPredicateIds: new Set(session.usedPredicateIds),
    acceptedDisclosureCount: session.acceptedDisclosureCount,
    collectedObservationIds: new Set(session.collectedObservationIds),
    testimonyEntries: [...session.testimonyEntries],
    certifiedDisclosures: [...session.certifiedDisclosures],
    exploredRoomIds: new Set(session.exploredRoomIds),
    state: session.state,
    pendingOperation: session.pendingOperation,
    ...(session.terminalResult === undefined ? {} : { terminalResult: session.terminalResult }),
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    createdAtMs: session.createdAtMs,
    updatedAtMs: session.updatedAtMs,
  };
}

function isNodeError(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error && error.code === code;
}
