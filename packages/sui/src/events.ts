import {
  isValidSuiAddress,
  isValidSuiObjectId,
  normalizeStructTag,
  normalizeSuiAddress,
  normalizeSuiObjectId,
} from '@mysten/sui/utils';
import { z } from 'zod';

import { ALIBI_MOVE_MODULE, VERIFIER_VERIFIED_STATUS } from './constants';
import { sanitizedError } from './errors';
import { parseU256, parseU64, popcountU64, u256ToHex, u64ToHex } from './masks';

export type MoveEventEnvelope = { type: string; parsedJson: unknown };

const integer = z.union([z.number().int().nonnegative(), z.string().regex(/^(0|[1-9][0-9]*)$/)]);
const u64 = z.string().regex(/^(0|[1-9][0-9]*)$/);
const objectId = z.string().refine(isValidSuiObjectId);
const address = z.string().refine(isValidSuiAddress);
const bytes = z.array(z.number().int().min(0).max(255));
const commitment = bytes.length(32);

const schemas = {
  LevelCreated: z
    .object({
      level: objectId,
      schema_version: integer,
      level_version: integer,
      case_count: integer,
      predicate_count: integer,
      disclosure_limit: integer,
      minimum_survivors: integer,
      verifier_state: integer,
      verdict_verifier_state: integer,
    })
    .strict(),
  SessionCreated: z
    .object({
      session: objectId,
      level: objectId,
      player: address,
      mode: integer,
      candidate_mask: u64,
      candidate_count: integer,
      disclosure_count: integer,
      query_nonce: u64,
      attempt_nonce: u64,
      protocol_version: integer,
      level_version: integer,
    })
    .strict(),
  AccusationStarted: z
    .object({
      session: objectId,
      level: objectId,
      attempt_nonce: u64,
      accusation_commitment: commitment,
      expected_verdict_blob_id: z.string().regex(/^(0|[1-9][0-9]*)$/),
      session_attempt_domain_commitment: commitment,
      started_at_ms: u64,
    })
    .strict(),
  VerdictFinalized: z
    .object({
      session: objectId,
      level: objectId,
      attempt_nonce: u64,
      accusation_commitment: commitment,
      session_attempt_domain_commitment: commitment,
      verdict_commitment: commitment,
      encrypted_verdict_blob_id: z.string().regex(/^(0|[1-9][0-9]*)$/),
      verifier_identity: commitment,
      verifier_status: integer,
      finalized_at_ms: u64,
    })
    .strict(),
  QueryAuthorized: z
    .object({
      session: objectId,
      level: objectId,
      predicate_id: integer,
      query_nonce: u64,
      pre_candidate_mask: u64,
      yes_branch: u64,
      no_branch: u64,
      expires_at_ms: u64,
    })
    .strict(),
  QueryExpired: z
    .object({
      session: objectId,
      level: objectId,
      predicate_id: integer,
      query_nonce: u64,
      candidate_mask: u64,
      disclosure_count: integer,
      next_query_nonce: u64,
    })
    .strict(),
  QueryResolved: z
    .object({
      session: objectId,
      level: objectId,
      predicate_id: integer,
      query_nonce: u64,
      result: z.boolean(),
      pre_candidate_mask: u64,
      post_candidate_mask: u64,
      candidate_count: integer,
      disclosure_count: integer,
      next_query_nonce: u64,
    })
    .strict(),
} as const;

export type PublicAlibiEvent = {
  kind: keyof typeof schemas;
  data: Readonly<Record<string, boolean | number | string>>;
};

function bytesToHex(value: readonly number[]): string {
  if (value.length !== 32 || value.every((byte) => byte === 0))
    throw sanitizedError('MALFORMED_EVENT', 'An Alibi event commitment is malformed.');
  return `0x${value.map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

function numberValue(value: number | string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed))
    throw sanitizedError('MALFORMED_EVENT', 'An Alibi event integer is malformed.');
  return parsed;
}

function eventKind(type: string, packageId: string): keyof typeof schemas | null {
  for (const kind of Object.keys(schemas) as (keyof typeof schemas)[]) {
    try {
      if (
        normalizeStructTag(type) ===
        normalizeStructTag(`${packageId}::${ALIBI_MOVE_MODULE}::${kind}`)
      )
        return kind;
    } catch {
      return null;
    }
  }
  return null;
}

export function decodeAlibiEvent(envelope: MoveEventEnvelope, packageId: string): PublicAlibiEvent {
  if (!isValidSuiObjectId(packageId))
    throw sanitizedError('MALFORMED_EVENT', 'The configured package ID is invalid.');
  const kind = eventKind(envelope.type, packageId);
  if (kind === null)
    throw sanitizedError(
      'MALFORMED_EVENT',
      'The event is not a known event from the configured Alibi package.',
    );
  const result = schemas[kind].safeParse(envelope.parsedJson);
  if (!result.success)
    throw sanitizedError('MALFORMED_EVENT', 'The Alibi event payload is malformed.');
  if (
    kind === 'VerdictFinalized' &&
    'verifier_status' in result.data &&
    numberValue(result.data.verifier_status) !== VERIFIER_VERIFIED_STATUS
  )
    throw sanitizedError('MALFORMED_EVENT', 'The verdict event is not verified.');
  const data: Record<string, boolean | number | string> = {};
  for (const [key, value] of Object.entries(result.data)) {
    if (key === 'session' || key === 'level') data[key] = normalizeSuiObjectId(value as string);
    else if (key === 'player') data[key] = normalizeSuiAddress(value as string);
    else if (key.includes('commitment') || key === 'verifier_identity')
      data[key] = bytesToHex(value as number[]);
    else if (key.endsWith('verdict_blob_id')) {
      const blobId = parseU256(value as string);
      if (blobId === 0n)
        throw sanitizedError('MALFORMED_EVENT', 'The Walrus verdict reference is malformed.');
      data[key] = u256ToHex(blobId);
    } else if (key.includes('mask') || key.endsWith('branch'))
      data[key] = u64ToHex(value as string);
    else if (key.endsWith('nonce') || key.endsWith('_ms'))
      data[key] = parseU64(value as string).toString();
    else if (typeof value === 'boolean') data[key] = value;
    else data[key] = numberValue(value as number | string);
  }
  if (
    'post_candidate_mask' in result.data &&
    numberValue(result.data.candidate_count) !== popcountU64(result.data.post_candidate_mask)
  ) {
    throw sanitizedError('MALFORMED_EVENT', 'The event candidate count does not match its mask.');
  }
  return { kind, data };
}

export function tryDecodeAlibiEvent(
  envelope: MoveEventEnvelope,
  packageId: string,
): PublicAlibiEvent | null {
  try {
    return decodeAlibiEvent(envelope, packageId);
  } catch {
    return null;
  }
}
