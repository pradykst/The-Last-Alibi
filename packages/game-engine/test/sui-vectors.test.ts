import { readFileSync } from 'node:fs';

import {
  CASE_COUNT,
  INITIAL_CANDIDATE_MASK,
  REGISTERED_PREDICATES,
  previewDisclosure,
  serializeMask,
} from '../src/index';
import {
  CASE_CANDIDATE_COUNT,
  CERTIFIED_DISCLOSURE_LIMIT,
  MINIMUM_SURVIVING_CANDIDATES,
} from '@alibi/protocol';
import { describe, expect, it } from 'vitest';

const vectors = JSON.parse(
  readFileSync(
    new URL('../../../contracts/alibi/test-vectors/predicates.json', import.meta.url),
    'utf8',
  ),
) as {
  generatedFrom: string;
  schemaVersion: number;
  caseCount: number;
  predicateCount: number;
  initialCandidateMask: string;
  disclosureLimit: number;
  minimumSurvivors: number;
  predicates: Array<{
    numericId: number;
    browserId: string;
    dimension: string;
    dimensionId: number;
    valueId: string;
    valueIndex: number;
    mask: string;
    yesInitialCount: number;
    noInitialCount: number;
  }>;
};

const dimensionOrder = ['suspect', 'room', 'weapon', 'time'] as const;

describe('generated Sui predicate vectors', () => {
  it('matches every canonical B2 predicate and public rule', () => {
    const valueCounters = new Map<string, number>();
    const expectedPredicates = REGISTERED_PREDICATES.map((predicate, numericId) => {
      const valueIndex = valueCounters.get(predicate.dimension) ?? 0;
      valueCounters.set(predicate.dimension, valueIndex + 1);
      const preview = previewDisclosure(INITIAL_CANDIDATE_MASK, predicate);
      return {
        numericId,
        browserId: predicate.id,
        dimension: predicate.dimension,
        dimensionId: dimensionOrder.indexOf(predicate.dimension),
        valueId: predicate.valueId,
        valueIndex,
        mask: serializeMask(predicate.truthMask),
        yesInitialCount: preview.yesCandidateCount,
        noInitialCount: preview.noCandidateCount,
      };
    });

    expect(vectors).toEqual({
      generatedFrom: '@alibi/game-engine',
      schemaVersion: 1,
      caseCount: CASE_COUNT,
      predicateCount: REGISTERED_PREDICATES.length,
      initialCandidateMask: serializeMask(INITIAL_CANDIDATE_MASK),
      disclosureLimit: CERTIFIED_DISCLOSURE_LIMIT,
      minimumSurvivors: MINIMUM_SURVIVING_CANDIDATES,
      predicates: expectedPredicates,
    });
    expect(vectors.caseCount).toBe(CASE_CANDIDATE_COUNT);
    expect(vectors.predicates).toHaveLength(12);
  });
});
