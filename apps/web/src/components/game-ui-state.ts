import type { PublicGameSession, PublicPredicateStatus, TestimonyEntry } from '@alibi/protocol';

import type { PendingAction } from './game-shell-helpers';
import type { SessionCreationStage } from './opening-experience';
import type { InvestigationHypothesis } from './investigation-experience';

export type OpeningAction = 'title-timer' | 'menu-timer' | 'skip' | 'reduce-motion';
export type OpeningPhase = 'black' | 'title' | 'ready';

export function advanceOpeningPhase(current: OpeningPhase, action: OpeningAction): OpeningPhase {
  if (action === 'skip' || action === 'reduce-motion' || action === 'menu-timer') return 'ready';
  if (action === 'title-timer' && current === 'black') return 'title';
  return current;
}

export function getModeAvailability(runtimeMode: 'fixture' | 'live' | null): {
  practice: 'available' | 'unavailable';
  ranked: 'unavailable';
} {
  return {
    practice: runtimeMode === 'fixture' ? 'available' : 'unavailable',
    ranked: 'unavailable',
  };
}

export function getCreationHeading(stage: SessionCreationStage): string {
  const headings: Record<SessionCreationStage, string> = {
    idle: 'Preparing case',
    preparing: 'Preparing case',
    committing: 'Committing case',
    confirmed: 'Case confirmed',
    failed: 'Case preparation failed',
  };
  return headings[stage];
}

export type WarrantPresentationState = 'safe' | 'implied' | 'unavailable' | 'confirmed';

export function getWarrantPresentationState(
  predicate: PublicPredicateStatus,
  currentCandidateCount: number,
): WarrantPresentationState {
  if (predicate.availability === 'used') return 'confirmed';
  if (predicate.availability === 'unsafe') return 'unavailable';
  if (
    predicate.yesCandidateCount === currentCandidateCount ||
    predicate.noCandidateCount === currentCandidateCount
  ) {
    return 'implied';
  }
  return 'safe';
}

export function getWorstCaseSurvivorCount(predicate: PublicPredicateStatus): number {
  return Math.max(predicate.yesCandidateCount, predicate.noCandidateCount);
}

export function isAccusationComplete(hypothesis: InvestigationHypothesis): boolean {
  return Object.values(hypothesis).every((value) => value !== '');
}

export function isDuplicateTestimonyQuestion(
  transcript: readonly TestimonyEntry[],
  questionId: string,
): boolean {
  return transcript.some((entry) => entry.questionId === questionId);
}

export function terminalSubmissionDisabled(input: {
  hypothesis: InvestigationHypothesis;
  confirmed: boolean;
  pendingAction: PendingAction;
  session: PublicGameSession;
}): boolean {
  return (
    input.session.state === 'terminal' ||
    input.pendingAction !== null ||
    !input.confirmed ||
    !isAccusationComplete(input.hypothesis)
  );
}

export function shouldOfferContinue(input: {
  runtimeMode: 'fixture' | 'live' | null;
  validatedSessionState: PublicGameSession['state'] | null;
}): boolean {
  return input.runtimeMode === 'fixture' && input.validatedSessionState === 'active';
}

export function getResponsiveShellMode(width: number): 'mobile' | 'tablet' | 'desktop' {
  if (width <= 780) return 'mobile';
  if (width <= 1120) return 'tablet';
  return 'desktop';
}
