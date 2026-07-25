import { bcs, fromHex, toHex } from '@mysten/bcs';
import {
  BN254_SCALAR_MODULUS,
  canonicalFieldBytes,
  canonicalFieldFromBytes,
  verdictCommitment,
} from '@alibi/verdict-circuit';
import { normalizeSuiObjectId } from '@mysten/sui/utils';

export const VERDICT_CAPSULE_FORMAT_VERSION = 1;
export const VERDICT_CAPSULE_BYTE_LENGTH = 143;

const VerdictCapsuleBcs = bcs.struct('VerdictCapsuleV1', {
  format_version: bcs.u16(),
  protocol_version: bcs.u16(),
  level_version: bcs.u16(),
  session_id: bcs.bytes(32),
  attempt_nonce: bcs.u64(),
  accusation_commitment: bcs.bytes(32),
  verdict: bcs.u8(),
  verdict_salt: bcs.bytes(32),
  verdict_commitment: bcs.bytes(32),
});

export interface VerdictCapsuleInput {
  protocolVersion: number;
  levelVersion: number;
  sessionId: string;
  attemptNonce: bigint;
  accusationCommitment: string;
  verdict: 0 | 1;
  verdictSalt: string;
  verdictCommitment: string;
}

export interface DecodedVerdictCapsule extends VerdictCapsuleInput {
  formatVersion: typeof VERDICT_CAPSULE_FORMAT_VERSION;
}

function parseU16(value: number, field: string): number {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
    throw new Error(`${field} must be a canonical u16`);
  }
  return value;
}

function parseU64(value: bigint | string, field: string): bigint {
  const parsed = typeof value === 'bigint' ? value : BigInt(value);
  if (parsed < 0n || parsed > 0xffff_ffff_ffff_ffffn) {
    throw new Error(`${field} must be a canonical u64`);
  }
  return parsed;
}

function canonicalCommitmentBytes(value: string, field: string): Uint8Array {
  const input = fromHex(value);
  const integer = canonicalFieldFromBytes(input, field);
  if (integer >= BN254_SCALAR_MODULUS) {
    throw new Error(`${field} is not a canonical BN254 scalar`);
  }
  return canonicalFieldBytes(integer);
}

function sessionIdBytes(sessionId: string): Uint8Array {
  const bytes = fromHex(normalizeSuiObjectId(sessionId));
  if (bytes.length !== 32) {
    throw new Error('sessionId must be a canonical 32-byte Sui object ID');
  }
  return bytes;
}

function canonicalHex(bytes: Uint8Array): string {
  return `0x${toHex(bytes)}`;
}

export function encodeVerdictCapsule(input: VerdictCapsuleInput): Uint8Array {
  if (input.verdict !== 0 && input.verdict !== 1) {
    throw new Error('verdict must be exactly 0 or 1');
  }

  const bytes = VerdictCapsuleBcs.serialize({
    format_version: VERDICT_CAPSULE_FORMAT_VERSION,
    protocol_version: parseU16(input.protocolVersion, 'protocolVersion'),
    level_version: parseU16(input.levelVersion, 'levelVersion'),
    session_id: sessionIdBytes(input.sessionId),
    attempt_nonce: parseU64(input.attemptNonce, 'attemptNonce'),
    accusation_commitment: canonicalCommitmentBytes(
      input.accusationCommitment,
      'accusationCommitment',
    ),
    verdict: input.verdict,
    verdict_salt: canonicalCommitmentBytes(input.verdictSalt, 'verdictSalt'),
    verdict_commitment: canonicalCommitmentBytes(input.verdictCommitment, 'verdictCommitment'),
  }).toBytes();

  if (bytes.length !== VERDICT_CAPSULE_BYTE_LENGTH) {
    throw new Error(`unexpected verdict capsule length ${bytes.length}`);
  }
  return bytes;
}

export function decodeVerdictCapsule(bytes: Uint8Array): DecodedVerdictCapsule {
  if (bytes.length !== VERDICT_CAPSULE_BYTE_LENGTH) {
    throw new Error(`verdict capsule must be exactly ${VERDICT_CAPSULE_BYTE_LENGTH} bytes`);
  }

  const decoded = VerdictCapsuleBcs.parse(bytes);
  if (decoded.format_version !== VERDICT_CAPSULE_FORMAT_VERSION) {
    throw new Error(`unsupported verdict capsule version ${decoded.format_version}`);
  }
  if (decoded.verdict !== 0 && decoded.verdict !== 1) {
    throw new Error('verdict capsule has a non-canonical verdict value');
  }

  const capsule: DecodedVerdictCapsule = {
    formatVersion: VERDICT_CAPSULE_FORMAT_VERSION,
    protocolVersion: parseU16(decoded.protocol_version, 'protocolVersion'),
    levelVersion: parseU16(decoded.level_version, 'levelVersion'),
    sessionId: normalizeSuiObjectId(toHex(decoded.session_id)),
    attemptNonce: parseU64(decoded.attempt_nonce, 'attemptNonce'),
    accusationCommitment: canonicalHex(
      canonicalCommitmentBytes(toHex(decoded.accusation_commitment), 'accusationCommitment'),
    ),
    verdict: decoded.verdict,
    verdictSalt: canonicalHex(canonicalCommitmentBytes(toHex(decoded.verdict_salt), 'verdictSalt')),
    verdictCommitment: canonicalHex(
      canonicalCommitmentBytes(toHex(decoded.verdict_commitment), 'verdictCommitment'),
    ),
  };

  const canonical = encodeVerdictCapsule(capsule);
  if (!bytes.every((byte, index) => byte === canonical[index])) {
    throw new Error('verdict capsule is not canonically encoded');
  }
  return capsule;
}

export async function validateVerdictCapsuleOpening(capsule: DecodedVerdictCapsule): Promise<void> {
  const expected = await verdictCommitment(
    BigInt(capsule.verdict),
    canonicalCommitmentBytes(capsule.verdictSalt, 'verdictSalt'),
  );
  if (`0x${toHex(expected)}` !== capsule.verdictCommitment) {
    throw new Error('verdict capsule commitment opening does not match terminal state');
  }
}
