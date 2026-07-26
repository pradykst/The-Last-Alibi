import type { Transaction } from '@mysten/sui/transactions';
import { isValidTransactionDigest } from '@mysten/sui/utils';

import type { SuiPublicConfig } from './config';
import { sanitizedError } from './errors';
import type { PublicAlibiEvent } from './events';
import {
  decodeGameSession,
  decodeLevelConfig,
  type MoveObjectEnvelope,
  type PublicGameSession,
  type PublicLevelConfig,
} from './state';
import {
  buildAuthorizeRegisteredQuery,
  buildCreatePracticeSession,
  buildExpireUnresolvedQuery,
  buildProofBackedResolution,
  buildProofBackedVerdictFinalization,
  buildStartTerminalAccusation,
  type BuilderDependencies,
  type FutureProofResolution,
  type FutureVerdictFinalization,
} from './transactions';
import type { WalrusContentBlobId } from './walrus-blob-id';

export type ProtocolEvent = PublicAlibiEvent;
export type ProtocolConfirmationExpectation = {
  eventKind: ProtocolEvent['kind'];
  createdObjectType?: 'LevelConfig' | 'GameSession';
};
export type ProtocolConfirmationResult = {
  digest: string;
  success: boolean;
  checkpoint?: string;
  events?: readonly ProtocolEvent[];
  createdObjects?: readonly { objectId: string; objectType: string }[];
};
export type PendingTransaction = {
  status: 'pending';
  digest: string;
  expectation: ProtocolConfirmationExpectation;
};
export type ConfirmedTransaction = {
  status: 'confirmed';
  digest: string;
  checkpoint: string;
  events: readonly ProtocolEvent[];
  createdObjects: readonly { objectId: string; objectType: string }[];
};
export interface TransactionSubmitter {
  submit(transaction: Transaction): Promise<{ digest: string }>;
}

export interface TransactionConfirmer {
  confirm(
    digest: string,
    expectation: ProtocolConfirmationExpectation,
  ): Promise<ProtocolConfirmationResult>;
}

export interface PublicObjectReader {
  readObject(objectId: string): Promise<MoveObjectEnvelope>;
}

export interface AlibiSuiAdapterDependencies {
  submitter: TransactionSubmitter;
  confirmer: TransactionConfirmer;
  reader: PublicObjectReader;
  builder?: BuilderDependencies;
}

export class AlibiSuiAdapter {
  readonly config: SuiPublicConfig;
  readonly dependencies: AlibiSuiAdapterDependencies;

  constructor(config: SuiPublicConfig, dependencies: AlibiSuiAdapterDependencies) {
    this.config = config;
    this.dependencies = dependencies;
  }

  createPracticeSession(caseCommitment: Uint8Array | string): Transaction {
    return buildCreatePracticeSession(this.config, caseCommitment, this.dependencies.builder);
  }

  authorizeQuery(
    sessionId: string,
    predicateId: number,
    expectedNonce: bigint | string,
  ): Transaction {
    return buildAuthorizeRegisteredQuery(
      { ...this.config, sessionId, predicateId, expectedNonce },
      this.dependencies.builder,
    );
  }

  startAccusation(
    sessionId: string,
    accusationCommitment: Uint8Array | string,
    expectedVerdictBlobId: WalrusContentBlobId,
    expectedAttemptNonce: bigint | string,
  ): Transaction {
    return buildStartTerminalAccusation(
      {
        ...this.config,
        sessionId,
        accusationCommitment,
        expectedVerdictBlobId,
        expectedAttemptNonce,
      },
      this.dependencies.builder,
    );
  }

  expireQuery(sessionId: string): Transaction {
    return buildExpireUnresolvedQuery({ ...this.config, sessionId }, this.dependencies.builder);
  }

  prepareProofResolution(
    input: Omit<FutureProofResolution, 'packageId' | 'levelConfigId'>,
  ): Transaction {
    return buildProofBackedResolution({ ...input, ...this.config }, this.dependencies.builder);
  }

  prepareVerdictFinalization(
    input: Omit<FutureVerdictFinalization, 'packageId' | 'levelConfigId'>,
  ): Transaction {
    return buildProofBackedVerdictFinalization(
      { ...input, ...this.config },
      this.dependencies.builder,
    );
  }

  async submit(
    transaction: Transaction,
    expectation: ProtocolConfirmationExpectation,
  ): Promise<PendingTransaction> {
    try {
      const result = await this.dependencies.submitter.submit(transaction);
      if (!isValidTransactionDigest(result.digest)) throw new Error('invalid digest');
      return { status: 'pending', digest: result.digest, expectation };
    } catch {
      throw sanitizedError(
        'SUBMISSION_FAILED',
        'The Sui transaction could not be submitted.',
        true,
      );
    }
  }

  async confirm(pending: PendingTransaction): Promise<ConfirmedTransaction> {
    try {
      if (!isValidTransactionDigest(pending.digest)) throw new Error('invalid digest');
      const result = await this.dependencies.confirmer.confirm(pending.digest, pending.expectation);
      if (
        result.digest !== pending.digest ||
        !result.success ||
        typeof result.checkpoint !== 'string' ||
        result.checkpoint.length === 0 ||
        !Array.isArray(result.events) ||
        !Array.isArray(result.createdObjects)
      ) {
        throw new Error('not confirmed');
      }
      return {
        status: 'confirmed',
        digest: result.digest,
        checkpoint: result.checkpoint,
        events: result.events,
        createdObjects: result.createdObjects,
      };
    } catch {
      throw sanitizedError(
        'CONFIRMATION_FAILED',
        'The Sui transaction was not confirmed successfully.',
        true,
      );
    }
  }

  async readLevel(): Promise<PublicLevelConfig> {
    try {
      return decodeLevelConfig(
        await this.dependencies.reader.readObject(this.config.levelConfigId),
        this.config.packageId,
      );
    } catch (error) {
      if (error instanceof Error && error.name === 'AlibiSuiError') throw error;
      throw sanitizedError('RPC_UNAVAILABLE', 'The Sui level state is unavailable.', true);
    }
  }

  async readSession(sessionId: string): Promise<PublicGameSession> {
    try {
      return decodeGameSession(
        await this.dependencies.reader.readObject(sessionId),
        this.config.packageId,
      );
    } catch (error) {
      if (error instanceof Error && error.name === 'AlibiSuiError') throw error;
      throw sanitizedError('RPC_UNAVAILABLE', 'The Sui session state is unavailable.', true);
    }
  }
}
