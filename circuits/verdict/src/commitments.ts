import { blake2b } from '@noble/hashes/blake2.js';
import { buildPoseidon } from 'circomlibjs';

export const BN254_SCALAR_MODULUS =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;
export const U128_LIMIT = 1n << 128n;
export const COMMITMENT_BYTE_LENGTH = 32;
export const PUBLIC_INPUT_FIELD_COUNT = 8;
export const PUBLIC_INPUT_BYTE_LENGTH = PUBLIC_INPUT_FIELD_COUNT * COMMITMENT_BYTE_LENGTH;

export const PROTOCOL_VERSION = 1n;
export const LEVEL_VERSION = 1n;
export const CASE_DOMAIN = 59645246114738790757125204n;
export const ACCUSATION_DOMAIN = 16788644443274716470833820098044729838676n;
export const VERDICT_DOMAIN = 1000681195498610548960066585840724n;
export const SESSION_ATTEMPT_DOMAIN = new TextEncoder().encode(
  'the-last-alibi::verdict::session-attempt::v1',
);

export interface CaseOpening {
  suspect: bigint;
  room: bigint;
  weapon: bigint;
  time: bigint;
  salt: Uint8Array;
}

export interface PublicCommitments {
  caseCommitment: Uint8Array;
  accusationCommitment: Uint8Array;
  sessionAttemptDomainCommitment: Uint8Array;
  verdictCommitment: Uint8Array;
}

export interface PublicInputEncoding {
  fields: readonly bigint[];
  bytes: Uint8Array;
}

function assertByteLength(value: Uint8Array, expected: number, label: string): void {
  if (value.length !== expected) {
    throw new RangeError(
      `${label} must contain exactly ${expected} bytes; received ${value.length}`,
    );
  }
}

function assertRange(value: bigint, minimum: bigint, maximum: bigint, label: string): void {
  if (value < minimum || value > maximum) {
    throw new RangeError(`${label} is outside [${minimum}, ${maximum}]`);
  }
}

export function littleEndianBytesToBigInt(bytes: Uint8Array): bigint {
  let result = 0n;
  for (let index = bytes.length - 1; index >= 0; index -= 1) {
    result = (result << 8n) | BigInt(bytes[index] ?? 0);
  }
  return result;
}

export function bigIntToLittleEndianBytes(
  value: bigint,
  length: number,
  label = 'value',
): Uint8Array {
  if (value < 0n || value >= 1n << (8n * BigInt(length))) {
    throw new RangeError(`${label} does not fit in ${length} little-endian bytes`);
  }
  const result = new Uint8Array(length);
  let remaining = value;
  for (let index = 0; index < length; index += 1) {
    result[index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  return result;
}

export function canonicalFieldBytes(value: bigint): Uint8Array {
  assertRange(value, 0n, BN254_SCALAR_MODULUS - 1n, 'BN254 scalar');
  return bigIntToLittleEndianBytes(value, COMMITMENT_BYTE_LENGTH, 'BN254 scalar');
}

export function canonicalFieldFromBytes(bytes: Uint8Array, label = 'commitment'): bigint {
  assertByteLength(bytes, COMMITMENT_BYTE_LENGTH, label);
  const value = littleEndianBytesToBigInt(bytes);
  if (value >= BN254_SCALAR_MODULUS) {
    throw new RangeError(`${label} is not a canonical BN254 scalar encoding`);
  }
  return value;
}

export function commitmentToLimbs(commitment: Uint8Array): readonly [bigint, bigint] {
  assertByteLength(commitment, COMMITMENT_BYTE_LENGTH, 'commitment');
  return [
    littleEndianBytesToBigInt(commitment.subarray(0, 16)),
    littleEndianBytesToBigInt(commitment.subarray(16, 32)),
  ];
}

export function limbsToCommitment(low: bigint, high: bigint): Uint8Array {
  assertRange(low, 0n, U128_LIMIT - 1n, 'low limb');
  assertRange(high, 0n, U128_LIMIT - 1n, 'high limb');
  const commitment = new Uint8Array(COMMITMENT_BYTE_LENGTH);
  commitment.set(bigIntToLittleEndianBytes(low, 16, 'low limb'), 0);
  commitment.set(bigIntToLittleEndianBytes(high, 16, 'high limb'), 16);
  return commitment;
}

function limbScalarBytes(limb: bigint): Uint8Array {
  assertRange(limb, 0n, U128_LIMIT - 1n, 'public-input limb');
  return bigIntToLittleEndianBytes(limb, COMMITMENT_BYTE_LENGTH, 'public-input limb');
}

export function encodePublicInputs(commitments: PublicCommitments): PublicInputEncoding {
  canonicalFieldFromBytes(commitments.caseCommitment, 'case commitment');
  canonicalFieldFromBytes(commitments.accusationCommitment, 'accusation commitment');
  assertByteLength(
    commitments.sessionAttemptDomainCommitment,
    COMMITMENT_BYTE_LENGTH,
    'session-attempt domain commitment',
  );
  canonicalFieldFromBytes(commitments.verdictCommitment, 'verdict commitment');

  const orderedCommitments = [
    commitments.caseCommitment,
    commitments.accusationCommitment,
    commitments.sessionAttemptDomainCommitment,
    commitments.verdictCommitment,
  ] as const;
  const fields = orderedCommitments.flatMap((commitment) => [...commitmentToLimbs(commitment)]);
  const bytes = new Uint8Array(PUBLIC_INPUT_BYTE_LENGTH);
  fields.forEach((field, index) => {
    bytes.set(limbScalarBytes(field), index * COMMITMENT_BYTE_LENGTH);
  });
  return { fields, bytes };
}

export function decodePublicInputBytes(bytes: Uint8Array): readonly bigint[] {
  assertByteLength(bytes, PUBLIC_INPUT_BYTE_LENGTH, 'public proof inputs');
  const fields: bigint[] = [];
  for (let index = 0; index < PUBLIC_INPUT_FIELD_COUNT; index += 1) {
    const scalar = bytes.subarray(index * 32, (index + 1) * 32);
    for (let highIndex = 16; highIndex < 32; highIndex += 1) {
      if (scalar[highIndex] !== 0) {
        throw new RangeError(`public-input field ${index} exceeds 128 bits`);
      }
    }
    fields.push(littleEndianBytesToBigInt(scalar.subarray(0, 16)));
  }
  return fields;
}

async function poseidonCommitment(inputs: readonly bigint[]): Promise<Uint8Array> {
  const poseidon = await buildPoseidon();
  const result = poseidon.F.toObject(poseidon(inputs));
  return canonicalFieldBytes(result);
}

function validateOpening(opening: CaseOpening, label: string): bigint {
  assertRange(opening.suspect, 0n, 3n, `${label} suspect`);
  assertRange(opening.room, 0n, 3n, `${label} room`);
  assertRange(opening.weapon, 0n, 1n, `${label} weapon`);
  assertRange(opening.time, 0n, 1n, `${label} time`);
  return canonicalFieldFromBytes(opening.salt, `${label} salt`);
}

export async function caseCommitment(opening: CaseOpening): Promise<Uint8Array> {
  const salt = validateOpening(opening, 'case');
  return poseidonCommitment([
    CASE_DOMAIN,
    PROTOCOL_VERSION,
    LEVEL_VERSION,
    opening.suspect,
    opening.room,
    opening.weapon,
    opening.time,
    salt,
  ]);
}

export async function accusationCommitment(opening: CaseOpening): Promise<Uint8Array> {
  const salt = validateOpening(opening, 'accusation');
  return poseidonCommitment([
    ACCUSATION_DOMAIN,
    PROTOCOL_VERSION,
    LEVEL_VERSION,
    opening.suspect,
    opening.room,
    opening.weapon,
    opening.time,
    salt,
  ]);
}

export async function verdictCommitment(
  verdict: bigint,
  saltBytes: Uint8Array,
): Promise<Uint8Array> {
  assertRange(verdict, 0n, 1n, 'verdict');
  const salt = canonicalFieldFromBytes(saltBytes, 'verdict salt');
  return poseidonCommitment([VERDICT_DOMAIN, PROTOCOL_VERSION, LEVEL_VERSION, verdict, salt]);
}

function encodeU64(value: bigint): Uint8Array {
  assertRange(value, 0n, (1n << 64n) - 1n, 'attempt nonce');
  return bigIntToLittleEndianBytes(value, 8, 'attempt nonce');
}

export function sessionAttemptDomainCommitment(
  sessionId: Uint8Array,
  attemptNonce: bigint,
  verdictBlobId: Uint8Array,
): Uint8Array {
  assertByteLength(sessionId, 32, 'session ID');
  assertByteLength(verdictBlobId, 32, 'Walrus content blob ID');
  const preimage = new Uint8Array(120);
  preimage.set(SESSION_ATTEMPT_DOMAIN, 0);
  preimage.set(sessionId, 44);
  preimage.set(encodeU64(attemptNonce), 76);
  preimage.set([1, 0, 1, 0], 84);
  preimage.set(verdictBlobId, 88);
  return blake2b(preimage, { dkLen: 32 });
}
