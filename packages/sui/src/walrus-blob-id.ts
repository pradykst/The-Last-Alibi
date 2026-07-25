import { fromBase64, toBase64 } from '@mysten/sui/utils';

import { sanitizedError } from './errors';

const WALRUS_BLOB_ID_LENGTH = 32;
const CANONICAL_BASE64URL_LENGTH = 43;
const canonicalBase64Url = /^[A-Za-z0-9_-]{43}$/u;

function bytesToBigEndianU256(bytes: Uint8Array): bigint {
  let value = 0n;
  for (let index = 0; index < bytes.length; index += 1) {
    value = (value << 8n) | BigInt(bytes[index] ?? 0);
  }
  return value;
}

function encodeBase64Url(bytes: Uint8Array): string {
  return toBase64(bytes).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function invalidBlobId(): never {
  throw sanitizedError(
    'INVALID_INPUT',
    'Expected a canonical nonzero Walrus content blob ID, not a Sui object ID.',
  );
}

/**
 * A canonical Walrus content-derived blob ID. This is deliberately distinct
 * from the Sui Blob metadata object ID and cannot be constructed from a u256.
 */
export class WalrusContentBlobId {
  readonly #base64Url: string;
  readonly #bytes: Uint8Array;
  readonly #moveU256: bigint;

  private constructor(base64Url: string, bytes: Uint8Array, moveU256: bigint) {
    this.#base64Url = base64Url;
    this.#bytes = bytes;
    this.#moveU256 = moveU256;
  }

  static fromBase64Url(value: string): WalrusContentBlobId {
    if (
      typeof value !== 'string' ||
      value.length !== CANONICAL_BASE64URL_LENGTH ||
      !canonicalBase64Url.test(value)
    ) {
      return invalidBlobId();
    }
    let bytes: Uint8Array;
    try {
      const standardBase64 = `${value.replaceAll('-', '+').replaceAll('_', '/')}=`;
      bytes = fromBase64(standardBase64);
    } catch {
      return invalidBlobId();
    }
    if (
      bytes.length !== WALRUS_BLOB_ID_LENGTH ||
      encodeBase64Url(bytes) !== value ||
      bytes.every((byte) => byte === 0)
    ) {
      return invalidBlobId();
    }
    return new WalrusContentBlobId(value, bytes.slice(), bytesToBigEndianU256(bytes));
  }

  toBase64Url(): string {
    return this.#base64Url;
  }

  toBytes(): Uint8Array {
    return this.#bytes.slice();
  }

  toMoveU256(): bigint {
    return this.#moveU256;
  }
}

export function walrusContentBlobIdFromBase64Url(value: string): WalrusContentBlobId {
  return WalrusContentBlobId.fromBase64Url(value);
}
