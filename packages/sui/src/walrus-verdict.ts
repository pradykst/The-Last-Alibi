import type { WalrusClient, WriteBlobStep, WriteBlobStepCertified } from '@mysten/walrus';

import type { OfficialSealVerdictCrypto } from './seal-verdict.js';
import { encodeSealVerdictIdentity } from './seal-verdict.js';
import type { VerdictCapsuleInput } from './verdict-capsule.js';
import { encodeVerdictCapsule } from './verdict-capsule.js';
import { WalrusContentBlobId } from './walrus-blob-id.js';

export interface WalrusVerdictReceipt {
  contentBlobId: WalrusContentBlobId;
  suiBlobObjectId: string;
  endEpoch: number;
  ciphertext: Uint8Array;
}

export interface WalrusVerdictStore {
  computeContentBlobId(bytes: Uint8Array): Promise<WalrusContentBlobId>;
  storeExact(bytes: Uint8Array): Promise<WalrusVerdictReceipt>;
  readExact(blobId: WalrusContentBlobId): Promise<Uint8Array>;
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

export class OfficialWalrusVerdictStore implements WalrusVerdictStore {
  readonly #client: WalrusClient;
  readonly #epochs: number;
  readonly #signer: Parameters<WalrusClient['writeBlob']>[0]['signer'];
  readonly #onCheckpoint: ((progress: WriteBlobStep) => void) | undefined;
  #resume: WriteBlobStep | undefined;

  constructor(input: {
    client: WalrusClient;
    signer: Parameters<WalrusClient['writeBlob']>[0]['signer'];
    epochs: number;
    resume?: WriteBlobStep;
    onCheckpoint?: (progress: WriteBlobStep) => void;
  }) {
    if (!Number.isInteger(input.epochs) || input.epochs < 1) {
      throw new Error('Walrus storage epochs must be a positive integer');
    }
    this.#client = input.client;
    this.#signer = input.signer;
    this.#epochs = input.epochs;
    this.#resume = input.resume;
    this.#onCheckpoint = input.onCheckpoint;
  }

  async computeContentBlobId(bytes: Uint8Array): Promise<WalrusContentBlobId> {
    const metadata = await this.#client.computeBlobMetadata({ bytes });
    return WalrusContentBlobId.fromBase64Url(metadata.blobId);
  }

  async storeExact(bytes: Uint8Array): Promise<WalrusVerdictReceipt> {
    const immutableCiphertext = bytes.slice();
    const localId = await this.computeContentBlobId(immutableCiphertext);
    const options: Parameters<WalrusClient['writeBlob']>[0] = {
      blob: immutableCiphertext,
      deletable: false,
      epochs: this.#epochs,
      signer: this.#signer,
      ...(this.#resume === undefined ? {} : { resume: this.#resume }),
      onStep: (progress: WriteBlobStep) => {
        this.#resume = progress;
        this.#onCheckpoint?.(progress);
      },
    };
    const stored = await this.#client.writeBlob(options);
    const returnedId = WalrusContentBlobId.fromBase64Url(stored.blobId);
    if (!returnedId.equals(localId)) {
      throw new Error('Walrus publisher returned a different content Blob ID');
    }
    const recordedContentId = WalrusContentBlobId.fromAuthoritativeMoveU256(
      BigInt(stored.blobObject.blob_id),
    );
    if (!recordedContentId.equals(localId)) {
      throw new Error('Walrus Blob object records a different content Blob ID');
    }
    if (stored.blobObject.certified_epoch === null) {
      throw new Error('Walrus did not certify the encrypted verdict capsule');
    }
    const retrieved = await this.readExact(localId);
    if (!equalBytes(retrieved, immutableCiphertext)) {
      throw new Error('Walrus read-back bytes differ from the encrypted capsule');
    }
    return {
      contentBlobId: localId,
      suiBlobObjectId: stored.blobObject.id,
      endEpoch: stored.blobObject.storage.end_epoch,
      ciphertext: immutableCiphertext,
    };
  }

  async readExact(blobId: WalrusContentBlobId): Promise<Uint8Array> {
    const bytes = await this.#client.readBlob({ blobId: blobId.toString() });
    const recomputed = await this.computeContentBlobId(bytes);
    if (!recomputed.equals(blobId)) {
      throw new Error('retrieved Walrus bytes do not match the requested content Blob ID');
    }
    return bytes;
  }
}

export interface PreparedTerminalVerdictCapsule {
  ciphertext: Uint8Array;
  identity: Uint8Array;
  contentBlobId: WalrusContentBlobId;
}

export async function prepareTerminalVerdictCapsule(input: {
  capsule: VerdictCapsuleInput;
  seal: Pick<OfficialSealVerdictCrypto, 'encrypt'>;
  walrus: Pick<WalrusVerdictStore, 'computeContentBlobId'>;
}): Promise<PreparedTerminalVerdictCapsule> {
  let encrypted: Awaited<ReturnType<typeof input.seal.encrypt>>;
  const identity = encodeSealVerdictIdentity({
    sessionId: input.capsule.sessionId,
    attemptNonce: input.capsule.attemptNonce,
    protocolVersion: input.capsule.protocolVersion,
    levelVersion: input.capsule.levelVersion,
    accusationCommitment: input.capsule.accusationCommitment,
    verdictCommitment: input.capsule.verdictCommitment,
  });
  const plaintext = encodeVerdictCapsule(input.capsule);
  try {
    encrypted = await input.seal.encrypt(plaintext, identity);
  } finally {
    plaintext.fill(0);
  }
  if (!equalBytes(encrypted.identity, identity)) {
    throw new Error('Seal encryptor returned a different identity');
  }
  const ciphertext = encrypted.bytes.slice();
  return {
    ciphertext,
    identity,
    contentBlobId: await input.walrus.computeContentBlobId(ciphertext),
  };
}

export async function storePreparedTerminalVerdictCapsule(input: {
  prepared: PreparedTerminalVerdictCapsule;
  walrus: Pick<WalrusVerdictStore, 'storeExact'>;
}): Promise<WalrusVerdictReceipt> {
  const stored = await input.walrus.storeExact(input.prepared.ciphertext);
  if (!stored.contentBlobId.equals(input.prepared.contentBlobId)) {
    throw new Error('stored ciphertext has a different content Blob ID than the prepared attempt');
  }
  if (!equalBytes(stored.ciphertext, input.prepared.ciphertext)) {
    throw new Error('Walrus storage changed the prepared ciphertext');
  }
  return stored;
}

export type CertifiedWalrusBlobObject = WriteBlobStepCertified['blobObject'];
