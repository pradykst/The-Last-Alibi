import { SUI_CLOCK_OBJECT_ID, toBase64 } from '@mysten/sui/utils';
import { describe, expect, it } from 'vitest';

import { buildConsumeRankedPermit, buildIssueRankedPermit } from '../src';

const PACKAGE = `0x${'a11b1'.padStart(64, '0')}`;
const REGISTRY = `0x${'111'.padStart(64, '0')}`;
const ISSUER = `0x${'222'.padStart(64, '0')}`;
const LEVEL = `0x${'333'.padStart(64, '0')}`;
const PERMIT = `0x${'444'.padStart(64, '0')}`;
const RECIPIENT = `0x${'1234'.padStart(64, '0')}`;
const COMMITMENT = `0x${'ab'.repeat(32)}`;

function moveCall(transaction: ReturnType<typeof buildIssueRankedPermit>, index = 0) {
  const command = transaction.getData().commands[index] as { MoveCall?: Record<string, unknown> };
  if (command.MoveCall === undefined) throw new Error('Expected MoveCall.');
  return command.MoveCall;
}

describe('ranked-permit Sui transaction boundary', () => {
  it('binds issue to the registry, issuer cap, level, recipient, commitments, expiry and Clock', () => {
    const tx = buildIssueRankedPermit(
      {
        packageId: PACKAGE,
        registryId: REGISTRY,
        issuerCapId: ISSUER,
        levelConfigId: LEVEL,
      },
      {
        schemaVersion: 1,
        levelId: 'the-last-exhibit',
        recipient: RECIPIENT,
        entitlementCommitment: COMMITMENT,
        nonceCommitment: COMMITMENT,
        resourceCommitment: COMMITMENT,
        expiresAtMs: 123_456,
      },
    );
    const data = tx.getData();
    expect(moveCall(tx)).toMatchObject({
      module: 'ranked_permit',
      function: 'issue_ranked_permit',
    });
    expect(data.inputs).toHaveLength(10);
    expect(data.inputs[5]).toMatchObject({
      Pure: { bytes: toBase64(Uint8Array.from([32, ...Array(32).fill(0xab)])) },
    });
    expect(data.inputs[9]).toMatchObject({
      UnresolvedObject: {
        objectId: expect.stringContaining(SUI_CLOCK_OBJECT_ID.slice(2).padStart(64, '0')),
      },
    });
  });

  it('builds isolated permit consumption without verdict arguments', () => {
    const tx = buildConsumeRankedPermit({ packageId: PACKAGE, levelConfigId: LEVEL }, PERMIT);
    expect(moveCall(tx)).toMatchObject({
      module: 'ranked_permit',
      function: 'consume_ranked_permit',
    });
    expect(tx.getData().inputs).toHaveLength(3);
  });

  it('rejects malformed commitments before transaction construction', () => {
    expect(() =>
      buildIssueRankedPermit(
        {
          packageId: PACKAGE,
          registryId: REGISTRY,
          issuerCapId: ISSUER,
          levelConfigId: LEVEL,
        },
        {
          schemaVersion: 1,
          levelId: 'the-last-exhibit',
          recipient: RECIPIENT,
          entitlementCommitment: '0x12',
          nonceCommitment: COMMITMENT,
          resourceCommitment: COMMITMENT,
          expiresAtMs: 123,
        },
      ),
    ).toThrowError('32 bytes');
  });
});
