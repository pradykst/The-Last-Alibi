import {
  isValidSuiAddress,
  isValidSuiObjectId,
  normalizeStructTag,
  normalizeSuiAddress,
  normalizeSuiObjectId,
} from '@mysten/sui/utils';
import { z } from 'zod';

import { ALIBI_MOVE_MODULE } from './constants';
import { sanitizedError } from './errors';
import { parseU64, popcountU64, u64ToHex } from './masks';

export type MoveEventEnvelope = { type: string; parsedJson: unknown };

const integer = z.union([z.number().int().nonnegative(), z.string().regex(/^(0|[1-9][0-9]*)$/)]);
const u64 = z.string().regex(/^(0|[1-9][0-9]*)$/);
const objectId = z.string().refine(isValidSuiObjectId);
const address = z.string().refine(isValidSuiAddress);

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
      protocol_version: integer,
      level_version: integer,
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
  const data: Record<string, boolean | number | string> = {};
  for (const [key, value] of Object.entries(result.data)) {
    if (key === 'session' || key === 'level') data[key] = normalizeSuiObjectId(value as string);
    else if (key === 'player') data[key] = normalizeSuiAddress(value as string);
    else if (key.includes('mask') || key.endsWith('branch')) data[key] = u64ToHex(value as string);
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
