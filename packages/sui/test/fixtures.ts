import { REGISTERED_PREDICATES } from '@alibi/game-engine';

export const PACKAGE_ID = '0x00000000000000000000000000000000000000000000000000000000000a11b1';
export const LEVEL_ID = '0x000000000000000000000000000000000000000000000000000000000001e0e1';
export const SESSION_ID = '0x00000000000000000000000000000000000000000000000000000000005e5510';
export const PLAYER = '0x000000000000000000000000000000000000000000000000000000000000cafe';
export const VERIFIER_IDENTITY = Array.from({ length: 32 }, () => 0xaa);

function commitment(byte: number): number[] {
  return Array.from({ length: 32 }, () => byte);
}

export function levelEnvelope(extra: Record<string, unknown> = {}) {
  return {
    objectId: LEVEL_ID,
    type: `${PACKAGE_ID}::alibi::LevelConfig`,
    fields: {
      id: { id: LEVEL_ID },
      product_id: Array.from(new TextEncoder().encode('the-last-alibi')),
      level_id: Array.from(new TextEncoder().encode('the-last-exhibit')),
      schema_version: 1,
      level_version: 1,
      case_count: 64,
      predicate_count: 12,
      disclosure_limit: 5,
      minimum_survivors: 2,
      verifier_state: 0,
      expected_verifier_identity: [],
      verdict_verifier_state: 0,
      expected_verdict_verifier_identity: [],
      finalized: true,
      predicates: REGISTERED_PREDICATES.map((predicate, id) => ({
        id,
        dimension: id < 4 ? 0 : id < 8 ? 1 : id < 10 ? 2 : 3,
        value: id < 4 ? id : id < 8 ? id - 4 : id < 10 ? id - 8 : id - 10,
        truth_mask: predicate.truthMask.toString(),
      })),
      ...extra,
    },
  };
}

export function sessionEnvelope(extra: Record<string, unknown> = {}) {
  return {
    objectId: SESSION_ID,
    type: `${PACKAGE_ID}::alibi::GameSession`,
    fields: {
      id: { id: SESSION_ID },
      player: PLAYER,
      level: LEVEL_ID,
      mode: 0,
      case_commitment: Array.from({ length: 32 }, (_, index) => index),
      candidate_mask: '18446744073709551615',
      disclosure_count: 0,
      used_predicates: 0,
      query_nonce: '0',
      pending_query: { vec: [] },
      attempt_nonce: '0',
      pending_accusation: { vec: [] },
      verdict: { vec: [] },
      state: 1,
      protocol_version: 1,
      level_version: 1,
      ...extra,
    },
  };
}

export function pendingQuery() {
  const predicateMask = REGISTERED_PREDICATES[0]!.truthMask;
  return {
    predicate_id: 0,
    query_nonce: '0',
    pre_candidate_mask: '18446744073709551615',
    yes_branch: predicateMask.toString(),
    no_branch: (((1n << 64n) - 1n) ^ predicateMask).toString(),
    authorized_at_ms: '1000',
    expires_at_ms: '301000',
  };
}

export function pendingAccusation() {
  return {
    attempt_nonce: '0',
    accusation_commitment: commitment(0x22),
    session_attempt_domain_commitment: commitment(0x33),
    started_at_ms: '1000',
  };
}

export function verdictRecord() {
  return {
    attempt_nonce: '0',
    accusation_commitment: commitment(0x22),
    session_attempt_domain_commitment: commitment(0x33),
    verdict_commitment: commitment(0x44),
    encrypted_verdict_blob_id: '1',
    verifier_identity: VERIFIER_IDENTITY,
    verifier_status: 1,
    started_at_ms: '1000',
    finalized_at_ms: '2000',
  };
}
