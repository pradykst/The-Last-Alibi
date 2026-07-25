import { sanitizedError } from './errors';

export const U64_MAX = (1n << 64n) - 1n;

export function parseU64(value: bigint | string): bigint {
  if (typeof value === 'number') {
    throw sanitizedError('INVALID_INPUT', 'JavaScript numbers are not accepted for u64 values.');
  }
  if (typeof value === 'string' && !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw sanitizedError('INVALID_INPUT', 'The u64 value is not canonically encoded.');
  }
  let parsed: bigint;
  try {
    parsed = typeof value === 'bigint' ? value : BigInt(value);
  } catch {
    throw sanitizedError('INVALID_INPUT', 'The u64 value is invalid.');
  }
  if (parsed < 0n || parsed > U64_MAX) {
    throw sanitizedError('INVALID_INPUT', 'The u64 value is outside the supported range.');
  }
  return parsed;
}

export function u64ToHex(value: bigint | string): string {
  return `0x${parseU64(value).toString(16).padStart(16, '0')}`;
}

export function popcountU64(value: bigint | string): number {
  let mask = parseU64(value);
  let count = 0;
  while (mask !== 0n) {
    mask &= mask - 1n;
    count += 1;
  }
  return count;
}
