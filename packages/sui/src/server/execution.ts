import type { Transaction } from '@mysten/sui/transactions';
import { decodeSuiPrivateKey, type Signer } from '@mysten/sui/cryptography';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Secp256k1Keypair } from '@mysten/sui/keypairs/secp256k1';
import { Secp256r1Keypair } from '@mysten/sui/keypairs/secp256r1';
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import {
  isValidTransactionDigest,
  normalizeStructTag,
  normalizeSuiObjectId,
} from '@mysten/sui/utils';

import type {
  ProtocolConfirmationExpectation,
  ProtocolConfirmationResult,
  ProtocolEvent,
  TransactionConfirmer,
  TransactionSubmitter,
} from '../adapter';
import { ALIBI_MOVE_MODULE } from '../constants';
import { sanitizedError } from '../errors';
import { decodeAlibiEvent } from '../events';
import type { SuiServerConfig } from './config';

export type SuiExecutionResponse = {
  digest: string;
  checkpoint?: string | null;
  effects?: { status: { status: 'success' | 'failure' } } | null;
  errors?: string[];
  events?:
    | {
        packageId: string;
        transactionModule: string;
        type: string;
        parsedJson: unknown;
      }[]
    | null;
  objectChanges?:
    | (
        | { type: 'created'; objectId: string; objectType: string }
        | { type: string; objectId?: string; objectType?: string }
      )[]
    | null;
};

export interface SuiExecutionClient {
  getChainIdentifier(): Promise<string>;
  signAndExecuteTransaction(input: {
    transaction: Transaction;
    signer: Signer;
    options: { showEffects: true };
  }): Promise<SuiExecutionResponse>;
  waitForTransaction(input: {
    digest: string;
    options: { showEffects: true; showEvents: true; showObjectChanges: true };
  }): Promise<SuiExecutionResponse>;
}

function loadSigner(secret: string): Signer {
  const decoded = decodeSuiPrivateKey(secret);
  switch (decoded.scheme) {
    case 'ED25519':
      return Ed25519Keypair.fromSecretKey(decoded.secretKey);
    case 'Secp256k1':
      return Secp256k1Keypair.fromSecretKey(decoded.secretKey);
    case 'Secp256r1':
      return Secp256r1Keypair.fromSecretKey(decoded.secretKey);
    default:
      throw new Error('unsupported signer scheme');
  }
}

export class OfficialSuiTransactionExecutor implements TransactionSubmitter, TransactionConfirmer {
  readonly config: SuiServerConfig;
  readonly client: SuiExecutionClient;
  readonly signer: Signer;
  private chainValidated = false;

  constructor(
    config: SuiServerConfig,
    dependencies: { client?: SuiExecutionClient; signer?: Signer } = {},
  ) {
    this.config = config;
    this.client =
      dependencies.client ??
      (new SuiJsonRpcClient({ url: config.rpcUrl, network: config.network }) as SuiExecutionClient);
    try {
      this.signer = dependencies.signer ?? loadSigner(config.signerSecretKey);
      if (this.signer.toSuiAddress() !== config.signerAddress) throw new Error('signer mismatch');
    } catch {
      throw sanitizedError('INVALID_CONFIGURATION', 'The configured Sui signer is invalid.');
    }
  }

  async submit(transaction: Transaction): Promise<{ digest: string }> {
    try {
      await this.assertChain();
      const result = await this.client.signAndExecuteTransaction({
        transaction,
        signer: this.signer,
        options: { showEffects: true },
      });
      if (
        !isValidTransactionDigest(result.digest) ||
        result.effects?.status.status === 'failure' ||
        (result.errors?.length ?? 0) > 0
      ) {
        throw new Error('submission failed');
      }
      return { digest: result.digest };
    } catch {
      throw sanitizedError(
        'SUBMISSION_FAILED',
        'The Sui transaction could not be submitted.',
        true,
      );
    }
  }

  async confirm(
    digest: string,
    expectation: ProtocolConfirmationExpectation,
  ): Promise<ProtocolConfirmationResult> {
    try {
      await this.assertChain();
      if (!isValidTransactionDigest(digest)) throw new Error('invalid digest');
      const result = await this.client.waitForTransaction({
        digest,
        options: { showEffects: true, showEvents: true, showObjectChanges: true },
      });
      if (
        result.digest !== digest ||
        result.effects?.status.status !== 'success' ||
        typeof result.checkpoint !== 'string' ||
        result.checkpoint.length === 0 ||
        (result.errors?.length ?? 0) > 0
      ) {
        throw new Error('confirmation failed');
      }
      const events = this.decodeExpectedEvent(result, expectation);
      const createdObjects = this.extractCreatedObjects(result, expectation);
      return {
        digest,
        success: true,
        checkpoint: result.checkpoint,
        events,
        createdObjects,
      };
    } catch {
      throw sanitizedError(
        'CONFIRMATION_FAILED',
        'The Sui transaction was not confirmed successfully.',
        true,
      );
    }
  }

  private async assertChain(): Promise<void> {
    if (this.chainValidated) return;
    if ((await this.client.getChainIdentifier()) !== this.config.chainIdentifier) {
      throw new Error('network mismatch');
    }
    this.chainValidated = true;
  }

  private decodeExpectedEvent(
    result: SuiExecutionResponse,
    expectation: ProtocolConfirmationExpectation,
  ): readonly ProtocolEvent[] {
    const events = result.events ?? [];
    if (events.length !== 1) throw new Error('ambiguous event');
    const event = events[0];
    if (!event) throw new Error('missing event');
    if (
      normalizeSuiObjectId(event.packageId) !== this.config.packageId ||
      event.transactionModule !== ALIBI_MOVE_MODULE ||
      normalizeStructTag(event.type) !==
        normalizeStructTag(
          `${this.config.packageId}::${ALIBI_MOVE_MODULE}::${expectation.eventKind}`,
        )
    ) {
      throw new Error('unexpected event identity');
    }
    const decoded = decodeAlibiEvent(
      { type: event.type, parsedJson: event.parsedJson },
      this.config.packageId,
    );
    if (decoded.kind !== expectation.eventKind) throw new Error('unexpected event kind');
    return [decoded];
  }

  private extractCreatedObjects(
    result: SuiExecutionResponse,
    expectation: ProtocolConfirmationExpectation,
  ): readonly { objectId: string; objectType: string }[] {
    const created = (result.objectChanges ?? [])
      .filter(
        (change): change is { type: 'created'; objectId: string; objectType: string } =>
          change.type === 'created' &&
          typeof change.objectId === 'string' &&
          typeof change.objectType === 'string',
      )
      .map((change) => ({
        objectId: normalizeSuiObjectId(change.objectId),
        objectType: normalizeStructTag(change.objectType),
      }));
    if (!expectation.createdObjectType) {
      if (created.some((item) => item.objectType.startsWith(`${this.config.packageId}::`))) {
        throw new Error('unexpected protocol object');
      }
      return [];
    }
    const expectedType = normalizeStructTag(
      `${this.config.packageId}::${ALIBI_MOVE_MODULE}::${expectation.createdObjectType}`,
    );
    const matches = created.filter((item) => item.objectType === expectedType);
    if (matches.length !== 1) throw new Error('missing or ambiguous created object');
    return matches;
  }
}
