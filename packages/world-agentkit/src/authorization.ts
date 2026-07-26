import {
  createAgentBookVerifier,
  parseAgentkitHeader,
  validateAgentkitMessage,
  verifyAgentkitSignature,
  type AgentBookVerifier,
  type AgentkitPayload,
} from '@worldcoin/agentkit';
import { isAddress } from 'viem';
import { isValidSuiAddress, normalizeSuiAddress } from '@mysten/sui/utils';

import { publicCommitment } from './commitments';
import type { RankedAgentkitConfig } from './config';
import { deny, type RankedAuthorizationDenial } from './errors';
import type { RankedAuthorizationStore } from './storage';

export type RankedPermitAuthorization = {
  authorized: true;
  permit: {
    schemaVersion: 1;
    levelId: string;
    recipient: string;
    entitlementCommitment: `0x${string}`;
    nonceCommitment: `0x${string}`;
    resourceCommitment: `0x${string}`;
    expiresAtMs: number;
  };
};

export type RankedAuthorizationDecision = RankedPermitAuthorization | RankedAuthorizationDenial;

export type RankedAuthorizationRequest = {
  agentkitHeader?: string;
  resourceUri: string;
  levelId: string;
  recipient: string;
};

type VerificationDependencies = {
  parseHeader: typeof parseAgentkitHeader;
  validateMessage: typeof validateAgentkitMessage;
  verifySignature: typeof verifyAgentkitSignature;
  agentBook: AgentBookVerifier;
  now: () => number;
};

export class RankedAgentkitAuthorizer {
  private readonly config: RankedAgentkitConfig;
  private readonly store: RankedAuthorizationStore;
  private readonly verification: VerificationDependencies;

  constructor(
    config: RankedAgentkitConfig,
    store: RankedAuthorizationStore,
    dependencies: Partial<VerificationDependencies> = {},
  ) {
    this.config = config;
    this.store = store;
    this.verification = {
      parseHeader: dependencies.parseHeader ?? parseAgentkitHeader,
      validateMessage: dependencies.validateMessage ?? validateAgentkitMessage,
      verifySignature: dependencies.verifySignature ?? verifyAgentkitSignature,
      agentBook:
        dependencies.agentBook ??
        createAgentBookVerifier(
          config.worldRpcUrl === undefined ? {} : { rpcUrl: config.worldRpcUrl },
        ),
      now: dependencies.now ?? Date.now,
    };
  }

  async authorize(request: RankedAuthorizationRequest): Promise<RankedAuthorizationDecision> {
    if (request.levelId !== this.config.levelId) return deny('WRONG_LEVEL');
    if (request.resourceUri !== this.config.resourceUri) return deny('WRONG_RESOURCE');
    if (!isValidSuiAddress(request.recipient)) return deny('AUTHORIZATION_UNAVAILABLE');
    if (request.agentkitHeader === undefined || request.agentkitHeader.length === 0) {
      return deny('MISSING_AGENTKIT_HEADER');
    }

    let payload: AgentkitPayload;
    try {
      payload = this.verification.parseHeader(request.agentkitHeader);
    } catch {
      return deny('MALFORMED_AGENTKIT_HEADER');
    }

    if (payload.chainId !== this.config.network) return deny('MALFORMED_SIGNATURE');
    if (!exactlyBound(payload, this.config.resourceUri)) return deny('WRONG_RESOURCE');
    const nonceWasAvailable = await safely(() => this.store.isNonceAvailable(payload.nonce));
    if (nonceWasAvailable === undefined) return deny('AUTHORIZATION_UNAVAILABLE');
    if (!nonceWasAvailable) return deny('REPLAYED_NONCE');

    const validation = await safely(() =>
      this.verification.validateMessage(payload, this.config.resourceUri, {
        maxAge: this.config.maxAgeMs,
        checkNonce: (nonce) => this.store.isNonceAvailable(nonce),
      }),
    );
    if (validation === undefined) return deny('AUTHORIZATION_UNAVAILABLE');
    if (!validation.valid) {
      return deny(
        validation.error?.toLowerCase().includes('nonce') ? 'REPLAYED_NONCE' : 'STALE_MESSAGE',
      );
    }

    const signature = await safely(() =>
      this.verification.verifySignature(payload, this.config.signatureRpcUrl),
    );
    if (
      signature === undefined ||
      !signature.valid ||
      signature.address === undefined ||
      !isAddress(signature.address)
    ) {
      return deny('MALFORMED_SIGNATURE');
    }

    const humanId = await safely(() => this.verification.agentBook.lookupHuman(signature.address!));
    if (humanId === undefined) return deny('AUTHORIZATION_UNAVAILABLE');
    if (humanId === null || humanId.length === 0) return deny('UNREGISTERED_AGENT');

    const consumed = await safely(() =>
      this.store.consume({ nonce: payload.nonce, humanId, levelId: request.levelId }),
    );
    if (consumed === undefined) return deny('AUTHORIZATION_UNAVAILABLE');
    if (!consumed.consumed) {
      return deny(
        consumed.reason === 'nonce_replayed' ? 'REPLAYED_NONCE' : 'ENTITLEMENT_ALREADY_USED',
      );
    }

    const expiration =
      payload.expirationTime === undefined
        ? new Date(payload.issuedAt).getTime() + this.config.maxAgeMs
        : new Date(payload.expirationTime).getTime();
    return {
      authorized: true,
      permit: {
        schemaVersion: 1,
        levelId: request.levelId,
        recipient: normalizeSuiAddress(request.recipient),
        entitlementCommitment: consumed.entitlementCommitment,
        nonceCommitment: publicCommitment('alibi-agentkit-nonce-v1', payload.nonce),
        resourceCommitment: publicCommitment('alibi-agentkit-resource-v1', this.config.resourceUri),
        expiresAtMs: Math.min(expiration, this.verification.now() + this.config.maxAgeMs),
      },
    };
  }
}

function exactlyBound(payload: AgentkitPayload, expected: string): boolean {
  return (
    payload.uri === expected &&
    payload.resources?.length === 1 &&
    payload.resources[0] === expected &&
    payload.domain === new URL(expected).hostname
  );
}

async function safely<T>(operation: () => Promise<T>): Promise<T | undefined> {
  try {
    return await operation();
  } catch {
    return undefined;
  }
}
