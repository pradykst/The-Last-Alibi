import { toBase58 } from '@mysten/sui/utils';
import { describe, expect, it } from 'vitest';

import { AlibiSuiAdapter, AlibiSuiError, parseSuiPublicConfig } from '../src';
import { LEVEL_ID, PACKAGE_ID, SESSION_ID, levelEnvelope, sessionEnvelope } from './fixtures';

const DIGEST = toBase58(new Uint8Array(32).fill(7));
const SESSION_EXPECTATION = {
  eventKind: 'SessionCreated',
  createdObjectType: 'GameSession',
} as const;
const EXPIRED_EXPECTATION = { eventKind: 'QueryExpired' } as const;

function adapter(overrides: Partial<ConstructorParameters<typeof AlibiSuiAdapter>[1]> = {}) {
  return new AlibiSuiAdapter(
    parseSuiPublicConfig({ network: 'testnet', packageId: PACKAGE_ID, levelConfigId: LEVEL_ID }),
    {
      submitter: { submit: async () => ({ digest: DIGEST }) },
      confirmer: {
        confirm: async (digest) => ({
          digest,
          success: true,
          checkpoint: '42',
          events: [{ kind: 'SessionCreated' as const, data: {} }],
          createdObjects: [
            { objectId: SESSION_ID, objectType: PACKAGE_ID + '::alibi::GameSession' },
          ],
        }),
      },
      reader: {
        readObject: async (id) =>
          id.endsWith(SESSION_ID.slice(2)) ? sessionEnvelope() : levelEnvelope(),
      },
      ...overrides,
    },
  );
}

describe('typed adapter lifecycle', () => {
  it('keeps construction, pending submission, and confirmed execution distinct', async () => {
    const client = adapter();
    const transaction = client.createPracticeSession(new Uint8Array(32));
    const pending = await client.submit(transaction, SESSION_EXPECTATION);
    expect(pending).toEqual({
      status: 'pending',
      digest: DIGEST,
      expectation: SESSION_EXPECTATION,
    });
    const confirmed = await client.confirm(pending);
    expect(confirmed).toEqual({
      status: 'confirmed',
      digest: DIGEST,
      checkpoint: '42',
      events: [{ kind: 'SessionCreated', data: {} }],
      createdObjects: [{ objectId: SESSION_ID, objectType: PACKAGE_ID + '::alibi::GameSession' }],
    });
  });

  it('requires actual valid digests and successful confirmed execution', async () => {
    await expect(
      adapter({ submitter: { submit: async () => ({ digest: 'fake-digest' }) } }).submit(
        adapter().expireQuery(SESSION_ID),
        EXPIRED_EXPECTATION,
      ),
    ).rejects.toMatchObject({ code: 'SUBMISSION_FAILED' });
    const client = adapter({
      confirmer: { confirm: async (digest) => ({ digest, success: false }) },
    });
    await expect(
      client.confirm({ status: 'pending', digest: DIGEST, expectation: EXPIRED_EXPECTATION }),
    ).rejects.toMatchObject({
      code: 'CONFIRMATION_FAILED',
    });
  });

  it('reads only configured package types and sanitizes RPC failures', async () => {
    expect((await adapter().readLevel()).predicateCount).toBe(12);
    expect((await adapter().readSession(SESSION_ID)).candidateCount).toBe(64);
    const failing = adapter({
      reader: {
        readObject: async () => {
          throw new Error('C:\\private\\rpc token=secret');
        },
      },
    });
    try {
      await failing.readLevel();
      throw new Error('expected failure');
    } catch (error) {
      expect(error).toBeInstanceOf(AlibiSuiError);
      expect(JSON.stringify(error)).not.toContain('private');
      expect(JSON.stringify(error)).not.toContain('secret');
      expect(error).toMatchObject({ code: 'RPC_UNAVAILABLE', retryable: true });
    }
  });

  it('has no fixture fallback or secret-bearing public output', async () => {
    const serialized = JSON.stringify({
      level: await adapter().readLevel(),
      session: await adapter().readSession(SESSION_ID),
    });
    for (const forbidden of [
      'hidden_case',
      'case_salt',
      'private_witness',
      'accusation',
      'verdict_salt',
      'mnemonic',
      'private_key',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});
