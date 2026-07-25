import { ROOM_IDS, SUSPECT_IDS, TIME_WINDOW_IDS, WEAPON_IDS } from '@alibi/protocol';
import type { RoomId, SuspectId, TimeWindowId, WeaponId } from '@alibi/protocol';

export const CASE_COUNT = 64 as const;
export const UNIVERSE_MASK = (1n << 64n) - 1n;
export const INITIAL_CANDIDATE_MASK = UNIVERSE_MASK;

export type CaseCoordinates = {
  suspectIndex: number;
  roomIndex: number;
  weaponIndex: number;
  timeIndex: number;
};

export type AlibiCase = CaseCoordinates & {
  index: number;
  suspectId: SuspectId;
  roomId: RoomId;
  weaponId: WeaponId;
  timeWindowId: TimeWindowId;
};

function assertIntegerInRange(
  value: number,
  minimum: number,
  maximum: number,
  label: string,
): void {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${label} must be an integer from ${minimum} through ${maximum}.`);
  }
}

export function caseIndex(
  suspectIndex: number,
  roomIndex: number,
  weaponIndex: number,
  timeIndex: number,
): number {
  assertIntegerInRange(suspectIndex, 0, 3, 'suspectIndex');
  assertIntegerInRange(roomIndex, 0, 3, 'roomIndex');
  assertIntegerInRange(weaponIndex, 0, 1, 'weaponIndex');
  assertIntegerInRange(timeIndex, 0, 1, 'timeIndex');

  return ((suspectIndex * 4 + roomIndex) * 2 + weaponIndex) * 2 + timeIndex;
}

export function coordinatesFromIndex(index: number): CaseCoordinates {
  assertIntegerInRange(index, 0, CASE_COUNT - 1, 'index');

  let remainder = index;
  const timeIndex = remainder % 2;
  remainder = Math.floor(remainder / 2);
  const weaponIndex = remainder % 2;
  remainder = Math.floor(remainder / 2);
  const roomIndex = remainder % 4;
  const suspectIndex = Math.floor(remainder / 4);

  return {
    suspectIndex,
    roomIndex,
    weaponIndex,
    timeIndex,
  };
}

export function caseFromIndex(index: number): AlibiCase {
  const coordinates = coordinatesFromIndex(index);

  return {
    index,
    ...coordinates,
    suspectId: SUSPECT_IDS[coordinates.suspectIndex]!,
    roomId: ROOM_IDS[coordinates.roomIndex]!,
    weaponId: WEAPON_IDS[coordinates.weaponIndex]!,
    timeWindowId: TIME_WINDOW_IDS[coordinates.timeIndex]!,
  };
}

export function generateCaseUniverse(): readonly AlibiCase[] {
  return Array.from({ length: CASE_COUNT }, (_, index) => caseFromIndex(index));
}

export const CASE_UNIVERSE = generateCaseUniverse();

export function clampMask(mask: bigint): bigint {
  return mask & UNIVERSE_MASK;
}

export function maskForCase(index: number): bigint {
  assertIntegerInRange(index, 0, CASE_COUNT - 1, 'index');
  return 1n << BigInt(index);
}

export function intersectMasks(left: bigint, right: bigint): bigint {
  return clampMask(left) & clampMask(right);
}

export function complementMask(mask: bigint): bigint {
  return UNIVERSE_MASK ^ clampMask(mask);
}

export function popcount(mask: bigint): number {
  let remaining = clampMask(mask);
  let count = 0;

  while (remaining !== 0n) {
    remaining &= remaining - 1n;
    count += 1;
  }

  return count;
}

export function serializeMask(mask: bigint): string {
  return `0x${clampMask(mask).toString(16).padStart(16, '0')}`;
}
