import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';

import { privateCommitment } from './commitments';

type StoredState = {
  version: 1;
  nonceCommitments: string[];
  entitlementCommitments: string[];
};

export type ConsumeAuthorizationInput = {
  nonce: string;
  humanId: string;
  levelId: string;
};

export type ConsumeAuthorizationResult =
  | { consumed: true; entitlementCommitment: `0x${string}` }
  | { consumed: false; reason: 'nonce_replayed' | 'entitlement_used' };

export interface RankedAuthorizationStore {
  isNonceAvailable(nonce: string): Promise<boolean>;
  consume(input: ConsumeAuthorizationInput): Promise<ConsumeAuthorizationResult>;
}

function emptyState(): StoredState {
  return { version: 1, nonceCommitments: [], entitlementCommitments: [] };
}

abstract class HashedAuthorizationStore implements RankedAuthorizationStore {
  protected readonly secret: string;

  constructor(secret: string) {
    this.secret = secret;
  }

  protected nonceCommitment(nonce: string): `0x${string}` {
    return privateCommitment(this.secret, 'alibi-agentkit-nonce-v1', nonce);
  }

  protected entitlementCommitment(humanId: string, levelId: string): `0x${string}` {
    return privateCommitment(this.secret, 'alibi-ranked-entitlement-v1', levelId, humanId);
  }

  public abstract isNonceAvailable(nonce: string): Promise<boolean>;
  public abstract consume(input: ConsumeAuthorizationInput): Promise<ConsumeAuthorizationResult>;
}

export class InMemoryRankedAuthorizationStore extends HashedAuthorizationStore {
  private state = emptyState();
  private pending: Promise<void> = Promise.resolve();

  async isNonceAvailable(nonce: string): Promise<boolean> {
    return !this.state.nonceCommitments.includes(this.nonceCommitment(nonce));
  }

  async consume(input: ConsumeAuthorizationInput): Promise<ConsumeAuthorizationResult> {
    let result: ConsumeAuthorizationResult | undefined;
    this.pending = this.pending.then(() => {
      result = consumeState(this.state, input, this.secret);
    });
    await this.pending;
    if (result === undefined) throw new Error('Authorization store did not produce a result.');
    return result;
  }

  snapshotForTesting(): string {
    return JSON.stringify(this.state);
  }
}

export class FileRankedAuthorizationStore extends HashedAuthorizationStore {
  private readonly path: string;
  private readonly lockPath: string;

  constructor(path: string, secret: string) {
    super(secret);
    this.path = path;
    this.lockPath = `${path}.lock`;
  }

  async isNonceAvailable(nonce: string): Promise<boolean> {
    const state = await this.readState();
    return !state.nonceCommitments.includes(this.nonceCommitment(nonce));
  }

  async consume(input: ConsumeAuthorizationInput): Promise<ConsumeAuthorizationResult> {
    await mkdir(dirname(this.path), { recursive: true });
    const release = await this.acquireLock();
    try {
      const state = await this.readState();
      const result = consumeState(state, input, this.secret);
      if (result.consumed) await this.writeState(state);
      return result;
    } finally {
      await release();
    }
  }

  private async acquireLock(): Promise<() => Promise<void>> {
    const deadline = Date.now() + 5_000;
    while (true) {
      try {
        const handle = await open(this.lockPath, 'wx', 0o600);
        await handle.close();
        return async () => {
          await rm(this.lockPath, { force: true });
        };
      } catch (error) {
        if (!isNodeError(error, 'EEXIST') || Date.now() >= deadline) throw error;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    }
  }

  private async readState(): Promise<StoredState> {
    try {
      const parsed = JSON.parse(await readFile(this.path, 'utf8')) as Partial<StoredState>;
      if (
        parsed.version !== 1 ||
        !Array.isArray(parsed.nonceCommitments) ||
        !Array.isArray(parsed.entitlementCommitments) ||
        !parsed.nonceCommitments.every(isCommitment) ||
        !parsed.entitlementCommitments.every(isCommitment)
      ) {
        throw new Error('Authorization store is malformed.');
      }
      return {
        version: 1,
        nonceCommitments: parsed.nonceCommitments,
        entitlementCommitments: parsed.entitlementCommitments,
      };
    } catch (error) {
      if (isNodeError(error, 'ENOENT')) return emptyState();
      throw error;
    }
  }

  private async writeState(state: StoredState): Promise<void> {
    const temporaryPath = `${this.path}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`;
    const handle = await open(temporaryPath, 'wx', 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(state)}\n`, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporaryPath, this.path);
  }
}

function consumeState(
  state: StoredState,
  input: ConsumeAuthorizationInput,
  secret: string,
): ConsumeAuthorizationResult {
  const nonce = privateCommitment(secret, 'alibi-agentkit-nonce-v1', input.nonce);
  if (state.nonceCommitments.includes(nonce)) {
    return { consumed: false, reason: 'nonce_replayed' };
  }
  const entitlement = privateCommitment(
    secret,
    'alibi-ranked-entitlement-v1',
    input.levelId,
    input.humanId,
  );
  if (state.entitlementCommitments.includes(entitlement)) {
    return { consumed: false, reason: 'entitlement_used' };
  }
  state.nonceCommitments.push(nonce);
  state.entitlementCommitments.push(entitlement);
  return { consumed: true, entitlementCommitment: entitlement };
}

function isCommitment(value: unknown): value is string {
  return typeof value === 'string' && /^0x[0-9a-f]{64}$/u.test(value);
}

function isNodeError(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error && error.code === code;
}
