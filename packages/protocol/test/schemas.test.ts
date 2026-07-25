import { describe, expect, it } from 'vitest';

import {
  CASE_CANDIDATE_COUNT,
  candidateCountSchema,
  gameLimitsSchema,
  integrationReceiptSchema,
  publicHealthResponseSchema,
} from '../src/index';

describe('public protocol schemas', () => {
  it('enforces the canonical 64-candidate case size', () => {
    expect(candidateCountSchema.parse(CASE_CANDIDATE_COUNT)).toBe(64);
    expect(() => candidateCountSchema.parse(65)).toThrow();
    expect(() => candidateCountSchema.parse(1)).toThrow();
  });

  it('publishes fixed B1 gameplay limits', () => {
    expect(
      gameLimitsSchema.parse({
        initialCandidateCount: 64,
        certifiedDisclosureLimit: 5,
        minimumSurvivingCandidates: 2,
      }),
    ).toEqual({
      initialCandidateCount: 64,
      certifiedDisclosureLimit: 5,
      minimumSurvivingCandidates: 2,
    });
  });

  it('rejects secret-shaped fields from strict integration receipts', () => {
    expect(() =>
      integrationReceiptSchema.parse({
        capability: 'walrus',
        operationId: 'operation-1',
        state: 'verified',
        externalResponseId: 'response-1',
        privateKey: 'must-not-pass',
      }),
    ).toThrow();
  });

  it('accepts a sanitized fixture health response', () => {
    const fixtureCapabilities = ['sui', 'zk-prover', '0g', 'walrus', 'seal', 'world-agentkit'].map(
      (capability) => ({
        capability,
        state: 'fixture',
        mode: 'fixture',
        label: capability,
        blocking: false,
      }),
    );

    expect(
      publicHealthResponseSchema.parse({
        status: 'ok',
        product: 'the-last-alibi',
        service: 'the-last-alibi-web',
        application: 'baseline-ready',
        runtime: {
          mode: 'fixture',
          label: 'Fixture',
          capabilities: fixtureCapabilities,
        },
      }).status,
    ).toBe('ok');
  });
});
