import type { Signer } from '@mysten/sui/cryptography';
import { Transaction } from '@mysten/sui/transactions';
import { toBase58 } from '@mysten/sui/utils';
import { describe, expect, it, vi } from 'vitest';

import { AlibiSuiError } from '../src';
import {
  OfficialSuiTransactionExecutor,
  parseSuiServerConfig,
  type SuiExecutionClient,
  type SuiExecutionResponse,
  type SuiServerConfig,
} from '../src/server';
import { LEVEL_ID, PACKAGE_ID, SESSION_ID } from './fixtures';

const DIGEST = toBase58(new Uint8Array(32).fill(7));
const CHAIN_IDENTIFIER = toBase58(new Uint8Array(32).fill(8));
const SIGNER_ADDRESS = '0x00000000000000000000000000000000000000000000000000000000000a11ce';

function config(overrides: Partial<Record<string, unknown>> = {}): SuiServerConfig {
  return parseSuiServerConfig({
    network: 'testnet',
    rpcUrl: 'https://fullnode.testnet.sui.io:443',
    chainIdentifier: CHAIN_IDENTIFIER,
    packageId: PACKAGE_ID,
    levelConfigId: LEVEL_ID,
    signerAddress: SIGNER_ADDRESS,
    signerSecretKey: 'suiprivkey1testonly',
    operationPath: 'D:\\alibi-test-operations',
    ...overrides,
  });
}

function signer(address = SIGNER_ADDRESS): Signer {
  return { toSuiAddress: () => address } as unknown as Signer;
}

function sessionEvent(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    packageId: PACKAGE_ID,
    transactionModule: 'alibi',
    type: `${PACKAGE_ID}::alibi::SessionCreated`,
    parsedJson: {
      session: SESSION_ID,
      level: LEVEL_ID,
      player: SIGNER_ADDRESS,
      mode: 0,
      candidate_mask: '18446744073709551615',
      candidate_count: 64,
      disclosure_count: 0,
      query_nonce: '0',
      attempt_nonce: '0',
      protocol_version: 1,
      level_version: 1,
    },
    ...overrides,
  };
}

function successResponse(overrides: Partial<SuiExecutionResponse> = {}): SuiExecutionResponse {
  return {
    digest: DIGEST,
    checkpoint: '42',
    effects: { status: { status: 'success' } },
    events: [sessionEvent()],
    objectChanges: [
      { type: 'created', objectId: SESSION_ID, objectType: `${PACKAGE_ID}::alibi::GameSession` },
    ],
    ...overrides,
  };
}

function fakeClient(overrides: Partial<SuiExecutionClient> = {}): SuiExecutionClient {
  return {
    getChainIdentifier: vi.fn(async () => CHAIN_IDENTIFIER),
    signAndExecuteTransaction: vi.fn(async () => successResponse()),
    waitForTransaction: vi.fn(async () => successResponse()),
    ...overrides,
  };
}

const expectation = { eventKind: 'SessionCreated', createdObjectType: 'GameSession' } as const;

describe('official server-side Sui execution boundary', () => {
  it('submits once, confirms finality, decodes the event, and extracts the created session', async () => {
    const client = fakeClient();
    const executor = new OfficialSuiTransactionExecutor(config(), { client, signer: signer() });
    await expect(executor.submit(new Transaction())).resolves.toEqual({ digest: DIGEST });
    const confirmed = await executor.confirm(DIGEST, expectation);
    expect(confirmed).toMatchObject({
      digest: DIGEST,
      success: true,
      checkpoint: '42',
      createdObjects: [{ objectId: SESSION_ID }],
      events: [{ kind: 'SessionCreated' }],
    });
    expect(client.signAndExecuteTransaction).toHaveBeenCalledTimes(1);
    expect(client.waitForTransaction).toHaveBeenCalledTimes(1);
  });

  it('rejects failed execution effects even when a digest exists', async () => {
    const client = fakeClient({
      signAndExecuteTransaction: vi.fn(async () =>
        successResponse({ effects: { status: { status: 'failure' } } }),
      ),
    });
    const executor = new OfficialSuiTransactionExecutor(config(), { client, signer: signer() });
    await expect(executor.submit(new Transaction())).rejects.toMatchObject({
      code: 'SUBMISSION_FAILED',
    });
  });

  it.each([
    ['package', { packageId: LEVEL_ID }],
    ['module', { transactionModule: 'verifier' }],
    ['event', { type: `${PACKAGE_ID}::alibi::QueryResolved` }],
  ])('rejects a wrong %s identity', async (_label, eventOverride) => {
    const client = fakeClient({
      waitForTransaction: vi.fn(async () =>
        successResponse({ events: [sessionEvent(eventOverride)] }),
      ),
    });
    const executor = new OfficialSuiTransactionExecutor(config(), { client, signer: signer() });
    await expect(executor.confirm(DIGEST, expectation)).rejects.toMatchObject({
      code: 'CONFIRMATION_FAILED',
    });
  });

  it('rejects missing, duplicated, or ambiguous expected events and created objects', async () => {
    for (const response of [
      successResponse({ events: [] }),
      successResponse({ events: [sessionEvent(), sessionEvent()] }),
      successResponse({ objectChanges: [] }),
      successResponse({
        objectChanges: [
          {
            type: 'created',
            objectId: SESSION_ID,
            objectType: `${PACKAGE_ID}::alibi::GameSession`,
          },
          { type: 'created', objectId: LEVEL_ID, objectType: `${PACKAGE_ID}::alibi::GameSession` },
        ],
      }),
    ]) {
      const executor = new OfficialSuiTransactionExecutor(config(), {
        client: fakeClient({ waitForTransaction: vi.fn(async () => response) }),
        signer: signer(),
      });
      await expect(executor.confirm(DIGEST, expectation)).rejects.toMatchObject({
        code: 'CONFIRMATION_FAILED',
      });
    }
  });

  it('rejects a network mismatch before signing', async () => {
    const client = fakeClient({ getChainIdentifier: vi.fn(async () => DIGEST) });
    const executor = new OfficialSuiTransactionExecutor(config(), { client, signer: signer() });
    await expect(executor.submit(new Transaction())).rejects.toMatchObject({
      code: 'SUBMISSION_FAILED',
    });
    expect(client.signAndExecuteTransaction).not.toHaveBeenCalled();
  });

  it('sanitizes RPC and signer failures without returning secret-bearing details', async () => {
    const client = fakeClient({
      signAndExecuteTransaction: vi.fn(async () => {
        throw new Error('rpc token=do-not-return C:\\private\\key');
      }),
    });
    const executor = new OfficialSuiTransactionExecutor(config(), { client, signer: signer() });
    try {
      await executor.submit(new Transaction());
      throw new Error('expected failure');
    } catch (error) {
      expect(error).toBeInstanceOf(AlibiSuiError);
      expect(JSON.stringify(error)).not.toMatch(/do-not-return|private|token=/u);
    }
    expect(
      () => new OfficialSuiTransactionExecutor(config(), { client, signer: signer(LEVEL_ID) }),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_CONFIGURATION' }));
  });

  it('never blindly resubmits after an ambiguous confirmation', async () => {
    const submit = vi.fn(async () => successResponse());
    const client = fakeClient({
      signAndExecuteTransaction: submit,
      waitForTransaction: vi.fn(async () => {
        throw new Error('ambiguous timeout after execution');
      }),
    });
    const executor = new OfficialSuiTransactionExecutor(config(), { client, signer: signer() });
    await executor.submit(new Transaction());
    await expect(executor.confirm(DIGEST, expectation)).rejects.toMatchObject({
      code: 'CONFIRMATION_FAILED',
    });
    expect(submit).toHaveBeenCalledTimes(1);
  });
});

describe('Sui live server configuration', () => {
  it('fails closed on missing or placeholder configuration', () => {
    expect(() => parseSuiServerConfig({})).toThrowError(
      expect.objectContaining({ code: 'INVALID_CONFIGURATION' }),
    );
    expect(() => config({ rpcUrl: 'https://example.com' })).toThrowError(
      expect.objectContaining({ code: 'INVALID_CONFIGURATION' }),
    );
    expect(() => config({ packageId: '0x0' })).toThrowError(
      expect.objectContaining({ code: 'INVALID_CONFIGURATION' }),
    );
  });
});
