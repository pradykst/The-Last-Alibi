import type {
  CertifiedDisclosureEntry,
  ObservationId,
  RoomId,
  TestimonyEntry,
  WarrantOutcome,
} from '@alibi/protocol';

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
};

export class FixtureSessionStore {
  readonly #sessions = new Map<string, SecretFixtureSession>();
  readonly #maximumSessions: number;
  readonly #timeToLiveMs: number;
  readonly #now: () => number;

  public constructor(options: SessionStoreOptions = {}) {
    this.#maximumSessions = options.maximumSessions ?? 128;
    this.#timeToLiveMs = options.timeToLiveMs ?? 2 * 60 * 60 * 1000;
    this.#now = options.now ?? Date.now;
  }

  public get(sessionId: string): SecretFixtureSession | undefined {
    const session = this.#sessions.get(sessionId);
    if (session === undefined) {
      return undefined;
    }

    if (this.#now() - session.updatedAtMs >= this.#timeToLiveMs) {
      this.#sessions.delete(sessionId);
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
  }

  public get size(): number {
    this.#evictExpired();
    return this.#sessions.size;
  }

  #evictExpired(): void {
    for (const [sessionId, session] of this.#sessions) {
      if (this.#now() - session.updatedAtMs >= this.#timeToLiveMs) {
        this.#sessions.delete(sessionId);
      }
    }
  }
}
