import { CERTIFIED_DISCLOSURE_LIMIT, MINIMUM_SURVIVING_CANDIDATES } from '@alibi/protocol';
import type { GameDenialCode, SessionState, WarrantOutcome } from '@alibi/protocol';

import type { RegisteredPredicate } from './predicates';
import { complementMask, intersectMasks, popcount } from './universe';

export type DisclosurePreview = {
  yesMask: bigint;
  noMask: bigint;
  yesCandidateCount: number;
  noCandidateCount: number;
  safe: boolean;
};

export type DisclosureEngineState = {
  state: SessionState;
  candidateMask: bigint;
  usedPredicateIds: ReadonlySet<string>;
  acceptedDisclosureCount: number;
  pendingOperation: boolean;
};

export type DisclosureDenial = {
  allowed: false;
  code: GameDenialCode;
};

export type DisclosureAuthorization = {
  allowed: true;
  preview: DisclosurePreview;
};

export type DisclosureDecision = DisclosureDenial | DisclosureAuthorization;

export function previewDisclosure(
  candidateMask: bigint,
  predicate: RegisteredPredicate,
): DisclosurePreview {
  const yesMask = intersectMasks(candidateMask, predicate.truthMask);
  const noMask = intersectMasks(candidateMask, complementMask(predicate.truthMask));
  const yesCandidateCount = popcount(yesMask);
  const noCandidateCount = popcount(noMask);

  return {
    yesMask,
    noMask,
    yesCandidateCount,
    noCandidateCount,
    safe:
      yesCandidateCount >= MINIMUM_SURVIVING_CANDIDATES &&
      noCandidateCount >= MINIMUM_SURVIVING_CANDIDATES,
  };
}

export function authorizeDisclosure(
  engineState: DisclosureEngineState,
  predicate: RegisteredPredicate | undefined,
): DisclosureDecision {
  if (engineState.pendingOperation) {
    return { allowed: false, code: 'OPERATION_ALREADY_PENDING' };
  }

  if (engineState.state !== 'active') {
    return { allowed: false, code: 'INVALID_SESSION_STATE' };
  }

  if (predicate === undefined) {
    return { allowed: false, code: 'UNKNOWN_PREDICATE' };
  }

  if (engineState.usedPredicateIds.has(predicate.id)) {
    return { allowed: false, code: 'PREDICATE_ALREADY_USED' };
  }

  if (engineState.acceptedDisclosureCount >= CERTIFIED_DISCLOSURE_LIMIT) {
    return { allowed: false, code: 'DISCLOSURE_LIMIT_REACHED' };
  }

  const preview = previewDisclosure(engineState.candidateMask, predicate);
  if (!preview.safe) {
    return { allowed: false, code: 'UNSAFE_DISCLOSURE' };
  }

  return { allowed: true, preview };
}

export function applyDisclosure(
  engineState: DisclosureEngineState,
  predicate: RegisteredPredicate,
  result: WarrantOutcome,
  preview: DisclosurePreview,
): DisclosureEngineState {
  if (!preview.safe) {
    throw new Error('Unsafe disclosures cannot be applied.');
  }

  const nextMask = result === 'YES' ? preview.yesMask : preview.noMask;
  if (intersectMasks(nextMask, engineState.candidateMask) !== nextMask) {
    throw new Error('A disclosure transition cannot add candidates.');
  }

  return {
    ...engineState,
    candidateMask: nextMask,
    acceptedDisclosureCount: engineState.acceptedDisclosureCount + 1,
    usedPredicateIds: new Set([...engineState.usedPredicateIds, predicate.id]),
    pendingOperation: false,
  };
}
