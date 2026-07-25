import {
  CASE_CANDIDATE_COUNT,
  CERTIFIED_DISCLOSURE_LIMIT,
  MINIMUM_SURVIVING_CANDIDATES,
  MVP_LEVEL_ID,
  PRODUCT_ID,
} from '@alibi/protocol';
import {
  isValidSuiAddress,
  isValidSuiObjectId,
  normalizeStructTag,
  normalizeSuiAddress,
  normalizeSuiObjectId,
} from '@mysten/sui/utils';
import { z } from 'zod';

import {
  ACTIVE_STATE,
  LEVEL_VERSION,
  MOVE_PREDICATES,
  PRACTICE_MODE,
  PROTOCOL_VERSION,
  QUERY_PENDING_STATE,
  SCHEMA_VERSION,
  VERIFIER_UNAVAILABLE_STATE,
} from './constants';
import { sanitizedError } from './errors';
import { parseU64, popcountU64, u64ToHex } from './masks';

export type MoveObjectEnvelope = {
  objectId: string;
  type: string;
  fields: unknown;
};

const byteVectorSchema = z.array(z.number().int().min(0).max(255));
const smallIntegerSchema = z.union([
  z.number().int().nonnegative(),
  z.string().regex(/^(0|[1-9][0-9]*)$/),
]);
const u64StringSchema = z.string().regex(/^(0|[1-9][0-9]*)$/);
const idFieldSchema = z.object({ id: z.string().refine(isValidSuiObjectId) }).strict();

const predicateSchema = z
  .object({
    id: smallIntegerSchema,
    dimension: smallIntegerSchema,
    value: smallIntegerSchema,
    truth_mask: u64StringSchema,
  })
  .strict();

const levelFieldsSchema = z
  .object({
    id: idFieldSchema,
    product_id: byteVectorSchema,
    level_id: byteVectorSchema,
    schema_version: smallIntegerSchema,
    level_version: smallIntegerSchema,
    case_count: smallIntegerSchema,
    predicate_count: smallIntegerSchema,
    disclosure_limit: smallIntegerSchema,
    minimum_survivors: smallIntegerSchema,
    verifier_state: smallIntegerSchema,
    expected_verifier_identity: byteVectorSchema,
    finalized: z.boolean(),
    predicates: z.array(predicateSchema),
  })
  .strict();

const pendingFieldsSchema = z
  .object({
    predicate_id: smallIntegerSchema,
    query_nonce: u64StringSchema,
    pre_candidate_mask: u64StringSchema,
    yes_branch: u64StringSchema,
    no_branch: u64StringSchema,
    authorized_at_ms: u64StringSchema,
    expires_at_ms: u64StringSchema,
  })
  .strict();

const sessionFieldsSchema = z
  .object({
    id: idFieldSchema,
    player: z.string().refine(isValidSuiAddress),
    level: z.string().refine(isValidSuiObjectId),
    mode: smallIntegerSchema,
    case_commitment: byteVectorSchema.length(32),
    candidate_mask: u64StringSchema,
    disclosure_count: smallIntegerSchema,
    used_predicates: smallIntegerSchema,
    query_nonce: u64StringSchema,
    pending_query: z.unknown(),
    state: smallIntegerSchema,
    protocol_version: smallIntegerSchema,
    level_version: smallIntegerSchema,
  })
  .strict();

function smallInteger(value: number | string): number {
  const result = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(result)) {
    throw sanitizedError('MALFORMED_PUBLIC_STATE', 'A public integer field is malformed.');
  }
  return result;
}

function bytesToText(bytes: readonly number[]): string {
  return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bytes));
}

function bytesToHex(bytes: readonly number[]): string {
  return `0x${bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

function assertObjectType(
  envelope: MoveObjectEnvelope,
  packageId: string,
  structName: string,
): void {
  if (!isValidSuiObjectId(envelope.objectId) || !isValidSuiObjectId(packageId)) {
    throw sanitizedError('OBJECT_TYPE_MISMATCH', 'The Sui object identity is invalid.');
  }
  let actual: string;
  let expected: string;
  try {
    actual = normalizeStructTag(envelope.type);
    expected = normalizeStructTag(`${packageId}::alibi::${structName}`);
  } catch {
    throw sanitizedError('OBJECT_TYPE_MISMATCH', 'The Sui object type is malformed.');
  }
  if (actual !== expected) {
    throw sanitizedError(
      'OBJECT_TYPE_MISMATCH',
      'The Sui object does not belong to the configured Alibi package.',
    );
  }
}

function malformedState(): never {
  throw sanitizedError('MALFORMED_PUBLIC_STATE', 'The Alibi public object state is malformed.');
}

export type PublicPredicate = {
  id: number;
  browserId: string;
  dimensionId: number;
  valueIndex: number;
  truthMask: string;
};

export type PublicLevelConfig = {
  objectId: string;
  productId: typeof PRODUCT_ID;
  levelId: typeof MVP_LEVEL_ID;
  schemaVersion: typeof SCHEMA_VERSION;
  levelVersion: typeof LEVEL_VERSION;
  caseCount: typeof CASE_CANDIDATE_COUNT;
  predicateCount: 12;
  disclosureLimit: typeof CERTIFIED_DISCLOSURE_LIMIT;
  minimumSurvivors: typeof MINIMUM_SURVIVING_CANDIDATES;
  verifierAvailable: false;
  finalized: true;
  predicates: readonly PublicPredicate[];
};

export type PublicPendingQuery = {
  predicateId: number;
  queryNonce: string;
  preCandidateMask: string;
  yesBranch: string;
  noBranch: string;
  authorizedAtMs: string;
  expiresAtMs: string;
};

export type PublicGameSession = {
  objectId: string;
  player: string;
  levelConfigId: string;
  mode: typeof PRACTICE_MODE;
  caseCommitment: string;
  candidateMask: string;
  candidateCount: number;
  disclosureCount: number;
  usedPredicates: number;
  queryNonce: string;
  pendingQuery: PublicPendingQuery | null;
  state: typeof ACTIVE_STATE | typeof QUERY_PENDING_STATE;
  protocolVersion: typeof PROTOCOL_VERSION;
  levelVersion: typeof LEVEL_VERSION;
};

export function decodeLevelConfig(
  envelope: MoveObjectEnvelope,
  packageId: string,
): PublicLevelConfig {
  assertObjectType(envelope, packageId, 'LevelConfig');
  const parsed = levelFieldsSchema.safeParse(envelope.fields);
  if (!parsed.success) malformedState();
  const fields = parsed.data;
  const predicates = fields.predicates.map((predicate, index) => {
    const expected = MOVE_PREDICATES[index];
    if (
      expected === undefined ||
      smallInteger(predicate.id) !== expected.id ||
      smallInteger(predicate.dimension) !== expected.dimensionId ||
      smallInteger(predicate.value) !== expected.valueIndex ||
      parseU64(predicate.truth_mask) !== expected.truthMask
    ) {
      malformedState();
    }
    return {
      id: expected.id,
      browserId: expected.browserId,
      dimensionId: expected.dimensionId,
      valueIndex: expected.valueIndex,
      truthMask: u64ToHex(predicate.truth_mask),
    };
  });
  if (
    normalizeSuiObjectId(fields.id.id) !== normalizeSuiObjectId(envelope.objectId) ||
    bytesToText(fields.product_id) !== PRODUCT_ID ||
    bytesToText(fields.level_id) !== MVP_LEVEL_ID ||
    smallInteger(fields.schema_version) !== SCHEMA_VERSION ||
    smallInteger(fields.level_version) !== LEVEL_VERSION ||
    smallInteger(fields.case_count) !== CASE_CANDIDATE_COUNT ||
    smallInteger(fields.predicate_count) !== 12 ||
    predicates.length !== 12 ||
    smallInteger(fields.disclosure_limit) !== CERTIFIED_DISCLOSURE_LIMIT ||
    smallInteger(fields.minimum_survivors) !== MINIMUM_SURVIVING_CANDIDATES ||
    smallInteger(fields.verifier_state) !== VERIFIER_UNAVAILABLE_STATE ||
    fields.expected_verifier_identity.length !== 0 ||
    fields.finalized !== true
  ) {
    malformedState();
  }
  return {
    objectId: normalizeSuiObjectId(envelope.objectId),
    productId: PRODUCT_ID,
    levelId: MVP_LEVEL_ID,
    schemaVersion: SCHEMA_VERSION,
    levelVersion: LEVEL_VERSION,
    caseCount: CASE_CANDIDATE_COUNT,
    predicateCount: 12,
    disclosureLimit: CERTIFIED_DISCLOSURE_LIMIT,
    minimumSurvivors: MINIMUM_SURVIVING_CANDIDATES,
    verifierAvailable: false,
    finalized: true,
    predicates,
  };
}

export function decodePendingQuery(value: unknown): PublicPendingQuery | null {
  let contents: unknown[];
  if (value === null) return null;
  if (Array.isArray(value)) contents = value;
  else if (typeof value === 'object' && value !== null && 'vec' in value) {
    const vec = (value as { vec: unknown }).vec;
    if (!Array.isArray(vec)) malformedState();
    contents = vec;
  } else malformedState();
  if (contents.length === 0) return null;
  if (contents.length !== 1) malformedState();
  const parsed = pendingFieldsSchema.safeParse(contents[0]);
  if (!parsed.success) malformedState();
  const pending = parsed.data;
  const predicateId = smallInteger(pending.predicate_id);
  const pre = parseU64(pending.pre_candidate_mask);
  const yes = parseU64(pending.yes_branch);
  const no = parseU64(pending.no_branch);
  if (
    predicateId >= 12 ||
    (yes & no) !== 0n ||
    (yes | no) !== pre ||
    popcountU64(yes) < 2 ||
    popcountU64(no) < 2
  )
    malformedState();
  if (parseU64(pending.expires_at_ms) < parseU64(pending.authorized_at_ms)) malformedState();
  return {
    predicateId,
    queryNonce: parseU64(pending.query_nonce).toString(),
    preCandidateMask: u64ToHex(pre),
    yesBranch: u64ToHex(yes),
    noBranch: u64ToHex(no),
    authorizedAtMs: parseU64(pending.authorized_at_ms).toString(),
    expiresAtMs: parseU64(pending.expires_at_ms).toString(),
  };
}

export function decodeGameSession(
  envelope: MoveObjectEnvelope,
  packageId: string,
): PublicGameSession {
  assertObjectType(envelope, packageId, 'GameSession');
  const parsed = sessionFieldsSchema.safeParse(envelope.fields);
  if (!parsed.success) malformedState();
  const fields = parsed.data;
  const state = smallInteger(fields.state);
  const pendingQuery = decodePendingQuery(fields.pending_query);
  const queryNonce = parseU64(fields.query_nonce).toString();
  const disclosureCount = smallInteger(fields.disclosure_count);
  const usedPredicates = smallInteger(fields.used_predicates);
  if (
    normalizeSuiObjectId(fields.id.id) !== normalizeSuiObjectId(envelope.objectId) ||
    smallInteger(fields.mode) !== PRACTICE_MODE ||
    (state !== ACTIVE_STATE && state !== QUERY_PENDING_STATE) ||
    (state === QUERY_PENDING_STATE) !== (pendingQuery !== null) ||
    (pendingQuery !== null &&
      (pendingQuery.queryNonce !== queryNonce ||
        pendingQuery.preCandidateMask !== u64ToHex(fields.candidate_mask))) ||
    disclosureCount > CERTIFIED_DISCLOSURE_LIMIT ||
    usedPredicates > 0x0fff ||
    smallInteger(fields.protocol_version) !== PROTOCOL_VERSION ||
    smallInteger(fields.level_version) !== LEVEL_VERSION
  )
    malformedState();
  return {
    objectId: normalizeSuiObjectId(envelope.objectId),
    player: normalizeSuiAddress(fields.player),
    levelConfigId: normalizeSuiObjectId(fields.level),
    mode: PRACTICE_MODE,
    caseCommitment: bytesToHex(fields.case_commitment),
    candidateMask: u64ToHex(fields.candidate_mask),
    candidateCount: popcountU64(fields.candidate_mask),
    disclosureCount,
    usedPredicates,
    queryNonce,
    pendingQuery,
    state,
    protocolVersion: PROTOCOL_VERSION,
    levelVersion: LEVEL_VERSION,
  };
}
