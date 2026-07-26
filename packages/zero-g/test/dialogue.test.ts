import { describe, expect, it } from 'vitest';

import { parseSuspectDialogue } from '../src/dialogue';
import { ZeroGError } from '../src/errors';

const APPROVALS = {
  approvedLeadIds: [] as string[],
  approvedPredicateIds: ['predicate_room_gallery'],
};

function expectCode(content: string, code: string): void {
  try {
    parseSuspectDialogue(content, APPROVALS);
    throw new Error('Expected dialogue to be rejected.');
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(ZeroGError);
    expect((error as ZeroGError).code).toBe(code);
  }
}

function dialogue(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    utterance: 'I remained near the archive records.',
    emotion: 'guarded',
    action: 'none',
    leadId: null,
    predicateId: null,
    ...overrides,
  });
}

describe('suspect dialogue schema', () => {
  it('accepts only the exact structured schema', () => {
    expect(parseSuspectDialogue(dialogue(), APPROVALS)).toEqual({
      utterance: 'I remained near the archive records.',
      emotion: 'guarded',
      action: 'none',
      leadId: null,
      predicateId: null,
    });
    expect(
      parseSuspectDialogue(
        dialogue({ action: 'suggest_warrant', predicateId: 'predicate_room_gallery' }),
        APPROVALS,
      ),
    ).toMatchObject({ action: 'suggest_warrant', predicateId: 'predicate_room_gallery' });
  });

  it('rejects extra fields, unknown emotions, malformed JSON, and Markdown fences', () => {
    expectCode(dialogue({ reasoning: 'hidden chain of thought' }), 'ZERO_G_OUTPUT_MALFORMED');
    expectCode(dialogue({ emotion: 'deceptive' }), 'ZERO_G_OUTPUT_MALFORMED');
    expectCode('{not-json}', 'ZERO_G_OUTPUT_MALFORMED');
    expectCode(`\`\`\`json\n${dialogue()}\n\`\`\``, 'ZERO_G_OUTPUT_MALFORMED');
  });

  it('rejects unknown actions, leads, and predicates with typed errors', () => {
    expectCode(dialogue({ action: 'execute_warrant' }), 'ZERO_G_UNKNOWN_ACTION');
    expectCode(dialogue({ action: 'offer_lead', leadId: 'invented_lead' }), 'ZERO_G_UNKNOWN_LEAD');
    expectCode(
      dialogue({ action: 'suggest_warrant', predicateId: 'invented_predicate' }),
      'ZERO_G_UNKNOWN_PREDICATE',
    );
  });

  it('enforces action and identifier combinations', () => {
    expectCode(dialogue({ action: 'offer_lead', leadId: null }), 'ZERO_G_OUTPUT_MALFORMED');
    expectCode(
      dialogue({ action: 'suggest_warrant', predicateId: null }),
      'ZERO_G_OUTPUT_MALFORMED',
    );
    expectCode(
      dialogue({ action: 'none', predicateId: 'predicate_room_gallery' }),
      'ZERO_G_OUTPUT_MALFORMED',
    );
  });
});
