import { ROOM_IDS, SUSPECT_IDS, TIME_WINDOW_IDS, WEAPON_IDS } from '@alibi/protocol';
import type {
  PredicateDimension,
  RoomId,
  SuspectId,
  TimeWindowId,
  WeaponId,
} from '@alibi/protocol';

import { LEVEL_MANIFEST } from './manifest';
import { CASE_UNIVERSE, maskForCase } from './universe';

export type PredicateValueId = SuspectId | RoomId | WeaponId | TimeWindowId;

export type RegisteredPredicate = {
  id: string;
  dimension: PredicateDimension;
  valueId: PredicateValueId;
  question: string;
  truthMask: bigint;
};

function generateTruthMask(dimension: PredicateDimension, valueId: PredicateValueId): bigint {
  let mask = 0n;

  for (const candidate of CASE_UNIVERSE) {
    const matches =
      (dimension === 'suspect' && candidate.suspectId === valueId) ||
      (dimension === 'room' && candidate.roomId === valueId) ||
      (dimension === 'weapon' && candidate.weaponId === valueId) ||
      (dimension === 'time' && candidate.timeWindowId === valueId);

    if (matches) {
      mask |= maskForCase(candidate.index);
    }
  }

  return mask;
}

function predicateQuestion(dimension: PredicateDimension, valueId: PredicateValueId): string {
  if (dimension === 'suspect') {
    const suspect = LEVEL_MANIFEST.suspects.find((entry) => entry.id === valueId)!;
    return `Was the culprit ${suspect.name}?`;
  }

  if (dimension === 'room') {
    const room = LEVEL_MANIFEST.rooms.find((entry) => entry.id === valueId)!;
    return `Did it happen in the ${room.name}?`;
  }

  if (dimension === 'weapon') {
    const weapon = LEVEL_MANIFEST.weapons.find((entry) => entry.id === valueId)!;
    return `Was the ${weapon.name} used?`;
  }

  const timeWindow = LEVEL_MANIFEST.timeWindows.find((entry) => entry.id === valueId)!;
  return timeWindow.id === 'time_post_blackout'
    ? 'Did it occur after the blackout?'
    : 'Did it occur before the blackout?';
}

function createPredicate(
  dimension: PredicateDimension,
  valueId: PredicateValueId,
): RegisteredPredicate {
  return {
    id: `predicate_${valueId}`,
    dimension,
    valueId,
    question: predicateQuestion(dimension, valueId),
    truthMask: generateTruthMask(dimension, valueId),
  };
}

export function generateRegisteredPredicates(): readonly RegisteredPredicate[] {
  return [
    ...SUSPECT_IDS.map((valueId) => createPredicate('suspect', valueId)),
    ...ROOM_IDS.map((valueId) => createPredicate('room', valueId)),
    ...WEAPON_IDS.map((valueId) => createPredicate('weapon', valueId)),
    ...TIME_WINDOW_IDS.map((valueId) => createPredicate('time', valueId)),
  ];
}

export const REGISTERED_PREDICATES = generateRegisteredPredicates();

export function findRegisteredPredicate(predicateId: string): RegisteredPredicate | undefined {
  return REGISTERED_PREDICATES.find((predicate) => predicate.id === predicateId);
}
