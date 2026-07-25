import { Transaction } from '@mysten/sui/transactions';
import {
  isValidSuiAddress,
  isValidSuiObjectId,
  normalizeSuiAddress,
  normalizeSuiObjectId,
  SUI_CLOCK_OBJECT_ID,
} from '@mysten/sui/utils';

export const RANKED_PERMIT_MODULE = 'ranked_permit' as const;

export type RankedPermitPackageConfig = {
  packageId: string;
  registryId: string;
  issuerCapId: string;
  levelConfigId: string;
};

export type OpaqueRankedAuthorization = {
  schemaVersion: 1;
  levelId: string;
  recipient: string;
  entitlementCommitment: string;
  nonceCommitment: string;
  resourceCommitment: string;
  expiresAtMs: number;
};

export function buildIssueRankedPermit(
  config: RankedPermitPackageConfig,
  authorization: OpaqueRankedAuthorization,
): Transaction {
  if (authorization.schemaVersion !== 1)
    throw new Error('Unsupported ranked authorization version.');
  if (!isValidSuiAddress(authorization.recipient)) throw new Error('Invalid Sui permit recipient.');
  if (!Number.isSafeInteger(authorization.expiresAtMs) || authorization.expiresAtMs < 0) {
    throw new Error('Invalid ranked authorization expiry.');
  }
  const tx = new Transaction();
  tx.moveCall({
    target: `${objectId(config.packageId)}::${RANKED_PERMIT_MODULE}::issue_ranked_permit`,
    arguments: [
      tx.object(objectId(config.registryId)),
      tx.object(objectId(config.issuerCapId)),
      tx.object(objectId(config.levelConfigId)),
      tx.pure.vector('u8', Array.from(new TextEncoder().encode(authorization.levelId))),
      tx.pure.address(normalizeSuiAddress(authorization.recipient)),
      tx.pure.vector('u8', commitmentBytes(authorization.entitlementCommitment)),
      tx.pure.vector('u8', commitmentBytes(authorization.nonceCommitment)),
      tx.pure.vector('u8', commitmentBytes(authorization.resourceCommitment)),
      tx.pure.u64(BigInt(authorization.expiresAtMs)),
      tx.object(SUI_CLOCK_OBJECT_ID),
    ],
  });
  return tx;
}

export function buildConsumeRankedPermit(
  config: Pick<RankedPermitPackageConfig, 'packageId' | 'levelConfigId'>,
  permitId: string,
): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${objectId(config.packageId)}::${RANKED_PERMIT_MODULE}::consume_ranked_permit`,
    arguments: [
      tx.object(objectId(permitId)),
      tx.object(objectId(config.levelConfigId)),
      tx.object(SUI_CLOCK_OBJECT_ID),
    ],
  });
  return tx;
}

function objectId(value: string): string {
  if (!isValidSuiObjectId(value)) throw new Error('Invalid Sui ranked-permit object ID.');
  return normalizeSuiObjectId(value);
}

function commitmentBytes(value: string): number[] {
  if (!/^0x[0-9a-fA-F]{64}$/u.test(value)) {
    throw new Error('Ranked authorization commitments must contain exactly 32 bytes.');
  }
  return Array.from({ length: 32 }, (_, index) =>
    Number.parseInt(value.slice(2 + index * 2, 4 + index * 2), 16),
  );
}
