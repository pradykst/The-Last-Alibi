import { SUI_CLOCK_OBJECT_ID, toBase64 } from '@mysten/sui/utils';
import { describe, expect, it } from 'vitest';

import {
  buildAuthorizeRegisteredQuery,
  buildCreatePracticeSession,
  buildExpireUnresolvedQuery,
  buildProofBackedResolution,
  buildProofBackedVerdictFinalization,
  buildStartTerminalAccusation,
} from '../src';
import { LEVEL_ID, PACKAGE_ID, SESSION_ID } from './fixtures';

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

  it('starts a terminal accusation with only commitment, nonce, and Clock', () => {
    const accusationCommitment = Uint8Array.from({ length: 32 }, () => 0x22);
    const data = buildStartTerminalAccusation({
      packageId: PACKAGE_ID,
      levelConfigId: LEVEL_ID,
      sessionId: SESSION_ID,
      accusationCommitment,
      expectedAttemptNonce: 0n,
    }).getData();
    expect(moveCall(data)).toMatchObject({ module: 'alibi', function: 'start_accusation' });
    expect(data.inputs).toHaveLength(5);
    expect(data.inputs[2]).toMatchObject({
      Pure: { bytes: toBase64(Uint8Array.from([32, ...accusationCommitment])) },
    });
    expect(() =>
      buildStartTerminalAccusation({
        packageId: PACKAGE_ID,
        levelConfigId: LEVEL_ID,
        sessionId: SESSION_ID,
        accusationCommitment: new Uint8Array(32),
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

  it('prepares the fail-closed Z1 verdict receipt and terminal consumption', () => {
    const data = buildProofBackedVerdictFinalization({
      packageId: PACKAGE_ID,
      levelConfigId: LEVEL_ID,
      sessionId: SESSION_ID,
      attemptNonce: 0n,
      caseCommitment: Uint8Array.from({ length: 32 }, () => 0x11),
      accusationCommitment: Uint8Array.from({ length: 32 }, () => 0x22),
      sessionAttemptDomainCommitment: Uint8Array.from({ length: 32 }, () => 0x33),
      verdictCommitment: Uint8Array.from({ length: 32 }, () => 0x44),
      encryptedVerdictBlobId: 1n,
      expectedVerifierIdentity: Uint8Array.from({ length: 32 }, () => 0xaa),
      proof: Uint8Array.of(1, 2, 3),
    }).getData();
    expect(data.commands).toHaveLength(2);
    expect(moveCall(data, 0)).toMatchObject({
      module: 'verifier',
      function: 'verify_verdict_proof',
    });
    expect(moveCall(data, 0).arguments as unknown[]).toHaveLength(11);
    expect(moveCall(data, 1)).toMatchObject({ module: 'alibi', function: 'finalize_verdict' });
    expect(moveCall(data, 1).arguments as unknown[]).toHaveLength(4);
  });

  it('rejects absent verdict blobs, proofs, and malformed commitments client-side', () => {
    const base = {
      packageId: PACKAGE_ID,
      levelConfigId: LEVEL_ID,
      sessionId: SESSION_ID,
      attemptNonce: 0n,
      caseCommitment: Uint8Array.from({ length: 32 }, () => 0x11),
      accusationCommitment: Uint8Array.from({ length: 32 }, () => 0x22),
      sessionAttemptDomainCommitment: Uint8Array.from({ length: 32 }, () => 0x33),
      verdictCommitment: Uint8Array.from({ length: 32 }, () => 0x44),
      encryptedVerdictBlobId: 1n,
      expectedVerifierIdentity: Uint8Array.from({ length: 32 }, () => 0xaa),
      proof: Uint8Array.of(1),
    };
    expect(() =>
      buildProofBackedVerdictFinalization({ ...base, encryptedVerdictBlobId: 0n }),
    ).toThrowError('blob ID is missing');
    expect(() =>
      buildProofBackedVerdictFinalization({ ...base, proof: new Uint8Array() }),
    ).toThrowError('proof is missing');
    expect(() =>
      buildProofBackedVerdictFinalization({ ...base, verdictCommitment: new Uint8Array(32) }),
    ).toThrowError('all zeroes');
  });
});
