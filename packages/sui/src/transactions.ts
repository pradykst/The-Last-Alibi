import { Transaction } from '@mysten/sui/transactions';
import { isValidSuiObjectId, normalizeSuiObjectId, SUI_CLOCK_OBJECT_ID } from '@mysten/sui/utils';

import {
  ALIBI_MOVE_MODULE,
  LEVEL_VERSION,
  PRACTICE_MODE,
  PROTOCOL_VERSION,
  RECEIPT_VERSION,
  VERDICT_RECEIPT_VERSION,
  VERIFIER_MOVE_MODULE,
  moveTarget,
} from './constants';
import { sanitizedError } from './errors';
import { parseU256, parseU64 } from './masks';

export type TransactionFactory = () => Transaction;

export type BuilderDependencies = {
  transactionFactory?: TransactionFactory;
};

function objectId(value: string): string {
  if (!isValidSuiObjectId(value)) {
    throw sanitizedError('INVALID_INPUT', 'A required Sui object ID is invalid.');
  }
  return normalizeSuiObjectId(value);
}

function bytes(value: Uint8Array | string, exactLength?: number): number[] {
  let result: number[];
  if (typeof value === 'string') {
    if (!/^0x(?:[0-9a-f]{2})*$/u.test(value)) {
      throw sanitizedError('INVALID_INPUT', 'A byte string is not canonically encoded.');
    }
    result = Array.from({ length: (value.length - 2) / 2 }, (_, index) =>
      Number.parseInt(value.slice(2 + index * 2, 4 + index * 2), 16),
    );
  } else {
    result = Array.from(value);
  }
  if (exactLength !== undefined && result.length !== exactLength) {
    throw sanitizedError('INVALID_INPUT', `Expected exactly ${exactLength} bytes.`);
  }
  return result;
}

function commitment(value: Uint8Array | string): number[] {
  const result = bytes(value, 32);
  if (result.every((byte) => byte === 0)) {
    throw sanitizedError('INVALID_INPUT', 'A commitment cannot be all zeroes.');
  }
  return result;
}

function transaction(dependencies?: BuilderDependencies): Transaction {
  return dependencies?.transactionFactory?.() ?? new Transaction();
}

export type AlibiTransactionConfig = {
  packageId: string;
  levelConfigId: string;
};

export function buildCreatePracticeSession(
  config: AlibiTransactionConfig,
  caseCommitment: Uint8Array | string,
  dependencies?: BuilderDependencies,
): Transaction {
  const tx = transaction(dependencies);
  tx.moveCall({
    target: moveTarget(objectId(config.packageId), ALIBI_MOVE_MODULE, 'create_session'),
    arguments: [
      tx.object(objectId(config.levelConfigId)),
      tx.pure.u8(PRACTICE_MODE),
      tx.pure.vector('u8', bytes(caseCommitment, 32)),
      tx.pure.u16(PROTOCOL_VERSION),
      tx.pure.u16(LEVEL_VERSION),
    ],
  });
  return tx;
}

export function buildStartTerminalAccusation(
  config: AlibiTransactionConfig & {
    sessionId: string;
    accusationCommitment: Uint8Array | string;
    expectedAttemptNonce: bigint | string;
  },
  dependencies?: BuilderDependencies,
): Transaction {
  const tx = transaction(dependencies);
  tx.moveCall({
    target: moveTarget(objectId(config.packageId), ALIBI_MOVE_MODULE, 'start_accusation'),
    arguments: [
      tx.object(objectId(config.sessionId)),
      tx.object(objectId(config.levelConfigId)),
      tx.pure.vector('u8', commitment(config.accusationCommitment)),
      tx.pure.u64(parseU64(config.expectedAttemptNonce)),
      tx.object(SUI_CLOCK_OBJECT_ID),
    ],
  });
  return tx;
}

export function buildAuthorizeRegisteredQuery(
  config: AlibiTransactionConfig & {
    sessionId: string;
    predicateId: number;
    expectedNonce: bigint | string;
  },
  dependencies?: BuilderDependencies,
): Transaction {
  if (!Number.isInteger(config.predicateId) || config.predicateId < 0 || config.predicateId >= 12) {
    throw sanitizedError('INVALID_INPUT', 'The predicate ID is not registered.');
  }
  const tx = transaction(dependencies);
  tx.moveCall({
    target: moveTarget(objectId(config.packageId), ALIBI_MOVE_MODULE, 'authorize_query'),
    arguments: [
      tx.object(objectId(config.sessionId)),
      tx.object(objectId(config.levelConfigId)),
      tx.pure.u8(config.predicateId),
      tx.pure.u64(parseU64(config.expectedNonce)),
      tx.object(SUI_CLOCK_OBJECT_ID),
    ],
  });
  return tx;
}

export function buildExpireUnresolvedQuery(
  config: AlibiTransactionConfig & { sessionId: string },
  dependencies?: BuilderDependencies,
): Transaction {
  const tx = transaction(dependencies);
  tx.moveCall({
    target: moveTarget(objectId(config.packageId), ALIBI_MOVE_MODULE, 'expire_query'),
    arguments: [
      tx.object(objectId(config.sessionId)),
      tx.object(objectId(config.levelConfigId)),
      tx.object(SUI_CLOCK_OBJECT_ID),
    ],
  });
  return tx;
}

export type FutureProofResolution = AlibiTransactionConfig & {
  sessionId: string;
  predicateId: number;
  queryNonce: bigint | string;
  preCandidateMask: bigint | string;
  result: boolean;
  expectedVerifierIdentity: Uint8Array | string;
  proof: Uint8Array | string;
};

/**
 * Prepares the Z1 transaction shape. On S1 bytecode the first call always aborts
 * with EVerifierUnavailable, so this builder cannot produce a confirmed mutation.
 */
export function buildProofBackedResolution(
  config: FutureProofResolution,
  dependencies?: BuilderDependencies,
): Transaction {
  if (!Number.isInteger(config.predicateId) || config.predicateId < 0 || config.predicateId >= 12) {
    throw sanitizedError('INVALID_INPUT', 'The predicate ID is not registered.');
  }
  const tx = transaction(dependencies);
  const packageId = objectId(config.packageId);
  const sessionId = objectId(config.sessionId);
  const levelId = objectId(config.levelConfigId);
  const receipt = tx.moveCall({
    target: moveTarget(packageId, VERIFIER_MOVE_MODULE, 'verify_query_proof'),
    arguments: [
      tx.pure.u16(RECEIPT_VERSION),
      tx.pure.id(sessionId),
      tx.pure.id(levelId),
      tx.pure.u8(config.predicateId),
      tx.pure.u64(parseU64(config.queryNonce)),
      tx.pure.u64(parseU64(config.preCandidateMask)),
      tx.pure.bool(config.result),
      tx.pure.vector('u8', bytes(config.expectedVerifierIdentity)),
      tx.pure.vector('u8', bytes(config.proof)),
    ],
  });
  tx.moveCall({
    target: moveTarget(packageId, ALIBI_MOVE_MODULE, 'resolve_query'),
    arguments: [tx.object(sessionId), tx.object(levelId), receipt],
  });
  return tx;
}

export type FutureVerdictFinalization = AlibiTransactionConfig & {
  sessionId: string;
  attemptNonce: bigint | string;
  caseCommitment: Uint8Array | string;
  accusationCommitment: Uint8Array | string;
  sessionAttemptDomainCommitment: Uint8Array | string;
  verdictCommitment: Uint8Array | string;
  encryptedVerdictBlobId: bigint | string;
  expectedVerifierIdentity: Uint8Array | string;
  proof: Uint8Array | string;
};

/**
 * Prepares the S2-to-Z1 transaction shape. The production S2 verifier always
 * aborts with EVerifierUnavailable and cannot create a verdict receipt.
 */
export function buildProofBackedVerdictFinalization(
  config: FutureVerdictFinalization,
  dependencies?: BuilderDependencies,
): Transaction {
  const tx = transaction(dependencies);
  const packageId = objectId(config.packageId);
  const sessionId = objectId(config.sessionId);
  const levelId = objectId(config.levelConfigId);
  const blobId = parseU256(config.encryptedVerdictBlobId);
  if (blobId === 0n) {
    throw sanitizedError('INVALID_INPUT', 'The encrypted verdict blob ID is missing.');
  }
  const proof = bytes(config.proof);
  if (proof.length === 0) {
    throw sanitizedError('INVALID_INPUT', 'The verdict proof is missing.');
  }
  const receipt = tx.moveCall({
    target: moveTarget(packageId, VERIFIER_MOVE_MODULE, 'verify_verdict_proof'),
    arguments: [
      tx.pure.u16(VERDICT_RECEIPT_VERSION),
      tx.pure.id(sessionId),
      tx.pure.id(levelId),
      tx.pure.u64(parseU64(config.attemptNonce)),
      tx.pure.vector('u8', bytes(config.caseCommitment, 32)),
      tx.pure.vector('u8', commitment(config.accusationCommitment)),
      tx.pure.vector('u8', commitment(config.sessionAttemptDomainCommitment)),
      tx.pure.vector('u8', commitment(config.verdictCommitment)),
      tx.pure.u256(blobId),
      tx.pure.vector('u8', commitment(config.expectedVerifierIdentity)),
      tx.pure.vector('u8', proof),
    ],
  });
  tx.moveCall({
    target: moveTarget(packageId, ALIBI_MOVE_MODULE, 'finalize_verdict'),
    arguments: [tx.object(sessionId), tx.object(levelId), receipt, tx.object(SUI_CLOCK_OBJECT_ID)],
  });
  return tx;
}
