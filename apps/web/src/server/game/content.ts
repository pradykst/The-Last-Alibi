import { publicGameContentSchema } from '@alibi/protocol';
import type { PublicGameContent, SuspectId, TestimonyQuestion } from '@alibi/protocol';
import { LEVEL_MANIFEST } from '@alibi/game-engine';

type ScriptedTestimony = TestimonyQuestion & {
  answer: string;
};

export const SCRIPTED_TESTIMONY: readonly ScriptedTestimony[] = [
  {
    id: 'question_archivist_blackout',
    suspectId: 'suspect_archivist',
    question: 'Where were you when the lights failed?',
    answer:
      'In the archive anteroom, checking a donor folio. The blackout made the access reader useless, which is inconvenient evidence rather than an alibi.',
  },
  {
    id: 'question_archivist_curator',
    suspectId: 'suspect_archivist',
    question: 'What were you arguing about with the curator?',
    answer:
      'Attribution records. He preferred a dramatic story; I preferred one the documents could support.',
  },
  {
    id: 'question_security_timeline',
    suspectId: 'suspect_security',
    question: 'How long did the blackout last?',
    answer:
      'Forty-seven seconds by the backup controller. Long enough to disrupt the cameras, not long enough to explain every convenient memory lapse.',
  },
  {
    id: 'question_security_access',
    suspectId: 'suspect_security',
    question: 'Who could bypass the locked rooms?',
    answer:
      'Staff credentials cover assigned areas. Emergency overrides are logged—when the logging system has power.',
  },
  {
    id: 'question_patron_meeting',
    suspectId: 'suspect_patron',
    question: 'Were you meeting the curator privately?',
    answer:
      'We spoke briefly about the exhibition’s future. “Private” makes it sound more scandalous than fundraising deserves.',
  },
  {
    id: 'question_patron_route',
    suspectId: 'suspect_patron',
    question: 'Why was the service stair open?',
    answer:
      'Ask the museum. Patrons are blamed for doors only after staff discover they have misplaced a key.',
  },
  {
    id: 'question_restorer_tools',
    suspectId: 'suspect_restorer',
    question: 'Are any restoration tools missing?',
    answer:
      'No. I counted twice. That does not mean nothing was moved—it means everything I am responsible for came back.',
  },
  {
    id: 'question_restorer_noise',
    suspectId: 'suspect_restorer',
    question: 'What did you hear during the blackout?',
    answer:
      'A scrape, then something heavier against stone. The ventilation was loud. I cannot tell you which room it came from.',
  },
] as const;

export const PUBLIC_GAME_CONTENT: PublicGameContent = publicGameContentSchema.parse({
  manifest: LEVEL_MANIFEST,
  testimonyQuestions: SCRIPTED_TESTIMONY.map((entry) => ({
    id: entry.id,
    suspectId: entry.suspectId,
    question: entry.question,
  })),
});

export function findScriptedTestimony(
  suspectId: SuspectId,
  questionId: string,
): ScriptedTestimony | undefined {
  return SCRIPTED_TESTIMONY.find(
    (entry) => entry.suspectId === suspectId && entry.id === questionId,
  );
}
