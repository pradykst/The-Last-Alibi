import { z } from 'zod';

import { ZeroGError } from './errors';

const identifierSchema = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
const emotionSchema = z.enum(['neutral', 'guarded', 'anxious', 'angry', 'relieved']);
const actionSchema = z.enum(['none', 'offer_lead', 'suggest_warrant', 'end_interview']);

export const suspectDialogueSchema = z
  .object({
    utterance: z.string().trim().min(1).max(700),
    emotion: emotionSchema,
    action: actionSchema,
    leadId: identifierSchema.nullable(),
    predicateId: identifierSchema.nullable(),
  })
  .strict();

export type SuspectDialogue = z.infer<typeof suspectDialogueSchema>;

type DialogueRecord = Record<string, unknown>;

function parseRecord(content: string): DialogueRecord {
  if (content.includes('```')) {
    throw new ZeroGError('ZERO_G_OUTPUT_MALFORMED');
  }
  try {
    const value: unknown = JSON.parse(content);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error('Not an object.');
    }
    return value as DialogueRecord;
  } catch {
    throw new ZeroGError('ZERO_G_OUTPUT_MALFORMED');
  }
}

export function parseSuspectDialogue(
  content: string,
  approvals: {
    approvedLeadIds: readonly string[];
    approvedPredicateIds: readonly string[];
  },
): SuspectDialogue {
  const record = parseRecord(content);
  const action = record['action'];
  if (typeof action !== 'string' || !actionSchema.safeParse(action).success) {
    throw new ZeroGError('ZERO_G_UNKNOWN_ACTION');
  }

  const parsed = suspectDialogueSchema.safeParse(record);
  if (!parsed.success) {
    throw new ZeroGError('ZERO_G_OUTPUT_MALFORMED');
  }
  const dialogue = parsed.data;

  if (dialogue.leadId !== null && !approvals.approvedLeadIds.includes(dialogue.leadId)) {
    throw new ZeroGError('ZERO_G_UNKNOWN_LEAD');
  }
  if (
    dialogue.predicateId !== null &&
    !approvals.approvedPredicateIds.includes(dialogue.predicateId)
  ) {
    throw new ZeroGError('ZERO_G_UNKNOWN_PREDICATE');
  }

  const validCombination =
    (dialogue.action === 'offer_lead' &&
      dialogue.leadId !== null &&
      dialogue.predicateId === null) ||
    (dialogue.action === 'suggest_warrant' &&
      dialogue.leadId === null &&
      dialogue.predicateId !== null) ||
    ((dialogue.action === 'none' || dialogue.action === 'end_interview') &&
      dialogue.leadId === null &&
      dialogue.predicateId === null);
  if (!validCombination) {
    throw new ZeroGError('ZERO_G_OUTPUT_MALFORMED');
  }

  return dialogue;
}
