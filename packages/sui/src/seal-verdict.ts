import { bcs, fromHex, toHex } from '@mysten/bcs';
import type { SealCompatibleClient } from '@mysten/seal';
import { DemType, EncryptedObject, SealClient, SessionKey } from '@mysten/seal';
import type { Transaction } from '@mysten/sui/transactions';
import { normalizeSuiAddress, normalizeSuiObjectId } from '@mysten/sui/utils';
import { canonicalFieldBytes, canonicalFieldFromBytes } from '@alibi/verdict-circuit';

export const SEAL_VERDICT_IDENTITY_VERSION = 1;
export const SEAL_VERDICT_IDENTITY_DOMAIN = 'the-last-alibi::seal::verdict-capsule::v1';
export const TESTNET_SEAL_FRAMEWORK_PACKAGE_ID =
  '0xdccbeb87767be2b2346af5575eb139807205e4c23ec53dc616f951fe1d814112';

export const TESTNET_VERIFIED_COMMITTEE_KEY_SERVER_OBJECT_ID =
  '0xb012378c9f3799fb5b1a7083da74a4069e3c3f1c93de0b27212a5799ce1e1e98';
export const TESTNET_VERIFIED_COMMITTEE_AGGREGATOR_URL =
  'https://seal-aggregator-testnet.mystenlabs.com';
export const TESTNET_VERIFIED_COMMITTEE_MEMBER_THRESHOLD = 3;
export const TESTNET_VERIFIED_COMMITTEE_MEMBER_COUNT = 5;

const SealVerdictIdentityBcs = bcs.struct('SealVerdictIdentityV1', {
  domain: bcs.string(),
  identity_version: bcs.u16(),
  session_id: bcs.bytes(32),
  attempt_nonce: bcs.u64(),
  protocol_version: bcs.u16(),
  level_version: bcs.u16(),
  accusation_commitment: bcs.bytes(32),
  verdict_commitment: bcs.bytes(32),
});

export interface SealVerdictIdentityInput {
  sessionId: string;
  attemptNonce: bigint;
  protocolVersion: number;
  levelVersion: number;
  accusationCommitment: string;
  verdictCommitment: string;
}

export interface SealKeyServerConfiguration {
  objectId: string;
  weight: number;
  aggregatorUrl?: string;
}

export interface SealVerdictConfiguration {
  policyPackageId: string;
  policyModule: string;
  approvalFunction: string;
  threshold: number;
  keyServers: readonly SealKeyServerConfiguration[];
}

export function testnetSealVerdictConfiguration(policyPackageId: string): SealVerdictConfiguration {
  const normalizedPolicyPackageId = normalizeSuiObjectId(policyPackageId);
  if (BigInt(normalizedPolicyPackageId) === 0n) {
    throw new Error('Seal policy package must be a deployed nonzero package ID');
  }
  return {
    policyPackageId: normalizedPolicyPackageId,
    policyModule: 'alibi',
    approvalFunction: 'seal_approve_verdict_capsule',
    // This one Seal service is itself the current official 3-of-5 Testnet MPC committee.
    threshold: 1,
    keyServers: [
      {
        objectId: TESTNET_VERIFIED_COMMITTEE_KEY_SERVER_OBJECT_ID,
        weight: 1,
        aggregatorUrl: TESTNET_VERIFIED_COMMITTEE_AGGREGATOR_URL,
      },
    ],
  };
}

function parseU16(value: number, field: string): number {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
    throw new Error(`${field} must be a canonical u16`);
  }
  return value;
}

function parseU64(value: bigint): bigint {
  if (value < 0n || value > 0xffff_ffff_ffff_ffffn) {
    throw new Error('attemptNonce must be a canonical u64');
  }
  return value;
}

export function encodeSealVerdictIdentity(input: SealVerdictIdentityInput): Uint8Array {
  return SealVerdictIdentityBcs.serialize({
    domain: SEAL_VERDICT_IDENTITY_DOMAIN,
    identity_version: SEAL_VERDICT_IDENTITY_VERSION,
    session_id: fromHex(normalizeSuiObjectId(input.sessionId)),
    attempt_nonce: parseU64(input.attemptNonce),
    protocol_version: parseU16(input.protocolVersion, 'protocolVersion'),
    level_version: parseU16(input.levelVersion, 'levelVersion'),
    accusation_commitment: canonicalFieldBytes(
      canonicalFieldFromBytes(fromHex(input.accusationCommitment), 'accusationCommitment'),
    ),
    verdict_commitment: canonicalFieldBytes(
      canonicalFieldFromBytes(fromHex(input.verdictCommitment), 'verdictCommitment'),
    ),
  }).toBytes();
}

export function sealVerdictIdentityHex(input: SealVerdictIdentityInput): string {
  return toHex(encodeSealVerdictIdentity(input));
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

export interface SealCiphertext {
  bytes: Uint8Array;
  identity: Uint8Array;
}

export class OfficialSealVerdictCrypto {
  readonly #client: SealClient;
  readonly #config: SealVerdictConfiguration;

  constructor(suiClient: SealCompatibleClient, config: SealVerdictConfiguration) {
    this.#config = config;
    this.#client = new SealClient({
      suiClient,
      serverConfigs: config.keyServers.map((server) => ({
        objectId: normalizeSuiObjectId(server.objectId),
        weight: server.weight,
        ...(server.aggregatorUrl === undefined ? {} : { aggregatorUrl: server.aggregatorUrl }),
      })),
      verifyKeyServers: false,
    });
  }

  async encrypt(plaintext: Uint8Array, identity: Uint8Array): Promise<SealCiphertext> {
    const result = await this.#client.encrypt({
      threshold: this.#config.threshold,
      packageId: normalizeSuiObjectId(this.#config.policyPackageId),
      id: toHex(identity),
      data: plaintext,
      aad: identity,
      demType: DemType.AesGcm256,
    });
    result.key.fill(0);
    this.assertCiphertext(result.encryptedObject, identity);
    return { bytes: result.encryptedObject, identity: identity.slice() };
  }

  assertCiphertext(ciphertext: Uint8Array, identity: Uint8Array): void {
    const parsed = EncryptedObject.parse(ciphertext);
    if (
      parsed.version !== 0 ||
      normalizeSuiObjectId(parsed.packageId) !== normalizeSuiObjectId(this.#config.policyPackageId)
    ) {
      throw new Error('Seal ciphertext policy package does not match configured policy');
    }
    const aesCiphertext = parsed.ciphertext.Aes256Gcm;
    if (
      parsed.id !== toHex(identity) ||
      aesCiphertext === null ||
      aesCiphertext === undefined ||
      aesCiphertext.aad === null ||
      !equalBytes(aesCiphertext.aad, identity)
    ) {
      throw new Error('Seal ciphertext identity or authenticated data does not match');
    }
    if (parsed.threshold !== this.#config.threshold) {
      throw new Error('Seal ciphertext threshold does not match configured threshold');
    }
    const expectedServers = this.#config.keyServers.map(
      (server) => [normalizeSuiObjectId(server.objectId), server.weight] as const,
    );
    const actualServers = parsed.services.map(
      ([objectId, weight]) => [normalizeSuiObjectId(objectId), weight] as const,
    );
    if (
      actualServers.length !== expectedServers.length ||
      actualServers.some(
        ([objectId, weight], index) =>
          objectId !== expectedServers[index]?.[0] || weight !== expectedServers[index]?.[1],
      )
    ) {
      throw new Error('Seal ciphertext key-server committee does not match configured committee');
    }
  }

  async decrypt(
    ciphertext: Uint8Array,
    identity: Uint8Array,
    sessionKey: ActivatedSealSession,
    transactionBytes: Uint8Array,
  ): Promise<Uint8Array> {
    sessionKey.assertUsable(this.#config.policyPackageId);
    this.assertCiphertext(ciphertext, identity);
    return this.#client.decrypt({
      data: ciphertext,
      sessionKey: sessionKey.sessionKey,
      txBytes: transactionBytes,
      checkShareConsistency: true,
    });
  }
}

export interface PersonalMessageSigner {
  toSuiAddress(): string;
  signPersonalMessage(bytes: Uint8Array): Promise<{ signature: string }>;
}

export class ActivatedSealSession {
  readonly sessionKey: SessionKey;
  readonly #account: string;
  readonly #currentAccount: () => string | null;

  private constructor(
    sessionKey: SessionKey,
    account: string,
    currentAccount: () => string | null,
  ) {
    this.sessionKey = sessionKey;
    this.#account = account;
    this.#currentAccount = currentAccount;
  }

  static async create(input: {
    suiClient: SealCompatibleClient;
    signer: PersonalMessageSigner;
    policyPackageId: string;
    ttlMinutes: number;
    currentAccount: () => string | null;
  }): Promise<ActivatedSealSession> {
    if (!Number.isInteger(input.ttlMinutes) || input.ttlMinutes < 1 || input.ttlMinutes > 10) {
      throw new Error('Seal session TTL must be an integer from 1 to 10 minutes');
    }
    const account = normalizeSuiAddress(input.signer.toSuiAddress());
    const current = input.currentAccount();
    if (current === null || normalizeSuiAddress(current) !== account) {
      throw new Error('active wallet account does not match the Seal session signer');
    }
    const sessionKey = await SessionKey.create({
      address: account,
      packageId: normalizeSuiObjectId(input.policyPackageId),
      ttlMin: input.ttlMinutes,
      suiClient: input.suiClient,
    });
    const { signature } = await input.signer.signPersonalMessage(sessionKey.getPersonalMessage());
    if (
      input.currentAccount() === null ||
      normalizeSuiAddress(input.currentAccount()!) !== account
    ) {
      throw new Error('wallet account changed while activating the Seal session');
    }
    await sessionKey.setPersonalMessageSignature(signature);
    return new ActivatedSealSession(sessionKey, account, input.currentAccount);
  }

  assertUsable(policyPackageId: string): void {
    const current = this.#currentAccount();
    if (current === null || normalizeSuiAddress(current) !== this.#account) {
      throw new Error('wallet account changed; the Seal session is invalid');
    }
    if (this.sessionKey.isExpired()) {
      throw new Error('Seal session has expired');
    }
    if (
      normalizeSuiObjectId(this.sessionKey.getPackageId()) !== normalizeSuiObjectId(policyPackageId)
    ) {
      throw new Error('Seal session is bound to a different policy package');
    }
  }
}

export interface SealApprovalBuilder {
  build(input: { sessionId: string; identity: Uint8Array }): Promise<Uint8Array>;
}

export class SuiSealApprovalBuilder implements SealApprovalBuilder {
  readonly #client: SealCompatibleClient;
  readonly #config: SealVerdictConfiguration;
  readonly #transactionFactory: () => Transaction;

  constructor(input: {
    client: SealCompatibleClient;
    config: SealVerdictConfiguration;
    transactionFactory: () => Transaction;
  }) {
    this.#client = input.client;
    this.#config = input.config;
    this.#transactionFactory = input.transactionFactory;
  }

  async build(input: { sessionId: string; identity: Uint8Array }): Promise<Uint8Array> {
    const transaction = this.#transactionFactory();
    transaction.moveCall({
      target: `${normalizeSuiObjectId(this.#config.policyPackageId)}::${this.#config.policyModule}::${this.#config.approvalFunction}`,
      arguments: [
        transaction.pure.vector('u8', [...input.identity]),
        transaction.object(input.sessionId),
      ],
    });
    return transaction.build({ client: this.#client, onlyTransactionKind: true });
  }
}
