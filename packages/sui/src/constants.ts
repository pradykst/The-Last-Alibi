import { REGISTERED_PREDICATES } from '@alibi/game-engine';

export const ALIBI_MOVE_MODULE = 'alibi' as const;
export const VERIFIER_MOVE_MODULE = 'verifier' as const;
export const SCHEMA_VERSION = 1 as const;
export const LEVEL_VERSION = 1 as const;
export const PROTOCOL_VERSION = 1 as const;
export const RECEIPT_VERSION = 1 as const;
export const PRACTICE_MODE = 0 as const;
export const ACTIVE_STATE = 1 as const;
export const QUERY_PENDING_STATE = 2 as const;
export const VERIFIER_UNAVAILABLE_STATE = 0 as const;

export const MOVE_PREDICATES = REGISTERED_PREDICATES.map((predicate, id) => ({
  id,
  browserId: predicate.id,
  dimension: predicate.dimension,
  dimensionId: id < 4 ? 0 : id < 8 ? 1 : id < 10 ? 2 : 3,
  valueId: predicate.valueId,
  valueIndex: id < 4 ? id : id < 8 ? id - 4 : id < 10 ? id - 8 : id - 10,
  truthMask: predicate.truthMask,
})) as readonly {
  id: number;
  browserId: string;
  dimension: 'suspect' | 'room' | 'weapon' | 'time';
  dimensionId: number;
  valueId: string;
  valueIndex: number;
  truthMask: bigint;
}[];

export function moveTarget(packageId: string, module: string, functionName: string): string {
  return `${packageId}::${module}::${functionName}`;
}
