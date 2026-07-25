import { REGISTERED_PREDICATES } from '@alibi/game-engine';
import { describe, expect, it } from 'vitest';

import {
  decodeAlibiEvent,
  decodeGameSession,
  decodeLevelConfig,
  decodePendingAccusation,
  decodePendingQuery,
  decodeVerdictRecord,
  tryDecodeAlibiEvent,
} from '../src';
import {
  LEVEL_ID,
  PACKAGE_ID,
  SESSION_ID,
  WALRUS_BLOB_U256,
  levelEnvelope,
  pendingAccusation,
  pendingQuery,
  sessionEnvelope,
  verdictRecord,
} from './fixtures';

describe('public object decoding', () => {
  it('validates a canonical immutable level and all predicate masks', () => {
    const level = decodeLevelConfig(levelEnvelope(), PACKAGE_ID);
    expect(level.caseCount).toBe(64);
    expect(level.predicates).toHaveLength(12);
    expect(level.predicates.map((predicate) => predicate.browserId)).toEqual(
      REGISTERED_PREDICATES.map((predicate) => predicate.id),
    );
    expect(level.predicates[0]!.truthMask).toMatch(/^0x[0-9a-f]{16}$/);
    expect(level.verifierAvailable).toBe(false);
  });

  it('decodes lossless session and pending public state', () => {
    const session = decodeGameSession(sessionEnvelope(), PACKAGE_ID);
    expect(session.candidateMask).toBe('0xffffffffffffffff');
    expect(session.candidateCount).toBe(64);
    expect(session.queryNonce).toBe('0');
    expect(session.pendingQuery).toBeNull();

    const pending = decodePendingQuery({ vec: [pendingQuery()] });
    expect(pending).toMatchObject({
      predicateId: 0,
      queryNonce: '0',
      preCandidateMask: '0xffffffffffffffff',
    });
    expect(
      decodeGameSession(
        sessionEnvelope({ pending_query: { vec: [pendingQuery()] }, state: 2 }),
        PACKAGE_ID,
      ).pendingQuery,
    ).not.toBeNull();
  });

  it('decodes accusation-pending and terminal commitment-only state', () => {
    const pending = decodePendingAccusation({ vec: [pendingAccusation()] });
    expect(pending).toMatchObject({
      attemptNonce: '0',
      expectedVerdictBlobId: '0x33886c646435a0292d7737a007a1e723a322dbc4b69ea38f1f12be5bbff80549',
      startedAtMs: '1000',
    });
    const accusationPending = decodeGameSession(
      sessionEnvelope({
        state: 3,
        attempt_nonce: '1',
        pending_accusation: { vec: [pendingAccusation()] },
      }),
      PACKAGE_ID,
    );
    expect(accusationPending.pendingAccusation?.accusationCommitment).toMatch(/^0x[0-9a-f]{64}$/);
    expect(accusationPending.verdict).toBeNull();

    const verdict = decodeVerdictRecord({ vec: [verdictRecord()] });
    expect(verdict).toMatchObject({
      attemptNonce: '0',
      encryptedVerdictBlobId: pending?.expectedVerdictBlobId,
      verifierStatus: 1,
    });
    const terminal = decodeGameSession(
      sessionEnvelope({
        state: 4,
        attempt_nonce: '1',
        verdict: { vec: [verdictRecord()] },
      }),
      PACKAGE_ID,
    );
    expect(terminal.pendingAccusation).toBeNull();
    expect(terminal.verdict?.verdictCommitment).toMatch(/^0x[0-9a-f]{64}$/);
    expect('result' in terminal.verdict!).toBe(false);
  });

  it('decodes an explicitly configured verdict verifier identity', () => {
    const level = decodeLevelConfig(
      levelEnvelope({
        verdict_verifier_state: 1,
        expected_verdict_verifier_identity: Array.from({ length: 32 }, () => 0xaa),
      }),
      PACKAGE_ID,
    );
    expect(level.verdictVerifierAvailable).toBe(true);
    expect(level.expectedVerdictVerifierIdentity).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('rejects attacker-selected types, malformed options, and secret fields', () => {
    expect(() =>
      decodeGameSession(
        {
          ...sessionEnvelope(),
          type: '0x0000000000000000000000000000000000000000000000000000000000000bad::alibi::GameSession',
        },
        PACKAGE_ID,
      ),
    ).toThrowError('does not belong');
    expect(() => decodeLevelConfig(levelEnvelope({ hidden_case: 7 }), PACKAGE_ID)).toThrowError(
      'malformed',
    );
    expect(() => decodeGameSession(sessionEnvelope({ case_salt: [1] }), PACKAGE_ID)).toThrowError(
      'malformed',
    );
    expect(() => decodePendingQuery({ vec: [pendingQuery(), pendingQuery()] })).toThrowError(
      'malformed',
    );
    expect(() =>
      decodePendingQuery({ vec: [{ ...pendingQuery(), yes_branch: '1' }] }),
    ).toThrowError('malformed');
    expect(() =>
      decodeGameSession(
        sessionEnvelope({
          state: 4,
          verdict: { vec: [{ ...verdictRecord(), verdict_bit: false }] },
        }),
        PACKAGE_ID,
      ),
    ).toThrowError('malformed');
    expect(() =>
      decodeGameSession(
        sessionEnvelope({
          state: 3,
          attempt_nonce: '2',
          pending_accusation: { vec: [pendingAccusation()] },
        }),
        PACKAGE_ID,
      ),
    ).toThrowError('malformed');
    expect(() =>
      decodeGameSession(sessionEnvelope({ attempt_nonce: '1' }), PACKAGE_ID),
    ).toThrowError('malformed');
  });
});

describe('sanitized event decoding', () => {
  it('decodes known resolution events and verifies candidate counts', () => {
    const event = decodeAlibiEvent(
      {
        type: `${PACKAGE_ID}::alibi::QueryResolved`,
        parsedJson: {
          session: SESSION_ID,
          level: LEVEL_ID,
          predicate_id: 0,
          query_nonce: '0',
          result: true,
          pre_candidate_mask: '18446744073709551615',
          post_candidate_mask: REGISTERED_PREDICATES[0]!.truthMask.toString(),
          candidate_count: 16,
          disclosure_count: 1,
          next_query_nonce: '1',
        },
      },
      PACKAGE_ID,
    );
    expect(event.kind).toBe('QueryResolved');
    expect(event.data).toMatchObject({
      result: true,
      candidate_count: 16,
      post_candidate_mask: expect.stringMatching(/^0x[0-9a-f]{16}$/),
    });
  });

  it('decodes the exact content blob bound at accusation start', () => {
    const event = decodeAlibiEvent(
      {
        type: `${PACKAGE_ID}::alibi::AccusationStarted`,
        parsedJson: {
          session: SESSION_ID,
          level: LEVEL_ID,
          attempt_nonce: '0',
          accusation_commitment: Array.from({ length: 32 }, () => 0x22),
          expected_verdict_blob_id: WALRUS_BLOB_U256,
          session_attempt_domain_commitment: Array.from({ length: 32 }, () => 0x33),
          started_at_ms: '1000',
        },
      },
      PACKAGE_ID,
    );
    expect(event.kind).toBe('AccusationStarted');
    expect(event.data.expected_verdict_blob_id).toBe(
      '0x33886c646435a0292d7737a007a1e723a322dbc4b69ea38f1f12be5bbff80549',
    );
  });

  it('decodes sanitized terminal events without a verdict bit', () => {
    const event = decodeAlibiEvent(
      {
        type: `${PACKAGE_ID}::alibi::VerdictFinalized`,
        parsedJson: {
          session: SESSION_ID,
          level: LEVEL_ID,
          attempt_nonce: '0',
          accusation_commitment: Array.from({ length: 32 }, () => 0x22),
          session_attempt_domain_commitment: Array.from({ length: 32 }, () => 0x33),
          verdict_commitment: Array.from({ length: 32 }, () => 0x44),
          encrypted_verdict_blob_id: WALRUS_BLOB_U256,
          verifier_identity: Array.from({ length: 32 }, () => 0xaa),
          verifier_status: 1,
          finalized_at_ms: '2000',
        },
      },
      PACKAGE_ID,
    );
    expect(event.kind).toBe('VerdictFinalized');
    expect(event.data.verdict_commitment).toMatch(/^0x[0-9a-f]{64}$/);
    expect(event.data.encrypted_verdict_blob_id).toBe(
      '0x33886c646435a0292d7737a007a1e723a322dbc4b69ea38f1f12be5bbff80549',
    );
    expect('result' in event.data).toBe(false);
    expect(() =>
      decodeAlibiEvent(
        {
          type: `${PACKAGE_ID}::alibi::VerdictFinalized`,
          parsedJson: {
            session: SESSION_ID,
            level: LEVEL_ID,
            attempt_nonce: '0',
            accusation_commitment: Array.from({ length: 32 }, () => 0x22),
            session_attempt_domain_commitment: Array.from({ length: 32 }, () => 0x33),
            verdict_commitment: Array.from({ length: 32 }, () => 0x44),
            encrypted_verdict_blob_id: WALRUS_BLOB_U256,
            verifier_identity: Array.from({ length: 32 }, () => 0xaa),
            verifier_status: 0,
            finalized_at_ms: '2000',
          },
        },
        PACKAGE_ID,
      ),
    ).toThrowError('not verified');
  });

  it('explicitly rejects or ignores malformed and foreign events', () => {
    const malformed = {
      type: `${PACKAGE_ID}::alibi::QueryResolved`,
      parsedJson: { private_witness: 'no' },
    };
    expect(() => decodeAlibiEvent(malformed, PACKAGE_ID)).toThrowError('malformed');
    expect(tryDecodeAlibiEvent(malformed, PACKAGE_ID)).toBeNull();
    expect(
      tryDecodeAlibiEvent(
        {
          type: '0x0000000000000000000000000000000000000000000000000000000000000bad::alibi::QueryResolved',
          parsedJson: {},
        },
        PACKAGE_ID,
      ),
    ).toBeNull();
  });
});
