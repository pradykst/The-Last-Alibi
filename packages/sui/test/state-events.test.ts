import { REGISTERED_PREDICATES } from '@alibi/game-engine';
import { describe, expect, it } from 'vitest';

import {
  decodeAlibiEvent,
  decodeGameSession,
  decodeLevelConfig,
  decodePendingQuery,
  tryDecodeAlibiEvent,
} from '../src';
import {
  LEVEL_ID,
  PACKAGE_ID,
  SESSION_ID,
  levelEnvelope,
  pendingQuery,
  sessionEnvelope,
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
