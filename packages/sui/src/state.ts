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
  ACCUSATION_PENDING_STATE,
  ACTIVE_STATE,
  LEVEL_VERSION,
  MOVE_PREDICATES,
  PRACTICE_MODE,
  PROTOCOL_VERSION,
  QUERY_PENDING_STATE,
  SCHEMA_VERSION,
  TERMINAL_STATE,
  VERIFIER_AVAILABLE_STATE,
  VERIFIER_UNAVAILABLE_STATE,
  VERIFIER_VERIFIED_STATUS,
} from './constants';
import { sanitizedError } from './errors';
import { parseU256, parseU64, popcountU64, u256ToHex, u64ToHex } from './masks';

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
const u256StringSchema = z.string().regex(/^(0|[1-9][0-9]*)$/);
const commitmentSchema = byteVectorSchema.length(32);
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
    verdict_verifier_state: smallIntegerSchema,
    expected_verdict_verifier_identity: byteVectorSchema,
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

const pendingAccusationFieldsSchema = z
  .object({
    attempt_nonce: u64StringSchema,
    accusation_commitment: commitmentSchema,
    session_attempt_domain_commitment: commitmentSchema,
    started_at_ms: u64StringSchema,
  })
  .strict();

const verdictFieldsSchema = z
  .object({
    attempt_nonce: u64StringSchema,
    accusation_commitment: commitmentSchema,
    session_attempt_domain_commitment: commitmentSchema,
    verdict_commitment: commitmentSchema,
    encrypted_verdict_blob_id: u256StringSchema,
    verifier_identity: commitmentSchema,
    verifier_status: smallIntegerSchema,
    started_at_ms: u64StringSchema,
    finalized_at_ms: u64StringSchema,
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
    attempt_nonce: u64StringSchema,
    pending_accusation: z.unknown(),
    verdict: z.unknown(),
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
  verdictVerifierAvailable: boolean;
  expectedVerdictVerifierIdentity: string | null;
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

export type PublicPendingAccusation = {
  attemptNonce: string;
  accusationCommitment: string;
  sessionAttemptDomainCommitment: string;
  startedAtMs: string;
};

export type PublicVerdictRecord = {
  attemptNonce: string;
  accusationCommitment: string;
  sessionAttemptDomainCommitment: string;
  verdictCommitment: string;
  encryptedVerdictBlobId: string;
  verifierIdentity: string;
  verifierStatus: typeof VERIFIER_VERIFIED_STATUS;
  startedAtMs: string;
  finalizedAtMs: string;
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
  attemptNonce: string;
  pendingAccusation: PublicPendingAccusation | null;
  verdict: PublicVerdictRecord | null;
  state:
    | typeof ACTIVE_STATE
    | typeof QUERY_PENDING_STATE
    | typeof ACCUSATION_PENDING_STATE
    | typeof TERMINAL_STATE;
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
    (smallInteger(fields.verdict_verifier_state) !== VERIFIER_UNAVAILABLE_STATE &&
      smallInteger(fields.verdict_verifier_state) !== VERIFIER_AVAILABLE_STATE) ||
    (smallInteger(fields.verdict_verifier_state) === VERIFIER_UNAVAILABLE_STATE &&
      fields.expected_verdict_verifier_identity.length !== 0) ||
    (smallInteger(fields.verdict_verifier_state) === VERIFIER_AVAILABLE_STATE &&
      (fields.expected_verdict_verifier_identity.length !== 32 ||
        fields.expected_verdict_verifier_identity.every((byte) => byte === 0))) ||
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
    verdictVerifierAvailable:
      smallInteger(fields.verdict_verifier_state) === VERIFIER_AVAILABLE_STATE,
    expectedVerdictVerifierIdentity:
      fields.expected_verdict_verifier_identity.length === 0
        ? null
        : bytesToHex(fields.expected_verdict_verifier_identity),
    finalized: true,
    predicates,
  };
}

function optionValue(value: unknown): unknown | null {
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
  return contents[0];
}

function publicCommitment(bytes: readonly number[]): string {
  if (bytes.length !== 32 || bytes.every((byte) => byte === 0)) malformedState();
  return bytesToHex(bytes);
}

export function decodePendingQuery(value: unknown): PublicPendingQuery | null {
  const contents = optionValue(value);
  if (contents === null) return null;
  const parsed = pendingFieldsSchema.safeParse(contents);
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

export function decodePendingAccusation(value: unknown): PublicPendingAccusation | null {
  const contents = optionValue(value);
  if (contents === null) return null;
  const parsed = pendingAccusationFieldsSchema.safeParse(contents);
  if (!parsed.success) malformedState();
  return {
    attemptNonce: parseU64(parsed.data.attempt_nonce).toString(),
    accusationCommitment: publicCommitment(parsed.data.accusation_commitment),
    sessionAttemptDomainCommitment: publicCommitment(parsed.data.session_attempt_domain_commitment),
    startedAtMs: parseU64(parsed.data.started_at_ms).toString(),
  };
}

export function decodeVerdictRecord(value: unknown): PublicVerdictRecord | null {
  const contents = optionValue(value);
  if (contents === null) return null;
  const parsed = verdictFieldsSchema.safeParse(contents);
  if (!parsed.success) malformedState();
  const blobId = parseU256(parsed.data.encrypted_verdict_blob_id);
  if (
    blobId === 0n ||
    smallInteger(parsed.data.verifier_status) !== VERIFIER_VERIFIED_STATUS ||
    parseU64(parsed.data.finalized_at_ms) < parseU64(parsed.data.started_at_ms)
  )
    malformedState();
  return {
    attemptNonce: parseU64(parsed.data.attempt_nonce).toString(),
    accusationCommitment: publicCommitment(parsed.data.accusation_commitment),
    sessionAttemptDomainCommitment: publicCommitment(parsed.data.session_attempt_domain_commitment),
    verdictCommitment: publicCommitment(parsed.data.verdict_commitment),
    encryptedVerdictBlobId: u256ToHex(blobId),
    verifierIdentity: publicCommitment(parsed.data.verifier_identity),
    verifierStatus: VERIFIER_VERIFIED_STATUS,
    startedAtMs: parseU64(parsed.data.started_at_ms).toString(),
    finalizedAtMs: parseU64(parsed.data.finalized_at_ms).toString(),
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
  const pendingAccusation = decodePendingAccusation(fields.pending_accusation);
  const verdict = decodeVerdictRecord(fields.verdict);
  const queryNonce = parseU64(fields.query_nonce).toString();
  const attemptNonce = parseU64(fields.attempt_nonce).toString();
  const disclosureCount = smallInteger(fields.disclosure_count);
  const usedPredicates = smallInteger(fields.used_predicates);
  if (
    normalizeSuiObjectId(fields.id.id) !== normalizeSuiObjectId(envelope.objectId) ||
    smallInteger(fields.mode) !== PRACTICE_MODE ||
    (state !== ACTIVE_STATE &&
      state !== QUERY_PENDING_STATE &&
      state !== ACCUSATION_PENDING_STATE &&
      state !== TERMINAL_STATE) ||
    (state === QUERY_PENDING_STATE) !== (pendingQuery !== null) ||
    (state === ACCUSATION_PENDING_STATE) !== (pendingAccusation !== null) ||
    (state === TERMINAL_STATE) !== (verdict !== null) ||
    ((state === ACTIVE_STATE || state === QUERY_PENDING_STATE) && attemptNonce !== '0') ||
    ((state === ACCUSATION_PENDING_STATE || state === TERMINAL_STATE) && attemptNonce !== '1') ||
    (pendingQuery !== null &&
      (pendingQuery.queryNonce !== queryNonce ||
        pendingQuery.preCandidateMask !== u64ToHex(fields.candidate_mask))) ||
    (pendingAccusation !== null &&
      parseU64(pendingAccusation.attemptNonce) + 1n !== parseU64(attemptNonce)) ||
    (verdict !== null && parseU64(verdict.attemptNonce) + 1n !== parseU64(attemptNonce)) ||
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
    attemptNonce,
    pendingAccusation,
    verdict,
    state,
    protocolVersion: PROTOCOL_VERSION,
    levelVersion: LEVEL_VERSION,
  };
}
