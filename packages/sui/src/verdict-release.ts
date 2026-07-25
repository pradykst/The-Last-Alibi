import { normalizeSuiAddress, normalizeSuiObjectId } from '@mysten/sui/utils';

import type { AlibiSuiAdapter } from './adapter.js';
import { ACCUSATION_PENDING_STATE, TERMINAL_STATE } from './constants.js';
import type {
  ActivatedSealSession,
  OfficialSealVerdictCrypto,
  SealApprovalBuilder,
} from './seal-verdict.js';
import { encodeSealVerdictIdentity } from './seal-verdict.js';
import type { PublicGameSession } from './state.js';
import { decodeVerdictCapsule, validateVerdictCapsuleOpening } from './verdict-capsule.js';
import { WalrusContentBlobId } from './walrus-blob-id.js';
import type { WalrusVerdictStore } from './walrus-verdict.js';

export interface VerifiedTerminalVerdict {
  verdict: 'YES' | 'NO';
  sessionId: string;
  attemptNonce: string;
  protocolVersion: number;
  levelVersion: number;
  accusationCommitment: string;
  verdictCommitment: string;
  walrusContentBlobId: string;
  storageVerified: true;
  sealAuthorized: true;
  capsuleValidated: true;
  commitmentOpeningValidated: true;
}

function assertTerminalAuthority(
  session: PublicGameSession,
  expectedPlayer: string,
): asserts session is PublicGameSession & {
  verdict: NonNullable<PublicGameSession['verdict']>;
} {
  if (
    session.state !== TERMINAL_STATE ||
    session.verdict === null ||
    normalizeSuiAddress(session.player) !== normalizeSuiAddress(expectedPlayer)
  ) {
    throw new Error('terminal verdict is not available to the authenticated session player');
  }
}

export async function releaseTerminalVerdict(input: {
  adapter: Pick<AlibiSuiAdapter, 'readSession'>;
  sessionId: string;
  authenticatedPlayer: string;
  walrus: Pick<WalrusVerdictStore, 'readExact'>;
  seal: Pick<OfficialSealVerdictCrypto, 'decrypt'>;
  approval: SealApprovalBuilder;
  sealSession: ActivatedSealSession;
}): Promise<VerifiedTerminalVerdict> {
  const session = await input.adapter.readSession(input.sessionId);
  if (normalizeSuiObjectId(session.objectId) !== normalizeSuiObjectId(input.sessionId)) {
    throw new Error('Sui returned a different GameSession object');
  }
  assertTerminalAuthority(session, input.authenticatedPlayer);

  const record = session.verdict;
  const blobId = WalrusContentBlobId.fromAuthoritativeMoveU256(
    BigInt(record.encryptedVerdictBlobId),
  );
  const identity = encodeSealVerdictIdentity({
    sessionId: session.objectId,
    attemptNonce: BigInt(record.attemptNonce),
    protocolVersion: session.protocolVersion,
    levelVersion: session.levelVersion,
    accusationCommitment: record.accusationCommitment,
    verdictCommitment: record.verdictCommitment,
  });
  const ciphertext = await input.walrus.readExact(blobId);
  const transactionBytes = await input.approval.build({
    sessionId: session.objectId,
    identity,
  });
  const plaintext = await input.seal.decrypt(
    ciphertext,
    identity,
    input.sealSession,
    transactionBytes,
  );

  try {
    const capsule = decodeVerdictCapsule(plaintext);
    if (
      normalizeSuiObjectId(capsule.sessionId) !== normalizeSuiObjectId(session.objectId) ||
      capsule.attemptNonce.toString() !== record.attemptNonce ||
      capsule.protocolVersion !== session.protocolVersion ||
      capsule.levelVersion !== session.levelVersion ||
      capsule.accusationCommitment !== record.accusationCommitment ||
      capsule.verdictCommitment !== record.verdictCommitment
    ) {
      throw new Error('decrypted verdict capsule does not match terminal Sui state');
    }
    await validateVerdictCapsuleOpening(capsule);
    return {
      verdict: capsule.verdict === 1 ? 'YES' : 'NO',
      sessionId: session.objectId,
      attemptNonce: record.attemptNonce,
      protocolVersion: session.protocolVersion,
      levelVersion: session.levelVersion,
      accusationCommitment: record.accusationCommitment,
      verdictCommitment: record.verdictCommitment,
      walrusContentBlobId: blobId.toBase64Url(),
      storageVerified: true,
      sealAuthorized: true,
      capsuleValidated: true,
      commitmentOpeningValidated: true,
    };
  } finally {
    plaintext.fill(0);
  }
}

export function assertPendingVerdictCapsuleTarget(input: {
  session: PublicGameSession;
  preparedBlobId: WalrusContentBlobId;
}): void {
  if (
    input.session.state !== ACCUSATION_PENDING_STATE ||
    input.session.pendingAccusation === null
  ) {
    throw new Error('session has no retryable pending accusation');
  }
  const expected = WalrusContentBlobId.fromAuthoritativeMoveU256(
    BigInt(input.session.pendingAccusation.expectedVerdictBlobId),
  );
  if (!expected.equals(input.preparedBlobId)) {
    throw new Error('prepared ciphertext does not match the pending accusation Blob ID');
  }
}
