import { randomBytes, randomInt } from 'node:crypto';

export type FixtureRandomSource = {
  bytes(length: number): Uint8Array;
  integer(maximumExclusive: number): number;
};

export const CRYPTO_RANDOM_SOURCE: FixtureRandomSource = {
  bytes(length) {
    return randomBytes(length);
  },
  integer(maximumExclusive) {
    return randomInt(maximumExclusive);
  },
};

export function bytesToHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex');
}
