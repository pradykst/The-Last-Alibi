import { SUI_CLOCK_OBJECT_ID, toBase64 } from '@mysten/sui/utils';
import { describe, expect, it } from 'vitest';

import {
  buildAuthorizeRegisteredQuery,
  buildCreatePracticeSession,
  buildExpireUnresolvedQuery,
  buildProofBackedResolution,
  buildProofBackedVerdictFinalization,
  buildStartTerminalAccusation,
  walrusContentBlobIdFromBase64Url,
} from '../src';
import { LEVEL_ID, OTHER_WALRUS_BLOB_ID, PACKAGE_ID, SESSION_ID, WALRUS_BLOB_ID } from './fixtures';

const verdictBlobId = walrusContentBlobIdFromBase64Url(WALRUS_BLOB_ID);

type TransactionData = ReturnType<ReturnType<typeof buildCreatePracticeSession>['getData']>;

function moveCall(data: TransactionData, index = 0) {
  const command = data.commands[index] as { MoveCall?: Record<string, unknown> };
  if (command.MoveCall === undefined) throw new Error('expected MoveCall');
  return command.MoveCall;
}

describe('transaction builders', () => {
  it('constructs Practice creation with exact argument encoding', () => {
    const commitment = Uint8Array.from({ length: 32 }, (_, index) => index);
    const data = buildCreatePracticeSession(
      { packageId: PACKAGE_ID, levelConfigId: LEVEL_ID },
      commitment,
    ).getData();
    expect(moveCall(data)).toMatchObject({ module: 'alibi', function: 'create_session' });
    expect(data.inputs).toHaveLength(5);
    expect(data.inputs[1]).toMatchObject({ Pure: { bytes: toBase64(Uint8Array.of(0)) } });
    expect(data.inputs[2]).toMatchObject({
      Pure: { bytes: toBase64(Uint8Array.from([32, ...commitment])) },
    });
    expect(data.inputs[3]).toMatchObject({ Pure: { bytes: toBase64(Uint8Array.of(1, 0)) } });
    expect(data.inputs[4]).toMatchObject({ Pure: { bytes: toBase64(Uint8Array.of(1, 0)) } });
    expect(() =>
      buildCreatePracticeSession({ packageId: PACKAGE_ID, levelConfigId: LEVEL_ID }, '0x00'),
    ).toThrowError('32 bytes');
  });

  it('encodes registered query, max nonce, and Clock exactly', () => {
    const data = buildAuthorizeRegisteredQuery({
      packageId: PACKAGE_ID,
      levelConfigId: LEVEL_ID,
      sessionId: SESSION_ID,
      predicateId: 11,
      expectedNonce: '18446744073709551615',
    }).getData();
    expect(moveCall(data)).toMatchObject({ module: 'alibi', function: 'authorize_query' });
    expect(data.inputs[2]).toMatchObject({ Pure: { bytes: toBase64(Uint8Array.of(11)) } });
    expect(data.inputs[3]).toMatchObject({
      Pure: { bytes: toBase64(Uint8Array.from({ length: 8 }, () => 255)) },
    });
    expect(data.inputs[4]).toMatchObject({
      UnresolvedObject: {
        objectId: expect.stringContaining(SUI_CLOCK_OBJECT_ID.slice(2).padStart(64, '0')),
      },
    });
    expect(() =>
      buildAuthorizeRegisteredQuery({
        packageId: PACKAGE_ID,
        levelConfigId: LEVEL_ID,
        sessionId: SESSION_ID,
        predicateId: 12,
        expectedNonce: 0n,
      }),
    ).toThrowError('not registered');
  });

  it('starts a terminal accusation with one canonical content blob ID', () => {
    const accusationCommitment = Uint8Array.from({ length: 32 }, () => 0x22);
    const data = buildStartTerminalAccusation({
      packageId: PACKAGE_ID,
      levelConfigId: LEVEL_ID,
      sessionId: SESSION_ID,
      accusationCommitment,
      expectedVerdictBlobId: verdictBlobId,
      expectedAttemptNonce: 0n,
    }).getData();
    expect(moveCall(data)).toMatchObject({ module: 'alibi', function: 'start_accusation' });
    expect(data.inputs).toHaveLength(6);
    expect(data.inputs[2]).toMatchObject({
      Pure: { bytes: toBase64(Uint8Array.from([32, ...accusationCommitment])) },
    });
    expect(data.inputs[3]).toMatchObject({
      Pure: { bytes: toBase64(verdictBlobId.toBytes().slice().reverse()) },
    });
    expect(() =>
      buildStartTerminalAccusation({
        packageId: PACKAGE_ID,
        levelConfigId: LEVEL_ID,
        sessionId: SESSION_ID,
        accusationCommitment: new Uint8Array(32),
        expectedVerdictBlobId: verdictBlobId,
        expectedAttemptNonce: 0n,
      }),
    ).toThrowError('all zeroes');
  });

  it('constructs expiry with no cancellation or result argument', () => {
    const data = buildExpireUnresolvedQuery({
      packageId: PACKAGE_ID,
      levelConfigId: LEVEL_ID,
      sessionId: SESSION_ID,
    }).getData();
    expect(moveCall(data)).toMatchObject({ module: 'alibi', function: 'expire_query' });
    expect(data.inputs).toHaveLength(3);
  });

  it('prepares verifier receipt consumption and no caller-supplied replacement mask', () => {
    const data = buildProofBackedResolution({
      packageId: PACKAGE_ID,
      levelConfigId: LEVEL_ID,
      sessionId: SESSION_ID,
      predicateId: 0,
      queryNonce: 0n,
      preCandidateMask: '18446744073709551615',
      result: true,
      expectedVerifierIdentity: new Uint8Array(),
      proof: Uint8Array.of(1, 2, 3),
    }).getData();
    expect(data.commands).toHaveLength(2);
    expect(moveCall(data, 0)).toMatchObject({ module: 'verifier', function: 'verify_query_proof' });
    expect(moveCall(data, 1)).toMatchObject({ module: 'alibi', function: 'resolve_query' });
    expect(moveCall(data, 1).arguments as unknown[]).toHaveLength(3);
  });

  it('binds one content blob through verification with no finalization override', () => {
    const data = buildProofBackedVerdictFinalization({
      packageId: PACKAGE_ID,
      levelConfigId: LEVEL_ID,
      sessionId: SESSION_ID,
      attemptNonce: 0n,
      verdictCommitment: Uint8Array.from({ length: 32 }, () => 0x44),
      encryptedVerdictBlobId: verdictBlobId,
      proof: Uint8Array.from({ length: 128 }, () => 1),
    }).getData();
    expect(data.commands).toHaveLength(2);
    expect(moveCall(data, 0)).toMatchObject({
      module: 'alibi',
      function: 'verify_verdict_proof',
    });
    expect(moveCall(data, 0).arguments as unknown[]).toHaveLength(6);
    expect(data.inputs[4]).toMatchObject({
      Pure: { bytes: toBase64(verdictBlobId.toBytes().slice().reverse()) },
    });
    expect(moveCall(data, 1)).toMatchObject({ module: 'alibi', function: 'finalize_verdict' });
    expect(moveCall(data, 1).arguments as unknown[]).toHaveLength(4);
  });

  it('rejects object-ID substitution, malformed proofs, and malformed commitments client-side', () => {
    const base = {
      packageId: PACKAGE_ID,
      levelConfigId: LEVEL_ID,
      sessionId: SESSION_ID,
      attemptNonce: 0n,
      verdictCommitment: Uint8Array.from({ length: 32 }, () => 0x44),
      encryptedVerdictBlobId: verdictBlobId,
      proof: Uint8Array.from({ length: 128 }, () => 1),
    };
    expect(() =>
      buildProofBackedVerdictFinalization({
        ...base,
        encryptedVerdictBlobId: SESSION_ID as never,
      }),
    ).toThrowError('not a Sui object ID');
    expect(() =>
      buildProofBackedVerdictFinalization({ ...base, proof: new Uint8Array() }),
    ).toThrowError('exactly 128 bytes');
    expect(() =>
      buildProofBackedVerdictFinalization({ ...base, verdictCommitment: new Uint8Array(32) }),
    ).toThrowError('all zeroes');
  });

  it('decodes only canonical nonzero Walrus content IDs without byte-order loss', () => {
    expect(verdictBlobId.toBase64Url()).toBe(WALRUS_BLOB_ID);
    expect(verdictBlobId.toBytes()).toEqual(
      Uint8Array.from([
        0x33, 0x88, 0x6c, 0x64, 0x64, 0x35, 0xa0, 0x29, 0x2d, 0x77, 0x37, 0xa0, 0x07, 0xa1, 0xe7,
        0x23, 0xa3, 0x22, 0xdb, 0xc4, 0xb6, 0x9e, 0xa3, 0x8f, 0x1f, 0x12, 0xbe, 0x5b, 0xbf, 0xf8,
        0x05, 0x49,
      ]),
    );
    expect(verdictBlobId.toMoveU256()).toBe(
      23308994573709855642619175826119088931643282545396843698436971920739544859977n,
    );
    expect(walrusContentBlobIdFromBase64Url(OTHER_WALRUS_BLOB_ID).toMoveU256()).not.toBe(
      verdictBlobId.toMoveU256(),
    );
    expect(() => walrusContentBlobIdFromBase64Url(SESSION_ID)).toThrowError('not a Sui object ID');
    expect(() =>
      walrusContentBlobIdFromBase64Url('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'),
    ).toThrowError('nonzero');
    expect(() => walrusContentBlobIdFromBase64Url(`${WALRUS_BLOB_ID}=`)).toThrowError('canonical');
  });
});
