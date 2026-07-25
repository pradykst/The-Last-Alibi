import type { CertifiedDisclosureEntry, ObservationId, TestimonyEntry } from '@alibi/protocol';

export type PendingAction =
  'create' | 'explore' | 'observe' | 'testimony' | 'warrant' | 'accusation' | null;

export function submissionsAreDisabled(pendingAction: PendingAction, terminal: boolean): boolean {
  return pendingAction !== null || terminal;
}

export function separateEvidence(input: {
  collectedObservationIds: readonly ObservationId[];
  testimonyEntries: readonly TestimonyEntry[];
  certifiedDisclosures: readonly CertifiedDisclosureEntry[];
  playerHypothesis: readonly string[];
}) {
  return {
    publicObservations: [...input.collectedObservationIds],
    unverifiedTestimony: [...input.testimonyEntries],
    certifiedDisclosures: [...input.certifiedDisclosures],
    playerHypothesis: [...input.playerHypothesis],
  };
}
